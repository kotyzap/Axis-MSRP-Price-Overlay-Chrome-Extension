(function () {
  "use strict";

  // Runs on https://www.axis.com/search - the site's Google Programmable
  // Search Engine results page. Appends an MSRP price badge to the end of
  // each result's bold title line when the title names a model (or model
  // family) we recognize from the Q1 2026 price list.
  //
  // Matching logic (normalize/findMatch/pickVariant) is intentionally
  // duplicated from content.js rather than shared, since content.js wraps
  // its own copy in an IIFE, so it isn't reachable from a second content
  // script file. Keeping this file self-contained avoids touching the
  // already-shipped Product Selector overlay.

  const MODELS = (typeof AXIS_CATALOG !== "undefined" && AXIS_CATALOG.models) || {};

  function normalize(s) {
    return (s || "")
      .toUpperCase()
      .replace(/®|™/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeBare(s) {
    return normalize(s).replace(/^AXIS\s+/, "");
  }

  function stripFps(s) {
    return (s || "").replace(/\b\d+(\.\d+)?\s*FPS\b/gi, "").trim();
  }

  function fmtPrice(n, currency) {
    const symbol = currency === "EUR" ? "€" : "$";
    return symbol + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // "USD" (default) uses each variant's msrp field; "EUR" uses msrp_eur
  // (Axis EE January 2026 price list, camera products only).
  let currentCurrency = "USD";
  function priceField() {
    return currentCurrency === "EUR" ? "msrp_eur" : "msrp";
  }

  const modelKeys = Object.keys(MODELS);
  const normIndex = new Map();
  for (const key of modelKeys) {
    normIndex.set(normalize(key), MODELS[key]);
  }
  const sortedNormKeys = Array.from(normIndex.keys()).sort((a, b) => b.length - a.length);

  // Bare (no "AXIS " prefix) keys, used for the whole-series/family fallback below.
  const bareEntries = modelKeys.map((key) => ({ bare: normalizeBare(key), variants: MODELS[key] }));

  function findMatch(displayName) {
    const norm = normalize(displayName);
    if (normIndex.has(norm)) {
      return { variants: normIndex.get(norm), remainder: "" };
    }
    for (const key of sortedNormKeys) {
      if (norm.startsWith(key + " ") || norm.startsWith(key + "-")) {
        return { variants: normIndex.get(key), remainder: norm.slice(key.length).trim() };
      }
    }
    let bestKey = null;
    for (const key of sortedNormKeys) {
      if (key.startsWith(norm + " ") && (!bestKey || key.length < bestKey.length)) {
        bestKey = key;
      }
    }
    if (bestKey) return { variants: normIndex.get(bestKey), remainder: "" };
    return null;
  }

  function isBulkPack(v) {
    return !!(v.note && /\bpcs\b/i.test(v.note));
  }

  function pickVariant(match) {
    const field = priceField();
    let variants = match.variants.filter((v) => v[field] != null);
    if (variants.length === 0) return null;
    const singleUnit = variants.filter((v) => !isBulkPack(v));
    if (singleUnit.length > 0) variants = singleUnit;
    if (variants.length === 1) return { single: variants[0], field };

    const remainder = match.remainder;
    if (remainder) {
      for (const v of variants) {
        if (!v.variant) continue;
        const lens = normalize(stripFps(v.variant));
        if (lens && remainder.includes(lens)) return { single: v, field };
      }
    }
    let min = variants[0], max = variants[0];
    for (const v of variants) {
      if (v[field] < min[field]) min = v;
      if (v[field] > max[field]) max = v;
    }
    return { range: { min, max, count: variants.length }, field };
  }

  // Mode A: the title names one specific model (optionally with several
  // lens/color/etc. variants of that SAME model) - identical matching to the
  // Product Selector overlay, so a genuine variant spread still shows as a
  // "$min-$max" range rather than "from".
  function specificPriceBadge(segment) {
    const match = findMatch(segment);
    if (!match) return null;
    const picked = pickVariant(match);
    if (!picked) return null;
    const field = picked.field;
    const sourceLabel = currentCurrency === "EUR" ? "Axis EE price list (Jan 2026, EUR)" : "Axis MSRP (Q1 2026 price list)";

    if (picked.single) {
      const v = picked.single;
      let title = sourceLabel;
      if (v.part_number) title += " — Part #" + v.part_number;
      if (v.variant) title += " — " + v.variant;
      return { text: fmtPrice(v[field], currentCurrency), title };
    }
    const { min, max, count } = picked.range;
    if (min[field] === max[field]) {
      return {
        text: fmtPrice(min[field], currentCurrency),
        title: sourceLabel + " — " + count + " variants, same price",
      };
    }
    return {
      text: fmtPrice(min[field], currentCurrency) + "–" + fmtPrice(max[field], currentCurrency),
      title: sourceLabel + " — range across " + count + " variants",
    };
  }

  // Mode B: the title only names a series/family (e.g. "M11", "Q35") that
  // spans several distinct models with their own separate catalog entries -
  // show the cheapest matched SKU anywhere in that family as "from $X".
  //
  // Axis series codes are short (2-3 digits: M11, M30, Q35, P39...); full
  // model numbers are 4+ digits (M1137, Q6100...). The digit-count+lookahead
  // here specifically excludes 4+ digit numbers, so a specific model that
  // just didn't get an exact/prefix hit in Mode A (e.g. a discontinued
  // "AXIS M1137" predecessor to "M1137 Mk II") falls through to no badge
  // instead of a misleading "from" price borrowed from an unrelated SKU
  // that merely happens to start with the same digits.
  function seriesFromBadge(segment) {
    const tokenMatch = segment.match(/^AXIS\s+([A-Z]+)(\d{2,3})(?!\d)/i);
    if (!tokenMatch) return null;
    const prefix = (tokenMatch[1] + tokenMatch[2]).toUpperCase();
    const field = priceField();
    let cheapest = null;
    let count = 0;
    for (const { bare, variants } of bareEntries) {
      if (!bare.startsWith(prefix)) continue;
      for (const v of variants) {
        if (v[field] == null || isBulkPack(v)) continue;
        count++;
        if (!cheapest || v[field] < cheapest[field]) cheapest = v;
      }
    }
    if (!cheapest) return null;
    const sourceLabel = currentCurrency === "EUR" ? "Axis EE price list (Jan 2026, EUR)" : "Axis MSRP (Q1 2026 price list)";
    return {
      text: "from " + fmtPrice(cheapest[field], currentCurrency),
      title: sourceLabel + " — cheapest of " + count + " matched " + prefix + "-series SKUs",
    };
  }

  // Search result titles are full sentences ("Product support for AXIS
  // M1137 Network Camera", "AXIS M1137 Mk II Box Camera - Axis
  // Communications"), not clean model names like on the Product Selector.
  // Isolate everything from the first "AXIS" onward and let findMatch's
  // existing prefix logic treat trailing words as a harmless remainder.
  function extractAxisSegment(rawTitle) {
    const idx = rawTitle.search(/\bAXIS\b/i);
    if (idx === -1) return null;
    return rawTitle.slice(idx).trim();
  }

  function priceBadgeForTitle(rawTitle) {
    const segment = extractAxisSegment(rawTitle);
    if (!segment) return null;
    return specificPriceBadge(segment) || seriesFromBadge(segment);
  }

  // ---------------------------------------------------------------------
  // DOM injection (Google Programmable Search Engine result markup)
  // ---------------------------------------------------------------------

  const RESULT_SELECTOR = ".gsc-webResult.gsc-result";
  const TITLE_SELECTOR = "a.gs-title";
  const PROCESSED_ATTR = "data-axis-price-done";

  function injectAll() {
    document.querySelectorAll(RESULT_SELECTOR).forEach((result) => {
      // Google's CSE widget renders each result's title twice (one hidden
      // layout variant); only the visible one should get a badge.
      const anchors = Array.from(result.querySelectorAll(TITLE_SELECTOR));
      const anchor = anchors.find((a) => a.offsetParent !== null) || anchors[0];
      if (!anchor || anchor.hasAttribute(PROCESSED_ATTR)) return;
      anchor.setAttribute(PROCESSED_ATTR, "1");

      const badge = priceBadgeForTitle(anchor.textContent.trim());
      if (!badge) return;

      const span = document.createElement("span");
      span.className = "axis-search-price-badge";
      span.textContent = badge.text;
      span.title = badge.title;
      anchor.appendChild(span);
    });
  }

  let scheduled = false;
  function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      observer.disconnect();
      try {
        injectAll();
      } finally {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) {
        scheduleInject();
        break;
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  scheduleInject();

  // Re-derive every already-badged title under the new currency (simplest
  // approach here since there's no sort/series state to preserve like on the
  // Product Selector - just wipe and re-run).
  function refreshAllBadges() {
    document.querySelectorAll(TITLE_SELECTOR + "[" + PROCESSED_ATTR + "]").forEach((anchor) => {
      anchor.removeAttribute(PROCESSED_ATTR);
      const existing = anchor.querySelector(".axis-search-price-badge");
      if (existing) existing.remove();
    });
    injectAll();
  }

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["axisCurrency"], (res) => {
      if (res && res.axisCurrency === "EUR") {
        currentCurrency = "EUR";
        refreshAllBadges();
      }
    });
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.axisCurrency) {
          currentCurrency = changes.axisCurrency.newValue === "EUR" ? "EUR" : "USD";
          refreshAllBadges();
        }
      });
    }
  }
})();

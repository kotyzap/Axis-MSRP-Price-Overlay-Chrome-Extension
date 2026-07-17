(function () {
  "use strict";

  const MODELS = (typeof AXIS_CATALOG !== "undefined" && AXIS_CATALOG.models) || {};
  let CHIPSETS = (typeof CHIPSET_DATA !== "undefined" && CHIPSET_DATA.chipsets) || {};

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

  // strip a trailing frame-rate token like "30 FPS" / "8.3 FPS" from a variant label
  function stripFps(s) {
    return (s || "").replace(/\b\d+(\.\d+)?\s*FPS\b/gi, "").trim();
  }

  function fmtPrice(n, currency) {
    const symbol = currency === "EUR" ? "€" : "$";
    return symbol + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // "EUR" (default) uses msrp_eur (AXIS Price List, July 2026, camera
  // products only - see catalog-data.js for per-variant coverage); "USD"
  // uses each variant's msrp field, which for those same SKUs is now an
  // FX-derived figure (EUR price converted at the EUR/USD rate in effect
  // when catalog-data.js was last regenerated), not an independent Axis
  // USD price list.
  let currentCurrency = "EUR";
  function priceField() {
    return currentCurrency === "EUR" ? "msrp_eur" : "msrp";
  }

  // ---------------------------------------------------------------------
  // Price matching (AXIS Price List, July 2026, EUR; USD is FX-derived)
  // ---------------------------------------------------------------------

  const modelKeys = Object.keys(MODELS);
  const normIndex = new Map();
  for (const key of modelKeys) {
    normIndex.set(normalize(key), MODELS[key]);
  }
  const sortedNormKeys = Array.from(normIndex.keys()).sort((a, b) => b.length - a.length);

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

  // Applies a chrome.storage.local "catalogOverride" record (written by the
  // options page after a monthly .xls drop) onto the bundled catalog in
  // place, keyed by each variant's own part_number. MODELS is shared by
  // reference with normIndex/findMatch, so this reaches every lookup path
  // without rebuilding any index.
  function applyCatalogOverride(override) {
    if (!override || !override.overrides) return;
    for (const model in MODELS) {
      for (const v of MODELS[model]) {
        const o = v.part_number && override.overrides[v.part_number];
        if (o) {
          // Only touch fields the override actually carries - a USD-sourced
          // monthly update has no msrp_eur key, and must not blank out
          // whatever EUR price the variant already had.
          if (o.msrp_eur !== undefined) v.msrp_eur = o.msrp_eur;
          if (o.msrp !== undefined) v.msrp = o.msrp;
          if (o.msrp_display !== undefined) v.msrp_display = o.msrp_display;
        }
      }
    }
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

  function priceBadgeFor(name) {
    const match = findMatch(name);
    if (!match) return null;
    const picked = pickVariant(match);
    if (!picked) return null;
    const field = picked.field;
    const sourceLabel = currentCurrency === "EUR" ? "AXIS Price List (Jul 2026, EUR)" : "FX-derived from AXIS Price List (Jul 2026, EUR)";

    if (picked.single) {
      const v = picked.single;
      let title = sourceLabel;
      if (v.part_number) title += " — Part #" + v.part_number;
      if (v.variant) title += " — " + v.variant;
      if (v.note) title += " (" + v.note + ")";
      return { text: fmtPrice(v[field], currentCurrency), title, minPrice: v[field] };
    }

    const { min, max, count } = picked.range;
    if (min[field] === max[field]) {
      return {
        text: fmtPrice(min[field], currentCurrency),
        title: sourceLabel + " — " + count + " variants, same price",
        minPrice: min[field],
      };
    }
    const text = fmtPrice(min[field], currentCurrency) + "–" + fmtPrice(max[field], currentCurrency);
    const title =
      sourceLabel + " — range across " + count + " variants (" +
      (min.variant || min.part_number || "lowest") + " to " + (max.variant || max.part_number || "highest") + ")";
    return { text, title, minPrice: min[field] };
  }

  // ---------------------------------------------------------------------
  // Chipset matching (CamStreamer supported-camera data)
  // ---------------------------------------------------------------------

  let chipsetIndex = new Map();
  let sortedChipsetKeys = [];

  function rebuildChipsetIndex() {
    chipsetIndex = new Map();
    for (const key of Object.keys(CHIPSETS)) {
      chipsetIndex.set(normalize(key), CHIPSETS[key]);
    }
    sortedChipsetKeys = Array.from(chipsetIndex.keys()).sort((a, b) => b.length - a.length);
  }
  rebuildChipsetIndex();

  function lookupChipset(norm) {
    if (chipsetIndex.has(norm)) return chipsetIndex.get(norm);
    for (const key of sortedChipsetKeys) {
      if (norm === key || norm.startsWith(key + " ") || norm.startsWith(key + "-")) {
        return chipsetIndex.get(key);
      }
    }
    let bestKey = null;
    for (const key of sortedChipsetKeys) {
      if (key.startsWith(norm + " ") && (!bestKey || key.length < bestKey.length)) {
        bestKey = key;
      }
    }
    return bestKey ? chipsetIndex.get(bestKey) : null;
  }

  function chipsetFor(displayName) {
    const norm = normalizeBare(displayName);
    const direct = lookupChipset(norm);
    if (direct) return direct;
    // Axis stainless/marine variants insert an "S" right after the dash
    // (e.g. Q3538-SLVE vs the base Q3538-LVE), but CamStreamer doesn't
    // always list the marine SKU separately. When it does list both, they
    // share the same chipset (e.g. M4337-PLVE / M4337-SPLVE are both
    // ARTPEC-9), so falling back to the base variant here is a reasonable bet.
    const demarined = norm.replace(/-S([A-Z]+)\b/, "-$1");
    return demarined !== norm ? lookupChipset(demarined) : null;
  }

  // ---------------------------------------------------------------------
  // DOM injection
  // ---------------------------------------------------------------------

  const PROCESSED_ATTR = "data-axis-msrp-done";
  const CARD_SELECTOR = ".productCardDesktop__product-card";
  const NAME_SELECTOR = ".productCardDesktop__product-card-desktop-text a, .productCardDesktop__product-card-desktop-text";
  const IMG_CONTAINER_SELECTOR = ".productCardDesktop__product-card-img-container";

  // ---------------------------------------------------------------------
  // Series grouping: sort-by-price and hide-empty-series
  // ---------------------------------------------------------------------

  const SERIES_CONTAINER_SELECTOR = ".productSelector__desktop";
  const SERIES_LINK_SELECTOR = "a.productLayout__series-name";

  function loadBoolSetting(key, defaultVal) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultVal;
      return raw === "1";
    } catch (e) {
      return defaultVal;
    }
  }
  function saveBoolSetting(key, val) {
    try {
      localStorage.setItem(key, val ? "1" : "0");
    } catch (e) {
      /* ignore quota/availability errors */
    }
  }

  let sortEnabled = loadBoolSetting("axisSortSeriesV1", true);
  // Always on now - no longer user-configurable (was a checkbox in the panel).
  const hideEmptySeries = true;
  let originalSeriesOrder = null;

  function getSeriesWrappers() {
    const container = document.querySelector(SERIES_CONTAINER_SELECTOR);
    if (!container) return [];
    return Array.from(container.children).filter((el) => el.querySelector(SERIES_LINK_SELECTOR));
  }

  function captureOriginalSeriesOrderOnce() {
    if (originalSeriesOrder) return;
    const wrappers = getSeriesWrappers();
    if (wrappers.length > 5) originalSeriesOrder = wrappers;
  }

  // Only counts cards that are currently visible (i.e. not hidden by the
  // chipset filter), so series rank by the cheapest item you can actually
  // see right now, not by a hidden/filtered-out SKU elsewhere in the series.
  // Callers must apply the chipset filter first so card.style.display is current.
  function wrapperMinPrice(wrapper) {
    let min = Infinity;
    wrapper.querySelectorAll(CARD_SELECTOR).forEach((card) => {
      if (card.style.display === "none") return;
      const p = parseFloat(card.dataset.axisPrice);
      if (!isNaN(p) && p < min) min = p;
    });
    return min;
  }

  // The series container is a flex layout whose own React code re-renders and
  // reconciles child DOM order (it appears to virtualize/window the ~60
  // series for performance). Physically moving nodes with appendChild fights
  // that reconciliation - our move wins for a moment, then a later re-render
  // silently restores some or all wrappers to their original position,
  // producing a half-sorted, half-original order. Setting the CSS `order`
  // property instead reorders visually without moving any DOM node, so
  // there's nothing for React (or our own MutationObserver, which only
  // watches childList) to fight over or undo.
  function applyOrderRanks(rankedWrappers) {
    rankedWrappers.forEach((w, i) => {
      const rank = String(i);
      if (w.style.order !== rank) w.style.order = rank;
    });
  }

  function sortSeriesByPrice() {
    const withPrice = getSeriesWrappers().map((w) => ({ w, price: wrapperMinPrice(w) }));
    withPrice.sort((a, b) => a.price - b.price);
    applyOrderRanks(withPrice.map((x) => x.w));
  }

  function restoreOriginalSeriesOrder() {
    if (!originalSeriesOrder) return;
    applyOrderRanks(originalSeriesOrder.filter((w) => w.isConnected));
  }

  function updateSeriesVisibility() {
    const wrappers = getSeriesWrappers();
    if (!hideEmptySeries) {
      wrappers.forEach((w) => w.style.removeProperty("display"));
      return;
    }
    wrappers.forEach((w) => {
      const anyVisible = Array.from(w.querySelectorAll(CARD_SELECTOR)).some(
        (c) => c.style.display !== "none"
      );
      w.style.display = anyVisible ? "" : "none";
    });
  }

  function applyChipsetLabel(card, name) {
    const label = chipsetFor(name);
    let el = card.querySelector(".axis-chipset-badge");
    if (!label) {
      if (el) el.remove();
      card.removeAttribute("data-axis-chipset");
      return;
    }
    if (!el) {
      el = document.createElement("span");
      el.className = "axis-chipset-badge";
      const target = card.querySelector(IMG_CONTAINER_SELECTOR) || card;
      target.appendChild(el);
    }
    // A green stroke on the dark badge turned out too subtle to notice at a
    // glance, so CamStreamer ACAPs support (ARTPEC-9/8/6-7) is flagged with
    // a checkmark appended to the label text instead.
    const acapSupported = CAMSTREAMER_ACAPS_PRESET.includes(label);
    el.textContent = acapSupported ? label + " ✅" : label;
    el.title =
      "Chipset (via CamStreamer app-compatibility data): " + label +
      (acapSupported ? " — CamStreamer Support" : "");
    card.setAttribute("data-axis-chipset", label);
  }

  // Re-derives price text/value for every already-processed card using the
  // currently selected currency, without waiting for new cards to appear
  // (PROCESSED_ATTR normally gates re-processing, so a currency switch
  // needs its own pass to update existing badges rather than just new ones).
  function refreshPriceBadges() {
    observer.disconnect();
    try {
      document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
        if (!card.hasAttribute(PROCESSED_ATTR)) return;
        const nameEl = card.querySelector(NAME_SELECTOR);
        if (!nameEl) return;
        const name = nameEl.textContent.trim();
        if (!name) return;

        const badge = priceBadgeFor(name);
        let span = card.querySelector(".axis-msrp-badge");
        if (badge) {
          if (!span) {
            const target = card.querySelector(IMG_CONTAINER_SELECTOR) || card;
            span = document.createElement("span");
            span.className = "axis-msrp-badge";
            target.appendChild(span);
          }
          span.textContent = badge.text;
          span.title = badge.title;
          card.dataset.axisPrice = String(badge.minPrice);
        } else {
          if (span) span.remove();
          delete card.dataset.axisPrice;
        }
      });

      applyChipsetFilter();
      if (sortEnabled) sortSeriesByPrice();
      else restoreOriginalSeriesOrder();
    } finally {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function injectAll(root) {
    // Everything below can add/move DOM nodes (badges, series reordering). Since
    // we observe document.body for childList changes, our own writes would
    // otherwise re-trigger the observer and could loop. Pause it while we work.
    observer.disconnect();
    try {
      const cards = (root || document).querySelectorAll(CARD_SELECTOR);
      cards.forEach((card) => {
        const nameEl = card.querySelector(NAME_SELECTOR);
        if (!nameEl) return;
        const name = nameEl.textContent.trim();
        if (!name) return;

        if (!card.hasAttribute(PROCESSED_ATTR)) {
          card.setAttribute(PROCESSED_ATTR, "1");
          const badge = priceBadgeFor(name);
          if (badge) {
            const target = card.querySelector(IMG_CONTAINER_SELECTOR) || card;
            const span = document.createElement("span");
            span.className = "axis-msrp-badge";
            span.textContent = badge.text;
            span.title = badge.title;
            target.appendChild(span);
            card.dataset.axisPrice = String(badge.minPrice);
          }
        }

        applyChipsetLabel(card, name);
      });

      captureOriginalSeriesOrderOnce();

      // Filter first, then sort - wrapperMinPrice only looks at cards that
      // are currently visible, so it needs display state to already be current.
      applyChipsetFilter();
      if (sortEnabled) sortSeriesByPrice();
      else restoreOriginalSeriesOrder();

      // Re-attach the floating filter panel if a page re-render ever detaches it.
      if (filterPanelEl) mountPanel(filterPanelEl);
    } finally {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  let scheduled = false;
  function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectAll(document);
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

  // Pick up live chipset data once the background service worker has fetched it,
  // and whenever it refreshes later (weekly alarm or "Update chipset data" in the popup).
  // Also pick up the currency choice made in the popup (default EUR).
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["chipsetData", "axisCurrency", "catalogOverride"], (res) => {
      if (res && res.chipsetData && Object.keys(res.chipsetData).length > 0) {
        CHIPSETS = res.chipsetData;
        rebuildChipsetIndex();
      }
      if (res && res.axisCurrency === "USD") {
        currentCurrency = "USD";
      }
      applyCatalogOverride(res && res.catalogOverride);
      injectAll(document);
    });
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.chipsetData) {
          CHIPSETS = changes.chipsetData.newValue || {};
          rebuildChipsetIndex();
          injectAll(document);
        }
        if (changes.axisCurrency) {
          currentCurrency = changes.axisCurrency.newValue === "EUR" ? "EUR" : "USD";
          refreshPriceBadges();
        }
        // Written by the settings page (gear icon) after a monthly .xls
        // drop - mutate the shared catalog objects and re-render in place.
        if (changes.catalogOverride) {
          applyCatalogOverride(changes.catalogOverride.newValue);
          refreshPriceBadges();
        }
      });
    }
  }

  // ---------------------------------------------------------------------
  // Chipset filter panel
  // ---------------------------------------------------------------------

  const FILTER_STORAGE_KEY = "axisChipsetFilterV1";
  const CHIPSET_ORDER = [
    "ARTPEC-9", "ARTPEC-8", "ARTPEC-6/7", "ARTPEC-5", "ARTPEC-4", "ARTPEC-3",
    "Ambarella CV75", "Ambarella CV25", "Ambarella S3L", "Ambarella S2L", "Ambarella S2E", "Ambarella A5S",
  ];

  // The filter panel shows one checkbox per GROUP rather than one per exact
  // canonical chipset label: ARTPEC-3/4/5 collapse into a single "older
  // ARTPEC" checkbox, and all Ambarella variants collapse into a single
  // "Ambarella" checkbox. ARTPEC-9/8/6-7 stay as their own checkboxes since
  // those are the ones people actually care to isolate (e.g. for
  // CamStreamer ACAPs support). checkedChipsets still stores the underlying
  // exact canonical labels (unchanged), so applyChipsetFilter/card matching
  // doesn't need to know about grouping at all - only the panel UI does.
  const FILTER_GROUPS = [
    { label: "ARTPEC-9", members: ["ARTPEC-9"] },
    { label: "ARTPEC-8", members: ["ARTPEC-8"] },
    { label: "ARTPEC-6/7", members: ["ARTPEC-6/7"] },
    { label: "ARTPEC-3/4/5", members: ["ARTPEC-5", "ARTPEC-4", "ARTPEC-3"] },
    {
      label: "Ambarella",
      members: ["Ambarella CV75", "Ambarella CV25", "Ambarella S3L", "Ambarella S2L", "Ambarella S2E", "Ambarella A5S"],
    },
  ];

  function sortChipsetLabels(labels) {
    return labels.sort((a, b) => {
      const ia = CHIPSET_ORDER.indexOf(a);
      const ib = CHIPSET_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  function loadCheckedSet() {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch (e) {
      return new Set();
    }
  }

  function saveCheckedSet(set) {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify([...set]));
    } catch (e) {
      /* ignore quota/availability errors */
    }
  }

  let checkedChipsets = loadCheckedSet();
  let filterPanelEl = null;

  // Presets: chipset labels covered by CamStreamer ACAPs (ARTPEC 6 through 9;
  // 6 and 7 share one combined bucket in our data since CamStreamer's own
  // compatibility listing doesn't separate them).
  const CAMSTREAMER_ACAPS_PRESET = ["ARTPEC-9", "ARTPEC-8", "ARTPEC-6/7"];

  // Baseball Tracker needs a DLPU (Deep Learning Processing Unit), which
  // narrows this to ARTPEC-8/9 only (unlike the ACAPs preset, ARTPEC-6/7 is
  // excluded here). We don't have a separate per-model DLPU data field, so
  // this is chipset-only - some ARTPEC-6/7 cameras do have a DLPU too, but
  // ARTPEC-8/9 is the documented fallback for this preset.
  const BASEBALL_TRACKER_PRESET = ["ARTPEC-9", "ARTPEC-8"];

  // Quick-select checkboxes shown above the full chipset list. Each one just
  // toggles a subset of the same underlying labels used by the individual
  // checkboxes further down, kept in sync via groupCheckboxes/syncGroupCheckboxes.
  const PRESETS = [
    {
      label: "CamStreamer Support",
      members: CAMSTREAMER_ACAPS_PRESET,
      title: "Select ARTPEC-9, ARTPEC-8, and ARTPEC-6/7 - the chipsets with CamStreamer Support",
    },
    {
      label: "Baseball Tracker",
      members: BASEBALL_TRACKER_PRESET,
      title: "Select ARTPEC-9 and ARTPEC-8 - the DLPU-capable chipsets Baseball Tracker requires",
    },
  ];

  // Floating panel, bottom-right. (An earlier version docked this into the
  // native sidebar in place of the "System-on-chip" dropdown, but that made
  // it cramped and easy to miss inside the site's own collapsible filter
  // groups, so it's back to floating. It's still idempotent - only touches
  // the DOM when actually detached - so calling it from injectAll() on every
  // mutation doesn't itself trigger more mutations.)
  function mountPanel(panel) {
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
  }

  function applyChipsetFilter() {
    const active = checkedChipsets.size > 0;
    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
      if (!active) {
        card.style.removeProperty("display");
        return;
      }
      const label = card.getAttribute("data-axis-chipset");
      const visible = !!label && checkedChipsets.has(label);
      card.style.display = visible ? "" : "none";
    });
    updateSeriesVisibility();
  }

  // Call after any change to the chipset filter (checkbox toggle, preset,
  // clear) so series re-rank by the cheapest item that's still visible.
  function applyFilterAndResort() {
    applyChipsetFilter();
    if (sortEnabled) sortSeriesByPrice();
  }

  function buildFilterPanel() {
    if (filterPanelEl) return;

    const available = sortChipsetLabels([...new Set(Object.values(CHIPSETS))]);

    const panel = document.createElement("div");
    panel.id = "axis-chipset-filter-panel";

    const header = document.createElement("div");
    header.className = "axis-chipset-panel-header";
    header.innerHTML =
      '<span>Chipset filter</span><button type="button" class="axis-chipset-panel-toggle" title="Collapse/expand">–</button>';
    panel.appendChild(header);

    const body = document.createElement("div");
    body.className = "axis-chipset-panel-body";

    const options = document.createElement("div");
    options.className = "axis-chipset-panel-options";

    // Populated by both the CamStreamer ACAPs shortcut below and the main
    // chipset list further down, so toggling either keeps the other in sync
    // (they share the same three underlying ARTPEC labels).
    const groupCheckboxes = [];
    function syncGroupCheckboxes() {
      groupCheckboxes.forEach(({ cb, members }) => {
        cb.checked = members.every((m) => checkedChipsets.has(m));
      });
    }

    const sortRow = document.createElement("label");
    sortRow.className = "axis-chipset-panel-row";
    const sortCb = document.createElement("input");
    sortCb.type = "checkbox";
    sortCb.checked = sortEnabled;
    sortCb.addEventListener("change", () => {
      sortEnabled = sortCb.checked;
      saveBoolSetting("axisSortSeriesV1", sortEnabled);
      if (sortEnabled) sortSeriesByPrice();
      else restoreOriginalSeriesOrder();
    });
    const sortLabel = document.createElement("span");
    sortLabel.textContent = "Sort series by cheapest price";
    sortRow.appendChild(sortCb);
    sortRow.appendChild(sortLabel);
    options.appendChild(sortRow);


    for (const preset of PRESETS) {
      const presetMembers = preset.members.filter((label) => available.includes(label));
      if (presetMembers.length === 0) continue;

      const presetRow = document.createElement("label");
      presetRow.className = "axis-chipset-panel-row axis-chipset-panel-preset";
      const presetCb = document.createElement("input");
      presetCb.type = "checkbox";
      presetCb.checked = presetMembers.every((m) => checkedChipsets.has(m));
      presetCb.addEventListener("change", () => {
        if (presetCb.checked) presetMembers.forEach((m) => checkedChipsets.add(m));
        else presetMembers.forEach((m) => checkedChipsets.delete(m));
        saveCheckedSet(checkedChipsets);
        syncGroupCheckboxes();
        applyFilterAndResort();
        updateCount();
      });
      groupCheckboxes.push({ cb: presetCb, members: presetMembers });
      const presetLabel = document.createElement("span");
      presetLabel.textContent = preset.label;
      presetRow.title = preset.title;
      presetRow.appendChild(presetCb);
      presetRow.appendChild(presetLabel);
      options.appendChild(presetRow);
    }

    body.appendChild(options);

    const divider = document.createElement("div");
    divider.className = "axis-chipset-panel-divider";
    body.appendChild(divider);

    const list = document.createElement("div");
    list.className = "axis-chipset-panel-list";
    for (const group of FILTER_GROUPS) {
      const presentMembers = group.members.filter((m) => available.includes(m));
      if (presentMembers.length === 0) continue; // none of this group's chipsets appear in the current data

      const row = document.createElement("label");
      row.className = "axis-chipset-panel-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = group.label;
      cb.checked = presentMembers.every((m) => checkedChipsets.has(m));
      cb.addEventListener("change", () => {
        if (cb.checked) presentMembers.forEach((m) => checkedChipsets.add(m));
        else presentMembers.forEach((m) => checkedChipsets.delete(m));
        saveCheckedSet(checkedChipsets);
        syncGroupCheckboxes(); // keep the CamStreamer ACAPs shortcut in sync too
        applyFilterAndResort();
        updateCount();
      });
      groupCheckboxes.push({ cb, members: presentMembers });
      const span = document.createElement("span");
      span.textContent = group.label;
      row.appendChild(cb);
      row.appendChild(span);
      list.appendChild(row);
    }
    body.appendChild(list);

    const footer = document.createElement("div");
    footer.className = "axis-chipset-panel-footer";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "axis-chipset-panel-clear";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => {
      checkedChipsets.clear();
      saveCheckedSet(checkedChipsets);
      syncGroupCheckboxes();
      applyFilterAndResort();
      updateCount();
    });
    const count = document.createElement("span");
    count.className = "axis-chipset-panel-count";
    footer.appendChild(count);
    footer.appendChild(clearBtn);
    body.appendChild(footer);

    panel.appendChild(body);
    filterPanelEl = panel;
    mountPanel(panel);

    function updateCount() {
      const total = document.querySelectorAll(CARD_SELECTOR).length;
      const visible = Array.from(document.querySelectorAll(CARD_SELECTOR)).filter(
        (c) => c.style.display !== "none"
      ).length;
      count.textContent = checkedChipsets.size > 0 ? visible + " / " + total + " shown" : "";
    }

    header.querySelector(".axis-chipset-panel-toggle").addEventListener("click", () => {
      const collapsed = panel.classList.toggle("axis-chipset-panel-collapsed");
      header.querySelector(".axis-chipset-panel-toggle").textContent = collapsed ? "+" : "–";
    });

    updateCount();
    applyFilterAndResort();
  }

  if (Object.keys(CHIPSETS).length > 0) {
    buildFilterPanel();
  }
})();

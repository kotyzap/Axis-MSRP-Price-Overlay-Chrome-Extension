(function () {
  "use strict";

  // Runs on https://www.axis.com/products/* - both a product-category page
  // (e.g. /products/axis-q17-series, a grid of "nav-card" tiles, one per
  // model) and an individual product page (e.g. /products/axis-q1728, a
  // single <h1> product name). Appends the same MSRP price badge + chipset
  // badge used elsewhere in this extension right next to each product name.
  //
  // Matching logic (normalize/findMatch/pickVariant/chipsetFor) is
  // intentionally duplicated from content.js/search-content.js rather than
  // shared, since each content script file is wrapped in its own IIFE and
  // isn't reachable from another file. Keeping this file self-contained
  // avoids touching the already-shipped Product Selector/search overlays.

  const MODELS = (typeof AXIS_CATALOG !== "undefined" && AXIS_CATALOG.models) || {};
  let CHIPSETS = (typeof CHIPSET_DATA !== "undefined" && CHIPSET_DATA.chipsets) || {};
  const CAMSTREAMER_ACAPS_PRESET = ["ARTPEC-9", "ARTPEC-8", "ARTPEC-6/7"];

  // A whole series can span many distinct chipsets (e.g. an M11 card lists
  // ARTPEC-8, ARTPEC-6/7, ARTPEC-5, ARTPEC-4, ARTPEC-3 individually), which
  // reads as clutter on a small card. Collapse the older ARTPEC generations
  // into two ranges - "ARTPEC 6-9" (the CamStreamer-supported ones) and
  // "ARTPEC 3-5" (the older, unsupported ones) - and shorten "Ambarella X"
  // to "AMB X", so at most a handful of badges ever show per card.
  const CHIPSET_GROUP_ORDER = ["ARTPEC 6-9", "ARTPEC 3-5"];

  function displayChipsetGroup(rawLabel) {
    if (rawLabel === "ARTPEC-9" || rawLabel === "ARTPEC-8" || rawLabel === "ARTPEC-6/7") return "ARTPEC 6-9";
    if (rawLabel === "ARTPEC-5" || rawLabel === "ARTPEC-4" || rawLabel === "ARTPEC-3") return "ARTPEC 3-5";
    if (rawLabel.indexOf("Ambarella ") === 0) return "AMB " + rawLabel.slice("Ambarella ".length);
    return rawLabel;
  }

  // Builds and appends one badge per *display* chipset group (not one per
  // raw chipset label) - e.g. ARTPEC-9/8/6-7 on the same card collapse into
  // a single "ARTPEC 6-9" badge. A group gets the CamStreamer-support
  // checkmark if ANY of its underlying raw labels does (true for the whole
  // "ARTPEC 6-9" group, never for "ARTPEC 3-5" or any AMB group, matching
  // CAMSTREAMER_ACAPS_PRESET below).
  function appendChipsetBadges(row, rawLabels) {
    const groupAcap = new Map();
    rawLabels.forEach((raw) => {
      const display = displayChipsetGroup(raw);
      const acap = CAMSTREAMER_ACAPS_PRESET.includes(raw);
      groupAcap.set(display, groupAcap.get(display) || acap);
    });
    const sortedLabels = Array.from(groupAcap.keys()).sort((a, b) => {
      const ia = CHIPSET_GROUP_ORDER.indexOf(a), ib = CHIPSET_GROUP_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    sortedLabels.forEach((label) => {
      const acap = groupAcap.get(label);
      const chipsetSpan = document.createElement("span");
      chipsetSpan.className = "axis-product-chipset-badge";
      chipsetSpan.textContent = label + (acap ? " ✅" : "");
      chipsetSpan.title =
        "Chipset (via CamStreamer app-compatibility data): " + label + (acap ? " — CamStreamer Support" : "");
      row.appendChild(chipsetSpan);
    });
  }

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

  // "EUR" (default) uses msrp_eur; "USD" uses each variant's msrp field,
  // which for those SKUs is an FX-derived figure - see content.js for the
  // full explanation of both fields.
  let currentCurrency = "EUR";
  function priceField() {
    return currentCurrency === "EUR" ? "msrp_eur" : "msrp";
  }

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
  // place, keyed by each variant's own part_number - identical logic to the
  // other two content scripts.
  function applyCatalogOverride(override) {
    if (!override || !override.overrides) return;
    for (const model in MODELS) {
      for (const v of MODELS[model]) {
        const o = v.part_number && override.overrides[v.part_number];
        if (o) {
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
      return { text: fmtPrice(v[field], currentCurrency), title };
    }

    const { min, max, count } = picked.range;
    if (min[field] === max[field]) {
      return {
        text: fmtPrice(min[field], currentCurrency),
        title: sourceLabel + " — " + count + " variants, same price",
      };
    }
    const text = fmtPrice(min[field], currentCurrency) + "–" + fmtPrice(max[field], currentCurrency);
    const title =
      sourceLabel + " — range across " + count + " variants (" +
      (min.variant || min.part_number || "lowest") + " to " + (max.variant || max.part_number || "highest") + ")";
    return { text, title };
  }

  // ---------------------------------------------------------------------
  // Chipset matching (CamStreamer supported-camera data) - identical
  // approach to content.js/search-content.js.
  // ---------------------------------------------------------------------

  let chipsetIndex = new Map();
  let sortedChipsetKeys = [];
  function rebuildChipsetIndex() {
    chipsetIndex = new Map();
    for (const key of Object.keys(CHIPSETS)) {
      chipsetIndex.set(normalizeBare(key), CHIPSETS[key]);
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
    // (e.g. Q3538-SLVE vs the base Q3538-LVE) - see content.js for the
    // full rationale.
    const demarined = norm.replace(/-S([A-Z]+)\b/, "-$1");
    return demarined !== norm ? lookupChipset(demarined) : null;
  }

  // ---------------------------------------------------------------------
  // Series ("from $X") fallback - when a card/heading names a model that
  // isn't an exact/prefix match in the catalog (e.g. a brand-new SKU added
  // to a series page before the catalog is regenerated, or a whole-series
  // "deck" card like "AXIS M10 Box Camera Series" on a hub page), fall back
  // to the cheapest known price anywhere in that same series via a regex on
  // the leading letter+digit model prefix (e.g. "Q17" out of "AXIS
  // Q1728-LE", or "M10" out of "AXIS M10 Box Camera Series"). Mirrors
  // seriesFromBadge in search-content.js.
  // ---------------------------------------------------------------------

  const bareEntries = modelKeys.map((key) => ({ bare: normalizeBare(key), variants: MODELS[key] }));

  function seriesPrefixOf(name) {
    const tokenMatch = normalizeBare(name).match(/^([A-Z]+)(\d{2,3})(?!\d)/);
    return tokenMatch ? (tokenMatch[1] + tokenMatch[2]).toUpperCase() : null;
  }

  function seriesFromBadge(name) {
    const prefix = seriesPrefixOf(name);
    if (!prefix) return null;
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
    const sourceLabel = currentCurrency === "EUR" ? "AXIS Price List (Jul 2026, EUR)" : "FX-derived from AXIS Price List (Jul 2026, EUR)";
    return {
      text: "from " + fmtPrice(cheapest[field], currentCurrency),
      title: sourceLabel + " — cheapest of " + count + " matched " + prefix + "-series SKUs",
    };
  }

  // ---------------------------------------------------------------------
  // Shared badge-building/injection helper
  // ---------------------------------------------------------------------

  // For a single specific model (badge came back non-null), show that one
  // model's own chipset. For a whole-series fallback (a "from $X" price
  // spanning several models, e.g. a hub-page "deck" card), show every
  // distinct chipset used anywhere in that series - could be more than one,
  // hence an array either way.
  function buildBadges(name) {
    const badge = priceBadgeFor(name);
    let chipsetLabels = [];
    let priceInfo = badge;
    if (badge) {
      const chipset = chipsetFor(name);
      if (chipset) chipsetLabels = [chipset];
    } else {
      const fallback = seriesFromBadge(name);
      if (!fallback) return null;
      priceInfo = fallback;
      const prefix = seriesPrefixOf(name);
      if (prefix) chipsetLabels = seriesChipsets(prefix);
    }

    const row = document.createElement("div");
    row.className = "axis-product-badges-row";
    appendChipsetBadges(row, chipsetLabels);
    const priceSpan = document.createElement("span");
    priceSpan.className = "axis-product-price-badge";
    priceSpan.textContent = priceInfo.text;
    priceSpan.title = priceInfo.title;
    row.appendChild(priceSpan);
    return row;
  }

  // ---------------------------------------------------------------------
  // Category page (/products/axis-*-series, etc.) and category "hub" pages
  // (/products/box-cameras, etc.) - both are a grid of nav-card tiles (one
  // per specific model, or one per whole series on a hub page).
  // ---------------------------------------------------------------------

  const CARD_SELECTOR = "a.nav-card";
  const CARD_NAME_SELECTOR = ".nav-card__text h3";
  const CARD_PROCESSED_ATTR = "data-axis-product-card-done";

  function injectCategoryCards(root) {
    (root || document).querySelectorAll(CARD_SELECTOR).forEach((card) => {
      if (card.hasAttribute(CARD_PROCESSED_ATTR)) return;
      const nameEl = card.querySelector(CARD_NAME_SELECTOR);
      if (!nameEl) return;
      const name = nameEl.textContent.trim();
      if (!name) return;
      card.setAttribute(CARD_PROCESSED_ATTR, "1");

      const row = buildBadges(name);
      if (!row) return;

      // Pinned to the top-center of the card, over the product image,
      // rather than appended after the tagline/count text below - that
      // bottom text varies in length card to card (and on hub pages,
      // ".nav-card__product-count" is itself already absolutely positioned
      // at the card's own bottom edge by the site's CSS), so anything
      // appended there risks colliding with it. The card itself
      // (`a.nav-card`) is already position:relative, so this needs no
      // extra wrapper - it just anchors to the card as a whole.
      row.classList.add("axis-product-badges-row--top-of-card");
      card.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------
  // Individual product page (/products/axis-q1728, etc.) - a single <h1>
  // product name.
  // ---------------------------------------------------------------------

  const PRODUCT_NAME_CONTAINER_SELECTOR = ".product-top__product-name";
  const PRODUCT_PROCESSED_ATTR = "data-axis-product-page-done";

  // Individual product pages get their price/chipset badges appended as a
  // trailing breadcrumb crumb, same placement as the series page (see
  // BREADCRUMB_LIST_SELECTOR/injectSeriesHeader below) - previously this
  // appended a "card overlay" style row under the h1 instead, which read as
  // a stray floating box rather than living in the breadcrumb trail where
  // it originally shipped. Only falls back to appending after the h1 if the
  // page genuinely has no breadcrumb list to attach to.
  function injectProductPage(root) {
    const scope = root || document;
    const container = scope.querySelector(PRODUCT_NAME_CONTAINER_SELECTOR);
    if (!container || container.hasAttribute(PRODUCT_PROCESSED_ATTR)) return;
    const h1 = container.querySelector("h1");
    if (!h1) return;
    const name = h1.textContent.trim();
    if (!name) return;

    const priceInfo = priceBadgeFor(name);
    if (!priceInfo) return;
    container.setAttribute(PRODUCT_PROCESSED_ATTR, "1");

    const chipset = chipsetFor(name);
    const breadcrumbList = scope.querySelector(BREADCRUMB_LIST_SELECTOR);
    const row = document.createElement(breadcrumbList ? "li" : "div");
    row.className = breadcrumbList
      ? "breadcrumb__list-item axis-product-series-breadcrumb-item"
      : "axis-product-badges-row axis-product-badges-row--product-page";

    if (breadcrumbList) {
      const sep = document.createElement("span");
      sep.className = "axis-product-series-breadcrumb-sep";
      sep.textContent = "/";
      row.appendChild(sep);
    }
    if (chipset) appendChipsetBadges(row, [chipset]);
    const priceSpan = document.createElement("span");
    priceSpan.className = "axis-product-price-badge";
    priceSpan.textContent = priceInfo.text;
    priceSpan.title = priceInfo.title;
    row.appendChild(priceSpan);

    if (breadcrumbList) breadcrumbList.appendChild(row);
    else h1.insertAdjacentElement("afterend", row);
  }

  // ---------------------------------------------------------------------
  // Series page hero heading (e.g. "AXIS Q17 Box Camera Series") - shows a
  // "from $X to $Y" range spanning every model in that series, via the
  // same letter+digit prefix regex used by seriesFromBadge. This is the
  // page-level title above the individual nav-card tiles, so it always
  // gets a range (never a single price/chipset), since it names a whole
  // family rather than one specific model.
  // ---------------------------------------------------------------------

  const SERIES_HEADER_SELECTOR = ".product-nav__header-title";
  const HEADER_PROCESSED_ATTR = "data-axis-product-header-done";

  // Names of the model tiles actually rendered on the current series page
  // (one per nav-card). Used to scope the breadcrumb's price range and
  // chipset list to only the models Axis is currently showing on this page
  // - a plain prefix scan over the whole catalog/chipset dataset would also
  // pick up older/discontinued same-prefix SKUs (e.g. a retired Q1765-LE on
  // ARTPEC-4) that CamStreamer's compatibility list still mentions but that
  // no longer appear as a card here, which reads as a wrong/phantom chipset
  // or price outlier on an otherwise consistent series.
  function currentPageCardNames(scope) {
    return Array.from(scope.querySelectorAll(CARD_NAME_SELECTOR))
      .map((el) => el.textContent.trim())
      .filter(Boolean);
  }

  function seriesHeaderRangeBadgeFromCards(cardNames, prefix) {
    const field = priceField();
    let min = null, max = null, count = 0;
    cardNames.forEach((name) => {
      const match = findMatch(name);
      if (!match) return;
      const picked = pickVariant(match);
      if (!picked) return;
      if (picked.single) {
        const v = picked.single;
        count++;
        if (!min || v[field] < min[field]) min = v;
        if (!max || v[field] > max[field]) max = v;
      } else if (picked.range) {
        const { min: mn, max: mx, count: c } = picked.range;
        count += c;
        if (!min || mn[field] < min[field]) min = mn;
        if (!max || mx[field] > max[field]) max = mx;
      }
    });
    if (!min) return null;
    const sourceLabel = currentCurrency === "EUR" ? "AXIS Price List (Jul 2026, EUR)" : "FX-derived from AXIS Price List (Jul 2026, EUR)";
    if (min[field] === max[field]) {
      return { text: fmtPrice(min[field], currentCurrency), title: sourceLabel + " — " + count + " " + prefix + "-series SKUs shown on this page, same price" };
    }
    return {
      text: "from " + fmtPrice(min[field], currentCurrency) + " to " + fmtPrice(max[field], currentCurrency),
      title: sourceLabel + " — range across " + count + " " + prefix + "-series SKUs shown on this page",
    };
  }

  // Every distinct chipset found among cataloged models sharing the same
  // series prefix (e.g. every M11xx model's chipset for prefix "M11"). Uses
  // CHIPSET_DATA directly (a separate dataset from MODELS, sourced from
  // CamStreamer rather than the price list), so a model can contribute a
  // chipset here even if it has no price, or vice versa.
  const CHIPSET_ORDER = [
    "ARTPEC-9", "ARTPEC-8", "ARTPEC-6/7", "ARTPEC-5", "ARTPEC-4", "ARTPEC-3",
    "Ambarella CV75", "Ambarella CV25", "Ambarella S3L", "Ambarella S2L", "Ambarella S2E", "Ambarella A5S",
  ];

  function sortChipsetLabels(labels) {
    return Array.from(labels).sort((a, b) => {
      const ia = CHIPSET_ORDER.indexOf(a), ib = CHIPSET_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  // Fallback for hub-page "deck" cards representing a whole series (e.g.
  // "AXIS M30 Dome Camera Series" on /products/dome-cameras), which have no
  // individual tiles of their own to read a chipset from directly. Scoped to
  // MODELS (the current price catalog) rather than a raw scan over every key
  // in CHIPSETS/CamStreamer's dataset - CamStreamer's compatibility list
  // covers every camera it has ever supported, including models long
  // discontinued and no longer sold, which would otherwise surface as
  // phantom chipset badges (e.g. old Ambarella models) on a series that
  // today only ships ARTPEC hardware.
  function seriesChipsets(prefix) {
    const found = new Set();
    for (const key of modelKeys) {
      if (!normalizeBare(key).startsWith(prefix)) continue;
      const chipset = chipsetFor(key);
      if (chipset) found.add(chipset);
    }
    return sortChipsetLabels(found);
  }

  // Scoped to the models actually rendered as cards on the current series
  // page - see currentPageCardNames() above for why this matters.
  function seriesChipsetsFromCards(cardNames) {
    const found = new Set();
    cardNames.forEach((name) => {
      const chipset = chipsetFor(name);
      if (chipset) found.add(chipset);
    });
    return sortChipsetLabels(found);
  }

  // Breadcrumb trail above the heading (e.g. "Network cameras / Box cameras")
  // - the badges are appended here as one more trailing crumb rather than
  // under the heading itself, per request, and sized up to stay legible at
  // the breadcrumb's larger placement.
  const BREADCRUMB_LIST_SELECTOR = ".breadcrumb__list";

  function injectSeriesHeader(root) {
    const scope = root || document;
    const h1 = scope.querySelector(SERIES_HEADER_SELECTOR);
    if (!h1 || h1.hasAttribute(HEADER_PROCESSED_ATTR)) return;
    const title = h1.textContent.trim();
    if (!title) return;

    const tokenMatch = normalizeBare(title).match(/^([A-Z]+)(\d{2,3})(?!\d)/);
    const prefix = tokenMatch ? (tokenMatch[1] + tokenMatch[2]).toUpperCase() : null;
    const cardNames = currentPageCardNames(scope);

    // Cards for this series page may not have rendered into the DOM yet on
    // an early call. Rather than fall back to a whole-catalog prefix scan
    // (which can surface discontinued same-prefix SKUs the page itself
    // isn't showing - the bug this whole cards-scoped approach fixes),
    // simply wait: leave HEADER_PROCESSED_ATTR unset so the next
    // MutationObserver pass, once cards exist, tries again.
    if (!cardNames.length) return;

    const badge = seriesHeaderRangeBadgeFromCards(cardNames, prefix || "series");
    if (!badge) return;
    h1.setAttribute(HEADER_PROCESSED_ATTR, "1");

    const chipsets = seriesChipsetsFromCards(cardNames);

    const breadcrumbList = scope.querySelector(BREADCRUMB_LIST_SELECTOR);
    const row = document.createElement(breadcrumbList ? "li" : "div");
    row.className = breadcrumbList
      ? "breadcrumb__list-item axis-product-series-breadcrumb-item"
      : "axis-product-badges-row axis-product-series-header-badges";

    if (breadcrumbList) {
      const sep = document.createElement("span");
      sep.className = "axis-product-series-breadcrumb-sep";
      sep.textContent = "/";
      row.appendChild(sep);
    }
    appendChipsetBadges(row, chipsets);
    const priceSpan = document.createElement("span");
    priceSpan.className = "axis-product-price-badge";
    priceSpan.textContent = badge.text;
    priceSpan.title = badge.title;
    row.appendChild(priceSpan);

    if (breadcrumbList) breadcrumbList.appendChild(row);
    else h1.insertAdjacentElement("afterend", row);
  }

  // ---------------------------------------------------------------------
  // "Compare products" table (series page, e.g. /products/axis-p13-series)
  // - one column per specific model, with each row a spec (max resolution,
  // frame rate, etc.). Adds a Chipset row and a Price row right at the top,
  // above every existing spec row, matching the table's own row markup
  // (<tr class="table-comp__row-diff table__row"><th class="table__row-header">
  // label</th><td class="table__cell">value per column</td>...) so the two
  // new rows are indistinguishable in structure from the site's own.
  // ---------------------------------------------------------------------

  const COMPARE_TABLE_SELECTOR = "table.table-comp";
  const COMPARE_HEAD_CELL_SELECTOR = "thead th";
  const COMPARE_PROCESSED_ATTR = "data-axis-compare-done";

  function buildCompareRow(labelText, cells) {
    const tr = document.createElement("tr");
    tr.className = "table-comp__row-diff table__row axis-product-compare-row";
    const th = document.createElement("th");
    th.className = "table__row-header";
    th.textContent = labelText;
    tr.appendChild(th);
    cells.forEach((cell) => {
      const td = document.createElement("td");
      td.className = "table__cell";
      if (cell) td.appendChild(cell);
      else td.textContent = "–";
      tr.appendChild(td);
    });
    return tr;
  }

  function injectCompareTable(root) {
    (root || document).querySelectorAll(COMPARE_TABLE_SELECTOR).forEach((table) => {
      if (table.hasAttribute(COMPARE_PROCESSED_ATTR)) return;
      const headCells = Array.from(table.querySelectorAll(COMPARE_HEAD_CELL_SELECTOR)).slice(1); // skip "Mark differences"
      const tbody = table.querySelector("tbody");
      if (!headCells.length || !tbody) return;
      table.setAttribute(COMPARE_PROCESSED_ATTR, "1");

      const names = headCells.map((th) => th.textContent.trim());
      const priceCells = [];
      const chipsetCells = [];
      let anyPrice = false;
      let anyChipset = false;

      names.forEach((name) => {
        const badge = priceBadgeFor(name);
        if (badge) {
          anyPrice = true;
          const span = document.createElement("span");
          span.className = "axis-product-price-badge axis-product-compare-badge";
          span.textContent = badge.text;
          span.title = badge.title;
          priceCells.push(span);
        } else {
          priceCells.push(null);
        }

        const chipset = chipsetFor(name);
        if (chipset) {
          anyChipset = true;
          const acap = CAMSTREAMER_ACAPS_PRESET.includes(chipset);
          const span = document.createElement("span");
          span.className = "axis-product-chipset-badge axis-product-compare-badge";
          span.textContent = chipset + (acap ? " ✅" : "");
          span.title =
            "Chipset (via CamStreamer app-compatibility data): " + chipset + (acap ? " — CamStreamer Support" : "");
          chipsetCells.push(span);
        } else {
          chipsetCells.push(null);
        }
      });

      if (!anyPrice && !anyChipset) return;

      // Chipset above price, both above every existing spec row, so
      // inserting order is: price row first (as first child), then
      // chipset row (also as first child, pushing price down one).
      if (anyPrice) tbody.insertBefore(buildCompareRow("Price", priceCells), tbody.firstChild);
      if (anyChipset) tbody.insertBefore(buildCompareRow("Chipset", chipsetCells), tbody.firstChild);
    });
  }

  function injectAll(root) {
    injectCategoryCards(root);
    injectProductPage(root);
    injectSeriesHeader(root);
    injectCompareTable(root);
  }

  // Re-derives badges for every already-processed element using the
  // currently selected currency/chipset data, without waiting for new
  // elements to appear (the *_PROCESSED_ATTR gates in injectAll normally
  // prevent reprocessing, so a currency/chipset switch needs its own pass).
  function refreshAllBadges() {
    document.querySelectorAll(CARD_SELECTOR + "[" + CARD_PROCESSED_ATTR + "]").forEach((card) => {
      card.removeAttribute(CARD_PROCESSED_ATTR);
      card.querySelectorAll(".axis-product-badges-row").forEach((row) => row.remove());
    });
    document.querySelectorAll(PRODUCT_NAME_CONTAINER_SELECTOR + "[" + PRODUCT_PROCESSED_ATTR + "]").forEach((container) => {
      container.removeAttribute(PRODUCT_PROCESSED_ATTR);
      container.querySelectorAll(".axis-product-badges-row").forEach((row) => row.remove());
    });
    document.querySelectorAll(SERIES_HEADER_SELECTOR + "[" + HEADER_PROCESSED_ATTR + "]").forEach((h1) => {
      h1.removeAttribute(HEADER_PROCESSED_ATTR);
      const next = h1.nextElementSibling;
      if (next && next.classList.contains("axis-product-series-header-badges")) next.remove();
    });
    document.querySelectorAll(".axis-product-series-breadcrumb-item").forEach((li) => li.remove());
    document.querySelectorAll(COMPARE_TABLE_SELECTOR + "[" + COMPARE_PROCESSED_ATTR + "]").forEach((table) => {
      table.removeAttribute(COMPARE_PROCESSED_ATTR);
      table.querySelectorAll(".axis-product-compare-row").forEach((row) => row.remove());
    });
    injectAll(document);
  }

  let scheduled = false;
  function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      observer.disconnect();
      try {
        injectAll(document);
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

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["axisCurrency", "catalogOverride", "chipsetData"], (res) => {
      if (res && res.axisCurrency === "USD") {
        currentCurrency = "USD";
      }
      applyCatalogOverride(res && res.catalogOverride);
      if (res && res.chipsetData && Object.keys(res.chipsetData).length > 0) {
        CHIPSETS = res.chipsetData;
        rebuildChipsetIndex();
      }
      refreshAllBadges();
    });
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.axisCurrency) {
          currentCurrency = changes.axisCurrency.newValue === "EUR" ? "EUR" : "USD";
          refreshAllBadges();
        }
        if (changes.catalogOverride) {
          applyCatalogOverride(changes.catalogOverride.newValue);
          refreshAllBadges();
        }
        if (changes.chipsetData) {
          CHIPSETS = changes.chipsetData.newValue || {};
          rebuildChipsetIndex();
          refreshAllBadges();
        }
      });
    }
  }
})();

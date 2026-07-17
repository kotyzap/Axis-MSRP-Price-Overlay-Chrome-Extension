(function () {
  const MODELS = (typeof AXIS_CATALOG !== "undefined" && AXIS_CATALOG.models) || {};

  // ---------------------------------------------------------------------
  // Chipset lookup (CamStreamer supported-camera data) - same matching
  // approach as content.js/search-content.js, just keyed directly off each
  // catalog model name instead of a scraped page-title string.
  // ---------------------------------------------------------------------

  let CHIPSETS = (typeof CHIPSET_DATA !== "undefined" && CHIPSET_DATA.chipsets) || {};
  const CAMSTREAMER_ACAPS_PRESET = ["ARTPEC-9", "ARTPEC-8", "ARTPEC-6/7"];

  function normalizeBare(s) {
    return (s || "")
      .toUpperCase()
      .replace(/®|™/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^AXIS\s+/, "");
  }

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
    // See content.js for the rationale - Axis marine/stainless "S" variants
    // (Q3538-SLVE vs base Q3538-LVE) aren't always listed separately by
    // CamStreamer, but share the same chipset when they are.
    const demarined = norm.replace(/-S([A-Z]+)\b/, "-$1");
    return demarined !== norm ? lookupChipset(demarined) : null;
  }

  // Applies a chrome.storage.local "catalogOverride" record (written by the
  // settings/options page after a monthly .xls drop) onto the bundled
  // catalog in place, keyed by each variant's own part_number. Must run
  // before `flat` is built below, since flat holds spread copies of each
  // variant - mutating MODELS afterwards wouldn't reach it.
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

  let flat = [];
  function buildFlat() {
    flat = [];
    for (const model in MODELS) {
      for (const v of MODELS[model]) {
        if (v.msrp == null) continue;
        flat.push({ model, ...v });
      }
    }
    document.getElementById("countLabel").textContent =
      Object.keys(MODELS).length + " models / " + flat.length + " SKUs loaded";
  }

  function fmt(n, currency) {
    const symbol = currency === "EUR" ? "€" : "$";
    return symbol + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const resultsEl = document.getElementById("results");
  const searchEl = document.getElementById("search");

  let currentCurrency = "EUR";

  function render(items) {
    resultsEl.innerHTML = "";
    if (!items.length) {
      resultsEl.innerHTML = '<div class="empty">No matches.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    items.slice(0, 60).forEach((it) => {
      const row = document.createElement("div");
      row.className = "row";
      const label = it.variant ? it.model + " — " + it.variant : it.model;
      const priceText =
        currentCurrency === "EUR"
          ? it.msrp_eur != null
            ? fmt(it.msrp_eur, "EUR")
            : "— (no EUR data)"
          : fmt(it.msrp, "USD");
      const chipset = chipsetFor(it.model);
      const chipsetText = chipset ? chipset + (CAMSTREAMER_ACAPS_PRESET.includes(chipset) ? " ✅" : "") : "";
      row.innerHTML =
        '<span class="price">' + priceText + '</span>' +
        (chipset ? '<span class="chipset">' + chipsetText + '</span>' : '') +
        '<div class="model">' + label + '</div>' +
        '<div class="meta">' + (it.part_number || "") + (it.section ? " · " + it.section : "") + '</div>';
      frag.appendChild(row);
    });
    resultsEl.appendChild(frag);
  }

  function search(q) {
    q = q.trim().toUpperCase();
    if (!q) return flat.slice(0, 60);
    return flat.filter(
      (it) =>
        it.model.toUpperCase().includes(q) ||
        (it.part_number && it.part_number.toUpperCase().includes(q)) ||
        (it.variant && it.variant.toUpperCase().includes(q))
    );
  }

  searchEl.addEventListener("input", () => render(search(searchEl.value)));

  // ---- Currency toggle (EUR default / USD) ----
  const usdBtn = document.getElementById("currencyUSD");
  const eurBtn = document.getElementById("currencyEUR");

  function setCurrency(next, persist) {
    currentCurrency = next === "USD" ? "USD" : "EUR";
    usdBtn.classList.toggle("active", currentCurrency === "USD");
    eurBtn.classList.toggle("active", currentCurrency === "EUR");
    render(search(searchEl.value));
    if (persist && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ axisCurrency: currentCurrency });
    }
  }
  usdBtn.addEventListener("click", () => setCurrency("USD", true));
  eurBtn.addEventListener("click", () => setCurrency("EUR", true));

  // ---- Startup: apply any stored monthly price override before building the
  // searchable list, then read the saved currency choice, then do the first render.
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["catalogOverride", "axisCurrency", "chipsetData"], (r) => {
      applyCatalogOverride(r.catalogOverride);
      buildFlat();
      if (r.chipsetData && Object.keys(r.chipsetData).length > 0) {
        CHIPSETS = r.chipsetData;
        rebuildChipsetIndex();
      }
      if (r.axisCurrency === "USD") setCurrency("USD", false);
      render(search(""));
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.catalogOverride) {
        applyCatalogOverride(changes.catalogOverride.newValue);
        buildFlat();
        render(search(searchEl.value));
      }
      if (changes.chipsetData) {
        CHIPSETS = changes.chipsetData.newValue || {};
        rebuildChipsetIndex();
        render(search(searchEl.value));
      }
    });
  } else {
    buildFlat();
    render(search(""));
  }

  // ---- Settings (gear) button - opens the monthly price-update page ----
  const settingsBtn = document.getElementById("settingsBtn");
  settingsBtn.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });

  const themeBtn = document.getElementById("themeToggle");
  chrome.storage && chrome.storage.local
    ? chrome.storage.local.get("axisMsrpTheme", (r) => {
        if (r.axisMsrpTheme) document.documentElement.setAttribute("data-theme", r.axisMsrpTheme);
      })
    : null;
  themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    if (chrome.storage && chrome.storage.local) chrome.storage.local.set({ axisMsrpTheme: next });
  });

  // ---- Chipset data status / manual refresh ----
  const chipsetStatusEl = document.getElementById("chipsetStatus");
  const refreshBtn = document.getElementById("refreshChipsets");

  function fmtWhen(ts) {
    if (!ts) return "never";
    const diffMin = Math.round((Date.now() - ts) / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return diffMin + " min ago";
    const diffH = Math.round(diffMin / 60);
    if (diffH < 48) return diffH + " h ago";
    return Math.round(diffH / 24) + " days ago";
  }

  function renderChipsetStatus() {
    if (!chrome.storage || !chrome.storage.local) {
      chipsetStatusEl.textContent = "unavailable";
      return;
    }
    chrome.storage.local.get(
      ["chipsetModelCount", "chipsetUpdatedAt", "chipsetLastError"],
      (r) => {
        if (r.chipsetLastError) {
          chipsetStatusEl.textContent = "Last update failed: " + r.chipsetLastError;
          chipsetStatusEl.classList.add("error");
        } else {
          chipsetStatusEl.classList.remove("error");
          chipsetStatusEl.textContent =
            (r.chipsetModelCount || 0) + " models · updated " + fmtWhen(r.chipsetUpdatedAt);
        }
      }
    );
  }
  renderChipsetStatus();

  refreshBtn.addEventListener("click", () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Updating…";
    chrome.runtime.sendMessage({ type: "REFRESH_CHIPSETS" }, (resp) => {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Update";
      if (chrome.runtime.lastError) {
        chipsetStatusEl.textContent = "Update failed: " + chrome.runtime.lastError.message;
        chipsetStatusEl.classList.add("error");
        return;
      }
      renderChipsetStatus();
    });
  });
})();

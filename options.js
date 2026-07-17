(function () {
  "use strict";

  const MODELS = (typeof AXIS_CATALOG !== "undefined" && AXIS_CATALOG.models) || {};
  const FX_ENDPOINT = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD";

  // ---------------------------------------------------------------------
  // Matching logic - deliberately mirrors the Python merge script used to
  // build the bundled catalog, so a self-service monthly update reproduces
  // the same coverage (part-number join, then a normalized-name-prefix
  // fallback for the handful of PTZ SKUs whose EU/US part numbers differ
  // for 50Hz/60Hz regional variants). Operates on generic {name, part,
  // price} rows - the caller decides whether `price` means EUR or USD.
  // ---------------------------------------------------------------------

  function cleanPart(p) {
    if (!p) return null;
    p = String(p).trim();
    return p.replace(/\s*\(.*?\)\s*$/, ""); // strip trailing "(N pcs)" bulk-pack suffixes
  }

  function normalizeName(name) {
    name = (name || "").toUpperCase();
    name = name.replace(/AXIS /g, "");
    name = name.replace(/[^\w\s]/g, " ");
    name = name.replace(/\s+/g, " ").trim();
    return name;
  }

  function colLetter(idx) {
    let s = "";
    idx = idx + 1;
    while (idx > 0) {
      const rem = (idx - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      idx = Math.floor((idx - 1) / 26);
    }
    return s;
  }

  // ---------------------------------------------------------------------
  // Auto-detection: recognizes the AXIS Price List's normal shape (a
  // sheet called "All products" or "Camera", with a title row then a header
  // row containing "Product Name" / "MSRP" style headers) without any user
  // interaction. Anything that doesn't match falls through to the manual
  // column-mapping UI below.
  // ---------------------------------------------------------------------

  function guessHeaderRow(rows2d) {
    let bestIdx = 0,
      bestScore = -1;
    const limit = Math.min(15, rows2d.length);
    for (let i = 0; i < limit; i++) {
      const row = rows2d[i] || [];
      const score = row.filter((c) => typeof c === "string" && c.trim() !== "").length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function findColumn(headerRow, patterns) {
    for (const pat of patterns) {
      const idx = headerRow.findIndex((c) => typeof c === "string" && c.toLowerCase().includes(pat));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function detectCurrencyHint(rows2d) {
    const text = rows2d
      .slice(0, 3)
      .map((r) => (r || []).join(" "))
      .join(" ")
      .toUpperCase();
    if (text.includes("USD")) return "USD";
    if (text.includes("EUR")) return "EUR";
    return null;
  }

  const NAME_PATTERNS = ["product name", "name", "model"];
  const PRICE_PATTERNS = ["msrp", "price"];
  const PART_PATTERNS = ["product number", "part number", "part no", "sku", "part"];

  function tryAutoDetect(workbook) {
    const priority = ["all products", "camera"];
    const orderedSheetNames = workbook.SheetNames.slice().sort((a, b) => {
      const ia = priority.indexOf(a.toLowerCase());
      const ib = priority.indexOf(b.toLowerCase());
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    for (const sheetName of orderedSheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
      if (rows2d.length < 2) continue;
      const headerRowIdx = guessHeaderRow(rows2d);
      const headerRow = (rows2d[headerRowIdx] || []).map((c) => (typeof c === "string" ? c : ""));
      const nameCol = findColumn(headerRow, NAME_PATTERNS);
      const priceCol = findColumn(headerRow, PRICE_PATTERNS);
      if (nameCol === -1 || priceCol === -1) continue;
      const partCol = findColumn(headerRow, PART_PATTERNS);
      const currency = detectCurrencyHint(rows2d) || "EUR";
      return { sheetName, headerRowIdx, nameCol, priceCol, partCol: partCol === -1 ? null : partCol, currency, auto: true };
    }
    return null;
  }

  function parseWithMapping(workbook, mapping) {
    const sheet = workbook.Sheets[mapping.sheetName];
    if (!sheet) throw new Error('Sheet "' + mapping.sheetName + '" not found in this file.');
    const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    const rows = [];
    for (let r = mapping.headerRowIdx + 1; r < rows2d.length; r++) {
      const row = rows2d[r];
      if (!row) continue;
      const name = row[mapping.nameCol];
      const price = row[mapping.priceCol];
      const part = mapping.partCol != null ? row[mapping.partCol] : null;
      if (!name) continue;
      if (typeof price !== "number") continue;
      rows.push({ name: String(name).trim(), part: part != null ? String(part).trim() : null, price });
    }
    if (rows.length === 0) {
      throw new Error("No priced rows found with this column mapping - double-check the sheet, header row, and columns.");
    }
    return rows;
  }

  function prefixFallback(modelKey, normRows) {
    const nk = normalizeName(modelKey);
    let min = null;
    for (const { normName, price } of normRows) {
      if (normName.startsWith(nk) || nk.startsWith(normName)) {
        if (min === null || price < min) min = price;
      }
    }
    return min;
  }

  function runMerge(rows) {
    const partToPrice = new Map();
    for (const { part, price } of rows) {
      const cp = cleanPart(part);
      if (!cp) continue;
      if (!partToPrice.has(cp) || price < partToPrice.get(cp)) partToPrice.set(cp, price);
    }
    const normRows = rows.map((r) => ({ normName: normalizeName(r.name), price: r.price }));

    const overrides = {};
    let partMatched = 0,
      fallbackMatched = 0,
      totalVariants = 0;
    const unmatched = [];
    const sectionStats = {};

    for (const modelKey in MODELS) {
      for (const v of MODELS[modelKey]) {
        totalVariants++;
        const section = v.section || "(unlabeled section)";
        if (!sectionStats[section]) sectionStats[section] = [0, 0];
        sectionStats[section][1]++;

        const part = cleanPart(v.part_number);
        const direct = part ? partToPrice.get(part) : undefined;
        let newPrice = null,
          matched = false;

        if (direct !== undefined) {
          newPrice = direct;
          matched = true;
          partMatched++;
        } else {
          const fb = prefixFallback(modelKey, normRows);
          if (fb !== null) {
            newPrice = fb;
            matched = true;
            fallbackMatched++;
          }
        }

        if (matched && v.part_number) {
          overrides[v.part_number] = { value: newPrice };
          sectionStats[section][0]++;
        } else if (!matched) {
          unmatched.push({ modelKey, part: v.part_number, section });
        }
      }
    }

    return { overrides, partMatched, fallbackMatched, unmatched, sectionStats, totalVariants, sourceRowCount: rows.length };
  }

  // Turns the generic { value } overrides into concrete catalog fields.
  // EUR source: msrp_eur = value, msrp = FX-derived. USD source: msrp =
  // value directly (no FX involved), msrp_eur is left untouched on the
  // catalog side (the override simply won't carry that key).
  function materializeOverrides(overrides, currency, fxRate) {
    for (const key in overrides) {
      const value = overrides[key].value;
      if (currency === "USD") {
        const usd = Math.round(value);
        overrides[key] = { msrp: usd, msrp_display: "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
      } else {
        const usd = Math.round(value * fxRate);
        overrides[key] = {
          msrp_eur: value,
          msrp: usd,
          msrp_display: "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        };
      }
    }
  }

  async function fetchFxRate() {
    const resp = await fetch(FX_ENDPOINT);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    if (!data || !data.rates || typeof data.rates.USD !== "number") {
      throw new Error("Unexpected response shape from " + FX_ENDPOINT);
    }
    return { rate: data.rates.USD, date: data.date };
  }

  // ---------------------------------------------------------------------
  // UI wiring
  // ---------------------------------------------------------------------

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const parseStatus = document.getElementById("parseStatus");
  const reportSection = document.getElementById("reportSection");
  const summaryEl = document.getElementById("summary");
  const sectionTableEl = document.getElementById("sectionTable");
  const unmatchedListEl = document.getElementById("unmatchedList");
  const fxRow = document.getElementById("fxRow");
  const fxRateInput = document.getElementById("fxRateInput");
  const fxSourceEl = document.getElementById("fxSource");
  const sourceLabelInput = document.getElementById("sourceLabelInput");
  const applyBtn = document.getElementById("applyBtn");
  const revertBtn = document.getElementById("revertBtn");
  const currentStatusEl = document.getElementById("currentStatus");

  const mappingCard = document.getElementById("mappingCard");
  const mappingHint = document.getElementById("mappingHint");
  const sheetSelect = document.getElementById("sheetSelect");
  const headerRowInput = document.getElementById("headerRowInput");
  const nameColSelect = document.getElementById("nameColSelect");
  const partColSelect = document.getElementById("partColSelect");
  const priceColSelect = document.getElementById("priceColSelect");
  const currencyEUR = document.getElementById("currencyEURRadio");
  const currencyUSD = document.getElementById("currencyUSDRadio");
  const previewTable = document.getElementById("previewTable");
  const useMappingBtn = document.getElementById("useMappingBtn");

  let pendingMerge = null; // result of runMerge(), before FX/currency materialized
  let pendingCurrency = "EUR";
  let currentFx = null;
  let currentWorkbook = null;

  function fmtDate(ts) {
    if (!ts) return "never";
    return new Date(ts).toLocaleString();
  }

  function renderCurrentStatus() {
    chrome.storage.local.get(["catalogOverride"], (res) => {
      const ov = res.catalogOverride;
      if (!ov) {
        // No monthly update has been applied - the extension already ships
        // with real, current-as-of-release prices baked into catalog-data.js
        // (not placeholder/empty data), so say exactly what that is rather
        // than a vague "bundled" message.
        const bundledSource = (typeof AXIS_CATALOG !== "undefined" && AXIS_CATALOG.eur_source) || "the bundled price list";
        currentStatusEl.textContent =
          "No monthly update applied - currently using the prices shipped with this extension version: " + bundledSource + ". This is the default until you drop a newer file below.";
        revertBtn.disabled = true;
      } else {
        const currencyNote = ov.currency === "USD" ? ", sourced directly in USD" : "";
        currentStatusEl.textContent =
          "Currently using: " + ov.sourceLabel + " — applied " + fmtDate(ov.updatedAt) +
          " (" + ov.matchedCount + "/" + ov.totalCount + " SKUs" + currencyNote + ").";
        revertBtn.disabled = false;
      }
    });
  }
  renderCurrentStatus();

  function setParseStatus(msg, isError) {
    parseStatus.textContent = msg;
    parseStatus.classList.toggle("error", !!isError);
  }

  // ---- Manual mapping UI helpers ----

  function currentMappingFromUI() {
    return {
      sheetName: sheetSelect.value,
      headerRowIdx: Math.max(0, (parseInt(headerRowInput.value, 10) || 1) - 1),
      nameCol: nameColSelect.value === "" ? -1 : parseInt(nameColSelect.value, 10),
      priceCol: priceColSelect.value === "" ? -1 : parseInt(priceColSelect.value, 10),
      partCol: partColSelect.value === "" ? null : parseInt(partColSelect.value, 10),
      currency: currencyUSD.checked ? "USD" : "EUR",
    };
  }

  function populateColumnSelects(rows2d, headerRowIdx, preselect) {
    const headerRow = (rows2d[headerRowIdx] || []).map((c) => (typeof c === "string" ? c : ""));
    const maxCols = Math.max(headerRow.length, ...rows2d.slice(0, 5).map((r) => (r || []).length));

    function fillSelect(sel, includeNone) {
      sel.innerHTML = "";
      if (includeNone) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "(none)";
        sel.appendChild(opt);
      }
      for (let c = 0; c < maxCols; c++) {
        const label = headerRow[c] ? headerRow[c].trim() : "(blank)";
        const opt = document.createElement("option");
        opt.value = String(c);
        opt.textContent = colLetter(c) + ": " + label;
        sel.appendChild(opt);
      }
    }
    fillSelect(nameColSelect, false);
    fillSelect(priceColSelect, false);
    fillSelect(partColSelect, true);

    const nameGuess = preselect && preselect.nameCol != null && preselect.nameCol !== -1 ? preselect.nameCol : findColumn(headerRow, NAME_PATTERNS);
    const priceGuess = preselect && preselect.priceCol != null && preselect.priceCol !== -1 ? preselect.priceCol : findColumn(headerRow, PRICE_PATTERNS);
    const partGuess = preselect && preselect.partCol != null ? preselect.partCol : findColumn(headerRow, PART_PATTERNS);

    if (nameGuess !== -1) nameColSelect.value = String(nameGuess);
    if (priceGuess !== -1) priceColSelect.value = String(priceGuess);
    partColSelect.value = partGuess !== -1 && partGuess != null ? String(partGuess) : "";

    const currencyGuess = (preselect && preselect.currency) || detectCurrencyHint(rows2d) || "EUR";
    currencyEUR.checked = currencyGuess !== "USD";
    currencyUSD.checked = currencyGuess === "USD";
  }

  function renderPreview() {
    if (!currentWorkbook) return;
    const mapping = currentMappingFromUI();
    previewTable.innerHTML = "";
    try {
      const rows = parseWithMapping(currentWorkbook, mapping).slice(0, 8);
      const table = document.createElement("table");
      table.innerHTML =
        "<tr><th>Name</th><th>Part #</th><th>Price (" + mapping.currency + ")</th></tr>" +
        rows.map((r) => "<tr><td>" + r.name + "</td><td>" + (r.part || "") + "</td><td>" + r.price + "</td></tr>").join("");
      previewTable.appendChild(table);
    } catch (e) {
      previewTable.textContent = "Preview unavailable: " + e.message;
    }
  }

  function onSheetOrHeaderChange() {
    const sheet = currentWorkbook.Sheets[sheetSelect.value];
    const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    const headerRowIdx = Math.max(0, (parseInt(headerRowInput.value, 10) || 1) - 1);
    populateColumnSelects(rows2d, headerRowIdx, null);
    renderPreview();
  }

  sheetSelect.addEventListener("change", () => {
    const sheet = currentWorkbook.Sheets[sheetSelect.value];
    const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    headerRowInput.value = String(guessHeaderRow(rows2d) + 1);
    onSheetOrHeaderChange();
  });
  headerRowInput.addEventListener("change", onSheetOrHeaderChange);
  [nameColSelect, partColSelect, priceColSelect].forEach((el) => el.addEventListener("change", renderPreview));
  [currencyEUR, currencyUSD].forEach((el) => el.addEventListener("change", renderPreview));

  function showMappingUI(workbook, guess) {
    currentWorkbook = workbook;
    mappingCard.style.display = "";
    sheetSelect.innerHTML = "";
    workbook.SheetNames.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sheetSelect.appendChild(opt);
    });
    const initialSheet = (guess && guess.sheetName) || workbook.SheetNames[0];
    sheetSelect.value = initialSheet;
    const sheet = workbook.Sheets[initialSheet];
    const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    const headerRowIdx = guess ? guess.headerRowIdx : guessHeaderRow(rows2d);
    headerRowInput.value = String(headerRowIdx + 1);
    populateColumnSelects(rows2d, headerRowIdx, guess);
    renderPreview();
  }

  async function finalizeMerge(rows, currency, sourceDescription) {
    pendingCurrency = currency;
    pendingMerge = runMerge(rows);

    if (currency === "EUR") {
      setParseStatus("Fetching today's EUR/USD rate…", false);
      let fx = null;
      try {
        fx = await fetchFxRate();
        fxSourceEl.textContent = "auto-fetched from api.frankfurter.dev, ECB reference rate for " + fx.date;
      } catch (e) {
        fx = { rate: 1.1, date: null };
        fxSourceEl.textContent = "auto-fetch failed (" + e.message + ") - enter the rate manually below.";
      }
      currentFx = fx;
      fxRateInput.value = fx.rate;
      fxRow.style.display = "";
      materializeOverrides(pendingMerge.overrides, "EUR", fx.rate);
    } else {
      fxRow.style.display = "none";
      currentFx = null;
      materializeOverrides(pendingMerge.overrides, "USD", null);
    }

    if (!sourceLabelInput.value.trim()) {
      const now = new Date();
      sourceLabelInput.value = sourceDescription || "Price list uploaded " + now.toLocaleDateString();
    }

    renderReport(pendingMerge);
    setParseStatus("Parsed " + pendingMerge.sourceRowCount + " priced rows (" + currency + ").", false);
    applyBtn.disabled = false;
  }

  async function handleFile(file) {
    if (!file) return;
    applyBtn.disabled = true;
    reportSection.style.display = "none";
    mappingCard.style.display = "none";
    setParseStatus("Reading " + file.name + "…", false);
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      currentWorkbook = workbook;

      const auto = tryAutoDetect(workbook);
      if (auto) {
        const rows = parseWithMapping(workbook, auto);
        const now = new Date();
        const label =
          "AXIS Price List, " + now.toLocaleString("en-US", { month: "long", year: "numeric" }) +
          " (" + auto.sheetName + " sheet, auto-detected)";
        await finalizeMerge(rows, auto.currency, label);
      } else {
        setParseStatus(
          "Couldn't automatically recognize the layout of " + file.name + " - configure the columns below, check the preview, then click \"Use this mapping\".",
          true
        );
        showMappingUI(workbook, null);
      }
    } catch (e) {
      setParseStatus("Couldn't parse this file: " + e.message, true);
      pendingMerge = null;
    }
  }

  useMappingBtn.addEventListener("click", async () => {
    if (!currentWorkbook) return;
    const mapping = currentMappingFromUI();
    if (mapping.nameCol === -1 || mapping.priceCol === -1) {
      setParseStatus("Pick both a name column and a price column before continuing.", true);
      return;
    }
    try {
      const rows = parseWithMapping(currentWorkbook, mapping);
      const now = new Date();
      const label =
        "Price list (" + mapping.sheetName + " sheet), manually mapped " + now.toLocaleDateString();
      await finalizeMerge(rows, mapping.currency, label);
    } catch (e) {
      setParseStatus("Couldn't parse with this mapping: " + e.message, true);
    }
  });

  function renderReport(merge) {
    reportSection.style.display = "";
    const matched = merge.partMatched + merge.fallbackMatched;
    summaryEl.textContent =
      matched + " / " + merge.totalVariants + " catalog SKUs matched (" +
      merge.partMatched + " by part number, " + merge.fallbackMatched + " by name fallback). " +
      merge.unmatched.length + " unmatched.";

    sectionTableEl.innerHTML = "";
    const sections = Object.entries(merge.sectionStats).sort((a, b) => b[1][1] - a[1][1]);
    for (const [section, [m, t]] of sections) {
      const row = document.createElement("div");
      row.className = "section-row";
      row.innerHTML =
        "<span>" + section + "</span><span>" + m + " / " + t + "</span>";
      sectionTableEl.appendChild(row);
    }

    unmatchedListEl.innerHTML = "";
    if (merge.unmatched.length === 0) {
      unmatchedListEl.textContent = "None.";
    } else {
      const shown = merge.unmatched.slice(0, 30);
      for (const u of shown) {
        const li = document.createElement("div");
        li.className = "unmatched-row";
        li.textContent = u.modelKey + " (" + (u.part || "no part #") + ") — " + u.section;
        unmatchedListEl.appendChild(li);
      }
      if (merge.unmatched.length > shown.length) {
        const more = document.createElement("div");
        more.className = "unmatched-row muted";
        more.textContent = "…and " + (merge.unmatched.length - shown.length) + " more.";
        unmatchedListEl.appendChild(more);
      }
    }
  }

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));

  applyBtn.addEventListener("click", () => {
    if (!pendingMerge) return;

    // If the source was EUR and the user tweaked the rate after parsing,
    // re-materialize with the current field value before persisting.
    if (pendingCurrency === "EUR") {
      const rate = parseFloat(fxRateInput.value);
      if (!rate || rate <= 0) {
        setParseStatus("Enter a valid EUR/USD rate before applying.", true);
        return;
      }
      if (!currentFx || rate !== currentFx.rate) {
        // Overrides already materialized once; if the user edited the rate,
        // recompute msrp/msrp_display from the stored msrp_eur values.
        for (const key in pendingMerge.overrides) {
          const eur = pendingMerge.overrides[key].msrp_eur;
          if (eur == null) continue;
          const usd = Math.round(eur * rate);
          pendingMerge.overrides[key].msrp = usd;
          pendingMerge.overrides[key].msrp_display =
            "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
      }
    }

    const record = {
      updatedAt: Date.now(),
      sourceLabel: sourceLabelInput.value.trim() || "Price list (uploaded " + new Date().toLocaleDateString() + ")",
      currency: pendingCurrency,
      fxRate: pendingCurrency === "EUR" ? parseFloat(fxRateInput.value) : null,
      fxDate: (currentFx && currentFx.date) || (pendingCurrency === "EUR" ? "manual entry" : null),
      matchedCount: pendingMerge.partMatched + pendingMerge.fallbackMatched,
      totalCount: pendingMerge.totalVariants,
      overrides: pendingMerge.overrides,
    };
    chrome.storage.local.set({ catalogOverride: record }, () => {
      setParseStatus("Applied. Product Selector, search badges, and the popup will pick this up immediately.", false);
      renderCurrentStatus();
    });
  });

  revertBtn.addEventListener("click", () => {
    chrome.storage.local.remove("catalogOverride", () => {
      setParseStatus("Reverted to the prices bundled with this extension version.", false);
      renderCurrentStatus();
    });
  });

  // Match whichever theme the popup is currently using, for visual consistency.
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get("axisMsrpTheme", (r) => {
      if (r.axisMsrpTheme) document.documentElement.setAttribute("data-theme", r.axisMsrpTheme);
    });
  }
})();

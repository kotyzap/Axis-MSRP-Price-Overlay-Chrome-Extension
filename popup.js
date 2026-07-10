(function () {
  const MODELS = (typeof AXIS_CATALOG !== "undefined" && AXIS_CATALOG.models) || {};
  const flat = [];
  for (const model in MODELS) {
    for (const v of MODELS[model]) {
      if (v.msrp == null) continue;
      flat.push({ model, ...v });
    }
  }

  document.getElementById("countLabel").textContent =
    Object.keys(MODELS).length + " models / " + flat.length + " SKUs loaded";

  function fmt(n, currency) {
    const symbol = currency === "EUR" ? "€" : "$";
    return symbol + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const resultsEl = document.getElementById("results");
  const searchEl = document.getElementById("search");

  let currentCurrency = "USD";

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
      row.innerHTML =
        '<span class="price">' + priceText + '</span>' +
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
  render(search(""));

  // ---- Currency toggle (USD default / EUR) ----
  const usdBtn = document.getElementById("currencyUSD");
  const eurBtn = document.getElementById("currencyEUR");

  function setCurrency(next, persist) {
    currentCurrency = next === "EUR" ? "EUR" : "USD";
    usdBtn.classList.toggle("active", currentCurrency === "USD");
    eurBtn.classList.toggle("active", currentCurrency === "EUR");
    render(search(searchEl.value));
    if (persist && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ axisCurrency: currentCurrency });
    }
  }

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get("axisCurrency", (r) => {
      if (r.axisCurrency === "EUR") setCurrency("EUR", false);
    });
  }
  usdBtn.addEventListener("click", () => setCurrency("USD", true));
  eurBtn.addEventListener("click", () => setCurrency("EUR", true));

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

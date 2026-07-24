# Axis MSRP Price Overlay

**Axis MSRP list prices and chipset/hardware-generation info, shown directly on axis.com.** No second tab, no price list open on the side, no spec-sheet lookup — the numbers appear on the pages you were already browsing.

[![Available in the Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Add%20to%20Chrome-FFC800?style=for-the-badge&logo=googlechrome&logoColor=1a1a1a)](https://chromewebstore.google.com/detail/axis-msrp-price-overlay/gnegcekipfaapeboifcejnjmfemfigpl)
[![Version](https://img.shields.io/badge/version-3.4.4-1a1a1a?style=for-the-badge)](#installing)
[![Currencies](https://img.shields.io/badge/EUR%20%C2%B7%20USD%20%C2%B7%20JPY-1a1a1a?style=for-the-badge)](#currency--eur-usd-and-jpy)

![AXIS P13 Box Camera Series page with chipset and price range badges in the breadcrumb, price and chipset badges on every product card, and a Compare Products table with added Chipset and Price rows](docs/img/p13-series-hero.png)

Built for anyone who needs pricing and chipset info at a glance while browsing axis.com: sales and channel teams, marketing, Axis resellers and partners, and Axis employees.

---

## Contents

- [What it shows, and where](#what-it-shows-and-where)
- [Currency — EUR, USD and JPY](#currency--eur-usd-and-jpy)
- [Japanese and other axis.com locales](#japanese-and-other-axiscom-locales)
- [Filters panel](#filters-panel-product-selector)
- [Keeping prices current](#keeping-prices-current)
- [Keeping chipset info current](#keeping-chipset-info-current)
- [Installing](#installing)
- [Privacy](#privacy)

---

## What it shows, and where

### Product Selector

Every camera tile on [axis.com/support/tools/product-selector](https://www.axis.com/support/tools/product-selector) gets a price badge and, where known, a chipset label. A floating **Filters** panel narrows the whole page down by chipset generation and field of view, and series can be sorted cheapest-first.

![Axis Product Selector with a price badge and ARTPEC-8 chipset badge on every camera tile, and the floating filter panel open at bottom-right](docs/img/product-selector-overview.png)

<sub>Screenshot from an earlier build — badge styling is unchanged, but the panel is now titled **Filters** and adds the field-of-view slider and Baseball Tracker preset described [below](#filters-panel-product-selector).</sub>

![Close-up of M32, M42 and M43 series cards, each with a checkmarked ARTPEC-8 chipset badge above a yellow price badge](docs/img/inline-badges-overview.png)

Badges sit above the site's own captions and survive its hover overlays, so nothing the site wants to show you gets covered:

![AXIS M11 series cards where the middle card is hovered, showing the site's Technical specifications / Product page / Compare overlay with the chipset and price badges still legible on top](docs/img/badge-closeup.png)

### axis.com search results

Searching for a model (`M1137`) or a whole series (`Q35`) appends a price badge to each matching result title, plus a chipset badge when the result names one specific model.

![axis.com search results for P1388, each result title ending in a yellow EUR price badge](docs/img/search-results-badge.png)

### Product and category pages

Every product tile on a category or series page gets a price badge and chipset badge(s), pinned top-center over the product image — a specific price for one model, or a "from €X" cheapest-price badge for a whole series card.

![AXIS Q16 series category page with every product card showing a grouped ARTPEC 6-9 chipset badge and a yellow price badge](docs/img/category-page-cards.png)

The series page breadcrumb trail shows the full "from X to Y" range — the one place a true range is displayed — plus every chipset used across that series. The range is scoped to the models actually rendered as cards on that page, so retired same-prefix SKUs don't distort it or add phantom chipsets.

![AXIS Q16 Box Camera Series breadcrumb showing grouped chipset badges and a yellow from €1,209.00 to €4,229.00 price range badge](docs/img/series-breadcrumb-range.png)

Top-level category hub pages (e.g. axis.com/products/network-cameras) work too. Each tile there names a whole product category ("Box cameras," "Panoramic cameras," …) rather than one model or series, so it gets its own "from €X" figure and chipset badges aggregated across every SKU in that category, matched via the same "section" field the AXIS Price List itself groups products by.

Individual product pages get the same badges appended as a trailing breadcrumb crumb, falling back to under the `<h1>` if a page has no breadcrumb.

### Compare Products tables

The "Compare products" table on a series page gains two new rows at the very top — **Chipset** and **Price** — one column per model, so cost and hardware generation sit alongside every other spec.

![AXIS Q1656 Compare products table with Chipset and Price rows inserted above Max video resolution, one column per model](docs/img/compare-table-q16.png)

The same two rows are added to the [Product Selector comparison page](https://www.axis.com/support/tools/product-selector/comparison/):

![AXIS P1385 Compare products table with Chipset and Price rows at the top](docs/img/compare-table-p13.png)

### Toolbar popup

Look up any model name, part number, or variant directly, with price and chipset side by side. Results are capped at 60 rows; each row shows the part number, section, chipset badge and price.

<img src="docs/img/popup-search.png" alt="Extension popup with currency toggle, search box, and matched models showing part numbers, chipset badges and prices" width="380">

Every price badge carries a tooltip naming the price list it came from, plus the part number, variant, bulk-pack note, or `range across N variants (X to Y)`.

On **product and category pages only**, chipset badges are grouped for readability: older ARTPEC generations collapse into "ARTPEC 3-5," CamStreamer-supported generations collapse into "ARTPEC 6-9," and Ambarella variants are shown as "AMB" plus the model code (e.g. "AMB CV25"). Everywhere else — Product Selector, search, both comparison tables, and the popup — the exact chipset label is shown (`ARTPEC-9`, `ARTPEC-6/7`, `Ambarella A5S`). CamStreamer-supported chipsets are marked with a ✅ on every surface.

---

## Currency — EUR, USD and JPY

A three-way **€ EUR / $ USD / ¥ JPY** toggle in the popup switches which currency is shown everywhere — Product Selector, search, product pages, and the popup itself — instantly, with no reload needed.

| | Source | Format | Tilde? |
|---|---|---|---|
| **EUR** | Bundled AXIS Price List | `€1,234.00` | no — this is the list price |
| **USD** | FX-derived at build time | `~$1,405` | yes |
| **JPY** | FX-derived live from EUR | `~¥37.3万` | yes |

- **EUR** is the one authoritative figure. It's present for every product section except 2N (plus a handful of individual non-camera SKUs) — 325 of 377 SKUs.
- **USD** is baked into the catalog at build time and rounded to whole dollars. Most USD figures are FX-derived from EUR; where a SKU has no EUR entry at all, the figure is the original Axis US price list number instead.
- **JPY** is computed live from the EUR figure and shown in shortened **万** (*man*, = 10,000) units rather than a six-digit yen amount: rounded up to the nearest ¥1,000, then expressed with one decimal, dropping a trailing `.0`. So ¥372,274 renders as `~¥37.3万`, and a round amount as `~¥5万`.

Exchange rates come from [api.frankfurter.dev](https://api.frankfurter.dev) (ECB reference rates, no API key) and are cached locally. A **FX rates (EUR→USD/JPY)** panel in the popup shows the current figures and when they were last fetched — `1 EUR ≈ $1.1387 / ¥172.3 · updated 2 h ago` — with an **Update** button to refresh on demand. Rates also refresh automatically on install, on browser startup, and weekly.

Since JPY is the only currency that needs a live rate, JPY badges are suppressed rather than guessed when no rate has been cached yet, and the popup shows `— (no rate yet)`. EUR and USD are unaffected.

---

## Japanese and other axis.com locales

The extension works on every localized axis.com path (`/ja-jp/`, `/en-us/`, `/pt-br/`, …), not just the bare English URLs.

![Japanese Box camera category page with chipset badges and a from ~¥6万 to ~¥78.8万 range badge in the breadcrumb, and yen price badges on every product card](docs/img/jp-category-page-yen.png)

- **Locale-aware default currency.** On first run, the currency is inferred from the URL you're browsing: Japanese locales → **JPY**, Americas locales → **USD**, everything else → **EUR**. The inferred value is saved so the popup and every open tab agree. Once you pick a currency yourself, your choice always wins.
- **Japanese disclaimer text.** Selecting ¥ JPY swaps the popup's footer disclaimer to a full Japanese translation — MSRP vs. street price, the price-list vintage, the FX-derived nature of the yen figure, and the chipset data source.
- **Locale-independent matching.** Badges are placed using CSS classes and URL slugs rather than visible English text, so category hub tiles resolve correctly even when they read "ボックス型カメラ" or "Câmeras dome". Model designators (AXIS M1135 Mk II, Q6086-E) stay Latin on every locale, so model matching is unaffected.

![AXIS M11 Series cards on a Japanese page, each with a checkmarked ARTPEC-6/7 badge and a yen price badge reading ~¥9.3万 or ~¥11.2万](docs/img/jp-series-yen-badges.png)

<img src="docs/img/jp-popup-jpy.png" alt="Popup with JPY selected, showing live FX rates and search results with yen prices in man units, and the disclaimer switched to Japanese" width="330">

Note that on-page injected labels ("Chipset", "Price", "Min. field of view", "Sort series by cheapest price") and the settings page remain in English.

---

## Filters panel (Product Selector)

<img src="docs/img/chipset-filter-detail.png" alt="Floating filter panel with grouped chipset checkboxes, a CamStreamer preset, a shown-count and a Clear button" width="260" align="right">

The floating panel, bottom-right, collapsible, with an `N / M shown` counter (displayed only while a filter is active) and a **Clear** button that clears the chipset selection and resets the FOV slider:

- **Chipset filter** — grouped checkboxes for `ARTPEC-9`, `ARTPEC-8`, `ARTPEC-6/7`, `ARTPEC-3/4/5` and `Ambarella` (covering CV75/CV25/S3L/S2L/S2E/A5S), plus two quick presets:
  - **CamStreamer Support** → ARTPEC-9, ARTPEC-8, ARTPEC-6/7.
  - **Baseball Tracker** → ARTPEC-9 and ARTPEC-8 only, the DLPU-capable chipsets that app requires.

  Presets and individual checkboxes stay in sync both ways.
- **Min. field of view** — a slider from 0° (off) to 180° that hides cameras whose published horizontal FOV never reaches the threshold. It matches on each model's **widest** figure, so a varifocal qualifies if its wide end is wide enough. The filter is **fail-open**: models with no FOV data yet always stay visible.
- **Sort series by cheapest price** — on by default. Series are ranked by their cheapest *currently visible* card, so the order re-ranks as you change filters. Series with zero visible cards are always hidden, which in practice only shows up once a filter is narrowing things down. (The **Clear** button doesn't touch this checkbox.)

Chipset and FOV filters combine with AND, and all three settings persist between visits.

<sub>Panel screenshot is from an earlier build: the header now reads **Filters**, the hide-empty-series checkbox is gone (it's always on), the preset is relabelled **CamStreamer Support**, and the field-of-view slider has been added.</sub>

### Sorting, before and after

| Off | On |
|---|---|
| ![Series in the Product Selector's default order, M11 followed by M30](docs/img/sort-before.png) | ![Modular cameras jumps ahead of M30 as the cheapest visible series](docs/img/sort-after.png) |

### FOV data

FOV figures are hand-curated from each model's own axis.com Technical specifications table (Lens → Horizontal field of view), since there's no scrapeable source. Coverage is deliberately partial and grows series by series — currently 80 entries covering one representative model per M/P/Q sub-series, the F/FA modular sensors, and per-lens-option thermal SKUs (e.g. `Q1961-TE 7 MM`). Values range from 2.0° (Q6086-E at full tele) to 360° (P3747-PLVE). This is why the filter is fail-open. Unlike chipset data, FOV data does not auto-refresh.

---

## Keeping prices current

The extension ships with a recent Axis public price list bundled in as the default — currently the **AXIS Price List, July 2026 (EUR)**, with USD derived at EUR/USD = 1.1387 (xe.com, 2026-07-14). Axis publishes a new price list roughly every month, and refreshing is built in — no reinstall, no waiting on a new extension version.

![Settings page with a drop zone for the monthly AXIS Price List file, a source label field, and Apply update / Revert to bundled prices buttons](docs/img/price-list-upload.png)

1. Click the extension icon, then the **⚙** gear button next to the theme toggle.
2. Drag the new month's official AXIS Price List `.xls`/`.xlsx` file onto the drop zone (or click to pick the file). Everything happens locally in your browser — the file itself never leaves your machine.
3. The standard AXIS Price List format is recognized and mapped automatically: sheets named "All products" then "Camera" are prioritized, the header row is guessed, and columns are matched by name pattern. For anything else (a different layout, a one-off export), a simple column-mapping screen lets you point out which column is the model name, which is the price, and so on, with a live preview before anything is applied.
4. **Source currency** can be € EUR, $ USD or ¥ JPY, auto-sniffed from the first few rows of the file. An editable **EUR→USD** rate is shown for EUR and JPY files (a JPY file is converted JPY → EUR → USD via an additional **EUR→JPY** field); a USD file is taken verbatim and needs no rate. Rates are auto-fetched from api.frankfurter.dev with the ECB reference date shown, and editing one re-derives the figures before you apply. A free-text **Source label** field records where the data came from, shown on the settings page's own status line.
5. Before committing, you'll see a coverage report — how many products matched, split into part-number matches vs. name fallbacks, broken down by category, plus any unmatched SKUs — so you know exactly what changed.
6. **Revert to bundled prices** is always available if you want to go back to the default data that shipped with the extension.

---

## Keeping chipset info current

Chipset labels are sourced from CamStreamer's published camera-compatibility list and refresh automatically on install, on browser startup, and about once a week. A manual **Update** button in the popup refreshes it on demand at any time. A sanity floor of 200 models guards the data: if CamStreamer's markup ever changes and fewer models parse, good data isn't overwritten and the error surfaces in the popup status line.

### Other popup details

- Header shows the version read from the manifest, plus a **🌓 light/dark theme toggle**. The settings page has no toggle of its own but follows whatever the popup is set to.
- Subtitle counter: `N models / M SKUs loaded`.
- Chipset status line: `N models · updated 3 days ago`, or the failure reason.

---

## Installing

Install from the Chrome Web Store: **[Axis MSRP Price Overlay](https://chromewebstore.google.com/detail/axis-msrp-price-overlay/gnegcekipfaapeboifcejnjmfemfigpl)** → **Add to Chrome**. No developer mode, and Chrome keeps it updated from then on.

![The Axis MSRP Price Overlay listing on the Chrome Web Store, with its rating, screenshot gallery and install button](docs/img/webstore-install.png)

Any axis.com tabs you already have open (Product Selector, search, product/category pages) pick it up automatically within a moment — including locale-prefixed URLs like `/ja-jp/` — with no need to reload or visit a specific page first.

### Running from source

For development, or to run a build before it reaches the store: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select this folder. Unpacked installs don't auto-update — click **Reload** on the extension card after pulling changes.

![Chrome's chrome://extensions page with Developer mode enabled and the Load unpacked button highlighted](docs/img/install-load-unpacked.png)

### Packaging note

When zipping this up for the Chrome Web Store developer dashboard, the dashboard enforces a **132-character limit on `manifest.json`'s `description` field** — longer than that, and the upload is rejected with "The description field in manifest is too long." Keep any future edits to `description` under that limit.

---

## Privacy

No data collection, no analytics, no accounts. The only network requests are to camstreamer.com (chipset compatibility list) and api.frankfurter.dev (ECB exchange rates), both declared in the manifest. Price-list files you upload are parsed entirely in your browser and never leave your machine.

---

## Documentation

A full illustrated overview lives in `docs/`:

- English: [`docs/index.html`](docs/index.html)
- 日本語: [`docs/index.ja.html`](docs/index.ja.html)

## Disclaimer

Personal project — not affiliated with, endorsed by, or sponsored by Axis Communications AB. AXIS® is a trademark of Axis Communications AB. Prices are MSRP list prices, not street prices. USD and JPY figures are estimates, not independently published Axis price lists. Chipset info is sourced from CamStreamer's published app-compatibility list, not from Axis.

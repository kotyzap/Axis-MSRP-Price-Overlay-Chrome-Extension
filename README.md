# Axis MSRP Price Overlay (Q2/26 MSRPs)

Shows Axis MSRP list prices and CamStreamer-sourced chipset info inline on the [Axis Product Selector](https://www.axis.com/support/tools/product-selector) and on [axis.com search results](https://www.axis.com/search), with a floating chipset filter panel and a toolbar popup for looking up any model/part number.

<img width="1090" height="583" alt="badge-closeup" src="https://github.com/user-attachments/assets/3e818e6c-1036-4927-8668-8b3137e58cb7" />

## Install (unpacked, since this isn't published to the Chrome Web Store)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `axis-msrp-extension` folder.
4. Open the [Product Selector](https://www.axis.com/support/tools/product-selector) — each recognized product tile gets a yellow MSRP badge (hover for the Axis part number) and, where known, a small dark chipset label above it. A floating "Chipset filter" panel appears bottom-right — check ARTPEC-9/8/6-7/etc. to hide everything else (multi-select, unlike the site's own single-select "System-on-chip" dropdown), or click **CamStreamer ACAPs (ARTPEC 6–9)** to instantly select the three chipset families CamStreamer apps run on (the answer to "what's the cheapest camera that supports CamStreamer ACAPs").
5. Search [axis.com/search](https://www.axis.com/search?q=M1137) for a model name (e.g. `M1137`) or a whole series (e.g. `M11` or `Q35`) — each result whose bold title names a recognized model gets a yellow price badge appended to the end of that title: an exact price (or a variant range) for one specific model, or "from $X" when the title only names a series/family spanning several models.
6. Click the extension icon and use the **$ USD / € EUR** toggle at the top of the popup (USD is the default) to switch which currency shows everywhere — Product Selector, search results, and the popup's own model search all update immediately, no reload needed.

## Data sources

- **Prices (USD)** — `catalog-data.js` bundles 290 models / 377 SKUs extracted from Axis's Q1 2026 "cheat sheet" price list PDF (MSRP, USD). Coverage isn't 100%: a handful of very new SKUs, some VMS software licenses, and a few accessory items aren't priced individually in that PDF. To refresh with a newer price list, regenerate `catalog-data.js` from the new PDF and reload the extension.
- **Prices (EUR)** — the same file also carries an `msrp_eur` figure per SKU, joined from the Axis EE (Eastern Europe) January 2026 price list by part number, with a same-model-name fallback for the handful of PTZ SKUs that use different region-specific part numbers for 50Hz/60Hz variants. That source only covers actual camera products (dome/box/modular/PTZ/panoramic/thermal/bullet/explosion-protected) — non-camera categories like 2N, video recorders, network audio, access control, encoders, and accessories simply have no EUR data, since they weren't in the uploaded price list (it's the "Camera" sheet of a larger multi-tab spreadsheet). When a specific SKU has no EUR price, no badge is shown for it in EUR mode rather than guessing.
- **Chipsets** — `chipset-data.js` bundles an initial snapshot (579 models) parsed from [camstreamer.com's supported-camera list](https://camstreamer.com/download-app-all-supported-cameras). This isn't an Axis-published spec; it's inferred from which CamStreamer app build (and CPU architecture) each camera runs, since CamStreamer only ships one binary per chipset family. Two consequences: only cameras CamStreamer supports have a chipset shown (no storage/audio/access-control/etc. devices, and no brand-new unreleased models), and older firmware-era ARTPEC-6 and ARTPEC-7 cameras are reported as a combined "ARTPEC-6/7" since CamStreamer's own compatibility data doesn't separate them.

## Keeping chipset data current

- The background service worker refreshes it automatically once a week.
- Click **Update** next to "Chipset data (CamStreamer)" in the popup to refresh on demand at any time.
- Both paths just re-fetch and re-parse the CamStreamer page live — no reinstall needed. Prices, by contrast, are static until you regenerate `catalog-data.js` from a new PDF.

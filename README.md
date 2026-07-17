# Axis MSRP Price Overlay

See Axis MSRP list prices and chipset/hardware-generation info directly on axis.com — on the Product Selector, on search results, and on every product and category page — without opening a separate price list or spec sheet.

<img width="70%" alt="badge-closeup" src="https://github.com/user-attachments/assets/dd3c7a60-6ddf-40f2-97f5-727dbe046a3d" />

Built for anyone who needs pricing and chipset info at a glance while browsing axis.com: sales and channel teams, marketing, Axis resellers and partners, and Axis employees.

## What it shows, and where

- **Product Selector** (axis.com/support/tools/product-selector) — every camera tile gets a price badge and, where known, a chipset label. A floating chipset filter panel lets you narrow the whole page down to specific chipset generations (e.g. only cameras with CamStreamer app support), and series can be sorted cheapest-first.
- **axis.com search results** — searching for a model (e.g. `M1137`) or a whole series (e.g. `Q35`) appends a price badge to each matching result title, plus a chipset badge when the result names one specific model.
- **Product and category pages** (axis.com/products/...):
  - Category pages (e.g. a hub page like "Box cameras," or a series page like "AXIS Q17 Box Camera Series") — every product tile gets a price badge and chipset badge(s), a specific price for one model or a "from $X" range for a whole series card.
  - The series page breadcrumb trail shows the full price range and every chipset used across that series in one place.
  - Individual product pages get the same price + chipset badges next to the product name.
  - The "Compare products" table on a series page gets two new rows at the top — **Chipset** and **Price** — one column per model, so you can compare cost and hardware generation right alongside every other spec.

 <img width="1387" height="623" alt="Screenshot 2026-07-17 at 14 42 05" src="https://github.com/user-attachments/assets/405fda81-351c-4d96-918c-305a2d95f287" />

  
- **Toolbar popup** — look up any model name or Axis part number directly, with its price and chipset shown side by side.

Chipset badges are grouped for readability: older ARTPEC generations collapse into "ARTPEC 3-5," CamStreamer-supported generations collapse into "ARTPEC 6-9" (marked with a ✅), and Ambarella variants are shown as "AMB" plus the model code (e.g. "AMB A5S").

<img width="1203" height="960" alt="sort-after" src="https://github.com/user-attachments/assets/ccdd4dec-2cf5-4a6d-9792-7c9915cbb82d" />

## Currency

A € EUR / $ USD toggle in the popup switches which currency is shown everywhere — Product Selector, search, product pages, and the popup itself — instantly, with no reload needed.

## Keeping prices current

The extension ships with a recent Axis public price list bundled in as the default (currently Q2 2026 pricing). Axis publishes a new price list roughly every month, and refreshing is built in — no reinstall, no waiting on a new extension version:

1. Click the extension icon, then the **⚙** gear button next to the theme toggle.
2. Drag the new month's official AXIS Price List `.xls`/`.xlsx` file onto the drop zone (or click to pick the file). Everything happens locally in your browser — the file itself never leaves your machine.
3. The standard AXIS Price List format is recognized and mapped automatically. For anything else (a different layout, a one-off export), a simple column-mapping screen lets you point out which column is the model name, which is the price, and so on, with a live preview before anything is applied.
4. Before committing, you'll see a coverage report — how many products matched, broken down by category, and anything that didn't match — so you know exactly what changed.
5. **Revert to bundled prices** is always available if you want to go back to the default data that shipped with the extension.

## Keeping chipset info current

Chipset labels are sourced from CamStreamer's published camera-compatibility list and refresh automatically about once a week. A manual **Update** button in the popup refreshes it on demand at any time.

## Installing

This extension isn't published to the Chrome Web Store, so it's installed as an unpacked extension:

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder.
4. Visit the Product Selector, axis.com search, or any axis.com product/category page to see it in action.

### Packaging note

If this is ever zipped up and uploaded through the Chrome Web Store developer dashboard (rather than loaded unpacked), the dashboard enforces a **132-character limit on `manifest.json`'s `description` field** — longer than that, and the upload is rejected with "The description field in manifest is too long." Keep any future edits to `description` under that limit.

<img width="1752" height="3237" alt="AXIS P13 Box Camera Series _ Axis Communications" src="https://github.com/user-attachments/assets/21ba2e7e-c969-4a85-9e9b-98fb764889de" />


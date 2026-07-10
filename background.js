// Background service worker: fetches CamStreamer's "all supported cameras" page,
// parses it into a { MODEL: "canonical chipset" } map, and stores it in
// chrome.storage.local for content.js / popup.js to read.

const CAMSTREAMER_URL = "https://camstreamer.com/download-app-all-supported-cameras";
const REFRESH_ALARM = "refreshChipsets";
const MIN_EXPECTED_MODELS = 200; // sanity floor - if CamStreamer changes markup, don't overwrite good data with garbage

function canonicalize(label) {
  const l = label.toUpperCase();
  if (l.includes("ARTPEC-9")) return "ARTPEC-9";
  if (l.includes("ARTPEC-8")) return "ARTPEC-8";
  if (l.includes("ARTPEC-7") || l.includes("ARTPEC-6")) return "ARTPEC-6/7";
  if (l.includes("ARTPEC-5")) return "ARTPEC-5";
  if (l.includes("ARTPEC-4")) return "ARTPEC-4";
  if (l.includes("ARTPEC-3")) return "ARTPEC-3";
  if (l.includes("CV75")) return "Ambarella CV75";
  if (l.includes("CV25") || l.includes("S5")) return "Ambarella CV25";
  if (l.includes("S3L")) return "Ambarella S3L";
  if (l.includes("S2L")) return "Ambarella S2L";
  if (l.includes("S2E")) return "Ambarella S2E";
  if (l.includes("A5S")) return "Ambarella A5S";
  return label.trim();
}

function parseChipsets(html) {
  const smallRe = /<small class="text--medium">([\s\S]*?)<\/small>/g;
  const chipRe = /<div class="text--medium text--heavy">([\s\S]*?)<\/div>/g;
  const smalls = [...html.matchAll(smallRe)].map((m) => m[1]);
  const chips = [...html.matchAll(chipRe)].map((m) =>
    m[1].replace(/<br\s*\/?>/gi, "\n").replace(/&nbsp;/g, " ").trim()
  );

  const buckets = {}; // MODEL -> Set of canonical labels seen
  const n = Math.min(smalls.length, chips.length);
  for (let i = 0; i < n; i++) {
    const lines = chips[i].split("\n").map((s) => s.trim()).filter(Boolean);
    const rawLabel = lines[0] || "";
    if (!rawLabel) continue;
    const canon = canonicalize(rawLabel);
    const models = smalls[i].split(",").map((s) => s.trim()).filter(Boolean);
    for (const m of models) {
      const key = m.toUpperCase().replace(/^AXIS\s+/, "").trim();
      if (!key) continue;
      if (!buckets[key]) buckets[key] = new Set();
      buckets[key].add(canon);
    }
  }

  const result = {};
  const conflicts = [];
  for (const [key, set] of Object.entries(buckets)) {
    const labels = [...set];
    if (labels.length > 1) conflicts.push({ key, labels });
    result[key] = labels[0];
  }
  return { chipsets: result, conflicts, blockCount: n };
}

async function refreshChipsetData() {
  const res = await fetch(CAMSTREAMER_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status + " fetching CamStreamer page");
  const html = await res.text();
  const { chipsets, conflicts, blockCount } = parseChipsets(html);
  const count = Object.keys(chipsets).length;
  if (count < MIN_EXPECTED_MODELS) {
    throw new Error(
      "Only parsed " + count + " models (expected 200+) - CamStreamer page structure may have changed"
    );
  }
  await chrome.storage.local.set({
    chipsetData: chipsets,
    chipsetUpdatedAt: Date.now(),
    chipsetModelCount: count,
    chipsetLastError: null,
  });
  return { count, blockCount, conflictCount: conflicts.length };
}

async function refreshAndRecordError() {
  try {
    return await refreshChipsetData();
  } catch (e) {
    await chrome.storage.local.set({ chipsetLastError: String((e && e.message) || e) });
    throw e;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 60 * 24 * 7 }); // weekly
  refreshAndRecordError().catch(() => {});
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    refreshAndRecordError().catch(() => {});
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) refreshAndRecordError().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "REFRESH_CHIPSETS") {
    refreshAndRecordError()
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true; // keep the message channel open for the async response
  }
});

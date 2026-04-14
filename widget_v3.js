const STATUS_URL = "https://raw.githubusercontent.com/SaberMIM/prjx-lp-monitor/main/status.json?ts=" + Date.now();
const MAX_POSITIONS = 3;

const req = new Request(STATUS_URL);
req.headers = { "Cache-Control": "no-cache" };

let data = {};
try {
  data = await req.loadJSON();
} catch (e) {
  data = { error: "Impossible de charger status.json" };
}

const w = new ListWidget();
w.setPadding(14, 14, 14, 14);
w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

const bg = new LinearGradient();
bg.locations = [0, 0.55, 1];
bg.colors = [new Color("#0A0E14"), new Color("#121826"), new Color("#1A2233")];
w.backgroundGradient = bg;

function addText(stack, text, size = 12, opacity = 1, bold = false, color = null) {
  const t = stack.addText(String(text));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color || new Color("#FFFFFF", opacity);
  t.lineLimit = 1;
  return t;
}

function getRiskScore(p) {
  return p.inRange ? Math.min(p.distToLowerPct, p.distToUpperPct) : -1;
}

function sortPositions(positions) {
  return [...positions].sort((a, b) => getRiskScore(a) - getRiskScore(b));
}

function getGlobalState(json) {
  if (!Array.isArray(json.positions) || json.positions.length === 0) return "EMPTY";
  if ((json.outOfRangeCount || 0) > 0) return "ALERT";
  const hasNear = json.positions.some(p => p.inRange && Math.min(p.distToLowerPct, p.distToUpperPct) <= 5);
  return hasNear ? "WATCH" : "OK";
}

function stateColors(state) {
  if (state === "ALERT") return { bg: new Color("#3A1820"), fg: new Color("#FCA5A5") };
  if (state === "WATCH") return { bg: new Color("#3A3018"), fg: new Color("#FCD34D") };
  if (state === "OK") return { bg: new Color("#13291F"), fg: new Color("#86EFAC") };
  return { bg: new Color("#202938"), fg: new Color("#CBD5E1") };
}

function metricBlock(parent, label, value, alignRight = false) {
  const box = parent.addStack();
  box.layoutVertically();
  if (alignRight) box.centerAlignContent();
  const l = box.addText(label);
  l.font = Font.systemFont(10);
  l.textColor = new Color("#FFFFFF", 0.5);
  const v = box.addText(value);
  v.font = Font.boldSystemFont(12);
  v.textColor = new Color("#FFFFFF");
  return box;
}

function bar(parent, leftPct, rightPct) {
  const wrap = parent.addStack();
  wrap.layoutHorizontally();
  wrap.size = new Size(0, 6);
  wrap.cornerRadius = 3;
  wrap.backgroundColor = new Color("#FFFFFF", 0.08);

  const total = Math.max(leftPct + rightPct, 0.0001);
  const leftShare = Math.max(0.08, Math.min(0.92, leftPct / total));
  const rightShare = 1 - leftShare;

  const left = wrap.addStack();
  left.size = new Size(Math.max(8, Math.floor(160 * leftShare)), 6);
  left.backgroundColor = new Color("#60A5FA");
  left.cornerRadius = 3;

  const gap = wrap.addStack();
  gap.size = new Size(3, 6);
  gap.backgroundColor = new Color("#FFFFFF", 0);

  const right = wrap.addStack();
  right.size = new Size(Math.max(8, Math.floor(160 * rightShare)), 6);
  right.backgroundColor = new Color("#F59E0B");
  right.cornerRadius = 3;

  return wrap;
}

const globalState = getGlobalState(data);
const palette = stateColors(globalState);

const header = w.addStack();
header.layoutHorizontally();
header.centerAlignContent();

const headerLeft = header.addStack();
headerLeft.layoutVertically();
addText(headerLeft, "PROJECT X LP", 11, 0.56, true);
const subtitleText = Array.isArray(data.positions)
  ? `${data.activePositionsCount || 0} active · ${(data.outOfRangeCount || 0)} out`
  : "monitor";
addText(headerLeft, subtitleText, 13, 1, true);

header.addSpacer();

const badge = header.addStack();
badge.setPadding(5, 10, 5, 10);
badge.cornerRadius = 10;
badge.backgroundColor = palette.bg;
addText(badge, globalState, 10, 1, true, palette.fg);

w.addSpacer(12);

if (data.error) {
  const err = w.addStack();
  err.layoutVertically();
  err.setPadding(12, 12, 12, 12);
  err.cornerRadius = 12;
  err.backgroundColor = new Color("#FFFFFF", 0.06);
  addText(err, "Erreur de chargement", 14, 1, true);
  err.addSpacer(4);
  addText(err, data.error, 11, 0.7, false);
} else if (!Array.isArray(data.positions) || data.positions.length === 0) {
  const empty = w.addStack();
  empty.layoutVertically();
  empty.setPadding(12, 12, 12, 12);
  empty.cornerRadius = 12;
  empty.backgroundColor = new Color("#FFFFFF", 0.06);
  addText(empty, "Aucune position active", 14, 1, true);
  empty.addSpacer(4);
  addText(empty, "Le wallet ne remonte actuellement aucune LP active.", 11, 0.68, false);
} else {
  const sorted = sortPositions(data.positions).slice(0, MAX_POSITIONS);

  for (let i = 0; i < sorted.length; i += 1) {
    const p = sorted[i];
    const card = w.addStack();
    card.layoutVertically();
    card.setPadding(10, 10, 10, 10);
    card.cornerRadius = 13;
    card.backgroundColor = new Color("#FFFFFF", 0.055);
    card.borderWidth = 1;
    card.borderColor = new Color("#FFFFFF", 0.05);

    const top = card.addStack();
    top.layoutHorizontally();
    top.centerAlignContent();
    addText(top, p.pair, 13, 1, true);
    top.addSpacer();
    const stateColor = p.inRange ? new Color("#86EFAC") : new Color("#FCA5A5");
    addText(top, p.inRange ? "IN RANGE" : "OUT", 10, 1, true, stateColor);

    card.addSpacer(3);

    const sub = card.addStack();
    sub.layoutHorizontally();
    addText(sub, `#${p.tokenId}`, 11, 0.64, false);
    sub.addSpacer();
    const edgeText = p.inRange ? `${Math.min(p.distToLowerPct, p.distToUpperPct)}% to edge` : "outside range";
    addText(sub, edgeText, 11, 0.64, false);

    card.addSpacer(8);

    bar(card, Math.max(0.01, p.distToLowerPct), Math.max(0.01, p.distToUpperPct));

    card.addSpacer(8);

    const metrics = card.addStack();
    metrics.layoutHorizontally();
    metricBlock(metrics, "Lower", `${p.distToLowerPct}%`);
    metrics.addSpacer();
    metricBlock(metrics, "Upper", `${p.distToUpperPct}%`, true);

    if (i < sorted.length - 1) {
      w.addSpacer(8);
    }
  }
}

w.addSpacer();

const footer = w.addStack();
footer.layoutHorizontally();
addText(footer, data.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Updated --:--", 10, 0.45, false);
footer.addSpacer();
addText(footer, "LP Monitor", 10, 0.32, false);

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentMedium();
}

Script.complete();

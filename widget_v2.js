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
bg.locations = [0, 1];
bg.colors = [new Color("#10131A"), new Color("#1A2230")];
w.backgroundGradient = bg;

function addText(line, size = 12, opacity = 1, bold = false) {
  const t = w.addText(String(line));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color("#FFFFFF", opacity);
  t.lineLimit = 1;
  return t;
}

function addMuted(line, size = 11) {
  return addText(line, size, 0.68, false);
}

function riskScore(p) {
  return p.inRange ? Math.min(p.distToLowerPct, p.distToUpperPct) : -1;
}

function globalStatusLabel(json) {
  if (json.outOfRangeCount > 0) return "ALERTE";
  if (Array.isArray(json.positions) && json.positions.some(p => p.inRange && Math.min(p.distToLowerPct, p.distToUpperPct) <= 5)) return "SURVEILLANCE";
  return "STABLE";
}

const topRow = w.addStack();
topRow.layoutHorizontally();
topRow.centerAlignContent();

const left = topRow.addStack();
left.layoutVertically();
left.size = new Size(0, 0);

const title = left.addText("Project X LP");
title.font = Font.boldSystemFont(16);
title.textColor = new Color("#FFFFFF");

const subtitle = left.addText(Array.isArray(data.positions) ? `${data.activePositionsCount || 0} position${(data.activePositionsCount || 0) > 1 ? "s" : ""}` : "Widget");
subtitle.font = Font.systemFont(11);
subtitle.textColor = new Color("#FFFFFF", 0.68);

topRow.addSpacer();

const badgeWrap = topRow.addStack();
badgeWrap.setPadding(5, 10, 5, 10);
badgeWrap.cornerRadius = 10;

const badgeText = globalStatusLabel(data);
if (badgeText === "ALERTE") {
  badgeWrap.backgroundColor = new Color("#40202A");
} else if (badgeText === "SURVEILLANCE") {
  badgeWrap.backgroundColor = new Color("#3A311A");
} else {
  badgeWrap.backgroundColor = new Color("#1B2C24");
}

const badge = badgeWrap.addText(badgeText);
badge.font = Font.boldSystemFont(10);
badge.textColor = new Color("#FFFFFF");

w.addSpacer(12);

if (data.error) {
  addText("Erreur de chargement", 14, 1, true);
  w.addSpacer(4);
  addMuted(data.error, 11);
} else if (!Array.isArray(data.positions) || data.positions.length === 0) {
  addText("Aucune position active", 14, 1, true);
  w.addSpacer(4);
  addMuted("Le wallet ne remonte aucune LP active actuellement.");
} else {
  const sorted = [...data.positions].sort((a, b) => riskScore(a) - riskScore(b));
  const top = sorted.slice(0, MAX_POSITIONS);

  for (let i = 0; i < top.length; i += 1) {
    const p = top[i];

    const card = w.addStack();
    card.layoutVertically();
    card.setPadding(10, 10, 10, 10);
    card.backgroundColor = new Color("#FFFFFF", 0.06);
    card.cornerRadius = 12;
    card.borderWidth = 1;
    card.borderColor = new Color("#FFFFFF", 0.06);

    const row1 = card.addStack();
    row1.layoutHorizontally();
    row1.centerAlignContent();

    const pair = row1.addText(`${p.pair}`);
    pair.font = Font.boldSystemFont(13);
    pair.textColor = new Color("#FFFFFF");
    pair.lineLimit = 1;

    row1.addSpacer();

    const state = row1.addText(p.inRange ? "IN RANGE" : "OUT");
    state.font = Font.boldSystemFont(10);
    state.textColor = p.inRange ? new Color("#A7F3D0") : new Color("#FCA5A5");

    card.addSpacer(3);

    const row2 = card.addStack();
    row2.layoutHorizontally();

    const token = row2.addText(`#${p.tokenId}`);
    token.font = Font.systemFont(11);
    token.textColor = new Color("#FFFFFF", 0.68);

    row2.addSpacer();

    const closest = p.inRange ? `${Math.min(p.distToLowerPct, p.distToUpperPct)}% du bord` : "hors range";
    const closestText = row2.addText(closest);
    closestText.font = Font.systemFont(11);
    closestText.textColor = new Color("#FFFFFF", 0.68);

    card.addSpacer(8);

    const metrics = card.addStack();
    metrics.layoutHorizontally();

    const leftMetric = metrics.addStack();
    leftMetric.layoutVertically();
    const l1 = leftMetric.addText("Lower");
    l1.font = Font.systemFont(10);
    l1.textColor = new Color("#FFFFFF", 0.55);
    const l2 = leftMetric.addText(`${p.distToLowerPct}%`);
    l2.font = Font.boldSystemFont(12);
    l2.textColor = new Color("#FFFFFF");

    metrics.addSpacer();

    const rightMetric = metrics.addStack();
    rightMetric.layoutVertically();
    const u1 = rightMetric.addText("Upper");
    u1.font = Font.systemFont(10);
    u1.textColor = new Color("#FFFFFF", 0.55);
    const u2 = rightMetric.addText(`${p.distToUpperPct}%`);
    u2.font = Font.boldSystemFont(12);
    u2.textColor = new Color("#FFFFFF");

    if (i < top.length - 1) {
      w.addSpacer(8);
    }
  }
}

w.addSpacer();

const footer = w.addStack();
footer.layoutHorizontally();

const updatedLabel = footer.addText(data.updatedAt ? `Maj ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Maj --:--");
updatedLabel.font = Font.systemFont(10);
updatedLabel.textColor = new Color("#FFFFFF", 0.5);

footer.addSpacer();

const brand = footer.addText("Scriptable");
brand.font = Font.systemFont(10);
brand.textColor = new Color("#FFFFFF", 0.35);

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentMedium();
}

Script.complete();

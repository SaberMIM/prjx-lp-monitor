const STATUS_URL = "https://raw.githubusercontent.com/SaberMIM/prjx-lp-monitor/main/status.json?ts=" + Date.now();
const MAX_POSITIONS = 2;

const req = new Request(STATUS_URL);
req.headers = { "Cache-Control": "no-cache" };

let data = {};
try {
  data = await req.loadJSON();
} catch (e) {
  data = { error: "Impossible de charger status.json" };
}

const w = new ListWidget();
w.setPadding(16, 16, 16, 16);
w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
w.backgroundColor = new Color("#111214");

function t(stack, text, size = 12, opts = {}) {
  const item = stack.addText(String(text));
  item.font = opts.bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  item.textColor = opts.color || new Color("#FFFFFF", opts.opacity ?? 1);
  item.lineLimit = opts.lineLimit ?? 1;
  return item;
}

function riskScore(p) {
  return p.inRange ? Math.min(p.distToLowerPct, p.distToUpperPct) : -1;
}

function getState(json) {
  if (!Array.isArray(json.positions) || json.positions.length === 0) return "EMPTY";
  if ((json.outOfRangeCount || 0) > 0) return "ALERT";
  const watch = json.positions.some(p => p.inRange && Math.min(p.distToLowerPct, p.distToUpperPct) <= 5);
  return watch ? "WATCH" : "OK";
}

function pill(parent, label, state) {
  const s = parent.addStack();
  s.setPadding(4, 9, 4, 9);
  s.cornerRadius = 10;

  if (state === "ALERT") {
    s.backgroundColor = new Color("#3A2024");
    t(s, label, 10, { bold: true, color: new Color("#FFB4BD") });
    return;
  }

  if (state === "WATCH") {
    s.backgroundColor = new Color("#3A3320");
    t(s, label, 10, { bold: true, color: new Color("#F6D88C") });
    return;
  }

  if (state === "OK") {
    s.backgroundColor = new Color("#203126");
    t(s, label, 10, { bold: true, color: new Color("#AEE7B8") });
    return;
  }

  s.backgroundColor = new Color("#25272B");
  t(s, label, 10, { bold: true, color: new Color("#D4D7DD") });
}

function divider() {
  const d = w.addStack();
  d.size = new Size(0, 1);
  d.backgroundColor = new Color("#FFFFFF", 0.08);
}

const state = getState(data);

const header = w.addStack();
header.layoutHorizontally();
header.centerAlignContent();

const headerLeft = header.addStack();
headerLeft.layoutVertically();
t(headerLeft, "Project X", 11, { opacity: 0.56, bold: true });
t(headerLeft, "LP Monitor", 18, { bold: true });

header.addSpacer();
pill(header, state, state);

w.addSpacer(12);

if (data.error) {
  const err = w.addStack();
  err.layoutVertically();
  t(err, "Erreur", 14, { bold: true });
  err.addSpacer(4);
  t(err, data.error, 11, { opacity: 0.68, lineLimit: 2 });
} else if (!Array.isArray(data.positions) || data.positions.length === 0) {
  const empty = w.addStack();
  empty.layoutVertically();
  t(empty, "Aucune position active", 14, { bold: true });
  empty.addSpacer(4);
  t(empty, "Le wallet ne remonte aucune LP active actuellement.", 11, { opacity: 0.68, lineLimit: 2 });
} else {
  const sorted = [...data.positions].sort((a, b) => riskScore(a) - riskScore(b)).slice(0, MAX_POSITIONS);

  for (let i = 0; i < sorted.length; i += 1) {
    const p = sorted[i];

    const row = w.addStack();
    row.layoutVertically();

    const top = row.addStack();
    top.layoutHorizontally();
    top.centerAlignContent();

    t(top, p.pair, 13, { bold: true });
    top.addSpacer();
    t(top, p.inRange ? "In range" : "Out", 11, {
      bold: true,
      color: p.inRange ? new Color("#AEE7B8") : new Color("#FFB4BD")
    });

    row.addSpacer(3);

    const middle = row.addStack();
    middle.layoutHorizontally();
    t(middle, `#${p.tokenId}`, 11, { opacity: 0.56 });
    middle.addSpacer();
    const edge = p.inRange ? `${Math.min(p.distToLowerPct, p.distToUpperPct)}% du bord` : "hors range";
    t(middle, edge, 11, { opacity: 0.56 });

    row.addSpacer(8);

    const bottom = row.addStack();
    bottom.layoutHorizontally();

    const left = bottom.addStack();
    left.layoutVertically();
    t(left, "Lower", 10, { opacity: 0.46 });
    t(left, `${p.distToLowerPct}%`, 13, { bold: true });

    bottom.addSpacer();

    const right = bottom.addStack();
    right.layoutVertically();
    t(right, "Upper", 10, { opacity: 0.46 });
    t(right, `${p.distToUpperPct}%`, 13, { bold: true });

    if (i < sorted.length - 1) {
      w.addSpacer(10);
      divider();
      w.addSpacer(10);
    }
  }
}

w.addSpacer();

const footer = w.addStack();
footer.layoutHorizontally();
t(footer, data.updatedAt ? `Maj ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Maj --:--", 10, { opacity: 0.42 });
footer.addSpacer();
t(footer, `${data.activePositionsCount || 0} active`, 10, { opacity: 0.42 });

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentMedium();
}

Script.complete();

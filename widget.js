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

function addLine(widget, text, font = Font.systemFont(12)) {
  const t = widget.addText(String(text));
  t.font = font;
  t.lineLimit = 1;
  return t;
}

const w = new ListWidget();
w.setPadding(12, 12, 12, 12);
w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

addLine(w, "Project X LP", Font.boldSystemFont(15));
w.addSpacer(6);

if (data.error) {
  addLine(w, data.error, Font.systemFont(12));
} else if (!Array.isArray(data.positions) || data.positions.length === 0) {
  addLine(w, "Aucune position active", Font.systemFont(12));
} else {
  const sorted = [...data.positions].sort((a, b) => {
    const scoreA = a.inRange ? Math.min(a.distToLowerPct, a.distToUpperPct) : -1;
    const scoreB = b.inRange ? Math.min(b.distToLowerPct, b.distToUpperPct) : -1;
    return scoreA - scoreB;
  });

  const top = sorted.slice(0, MAX_POSITIONS);

  for (const p of top) {
    addLine(w, `#${p.tokenId} ${p.pair}`, Font.boldSystemFont(12));
    addLine(w, p.inRange ? `IN ${Math.min(p.distToLowerPct, p.distToUpperPct)}%` : "OUT OF RANGE");
    addLine(w, `L ${p.distToLowerPct}% | U ${p.distToUpperPct}%`, Font.systemFont(11));
    w.addSpacer(6);
  }
}

if (data.updatedAt) {
  const updated = new Date(data.updatedAt);
  addLine(w, `Maj: ${updated.toLocaleTimeString()}`, Font.systemFont(10));
}

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentMedium();
}

Script.complete();

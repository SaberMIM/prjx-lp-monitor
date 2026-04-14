const STATUS_URL = "https://raw.githubusercontent.com/SaberMIM/prjx-lp-monitor/main/status.json?ts=" + Date.now();
const ALERT_THRESHOLD = 5;

const req = new Request(STATUS_URL);
req.headers = { "Cache-Control": "no-cache" };

let data = {};
try {
  data = await req.loadJSON();
} catch (e) {
  data = { error: "load_error" };
}

function getGlobalState(json) {
  if (json.error) {
    return {
      code: "ERR",
      title: "Erreur",
      subtitle: "Chargement impossible"
    };
  }

  if (!Array.isArray(json.positions) || json.positions.length === 0) {
    return {
      code: "NONE",
      title: "Aucune position",
      subtitle: "Aucune LP active"
    };
  }

  const out = json.positions.some(p => !p.inRange);
  if (out) {
    return {
      code: "OUT",
      title: "Hors range",
      subtitle: "Une position est sortie"
    };
  }

  const nearest = Math.min(...json.positions.map(p => Math.min(p.distToLowerPct, p.distToUpperPct)));
  if (nearest <= ALERT_THRESHOLD) {
    return {
      code: "NEAR",
      title: "Proche du bord",
      subtitle: `${nearest}% avant sortie`
    };
  }

  return {
    code: "IN",
    title: "Dans le range",
    subtitle: "Position stable"
  };
}

const state = getGlobalState(data);
const w = new ListWidget();
w.setPadding(8, 8, 8, 8);

function addText(stack, text, size = 12, bold = false, opacity = 1) {
  const t = stack.addText(String(text));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color("#FFFFFF", opacity);
  t.lineLimit = 1;
  return t;
}

if (config.widgetFamily === "accessoryInline") {
  let inlineText = "PRJX ";
  if (state.code === "IN") inlineText += "dans le range";
  else if (state.code === "NEAR") inlineText += "proche sortie";
  else if (state.code === "OUT") inlineText += "hors range";
  else if (state.code === "NONE") inlineText += "aucune position";
  else inlineText += "erreur";
  w.addText(inlineText);
}
else if (config.widgetFamily === "accessoryCircular") {
  const center = w.addStack();
  center.layoutVertically();
  center.centerAlignContent();
  center.addSpacer();

  let top = "LP";
  let bottom = "OK";
  if (state.code === "NEAR") bottom = "BORD";
  else if (state.code === "OUT") bottom = "OUT";
  else if (state.code === "NONE") bottom = "VIDE";
  else if (state.code === "ERR") bottom = "ERR";

  addText(center, top, 10, false, 0.7);
  addText(center, bottom, 12, true, 1);
  center.addSpacer();
}
else if (config.widgetFamily === "accessoryRectangular") {
  const main = w.addStack();
  main.layoutVertically();

  addText(main, "Project X LP", 11, true, 0.75);
  main.addSpacer(2);
  addText(main, state.title, 14, true, 1);
  main.addSpacer(2);
  addText(main, state.subtitle, 11, false, 0.72);
}
else {
  const main = w.addStack();
  main.layoutVertically();
  addText(main, "Lock Screen LP", 14, true, 1);
  main.addSpacer(4);
  addText(main, state.title, 13, true, 1);
  main.addSpacer(2);
  addText(main, state.subtitle, 11, false, 0.72);
}

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentAccessoryRectangular();
}

Script.complete();

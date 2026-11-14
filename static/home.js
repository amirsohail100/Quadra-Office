// ============================================
// App list. Each app lives in its own folder.
// Icon lookup order for id "word":
//   assets/word.svg -> assets/word.png -> default letter tile
// ============================================

// Backend (FastAPI) address. Change only this if the server port changes.
const API_BASE = "http://127.0.0.1:8000";

const APPS = [
  { id: "word", name: "Word", desc: "Write, format and save documents",
    path: "word/index.html", letter: "W", color: "#2b579a",
    api: `${API_BASE}/api/word` },
  { id: "excel", name: "Excel", desc: "Spreadsheets, formulas and data",
    path: "excel/index.html", letter: "X", color: "#217346",
    api: `${API_BASE}/api/excel` },
  { id: "powerpoint", name: "PowerPoint", desc: "Create presentations and slides",
    path: "powerpoint/index.html", letter: "P", color: "#d24726",
    api: `${API_BASE}/api/powerpoint` },
  { id: "onenote", name: "OneNote", desc: "Take notes and organise ideas",
    path: "onenote/index.html", letter: "N", color: "#7719aa",
    api: `${API_BASE}/api/onenote` }
];

// Hero background: tries these names in order. Put ONE of them in assets/
const BG_SOURCES = [
  "assets/background.png",
  "assets/background.PNG",
  "assets/background.jpg",
  "assets/background.jpeg",
  "assets/background.webp"
];

// ---------- DOM references ----------
const homeView = document.getElementById("homeView");
const appView = document.getElementById("appView");
const nav = document.getElementById("nav");
const topbar = document.getElementById("topbar");
const appTitle = document.getElementById("appTitle");
const openNew = document.getElementById("openNew");
const backBtn = document.getElementById("backBtn");
const appGrid = document.getElementById("appGrid");
const brandHome = document.getElementById("brandHome");
const hero = document.getElementById("hero");
const heroBg = document.getElementById("heroBg");

// Each app's iframe is created once and kept alive, so work is not lost when switching
const frames = {};

// ---------- Send API endpoint to an app ----------
function sendConfig(app) {
  const frame = frames[app.id];
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage(
    { type: "quadra:config", appId: app.id, apiEndpoint: app.api },
    "*"
  );
}

// ---------- Hero background ----------
function loadHeroBackground() {
  let i = 0;

  heroBg.onload = () => {
    hero.classList.add("has-bg");
    hero.classList.remove("no-bg");
  };

  heroBg.onerror = () => {
    i++;
    if (i < BG_SOURCES.length) {
      heroBg.src = BG_SOURCES[i];
    } else {
      hero.classList.add("no-bg");
      heroBg.remove();
      console.warn("Background image not found in assets/. Expected one of:", BG_SOURCES);
    }
  };

  heroBg.src = BG_SOURCES[0];
}

// ---------- Hero tiles: use custom logo from assets/ if present ----------
function loadTileImages() {
  document.querySelectorAll(".tile[data-app]").forEach(tile => {
    const id = tile.dataset.app;
    const sources = [`assets/${id}.svg`, `assets/${id}.png`, `assets/${id}.jpg`];
    let i = 0;

    const img = document.createElement("img");
    img.className = "tile-img";
    img.alt = "";

    img.onload = () => {
      tile.textContent = "";
      tile.classList.add("has-img");
      tile.appendChild(img);
    };
    img.onerror = () => {
      i++;
      if (i < sources.length) img.src = sources[i];
    };
    img.src = sources[0];
  });
}

// ---------- App icons (apps grid) ----------
function makeIcon(app) {
  const box = document.createElement("span");
  box.className = "app-icon";
  box.style.background = app.color;

  const letter = document.createElement("span");
  letter.textContent = app.letter;
  box.appendChild(letter);

  const sources = [`assets/${app.id}.svg`, `assets/${app.id}.png`, `assets/${app.id}.jpg`];
  let index = 0;

  const img = document.createElement("img");
  img.className = "app-img";
  img.alt = app.name;
  img.onload = () => { letter.hidden = true; };
  img.onerror = () => {
    index++;
    if (index < sources.length) {
      img.src = sources[index];
    } else {
      img.remove();
    }
  };
  img.src = sources[0];
  box.appendChild(img);

  return box;
}

function renderHome() {
  appGrid.innerHTML = "";
  APPS.forEach(app => {
    const btn = document.createElement("button");
    btn.className = "app-link";

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = app.name;

    btn.appendChild(makeIcon(app));
    btn.appendChild(label);
    btn.addEventListener("click", () => { location.hash = app.id; });
    appGrid.appendChild(btn);
  });
}

// ---------- App views ----------
function getFrame(app) {
  if (!frames[app.id]) {
    const frame = document.createElement("iframe");
    frame.className = "app-frame";
    frame.title = app.name;
    frame.src = app.path;
    frame.addEventListener("load", () => sendConfig(app));
    appView.appendChild(frame);
    frames[app.id] = frame;
  }
  return frames[app.id];
}

function showHome() {
  homeView.hidden = false;
  nav.hidden = false;
  topbar.hidden = true;
  appView.hidden = true;
  document.title = "Quadra Office";
  Object.values(frames).forEach(f => (f.hidden = true));
}

function showApp(app) {
  homeView.hidden = true;
  nav.hidden = true;
  topbar.hidden = false;
  appView.hidden = false;
  appTitle.textContent = app.name + " \u00B7 Quadra Office";
  openNew.href = app.path;
  document.title = `${app.name} \u00B7 Quadra Office`;

  APPS.forEach(a => {
    if (frames[a.id]) frames[a.id].hidden = a.id !== app.id;
  });
  getFrame(app).hidden = false;
  sendConfig(app);
}

// #word, #excel, #powerpoint, #onenote open the app. Empty hash shows home.
function route() {
  const id = location.hash.replace("#", "");
  const app = APPS.find(a => a.id === id);
  if (app) {
    showApp(app);
  } else {
    showHome();
  }
}

// ---------- Messages from apps ----------
// An app can ask for its endpoint again by sending "quadra:request-config"
window.addEventListener("message", e => {
  if (!e.data || e.data.type !== "quadra:request-config") return;
  const app = APPS.find(a => a.id === e.data.appId);
  if (app) sendConfig(app);
});

// ---------- Events ----------
backBtn.addEventListener("click", () => {
  location.hash = "";
  window.scrollTo(0, 0);
});

brandHome.addEventListener("click", e => {
  e.preventDefault();
  location.hash = "";
  window.scrollTo(0, 0);
});

window.addEventListener("hashchange", route);

// ---------- Start ----------
loadHeroBackground();
loadTileImages();
renderHome();
route();
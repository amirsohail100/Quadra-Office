// ============================================
// App list. Each app lives in its own folder.
// Icon lookup order for id "word":
//   assets/word.svg -> assets/word.png -> default letter tile
// ============================================
const APPS = [
  { id: "word", name: "Word", desc: "Write, format and save documents",
    path: "word/index.html", letter: "W", color: "#2b579a" },
  { id: "excel", name: "Excel", desc: "Spreadsheets, formulas and data",
    path: "excel/index.html", letter: "X", color: "#217346" },
  { id: "powerpoint", name: "PowerPoint", desc: "Create presentations and slides",
    path: "powerpoint/index.html", letter: "P", color: "#d24726" },
  { id: "onenote", name: "OneNote", desc: "Take notes and organise ideas",
    path: "onenote/index.html", letter: "N", color: "#7719aa" }
];

// Hero background: tries these names in order. Put ONE of them in assets/
const BG_SOURCES = [
  "assets/background.png",
  "assets/background.PNG",
  "assets/background.jpg",
  "assets/background.jpeg",
  "assets/background.webp"
];

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
      // No image found: show the plain fallback color, not black
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
    const sources = [`assets/${id}.svg`, `assets/${id}.png` , `assets/${id}.jpg`];
    let i = 0;

    const img = document.createElement("img");
    img.className = "tile-img";
    img.alt = "";

    img.onload = () => {
      tile.textContent = "";            // remove the letter
      tile.classList.add("has-img");
      tile.appendChild(img);
    };
    img.onerror = () => {
      i++;
      if (i < sources.length) {
        img.src = sources[i];
      }
      // If no file is found, the letter tile stays as it is
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

  const sources = [`assets/${app.id}.svg`, `assets/${app.id}.png` , `assets/${app.id}.jpg`];
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
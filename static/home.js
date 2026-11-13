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

// localStorage key where API endpoints are saved
const STORE_KEY = "quadra.apiEndpoints";

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
const apiList = document.getElementById("apiList");

// Each app's iframe is created once and kept alive, so work is not lost when switching
const frames = {};

// API endpoints per app, e.g. { word: "https://api.example.com/word" }
let endpoints = loadEndpoints();

// ---------- API endpoint storage ----------
function loadEndpoints() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function saveEndpoints() {
  localStorage.setItem(STORE_KEY, JSON.stringify(endpoints));
}

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (e) {
    return false;
  }
}

// Send the app's endpoint to its iframe
function sendConfig(app) {
  const frame = frames[app.id];
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage(
    { type: "quadra:config", appId: app.id, apiEndpoint: endpoints[app.id] || null },
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
    const sources = [`assets/${id}.svg`, `assets/${id}.png`];
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

  const sources = [`assets/${app.id}.svg`, `assets/${app.id}.png`];
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

// ---------- API endpoints panel ----------
function renderApiPanel() {
  apiList.innerHTML = "";

  APPS.forEach(app => {
    const row = document.createElement("div");
    row.className = "api-row";

    // App name with color dot
    const nameBox = document.createElement("div");
    nameBox.className = "api-app";
    const dot = document.createElement("span");
    dot.className = "api-dot";
    dot.style.background = app.color;
    const name = document.createElement("strong");
    name.textContent = app.name;
    nameBox.appendChild(dot);
    nameBox.appendChild(name);

    // URL input
    const input = document.createElement("input");
    input.className = "api-input";
    input.type = "url";
    input.placeholder = `https://api.example.com/${app.id}`;
    input.value = endpoints[app.id] || "";
    input.setAttribute("aria-label", `${app.name} API endpoint`);

    // Buttons
    const actions = document.createElement("div");
    actions.className = "api-actions";
    const saveBtn = document.createElement("button");
    saveBtn.className = "btn-small";
    saveBtn.textContent = "Save";
    const testBtn = document.createElement("button");
    testBtn.className = "btn-small btn-ghost";
    testBtn.textContent = "Test";
    const clearBtn = document.createElement("button");
    clearBtn.className = "btn-small btn-ghost";
    clearBtn.textContent = "Clear";
    actions.append(saveBtn, testBtn, clearBtn);

    // Status line
    const status = document.createElement("span");
    status.className = "api-status";
    status.setAttribute("aria-live", "polite");
    status.textContent = endpoints[app.id] ? "Saved" : "No endpoint set";

    const setStatus = (text, kind) => {
      status.textContent = text;
      status.className = "api-status" + (kind ? " " + kind : "");
    };

    saveBtn.addEventListener("click", () => {
      const value = input.value.trim();
      if (!value) {
        delete endpoints[app.id];
        saveEndpoints();
        sendConfig(app);
        setStatus("Cleared", "ok");
        return;
      }
      if (!isValidUrl(value)) {
        setStatus("Enter a valid http:// or https:// URL", "err");
        return;
      }
      endpoints[app.id] = value;
      saveEndpoints();
      sendConfig(app);
      setStatus("Saved", "ok");
    });

    testBtn.addEventListener("click", () => {
      const value = endpoints[app.id];
      if (!value) {
        setStatus("Save an endpoint first", "err");
        return;
      }
      setStatus("Testing...", "");
      fetch(value, { method: "GET", mode: "cors" })
        .then(r => {
          setStatus(
            r.ok ? `Reachable (HTTP ${r.status})` : `Server replied HTTP ${r.status}`,
            r.ok ? "ok" : "err"
          );
        })
        .catch(() => {
          setStatus("Unreachable, or CORS is not allowed", "err");
        });
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      delete endpoints[app.id];
      saveEndpoints();
      sendConfig(app);
      setStatus("Cleared", "ok");
    });

    row.append(nameBox, input, actions, status);
    apiList.appendChild(row);
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
renderApiPanel();
route();
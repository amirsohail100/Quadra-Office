// ============================================
// App list. Each app lives in its own folder.
// If your main file is not index.html, change the path.
// Example: "excel/excel.html"
// ============================================
const APPS = [
  {
    id: "word",
    name: "Word",
    desc: "Write, format and save documents",
    path: "word/index.html",
    letter: "W",
    color: "#2b579a"
  },
  {
    id: "excel",
    name: "Excel",
    desc: "Spreadsheets, formulas and data",
    path: "excel/index.html",
    letter: "X",
    color: "#217346"
  },
  {
    id: "powerpoint",
    name: "PowerPoint",
    desc: "Create presentations and slides",
    path: "powerpoint/index.html",
    letter: "P",
    color: "#d24726"
  },
  {
    id: "onenote",
    name: "OneNote",
    desc: "Take notes and organise ideas",
    path: "onenote/index.html",
    letter: "N",
    color: "#7719aa"
  }
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

// Each app's iframe is created once and kept alive, so work is not lost when switching
const frames = {};

function renderHome() {
  appGrid.innerHTML = "";
  APPS.forEach(app => {
    const btn = document.createElement("button");
    btn.className = "app-link";
    btn.innerHTML = `
      <span class="app-icon" style="background:${app.color}">${app.letter}</span>
      <span class="label">${app.name}</span>
    `;
    btn.addEventListener("click", () => {
      location.hash = app.id;
    });
    appGrid.appendChild(btn);
  });
}

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

renderHome();
route();
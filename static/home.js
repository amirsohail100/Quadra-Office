// ============================================
// यहां अपने ऐप्स की लिस्ट है।
// अगर आपकी फाइल का नाम excel.html है तो path को "excel/excel.html" कर दें।
// ============================================
const APPS = [
  {
    id: "word",
    name: "Word",
    desc: "डॉक्यूमेंट लिखें, फॉर्मेट करें और सेव करें",
    path: "word/index.html",
    icon: "W",
    color: "#2b579a"
  },
  {
    id: "excel",
    name: "Excel",
    desc: "स्प्रेडशीट, फॉर्मूले और डेटा का हिसाब रखें",
    path: "excel/index.html",
    icon: "X",
    color: "#217346"
  },
  {
    id: "powerpoint",
    name: "PowerPoint",
    desc: "प्रेजेंटेशन और स्लाइड्स बनाएं",
    path: "powerpoint/index.html",
    icon: "P",
    color: "#d24726"
  },
  {
    id: "onenote",
    name: "OneNote",
    desc: "नोट्स लिखें और अपने विचार व्यवस्थित करें",
    path: "onenote/index.html",
    icon: "N",
    color: "#7719aa"
  }
];

const homeView = document.getElementById("homeView");
const appView = document.getElementById("appView");
const topbar = document.getElementById("topbar");
const appTitle = document.getElementById("appTitle");
const openNew = document.getElementById("openNew");
const backBtn = document.getElementById("backBtn");
const appGrid = document.getElementById("appGrid");

// हर ऐप का iframe एक बार बनता है और दोबारा खोलने पर उसका काम सुरक्षित रहता है
const frames = {};

// होम पेज के कार्ड बनाएं
function renderHome() {
  appGrid.innerHTML = "";
  APPS.forEach(app => {
    const card = document.createElement("button");
    card.className = "card";
    card.innerHTML = `
      <div class="card-icon" style="background:${app.color}">${app.icon}</div>
      <h2>${app.name}</h2>
      <p>${app.desc}</p>
    `;
    card.addEventListener("click", () => {
      location.hash = app.id;
    });
    appGrid.appendChild(card);
  });
}

// ऐप का iframe लाएं (नहीं है तो बनाएं)
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
  topbar.hidden = true;
  appView.hidden = true;
  document.title = "Quadra Office";
  Object.values(frames).forEach(f => f.hidden = true);
}

function showApp(app) {
  homeView.hidden = true;
  topbar.hidden = false;
  appView.hidden = false;
  appTitle.textContent = app.name;
  openNew.href = app.path;
  document.title = `${app.name} · Quadra Office`;

  APPS.forEach(a => {
    if (frames[a.id]) frames[a.id].hidden = a.id !== app.id;
  });
  getFrame(app).hidden = false;
}

// URL के hash (#excel, #word आदि) के हिसाब से व्यू दिखाएं
function route() {
  const id = location.hash.replace("#", "");
  const app = APPS.find(a => a.id === id);
  app ? showApp(app) : showHome();
}

backBtn.addEventListener("click", () => {
  location.hash = "";
});

window.addEventListener("hashchange", route);

renderHome();
route();

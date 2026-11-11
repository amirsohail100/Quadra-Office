const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Quadra Office",
    webPreferences: { contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, "static", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
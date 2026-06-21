const { app, BrowserWindow, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const port = 5177;
const appUrl = `http://127.0.0.1:${port}`;
let serverProcess = null;
let mainWindow = null;

function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(appUrl, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) return resolve();
        retry();
      });
      request.on("error", retry);
      request.setTimeout(1000, () => request.destroy());

      function retry() {
        if (Date.now() >= deadline) {
          reject(new Error("앱 서버를 시작하지 못했습니다. 5177 포트를 사용하는 프로그램이 있는지 확인해 주세요."));
          return;
        }
        setTimeout(attempt, 250);
      }
    };
    attempt();
  });
}

function startServer() {
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar", "server.js")
    : path.join(__dirname, "..", "server.js");

  serverProcess = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      CHZZK_DATA_DIR: path.join(app.getPath("userData"), "data")
    },
    stdio: "ignore",
    windowsHide: true
  });
}

async function createWindow() {
  startServer();
  try {
    await waitForServer();
  } catch (error) {
    await dialog.showMessageBox({ type: "error", title: "Cheese Tracker", message: error.message });
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 900,
    minHeight: 680,
    autoHideMenuBar: true,
    title: "Cheese Tracker",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await mainWindow.loadURL(appUrl);
  configureAutoUpdater();
}

function configureAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.on("update-available", async () => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "업데이트 있음",
      message: "새 버전의 Cheese Tracker가 있습니다.",
      buttons: ["다운로드", "나중에"]
    });
    if (response === 0) autoUpdater.downloadUpdate();
  });
  autoUpdater.on("update-downloaded", async () => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "업데이트 준비 완료",
      message: "업데이트를 설치하려면 앱을 재시작해야 합니다.",
      buttons: ["재시작", "나중에"]
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (error) => console.error("Update check failed:", error));
  autoUpdater.checkForUpdates().catch((error) => console.error("Update check failed:", error));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

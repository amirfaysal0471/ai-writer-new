const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  clipboard,
  desktopCapturer,
  shell,
  dialog,
} = require("electron");
const { exec } = require("child_process");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

let mainWindow;

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

function setupAutoUpdater() {
  autoUpdater.checkForUpdatesAndNotify();
  autoUpdater.on("update-downloaded", (info) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Ready",
        message:
          "A new version has been downloaded. Restart the application to apply the updates.",
        buttons: ["Restart", "Later"],
      })
      .then((returnValue) => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall();
      });
  });
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("ai-writer", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("ai-writer");
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    const url = commandLine.find((arg) => arg.startsWith("ai-writer://"));
    if (url) handleDeepLink(url);
  });

  app.whenReady().then(() => {
    createWindow();

    globalShortcut.register("Option+Space", () => {
      if (mainWindow.isVisible()) {
        mainWindow.isFocused() ? mainWindow.hide() : mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    if (app.isPackaged) {
      setupAutoUpdater();
    }
  });
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const appWidth = 380;
  const appHeight = 600;

  mainWindow = new BrowserWindow({
    width: appWidth,
    height: appHeight,
    x: width - appWidth - 30,
    y: Math.floor((height - appHeight) / 2),
    resizable: false,
    frame: false,
    hasShadow: true,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "frontend/dist/index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
  }
}

function handleDeepLink(url) {
  try {
    const urlObj = new URL(url);
    const token = urlObj.searchParams.get("token");

    if (token && mainWindow) {
      mainWindow.webContents.send("auth-token", token);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  } catch (error) {
    console.error(error);
  }
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

ipcMain.on("minimize-app", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("close-app", () => {
  if (mainWindow) {
    mainWindow.hide();
  }
  if (process.platform === "darwin") {
    app.hide();
  }
});

ipcMain.on("open-browser", (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle("get-clipboard-text", async () => clipboard.readText());

ipcMain.handle("scan-screen-ocr", async () => {
  const windowBounds = mainWindow.getBounds();
  const currentDisplay = screen.getDisplayMatching(windowBounds);
  mainWindow.hide();

  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        if (process.platform === "darwin") {
          const tempPath = path.join(os.tmpdir(), `ocr_${Date.now()}.png`);
          const rect = `-R${currentDisplay.bounds.x},${currentDisplay.bounds.y},${currentDisplay.bounds.width},${currentDisplay.bounds.height}`;

          exec(`screencapture -x ${rect} ${tempPath}`, async (err) => {
            if (err) {
              mainWindow.show();
              return resolve(null);
            }
            const {
              data: { text },
            } = await Tesseract.recognize(tempPath, "eng");
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            mainWindow.show();
            mainWindow.focus();
            resolve(text);
          });
        } else {
          const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 1920, height: 1080 },
          });
          const source =
            sources.find(
              (s) => s.display_id === currentDisplay.id.toString()
            ) || sources[0];
          const {
            data: { text },
          } = await Tesseract.recognize(source.thumbnail.toPNG(), "eng");
          mainWindow.show();
          mainWindow.focus();
          resolve(text);
        }
      } catch (error) {
        mainWindow.show();
        resolve(null);
      }
    }, 300);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

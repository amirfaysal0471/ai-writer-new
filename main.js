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

let mainWindow;

// ✅ ১. প্রোটোকল সেটআপ (Deep Linking)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("ai-writer", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("ai-writer");
}

// ✅ ২. সিঙ্গেল ইনস্ট্যান্স লক (সবচেয়ে গুরুত্বপূর্ণ ফিক্স)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // যদি অন্য একটি অ্যাপ অলরেডি খোলা থাকে, তবে এই নতুনটি বন্ধ করে দাও
  app.quit();
} else {
  // যদি এটিই মেইন অ্যাপ হয়, তবে 'second-instance' ইভেন্ট শুনো
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // কেউ যদি অ্যাপ চালু থাকা অবস্থায় আবার খুলতে চায় (Deep Link দিয়ে)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }

    // Windows/Linux এর জন্য লিংক বের করা
    const url = commandLine.find((arg) => arg.startsWith("ai-writer://"));
    if (url) handleDeepLink(url);
  });

  // অ্যাপ রেডি হলে উইন্ডো তৈরি করো
  app.whenReady().then(() => {
    createWindow();

    // Global Shortcut
    globalShortcut.register("Option+Space", () => {
      if (mainWindow.isVisible()) {
        mainWindow.isFocused() ? mainWindow.hide() : mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });
}

// ✅ ৩. উইন্ডো তৈরি ফাংশন
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

  // External Link Handler
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Load App
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "frontend/dist/index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
  }
}

// ✅ ৪. Deep Link প্রসেসিং এবং টোকেন হ্যান্ডলার
function handleDeepLink(url) {
  try {
    const urlObj = new URL(url);
    const token = urlObj.searchParams.get("token");

    if (token && mainWindow) {
      console.log("🔥 Token Received:", token);

      // ফ্রন্টএন্ডে টোকেন পাঠানো
      mainWindow.webContents.send("auth-token", token);

      // উইন্ডো সামনে আনা
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  } catch (error) {
    console.error("Deep Link Error:", error);
  }
}

// ✅ ৫. Mac OS এর জন্য আলাদা হ্যান্ডলার
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// ✅ ৬. IPC হ্যান্ডলারস
ipcMain.on("minimize-app", () => mainWindow.minimize());
ipcMain.on("close-app", () => {
  mainWindow.hide();
  app.hide();
});
ipcMain.on("open-browser", (event, url) => {
  shell.openExternal(url);
});
ipcMain.handle("get-clipboard-text", async () => clipboard.readText());

// OCR Logic
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

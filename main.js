const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  clipboard,
  desktopCapturer,
} = require("electron");
const OpenAI = require("openai");
const { exec } = require("child_process");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");
const os = require("os");

const OPENROUTER_API_KEY =
  "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";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:5173",
    "X-Title": "AI Tool",
  },
});

const models = ["mistralai/mistral-7b-instruct:free"];

let mainWindow;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const appWidth = 380;
  const appHeight = 600;
  const xPos = width - appWidth - 30;
  const yPos = Math.floor((height - appHeight) / 2);

  mainWindow = new BrowserWindow({
    width: appWidth,
    height: appHeight,
    x: xPos,
    y: yPos,
    resizable: false,
    frame: false,
    hasShadow: true,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setFullScreenable(false);

  // 👇👇👇 BUILD MODE LOGIC ADDED HERE (পরিবর্তন করা হয়েছে) 👇👇👇

  // চেক করছি অ্যাপটি প্যাকেজ (Build) করা হয়েছে কিনা
  if (app.isPackaged) {
    // প্রোডাকশন মোড: বিল্ড করা index.html ফাইল লোড করবে
    // নিশ্চিত করবেন আপনার ফ্রন্টএন্ড বিল্ড ফোল্ডারটি সঠিক জায়গায় আছে (frontend/dist)
    mainWindow.loadFile(path.join(__dirname, "frontend/dist/index.html"));
  } else {
    // ডেভেলপমেন্ট মোড: লোকাল সার্ভার লোড করবে
    mainWindow.loadURL("http://localhost:5173");
    // mainWindow.webContents.openDevTools(); // ডিবাগ করার জন্য কনসোল খুলতে চাইলে এটা আনকমেন্ট করুন
  }

  // 👆👆👆 END OF BUILD MODE LOGIC 👆👆👆
}

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register("Option+Space", () => {
    if (mainWindow.isVisible()) {
      if (mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.focus();
      }
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

ipcMain.on("minimize-app", () => mainWindow.minimize());
ipcMain.on("close-app", () => {
  mainWindow.hide();
  app.hide();
});

ipcMain.handle("get-clipboard-text", async () => {
  return clipboard.readText();
});

// 🔥🔥🔥 OCR LOGIC (Multi-Monitor Fixed) 🔥🔥🔥
ipcMain.handle("scan-screen-ocr", async () => {
  const windowBounds = mainWindow.getBounds();
  const currentDisplay = screen.getDisplayMatching(windowBounds);

  mainWindow.hide();

  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        if (process.platform === "darwin") {
          const tempPath = path.join(os.tmpdir(), `ocr_snap_${Date.now()}.png`);
          const captureRect = `-R${currentDisplay.bounds.x},${currentDisplay.bounds.y},${currentDisplay.bounds.width},${currentDisplay.bounds.height}`;

          exec(`screencapture -x ${captureRect} ${tempPath}`, async (error) => {
            if (error) {
              console.error("Screenshot failed:", error);
              mainWindow.show();
              resolve(null);
              return;
            }

            try {
              const imageBuffer = fs.readFileSync(tempPath);
              const {
                data: { text },
              } = await Tesseract.recognize(imageBuffer, "eng");

              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

              mainWindow.show();
              mainWindow.focus();
              resolve(text);
            } catch (err) {
              console.error("OCR Error:", err);
              mainWindow.show();
              resolve(null);
            }
          });
        } else {
          const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 1920, height: 1080 },
          });

          let activeSource = sources.find(
            (s) => s.display_id === currentDisplay.id.toString()
          );

          if (!activeSource) {
            activeSource = sources[0];
          }

          const imageBuffer = activeSource.thumbnail.toPNG();

          const {
            data: { text },
          } = await Tesseract.recognize(imageBuffer, "eng", {
            logger: (m) => console.log(m),
          });

          mainWindow.show();
          mainWindow.focus();
          resolve(text);
        }
      } catch (error) {
        console.error("Global OCR Failed:", error);
        mainWindow.show();
        resolve(null);
      }
    }, 300);
  });
});

// AI REQUEST HANDLER
ipcMain.on("send-to-ai", async (event, payload) => {
  const history = payload.history || [];

  const messages = [
    {
      role: "system",
      content:
        "You are a Survey Assistant. I will provide text extracted from a screen via OCR. It might be messy. Find the main question and options. Suggest the best logical answer directly. Do NOT use tags like <s>, [OUT], or [/OUT]. Be concise.",
    },
    ...history,
  ];

  for (const modelName of models) {
    try {
      const stream = await openai.chat.completions.create({
        model: modelName,
        messages: messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) event.sender.send("ai-chunk", content);
      }
      event.sender.send("ai-done");
      return;
    } catch (error) {
      console.error(error);
    }
  }
  event.sender.send("ai-chunk", "Error connecting to AI.");
  event.sender.send("ai-done");
});

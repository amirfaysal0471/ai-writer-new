import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  IoRemoveOutline,
  IoCloseOutline,
  IoArrowUp,
  IoCopyOutline,
  IoFlashOutline,
  IoCheckmarkOutline,
  IoDocumentTextOutline,
  IoSparklesOutline,
  IoScanOutline,
} from "react-icons/io5";

let ipcRenderer;
try {
  if (window.require) {
    ipcRenderer = window.require("electron").ipcRenderer;
  }
} catch (error) {
  console.error("Electron ipcRenderer not found");
}

if (!ipcRenderer) {
  ipcRenderer = {
    on: () => {},
    removeListener: () => {},
    send: () => {},
    invoke: () => Promise.resolve(""),
  };
}

function App() {
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [lastClipboard, setLastClipboard] = useState("");
  const [ignoredClipboard, setIgnoredClipboard] = useState("");

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const checkClipboard = async () => {
      try {
        const text = await ipcRenderer.invoke("get-clipboard-text");
        if (
          text &&
          text.trim() !== "" &&
          text !== lastClipboard &&
          text !== ignoredClipboard
        ) {
          setLastClipboard(text);
          setContext(text.trim());
          setIgnoredClipboard("");
        }
      } catch (err) {
        console.error(err);
      }
    };
    const intervalId = setInterval(checkClipboard, 1000);
    return () => clearInterval(intervalId);
  }, [lastClipboard, ignoredClipboard]);

  useEffect(() => {
    const handleChunk = (event, chunk) => {
      if (!chunk || typeof chunk !== "string") return;
      setLoading(false);
      setMessages((prev) => {
        if (prev.length === 0) return [{ role: "assistant", content: chunk }];
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          const updatedMsg = {
            ...lastMsg,
            content: (lastMsg.content || "") + chunk,
          };
          return [...prev.slice(0, -1), updatedMsg];
        } else {
          return [...prev, { role: "assistant", content: chunk }];
        }
      });
    };

    const handleDone = () => setLoading(false);
    ipcRenderer.on("ai-chunk", handleChunk);
    ipcRenderer.on("ai-done", handleDone);

    return () => {
      ipcRenderer.removeListener("ai-chunk", handleChunk);
      ipcRenderer.removeListener("ai-done", handleDone);
    };
  }, []);

  useEffect(
    () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
    [messages, loading, context]
  );

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim()) return;

      const userText = input;
      setInput("");

      const promptForAI = context
        ? `Context:\n"""${context}"""\n\nUser Request: ${userText}`
        : userText;

      const newHistory = [...messages, { role: "user", content: promptForAI }];

      setMessages((prev) => [
        ...prev,
        { role: "user", content: userText, contextSnapshot: context },
        { role: "assistant", content: "" },
      ]);

      setLoading(true);
      ipcRenderer.send("send-to-ai", { history: newHistory });

      setIgnoredClipboard(context);
      setContext("");
    }
  };

  // 🔥 UPDATED SCAN HANDLER (Fixes Old Answer Issue)
  const handleScanPage = async () => {
    setScanning(true);

    const pageText = await ipcRenderer.invoke("scan-screen-ocr");
    setScanning(false);

    if (!pageText || pageText.trim().length < 5) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Could not read text. Try again." },
      ]);
      return;
    }

    const prompt = `Here is the text extracted from my screen. Identify the survey question and suggest the correct answer:\n\n"""${pageText}"""`;

    // UI তে দেখানোর জন্য মেসেজ অ্যাড করছি
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: "📷 Scanning Screen...",
        contextSnapshot: "OCR Scan",
      },
      { role: "assistant", content: "" },
    ]);

    setLoading(true);

    // 🔴 IMPORTANT FIX:
    // AI কে আমরা পুরো 'messages' হিস্ট্রি পাঠাব না।
    // শুধু বর্তমান স্ক্যান করা টেক্সট পাঠাব। এতে সে আগের প্রশ্নের সাথে গুলাবে না।
    const freshPayload = [{ role: "user", content: prompt }];

    ipcRenderer.send("send-to-ai", { history: freshPayload });

    setLastClipboard(pageText);
    setIgnoredClipboard(pageText);
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const handleCloseContext = () => {
    setIgnoredClipboard(context);
    setContext("");
  };

  // 🔥 UPDATED CLEANER (Fixes <s> [OUT] Issue)
  const cleanText = (text) => {
    if (!text) return "";
    return text
      .replace(/<think>[\s\S]*?<\/think>/gi, "") // Remove think blocks
      .replace(/<s>/g, "") // Remove start tag
      .replace(/<\/s>/g, "") // Remove end tag
      .replace(/\[OUT\]/g, "") // Remove [OUT]
      .replace(/\[\/OUT\]/g, "") // Remove [/OUT]
      .trim();
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-white font-sans text-gray-800 border border-gray-200/80 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/5">
      {/* Header */}
      <div
        className="h-11 w-full bg-white/90 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-4 shrink-0 z-50 cursor-move"
        style={{ WebkitAppRegion: "drag" }}
      >
        <div className="flex items-center gap-2 text-gray-800">
          <IoFlashOutline size={16} className="text-amber-500" />
          <span className="text-[13px] font-bold tracking-wide">
            AI Survey Helper
          </span>
        </div>
        <div
          className="flex items-center gap-1.5"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          <button
            onClick={() => ipcRenderer.send("minimize-app")}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <IoRemoveOutline size={16} />
          </button>
          <button
            onClick={() => ipcRenderer.send("close-app")}
            className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition"
          >
            <IoCloseOutline size={16} />
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 w-full overflow-y-auto px-5 scroll-smooth py-6 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3">
            <div className="p-4 bg-gray-50 rounded-full">
              <IoScanOutline size={24} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium">
              Click Scan button for protected sites
            </p>
          </div>
        )}

        {messages.map((msg, index) => {
          const displayText =
            msg.role === "assistant" ? cleanText(msg.content) : msg.content;
          if (!displayText && msg.role === "assistant" && !loading) return null;

          return (
            <div
              key={index}
              className={`flex w-full flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[90%] text-[14px] leading-relaxed relative group ${
                  msg.role === "user"
                    ? "bg-gray-100 text-gray-800 px-4 py-3 rounded-2xl rounded-tr-sm"
                    : "w-full text-gray-800 pl-0"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div>
                    <div className="prose prose-sm prose-slate max-w-none">
                      <ReactMarkdown>{displayText}</ReactMarkdown>
                    </div>
                    {!loading && index === messages.length - 1 && (
                      <div className="mt-2 pt-1 flex justify-start animate-in fade-in duration-500">
                        <button
                          onClick={() => handleCopy(displayText, index)}
                          className={`p-2 rounded-lg transition-all duration-200 border ${
                            copiedIndex === index
                              ? "bg-green-50 text-green-600 border-green-200"
                              : "bg-transparent text-gray-400 border-transparent hover:bg-gray-100 hover:text-gray-700 hover:border-gray-200"
                          }`}
                        >
                          {copiedIndex === index ? (
                            <IoCheckmarkOutline size={18} />
                          ) : (
                            <IoCopyOutline size={18} />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {msg.contextSnapshot && (
                      <div className="mb-2 text-[11px] bg-white/60 border-l-2 border-blue-400 p-2 rounded-r text-gray-500 italic truncate max-w-[220px]">
                        "{msg.contextSnapshot}"
                      </div>
                    )}
                    <span className="whitespace-pre-wrap font-medium">
                      {displayText}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex items-center gap-1.5 ml-1 mt-2">
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="bg-white/80 backdrop-blur border-t border-gray-100 w-full relative z-40">
        {context && (
          <div className="absolute bottom-full left-0 w-full px-4 py-2 bg-blue-50/90 backdrop-blur border-t border-blue-100 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200 shadow-sm">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="bg-blue-100 p-1 rounded text-blue-600 shrink-0">
                <IoDocumentTextOutline size={12} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                  Context Active
                </span>
                <p className="text-[11px] text-gray-600 truncate max-w-[240px] leading-tight opacity-80">
                  "{context}"
                </p>
              </div>
            </div>
            <button
              onClick={handleCloseContext}
              className="text-gray-400 hover:text-gray-600 hover:bg-white p-1 rounded-full transition"
            >
              <IoCloseOutline size={16} />
            </button>
          </div>
        )}
        <div className="p-4 flex gap-2 items-center">
          <button
            onClick={handleScanPage}
            disabled={scanning || loading}
            className={`p-3 rounded-xl border transition-all flex-shrink-0 ${
              scanning
                ? "bg-purple-100 text-purple-600 border-purple-200 animate-pulse"
                : "bg-white border-gray-200 text-gray-500 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50 shadow-sm"
            }`}
          >
            {scanning ? (
              <IoSparklesOutline size={20} className="animate-spin" />
            ) : (
              <IoScanOutline size={20} />
            )}
          </button>
          <div className="relative shadow-sm hover:shadow transition-shadow rounded-xl flex-1">
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={context ? "Ask about context..." : "Ask AI..."}
              className="w-full pl-4 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-[14px] outline-none focus:border-gray-400 focus:ring-0 transition-all text-gray-800 placeholder-gray-400"
            />
            <button
              onClick={() => {
                if (!input.trim()) return;
                handleKeyDown({ key: "Enter", preventDefault: () => {} });
              }}
              disabled={!input.trim()}
              className={`absolute right-2 top-2 p-1.5 rounded-lg transition-all ${
                input.trim()
                  ? "bg-black text-white hover:bg-gray-800 shadow-sm"
                  : "bg-gray-100 text-gray-300"
              }`}
            >
              <IoArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default App;

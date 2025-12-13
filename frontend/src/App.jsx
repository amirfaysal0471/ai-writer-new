import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import axios from "axios";
import { API_BASE_URL } from "./config/config";

import {
  IoRemoveOutline,
  IoCloseOutline,
  IoArrowUp,
  IoCopyOutline,
  IoFlashOutline,
  IoCheckmarkOutline,
  IoSparklesOutline,
  IoScanOutline,
  IoPersonCircleOutline,
  IoLogOutOutline,
  IoKeyOutline,
  IoLinkOutline,
  IoStop,
  IoWarningOutline,
  IoWalletOutline,
  IoDocumentTextOutline, // 🔥 Restore Icon
} from "react-icons/io5";

let ipcRenderer;
try {
  if (window.require) ipcRenderer = window.require("electron").ipcRenderer;
} catch (e) {}
if (!ipcRenderer)
  ipcRenderer = {
    on: () => {},
    removeListener: () => {},
    send: () => {},
    invoke: () => Promise.resolve(""),
  };

const api = axios.create({ baseURL: API_BASE_URL });
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("authToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

function App() {
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [user, setUser] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [showDevInput, setShowDevInput] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [lastClipboard, setLastClipboard] = useState("");
  const [ignoredClipboard, setIgnoredClipboard] = useState("");

  const abortControllerRef = useRef(null);
  const dropdownTimeoutRef = useRef(null);
  const bottomRef = useRef(null);

  const openDropdown = () => {
    clearTimeout(dropdownTimeoutRef.current);
    setIsDropdownOpen(true);
  };
  const closeDropdown = () => {
    dropdownTimeoutRef.current = setTimeout(
      () => setIsDropdownOpen(false),
      200
    );
  };
  useEffect(() => {
    return () => {
      if (dropdownTimeoutRef.current) clearTimeout(dropdownTimeoutRef.current);
    };
  }, []);

  // Auth
  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    if (storedToken) fetchUserProfile();
    const handleAuthToken = (e, token) => {
      localStorage.setItem("authToken", token);
      fetchUserProfile();
    };
    ipcRenderer.on("auth-token", handleAuthToken);
    return () => ipcRenderer.removeListener("auth-token", handleAuthToken);
  }, []);

  useEffect(() => {
    setImageError(false);
  }, [user]);

  const fetchUserProfile = async () => {
    try {
      const response = await api.get(`/api/current_user`);
      setUser(response.data);
      setShowDevInput(false);
    } catch (error) {
      if (error.response?.status === 401) localStorage.removeItem("authToken");
      setUser(null);
    }
  };

  const handleLogin = () =>
    ipcRenderer.send(
      "open-browser",
      "http://localhost:5173/login?source=desktop"
    );
  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setUser(null);
    setIsDropdownOpen(false);
  };
  const handleDashboardRedirect = () => {
    if (!user) return;
    const path = user.role === "admin" ? "admin-dashboard" : "user-dashboard";
    ipcRenderer.send("open-browser", `http://localhost:5173/${path}`);
    setIsDropdownOpen(false);
  };
  const handleManualSubmit = () => {
    if (manualToken.trim()) {
      localStorage.setItem("authToken", manualToken.trim());
      fetchUserProfile();
    }
  };

  // 🔥 RESTORED: Clipboard Monitor Logic
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, context]); // 'context' added dependency to scroll when context appears

  const cleanText = (text) =>
    text
      ?.replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<\/?s>/gi, "")
      .trim() || "";

  const addSystemMessage = (type, text) => {
    setMessages((prev) => [...prev, { role: "system", type, content: text }]);
    setLoading(false);
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const streamAIResponse = async (requestBody) => {
    const token = localStorage.getItem("authToken");
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/solve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error("AUTH_REQUIRED");
        if (response.status === 403) throw new Error("TOKEN_LIMIT");
        throw new Error("API Error");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.trim().startsWith("data:")) continue;
            const data = line.replace("data: ", "").trim();
            if (data === "[DONE]") {
              done = true;
              break;
            }
            try {
              const json = JSON.parse(data);
              if (json.text) {
                setMessages((prev) => {
                  if (prev.length === 0) return prev;
                  const lastIndex = prev.length - 1;
                  if (prev[lastIndex].role !== "assistant") return prev;
                  const updatedMsgs = [...prev];
                  updatedMsgs[lastIndex] = {
                    ...updatedMsgs[lastIndex],
                    content: updatedMsgs[lastIndex].content + json.text,
                  };
                  return updatedMsgs;
                });
              }
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      if (error.name === "AbortError") return;

      if (error.message === "AUTH_REQUIRED")
        addSystemMessage("auth", "Session expired.");
      else if (error.message === "TOKEN_LIMIT")
        addSystemMessage("token", "No tokens left.");
      else addSystemMessage("error", error.message || "Failed.");

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && !last.content)
          return prev.slice(0, -1);
        return prev;
      });
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (loading) {
        stopGeneration();
        return;
      }
      if (!input.trim()) return;
      if (!user) {
        addSystemMessage("auth", "Please login.");
        return;
      }

      const txt = input;
      setInput("");

      // Use context if available
      const promptForAI = context
        ? `Context:\n"""${context}"""\n\nQuestion: ${txt}`
        : txt;

      setMessages((prev) => [
        ...prev,
        { role: "user", content: txt, contextSnapshot: context },
        { role: "assistant", content: "" },
      ]);
      setLoading(true);

      await streamAIResponse({
        history: messages.map((m) => ({ role: m.role, content: m.content })), // Send history for context
        prompt: promptForAI,
      });

      setIgnoredClipboard(context);
      setContext(""); // Clear context after sending
    }
  };

  const handleScanPage = async () => {
    if (!user) {
      addSystemMessage("auth", "Login required.");
      return;
    }
    setScanning(true);
    const pageText = await ipcRenderer.invoke("scan-screen-ocr");
    setScanning(false);

    if (!pageText || pageText.trim().length < 5) {
      addSystemMessage("error", "No text found.");
      return;
    }
    const cleanPageText = pageText.replace(/[^a-zA-Z0-9\s.,?!$%-()]/g, " ");
    const prompt = `Context: Text extracted from screen.
Task: If it's a question, answer it. If it's general text, summarize or explain.
Text: """${cleanPageText}"""`;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: "📷 Analyzing...", contextSnapshot: "OCR Scan" },
      { role: "assistant", content: "" },
    ]);
    setLoading(true);
    await streamAIResponse({ prompt });
    setLastClipboard(pageText); // Update clipboard trackers
    setIgnoredClipboard(pageText);
  };

  const handleCloseContext = () => {
    setIgnoredClipboard(context);
    setContext("");
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const renderSystemMessage = (msg) => {
    if (msg.type === "auth")
      return (
        <div className="w-full bg-white border border-gray-200 rounded-xl p-5 text-center shadow-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3">
            <IoPersonCircleOutline size={22} className="text-gray-600" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">
            Authentication Required
          </h3>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            Please sign in to continue using the tool.
          </p>
          <button
            onClick={handleLogin}
            className="bg-black text-white text-xs font-bold px-5 py-2 rounded-lg hover:bg-gray-800 transition w-full"
          >
            Sign In
          </button>
        </div>
      );
    if (msg.type === "token")
      return (
        <div className="w-full bg-white border border-gray-200 rounded-xl p-5 text-center shadow-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3">
            <IoWalletOutline size={22} className="text-gray-600" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">Limit Reached</h3>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            You need more tokens to process requests.
          </p>
          <button
            onClick={handleDashboardRedirect}
            className="bg-black text-white text-xs font-bold px-5 py-2 rounded-lg hover:bg-gray-800 transition w-full"
          >
            Buy Tokens
          </button>
        </div>
      );
    return (
      <div className="w-full bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-3">
        <IoWarningOutline className="text-red-500 mt-0.5 shrink-0" />
        <p className="text-xs text-red-600 font-medium">{msg.content}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-white font-sans text-gray-900 border border-gray-200/80 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/5">
      {/* Header */}
      <div
        className="h-11 w-full bg-white border-b border-gray-100 flex items-center justify-between px-4 shrink-0 z-50 cursor-move"
        style={{ WebkitAppRegion: "drag" }}
      >
        <div className="flex items-center gap-2 text-gray-900">
          <IoFlashOutline size={16} className="text-black" />
          <span className="text-[13px] font-bold tracking-wide">
            Survey Boss AI
          </span>
        </div>
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          {!user && showDevInput && (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="w-24 text-[10px] p-1 border rounded bg-gray-50"
              />
              <button
                onClick={handleManualSubmit}
                className="bg-black text-white p-1 rounded text-[10px]"
              >
                Go
              </button>
            </div>
          )}
          {!user && (
            <button
              onClick={() => setShowDevInput(!showDevInput)}
              className="p-1 text-gray-400 hover:text-black"
            >
              <IoKeyOutline size={14} />
            </button>
          )}
          {user ? (
            <div
              className="relative flex items-center cursor-pointer"
              onMouseEnter={openDropdown}
              onMouseLeave={closeDropdown}
            >
              <button className="p-0.5 rounded-full hover:bg-gray-100 overflow-hidden shrink-0 transition">
                {user.picture && !imageError ? (
                  <img
                    src={user.picture}
                    alt="Profile"
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    className="w-6 h-6 rounded-full border border-gray-300 object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="w-6 h-6 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center font-bold text-xs border border-gray-200">
                    {user.displayName ? user.displayName[0].toUpperCase() : "U"}
                  </div>
                )}
              </button>
              {isDropdownOpen && (
                <div className="absolute right-0 top-9 bg-white border border-gray-100 shadow-xl rounded-lg p-2 min-w-[150px] z-50">
                  <p className="text-xs font-bold p-1 truncate text-gray-800">
                    {user.displayName}
                  </p>
                  <button
                    onClick={handleDashboardRedirect}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded"
                  >
                    <IoLinkOutline /> Dashboard
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded"
                  >
                    <IoLogOutOutline /> Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-black transition"
            >
              <IoPersonCircleOutline size={20} />
            </button>
          )}
          <div className="h-4 w-[1px] bg-gray-200 mx-1"></div>
          <button
            onClick={() => ipcRenderer.send("minimize-app")}
            className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded transition"
          >
            <IoRemoveOutline size={16} />
          </button>
          <button
            onClick={() => ipcRenderer.send("close-app")}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition"
          >
            <IoCloseOutline size={16} />
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 w-full overflow-y-auto px-4 py-4 scroll-smooth space-y-5 [&::-webkit-scrollbar]:hidden">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3">
            <div className="p-4 bg-gray-50 rounded-full">
              <IoScanOutline size={24} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium">Click Scan for smart analysis</p>
          </div>
        )}

        {messages.map((msg, index) => {
          if (msg.role === "system")
            return (
              <div key={index} className="flex justify-center w-full">
                {renderSystemMessage(msg)}
              </div>
            );

          const displayText =
            msg.role === "assistant" ? cleanText(msg.content) : msg.content;
          const showLoader =
            loading &&
            index === messages.length - 1 &&
            msg.role === "assistant" &&
            !displayText;

          return (
            <div
              key={index}
              className={`flex w-full flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[95%] relative transition-all duration-200 ${
                  msg.role === "user"
                    ? "bg-[#f4f4f4] text-gray-800 px-4 py-2.5 rounded-2xl rounded-tr-sm text-[14px]"
                    : "w-full pl-0 text-gray-900"
                }`}
              >
                {showLoader ? (
                  <div className="flex items-center gap-1.5 ml-1 h-6">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                  </div>
                ) : msg.role === "assistant" ? (
                  <div className="group">
                    <div className="prose prose-sm prose-slate max-w-none prose-p:my-1 prose-headings:my-1 prose-headings:font-bold prose-headings:text-black prose-strong:font-bold prose-strong:text-black">
                      <ReactMarkdown>{displayText}</ReactMarkdown>
                    </div>
                    {!loading && displayText && (
                      <div className="mt-1 flex justify-start">
                        <button
                          onClick={() => handleCopy(displayText, index)}
                          className="text-gray-300 hover:text-black transition p-1"
                          title="Copy"
                        >
                          {copiedIndex === index ? (
                            <IoCheckmarkOutline
                              size={16}
                              className="text-green-500"
                            />
                          ) : (
                            <IoCopyOutline size={16} />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {msg.contextSnapshot && (
                      <div className="mb-1 text-[10px] text-gray-400 italic truncate max-w-[200px]">
                        "{msg.contextSnapshot}"
                      </div>
                    )}
                    <span className="whitespace-pre-wrap font-medium leading-relaxed">
                      {displayText}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="bg-white/95 backdrop-blur border-t border-gray-100 w-full p-4 flex gap-2 items-center relative z-40">
        {/* 🔥 RESTORED: Context Active Bar (Clean/ChatGPT Style) */}
        {context && (
          <div className="absolute bottom-full left-0 w-full px-4 py-2 bg-white/95 backdrop-blur border-t border-gray-100 flex items-center justify-between shadow-sm z-50 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="bg-gray-100 p-1.5 rounded text-black shrink-0">
                <IoDocumentTextOutline size={12} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Context Active
                </span>
                <p className="text-[11px] text-gray-800 truncate max-w-[200px] font-medium">
                  "{context}"
                </p>
              </div>
            </div>
            <button
              onClick={handleCloseContext}
              className="text-gray-400 hover:text-red-500 hover:bg-gray-100 p-1 rounded-full transition"
            >
              <IoCloseOutline size={16} />
            </button>
          </div>
        )}

        <button
          onClick={handleScanPage}
          disabled={scanning || loading}
          className={`p-3 rounded-xl border transition-all ${
            scanning
              ? "bg-black text-white animate-pulse"
              : "bg-white text-gray-500 hover:text-black hover:border-gray-400 hover:bg-gray-50 border-gray-200 shadow-sm"
          }`}
        >
          {scanning ? (
            <IoSparklesOutline size={20} className="animate-spin" />
          ) : (
            <IoScanOutline size={20} />
          )}
        </button>
        <div className="relative shadow-sm rounded-xl flex-1 group">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={!user ? "Login to chat..." : "Ask AI..."}
            disabled={!user}
            className="w-full pl-4 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-[14px] outline-none focus:border-gray-400 focus:ring-0 disabled:bg-gray-50 disabled:text-gray-400 transition-all placeholder:text-gray-400 text-gray-800"
          />
          <button
            onClick={() => {
              if (loading) {
                stopGeneration();
              } else {
                if (input.trim())
                  handleKeyDown({ key: "Enter", preventDefault: () => {} });
              }
            }}
            disabled={!input.trim() && !loading}
            className={`absolute right-2 top-2 p-1.5 rounded-lg transition-all ${
              input.trim() || loading
                ? "bg-black text-white hover:bg-gray-800"
                : "bg-gray-100 text-gray-300"
            }`}
          >
            {loading ? <IoStop size={16} /> : <IoArrowUp size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

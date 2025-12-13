import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "./config/config";

// Import Components
import Header from "./components/Header";
import ChatArea from "./components/ChatArea";
import Footer from "./components/Footer";

// IPC Renderer
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
  // State
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [user, setUser] = useState(null);
  const [showDevInput, setShowDevInput] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [lastClipboard, setLastClipboard] = useState("");
  const [ignoredClipboard, setIgnoredClipboard] = useState("");

  const abortControllerRef = useRef(null);
  const bottomRef = useRef(null);

  // --- Auth & Setup ---
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

  // --- Handlers ---
  const handleLogin = () =>
    ipcRenderer.send(
      "open-browser",
      "https://ai-writer-frontend-fawn.vercel.app/login?source=desktop"
    );

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setUser(null);
    setMessages([]);
    setContext("");
    setInput("");
  };

  const handleDashboardRedirect = () => {
    if (!user) return;
    const path = user.role === "admin" ? "admin-dashboard" : "user-dashboard";
    ipcRenderer.send(
      "open-browser",
      `https://ai-writer-frontend-fawn.vercel.app/${path}`
    );
  };
  const handleManualSubmit = () => {
    if (manualToken.trim()) {
      localStorage.setItem("authToken", manualToken.trim());
      fetchUserProfile();
    }
  };

  // 🔥 FIXED: Robust Auto-Scrolling for Streaming
  useEffect(() => {
    if (bottomRef.current) {
      // স্ট্রিম চলাকালীন সময় যদি 'smooth' থাকে তাহলে অনেক সময় আটকে যায়।
      // তাই এখানে block: "end" ব্যবহার করা হয়েছে যা নিশ্চিত করে একদম নিচে যাবে।
      bottomRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [messages, loading]);

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };
  const handleCloseContext = () => {
    setIgnoredClipboard(context);
    setContext("");
  };

  // --- Logic: Clipboard ---
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
      } catch (err) {}
    };
    const intervalId = setInterval(checkClipboard, 1000);
    return () => clearInterval(intervalId);
  }, [lastClipboard, ignoredClipboard]);

  // --- Logic: AI Streaming ---
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
        addSystemMessage("token", "Limit Reached.");
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
    if (e?.preventDefault) e.preventDefault();
    if (!input.trim()) return;
    if (!user) {
      addSystemMessage("auth", "Please login.");
      return;
    }

    const txt = input;
    setInput("");
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
      history: messages.map((m) => ({ role: m.role, content: m.content })),
      prompt: promptForAI,
    });
    setIgnoredClipboard(context);
    setContext("");
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
    const prompt = `Context: Screen Text. Task: Answer or Explain. Text: """${cleanPageText}"""`;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: "📷 Analyzing...", contextSnapshot: "OCR Scan" },
      { role: "assistant", content: "" },
    ]);
    setLoading(true);
    await streamAIResponse({ prompt });
    setLastClipboard(pageText);
    setIgnoredClipboard(pageText);
  };

  // --- Main Layout ---
  return (
    <div className="flex flex-col w-screen h-screen bg-white font-sans text-gray-900 border border-gray-200/80 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/5">
      <Header
        user={user}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
        handleDashboardRedirect={handleDashboardRedirect}
        handleManualSubmit={handleManualSubmit}
        manualToken={manualToken}
        setManualToken={setManualToken}
        showDevInput={showDevInput}
        setShowDevInput={setShowDevInput}
      />
      <ChatArea
        messages={messages}
        loading={loading}
        bottomRef={bottomRef}
        handleCopy={handleCopy}
        copiedIndex={copiedIndex}
        handleLogin={handleLogin}
        handleDashboardRedirect={handleDashboardRedirect}
        user={user}
      />
      <Footer
        input={input}
        setInput={setInput}
        handleKeyDown={handleKeyDown}
        handleScanPage={handleScanPage}
        scanning={scanning}
        loading={loading}
        stopGeneration={stopGeneration}
        context={context}
        handleCloseContext={handleCloseContext}
        user={user}
      />
    </div>
  );
}

export default App;

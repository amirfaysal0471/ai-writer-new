import { useEffect, useRef } from "react"; // useRef and useEffect import koro
import {
  IoSparklesOutline,
  IoScanOutline,
  IoDocumentTextOutline,
  IoCloseOutline,
  IoStop,
  IoArrowUp,
} from "react-icons/io5";

const Footer = ({
  input,
  setInput,
  handleKeyDown,
  handleScanPage,
  scanning,
  loading,
  stopGeneration,
  context,
  handleCloseContext,
  user,
}) => {
  // 1. Ref to control textarea height
  const textareaRef = useRef(null);

  // 2. Auto-resize logic whenever input changes
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to correctly calculate the new scrollHeight
      textareaRef.current.style.height = "auto";
      // Set new height based on content, limited by max-height in CSS
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [input]);

  return (
    <div className="bg-white/95 backdrop-blur border-t border-gray-100 w-full p-4 flex gap-2 items-end relative z-40 shrink-0">
      {/* Context Active Bar */}
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

      {/* Scan Button */}
      <button
        onClick={handleScanPage}
        disabled={scanning || loading}
        className={`p-3 rounded-xl border transition-all h-[46px] w-[46px] flex items-center justify-center ${
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

      {/* Input Area */}
      <div className="relative shadow-sm rounded-xl flex-1 bg-white border border-gray-200 focus-within:border-gray-400 transition-colors">
        <textarea
          ref={textareaRef} // Attach the ref here
          autoFocus
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!input.trim() && !loading) return;
              if (loading) stopGeneration();
              else handleKeyDown(e);
            }
          }}
          placeholder={!user ? "Login required..." : "Ask anything..."}
          disabled={!user}
          // 🔥 FIXED: Added 'break-all' and removed fixed height styles to support dynamic growth
          className="w-full pl-4 pr-10 py-3 bg-transparent text-[14px] outline-none resize-none max-h-[120px] overflow-y-auto disabled:opacity-50 text-gray-800 placeholder:text-gray-400 break-all"
          style={{ minHeight: "46px" }}
        />

        {/* Send / Stop Button */}
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
          className={`absolute right-2 bottom-2 p-1.5 rounded-lg transition-all ${
            input.trim() || loading
              ? "bg-black text-white hover:bg-gray-800"
              : "bg-gray-100 text-gray-300"
          }`}
        >
          {loading ? <IoStop size={16} /> : <IoArrowUp size={16} />}
        </button>
      </div>
    </div>
  );
};

export default Footer;

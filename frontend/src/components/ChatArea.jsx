import ReactMarkdown from "react-markdown";
import {
  IoCopyOutline,
  IoCheckmarkOutline,
  IoScanOutline,
  IoPersonCircleOutline,
  IoWalletOutline,
  IoWarningOutline,
} from "react-icons/io5";

const ChatArea = ({
  messages,
  loading,
  bottomRef,
  handleCopy,
  copiedIndex,
  handleLogin,
  handleDashboardRedirect,
  user,
}) => {
  // Clean text helper
  const cleanText = (text) =>
    text
      ?.replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<\/?s>/gi, "")
      .trim() || "";

  // Render System Cards
  const renderSystemMessage = (msg) => {
    if (msg.type === "auth")
      return (
        <div className="w-full bg-white border border-gray-200 rounded-xl p-5 text-center shadow-sm animate-in fade-in zoom-in-95 duration-300">
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
        <div className="w-full bg-white border border-gray-200 rounded-xl p-5 text-center shadow-sm animate-in fade-in zoom-in-95 duration-300">
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
      <div className="w-full bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-3 animate-in fade-in">
        <IoWarningOutline className="text-red-500 mt-0.5 shrink-0" />
        <p className="text-xs text-red-600 font-medium">{msg.content}</p>
      </div>
    );
  };

  return (
    <div className="flex-1 w-full overflow-y-auto px-4 py-4 scroll-smooth space-y-6 [&::-webkit-scrollbar]:hidden">
      {/* Empty State */}
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3">
          {!user ? (
            <div className="w-full max-w-[280px]">
              {renderSystemMessage({ type: "auth" })}
            </div>
          ) : (
            <>
              <div className="p-4 bg-gray-50 rounded-full border border-dashed border-gray-200">
                <IoScanOutline size={24} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-400">
                Ready to assist...
              </p>
            </>
          )}
        </div>
      )}

      {/* Message List */}
      {messages.map((msg, index) => {
        if (msg.role === "system")
          return (
            <div key={index} className="flex justify-center w-full px-2">
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
                  ? "bg-[#f4f4f4] text-gray-800 px-4 py-2.5 rounded-2xl rounded-tr-sm text-xs leading-relaxed"
                  : "w-full pl-0 text-gray-900"
              }`}
            >
              {/* Loader Animation */}
              {showLoader ? (
                <div className="flex items-center gap-1.5 ml-1 h-6">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                </div>
              ) : msg.role === "assistant" ? (
                // Assistant Message with FORCED Small Text
                <div className="group">
                  {/* 🔥 ফিক্স: 
                      1. [&>p]:!text-xs -> প্যারাগ্রাফ ফোর্সফুলি text-xs হবে
                      2. [&>ul>li]:!text-xs -> লিস্ট আইটেম ছোট হবে
                      3. prose-sm এর ডিফল্ট সাইজ ওভাররাইড করা হয়েছে
                  */}
                  <div
                    className="prose prose-sm prose-slate max-w-none 
                    [&>p]:!text-xs [&>p]:!leading-relaxed [&>p]:!my-1
                    [&>ul>li]:!text-xs [&>ol>li]:!text-xs
                    [&>h1]:!text-xs [&>h2]:!text-xs [&>h3]:!text-xs
                    [&>pre]:!text-xs [&>pre]:!p-2 [&>pre]:!rounded-lg
                    [&>strong]:!text-xs
                    "
                  >
                    <ReactMarkdown>{displayText}</ReactMarkdown>
                  </div>

                  {!loading && displayText && (
                    <div className="mt-1 flex justify-start opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={() => handleCopy(displayText, index)}
                        className="text-gray-300 hover:text-black transition p-1"
                        title="Copy"
                      >
                        {copiedIndex === index ? (
                          <IoCheckmarkOutline
                            size={14} // আইকন সাইজও একটু কমানো হয়েছে
                            className="text-green-500"
                          />
                        ) : (
                          <IoCopyOutline size={14} />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // User Message
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
  );
};

export default ChatArea;

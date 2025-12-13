import { useState, useRef, useEffect } from "react";
import {
  IoRemoveOutline,
  IoCloseOutline,
  IoPersonCircleOutline,
  IoLogOutOutline,
  IoKeyOutline,
  IoLinkOutline,
  IoFlashOutline,
} from "react-icons/io5";

// IPC Helper
let ipcRenderer;
try {
  if (window.require) ipcRenderer = window.require("electron").ipcRenderer;
} catch (e) {}
if (!ipcRenderer) ipcRenderer = { send: () => {} };

const Header = ({
  user,
  handleLogin,
  handleLogout,
  handleDashboardRedirect,
  handleManualSubmit,
  manualToken,
  setManualToken,
  showDevInput,
  setShowDevInput,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownTimeoutRef = useRef(null);

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

  return (
    <div
      className="h-11 w-full bg-white/95 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-4 shrink-0 z-50 cursor-move"
      style={{ WebkitAppRegion: "drag" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 text-gray-900">
        <IoFlashOutline size={16} className="text-black" />
        <span className="text-[13px] font-bold tracking-wide">
          Survey Boss AI
        </span>
      </div>

      {/* Controls */}
      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        {/* Manual Token Input */}
        {!user && showDevInput && (
          <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
            <input
              type="text"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              className="w-24 text-[10px] p-1 border rounded bg-gray-50 focus:outline-none"
              placeholder="Token..."
            />
            <button
              onClick={handleManualSubmit}
              className="bg-black text-white p-1 rounded text-[10px] hover:bg-gray-800"
            >
              Go
            </button>
          </div>
        )}

        {!user && (
          <button
            onClick={() => setShowDevInput(!showDevInput)}
            className="p-1 text-gray-400 hover:text-black transition"
          >
            <IoKeyOutline size={14} />
          </button>
        )}

        {/* User Profile */}
        {user ? (
          <div
            className="relative flex items-center cursor-pointer"
            onMouseEnter={openDropdown}
            onMouseLeave={closeDropdown}
          >
            <button className="p-0.5 rounded-full hover:bg-gray-100 overflow-hidden shrink-0 transition">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt="Profile"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  className="w-6 h-6 rounded-full border border-gray-300 object-cover"
                />
              ) : (
                <div className="w-6 h-6 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center font-bold text-xs border border-gray-200">
                  {user.displayName ? user.displayName[0].toUpperCase() : "U"}
                </div>
              )}
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 top-9 bg-white border border-gray-100 shadow-xl rounded-lg p-2 min-w-[150px] z-50 animate-in fade-in zoom-in-95 duration-100">
                <p className="text-xs font-bold p-1 truncate text-gray-800">
                  {user.displayName}
                </p>
                <div className="h-px bg-gray-100 my-1"></div>
                <button
                  onClick={handleDashboardRedirect}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded transition"
                >
                  <IoLinkOutline /> Dashboard
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded transition"
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

        {/* Window Controls */}
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
  );
};

export default Header;

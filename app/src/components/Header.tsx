import React from "react";

interface HeaderProps {
  activeTab: "chat" | "settings";
  setActiveTab: (tab: "chat" | "settings") => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/50 px-6 py-3 flex items-center justify-between shrink-0">
      <h1 className="text-xl font-bold text-indigo-400">Assistant Desktop</h1>
      <nav className="flex space-x-2">
        <button
          onClick={() => setActiveTab("chat")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "chat"
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Workspace
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "settings"
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Settings
        </button>
      </nav>
    </header>
  );
};

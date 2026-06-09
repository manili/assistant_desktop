import React, { useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorTab } from "../types";

interface CodeViewerProps {
  tabs: EditorTab[];
  activeTabName: string;
  onSelectTab: (fileName: string) => void;
  onCloseTab: (fileName: string) => void;
  onEditTabContent: (fileName: string, content: string) => void;
  onSaveTabContent: (fileName: string) => void;
}

export const CodeViewer = React.memo(function CodeViewer({
  tabs,
  activeTabName,
  onSelectTab,
  onCloseTab,
  onEditTabContent,
  onSaveTabContent,
}: CodeViewerProps) {
  const activeTab = tabs.find((t) => t.fileName === activeTabName);

  // Monitor keys for Cmd+S or Ctrl+S within document context
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (activeTabName) {
          onSaveTabContent(activeTabName);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabName, onSaveTabContent]);

  return (
    <div className="flex-1 border-r border-slate-800 flex flex-col bg-slate-950 min-w-0 h-full overflow-hidden relative">
      {/* 1. Horizontal Tab Bar */}
      {tabs.length > 0 && (
        <div className="flex items-center bg-slate-900 border-b border-slate-850 shrink-0 overflow-x-auto select-none custom-scrollbar whitespace-nowrap justify-between">
          <div className="flex items-center">
            {tabs.map((tab) => {
              const isActive = tab.fileName === activeTabName;
              const displayName = tab.fileName.split("/").pop() || tab.fileName;

              return (
                <div
                  key={tab.fileName}
                  onClick={() => onSelectTab(tab.fileName)}
                  className={`group flex items-center space-x-2 px-4 py-2.5 border-r border-slate-850 text-xs font-semibold font-mono cursor-pointer transition-colors max-w-[180px] truncate ${
                    isActive
                      ? "bg-slate-950 text-indigo-400 border-t-2 border-t-indigo-500"
                      : "text-slate-500 hover:bg-slate-850 hover:text-slate-350"
                  }`}
                  title={tab.fileName}
                >
                  <span className="truncate">
                    📄 {displayName}
                    {tab.isDirty && (
                      <span className="text-amber-500 font-bold ml-1">*</span>
                    )}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.fileName);
                    }}
                    className="w-3.5 h-3.5 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-800 hover:text-rose-400 text-[9px] transition-colors"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Inline Save Trigger */}
          {activeTab && activeTab.isDirty && (
            <button
              onClick={() => onSaveTabContent(activeTab.fileName)}
              className="mr-4 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded flex items-center space-x-1 shadow transition-colors"
              title="Save changes (Cmd+S)"
            >
              <span>💾 Save</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Main Editor Window */}
      {activeTab ? (
        <div className="flex-1 overflow-auto relative">
          <CodeMirror
            value={activeTab.content}
            height="100%"
            theme={oneDark}
            extensions={[javascript()]}
            onChange={(val) => onEditTabContent(activeTab.fileName, val)} // Editable
            className="h-full text-sm"
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-600 space-y-2 text-center p-6 selection:bg-transparent">
          <svg
            className="w-10 h-10 text-slate-700"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
            />
          </svg>
          <span className="text-xs">
            No active tab open. Click files in the sidebar explorer.
          </span>
        </div>
      )}
    </div>
  );
});

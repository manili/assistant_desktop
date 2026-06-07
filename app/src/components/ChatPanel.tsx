import React, { useRef, useEffect } from "react";
import { ChatMessage } from "../types";
import { MessageItem } from "./MessageItem";

interface ChatPanelProps {
  messages: ChatMessage[];
  activeModel?: string;
  prompt: string;
  setPrompt: (v: string) => void;
  isStreaming: boolean;
  isTerminalOpen: boolean;
  setIsTerminalOpen: (v: boolean) => void;
  onSendMessage: () => void;
  onClearMessages: () => void;

  // Forwarded Item Event Handlers
  editingIndex: number | null;
  editingText: string;
  setEditingText: (text: string) => void;
  runningCommand: string | null;
  onCopy: (content: string) => void;
  onStartEdit: (index: number, content: string) => void;
  onSaveEdit: (index: number) => void;
  onCancelEdit: () => void;
  onDelete: (index: number) => void;
  onRerun: (index: number) => void;
  onRunCommand: (command: string) => void;
  onWriteFile: (fileName: string, content: string) => void;
  onPatchFile: (fileName: string, content: string) => void;
  onToggleMessageSelect: (index: number, checked: boolean) => void;
  onOpenPreview: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  activeModel,
  prompt,
  setPrompt,
  isStreaming,
  isTerminalOpen,
  setIsTerminalOpen,
  onSendMessage,
  onClearMessages,
  editingIndex,
  editingText,
  setEditingText,
  runningCommand,
  onCopy,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onRerun,
  onRunCommand,
  onWriteFile,
  onPatchFile,
  onToggleMessageSelect,
  onOpenPreview,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden w-full">
      <div className="p-3 border-b border-slate-800 bg-slate-950 text-xs text-slate-400 text-center uppercase tracking-wider font-semibold flex justify-between items-center shrink-0 select-none">
        <div className="flex space-x-2">
          <span>Engine: {activeModel || "None Selected"}</span>
          {messages.length > 0 && (
            <button
              onClick={onClearMessages}
              className="text-rose-400 hover:text-rose-350 ml-2 font-bold lowercase"
            >
              [clear thread]
            </button>
          )}
        </div>
        <button
          onClick={() => setIsTerminalOpen(!isTerminalOpen)}
          className="px-2 py-0.5 bg-slate-800 rounded text-xs hover:bg-slate-700 transition-colors"
        >
          {isTerminalOpen ? "Close Terminal" : "Open Terminal"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 text-sm select-none">
            Ready to assist. Ask a question!
          </div>
        ) : (
          messages.map((m, i) => (
            <MessageItem
              key={m.id}
              msg={m}
              index={i}
              editingIndex={editingIndex}
              editingText={editingText}
              setEditingText={setEditingText}
              runningCommand={runningCommand}
              onCopy={onCopy}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
              onRerun={onRerun}
              onRunCommand={onRunCommand}
              onWriteFile={onWriteFile}
              onPatchFile={onPatchFile}
              onToggleMessageSelect={onToggleMessageSelect}
            />
          ))
        )}
        <div ref={scrollRef} />
      </div>

      <div className="p-4 bg-slate-950 border-t border-slate-800 shrink-0">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Intercept Cmd+Enter or Ctrl+Enter to open the debug modal
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                onOpenPreview();
              } else if (!e.shiftKey) {
                e.preventDefault();
                onSendMessage();
              }
            }
          }}
          placeholder="Ask code questions... (Enter to send, Cmd+Enter to preview)"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 resize-none h-20"
          disabled={isStreaming}
        />
      </div>
    </div>
  );
};

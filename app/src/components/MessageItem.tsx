import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { ChatMessage } from "../types";
import { parseAgentOutput } from "../utils/parser";

interface MessageItemProps {
  msg: ChatMessage;
  index: number;
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
}

export const MessageItem: React.FC<MessageItemProps> = ({
  msg,
  index,
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
}) => {
  const isEditing = editingIndex === index;

  return (
    <div
      className={`relative group p-3 rounded-lg text-sm transition-all ${
        msg.role === "user"
          ? "bg-indigo-900/40 border border-indigo-800/50 ml-6"
          : msg.role === "system"
          ? "bg-slate-950/50 border border-slate-850/50 text-slate-400 mx-6 text-xs"
          : "bg-slate-800 border border-slate-700 mr-6"
      }`}
    >
      {!isEditing && (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1 bg-slate-950/90 border border-slate-800 px-1.5 py-1 rounded shadow-lg z-10">
          <button
            onClick={() => onCopy(msg.content)}
            title="Copy Content"
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
              />
            </svg>
          </button>
          <button
            onClick={() => onStartEdit(index, msg.content)}
            title="Edit Message"
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
          <button
            onClick={() => onDelete(index)}
            title="Delete Message"
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
          {msg.role === "user" && (
            <button
              onClick={() => onRerun(index)}
              title="Rerun prompt from here"
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      <span className="text-xs font-bold uppercase mb-1 block text-slate-500">
        {msg.role}
      </span>

      {isEditing ? (
        <div className="space-y-2 mt-2">
          <textarea
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 resize-y min-h-[80px]"
          />
          <div className="flex space-x-2 justify-end">
            <button
              onClick={onCancelEdit}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={() => onSaveEdit(index)}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
            >
              Save
            </button>
          </div>
        </div>
      ) : msg.role === "assistant" ? (
        <div className="space-y-3">
          {parseAgentOutput(msg.content).map((block, idx) => {
            if (block.type === "text") {
              return (
                <div
                  key={idx}
                  className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-sans text-slate-300 leading-relaxed"
                >
                  {block.content}
                </div>
              );
            } else if (block.type === "command") {
              return (
                <div
                  key={idx}
                  className="my-2 border border-amber-900/50 bg-amber-950/20 p-3 rounded-lg space-y-2"
                >
                  <div className="text-xs font-bold text-amber-500 uppercase tracking-wide">
                    Terminal Command Proposed
                  </div>
                  <code className="block bg-slate-950 p-2 rounded text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre">
                    {block.content}
                  </code>
                  <div className="flex space-x-2 pt-1">
                    <button
                      onClick={() => onRunCommand(block.content)}
                      disabled={!!runningCommand}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-slate-950 text-xs font-bold rounded transition-colors disabled:opacity-50"
                    >
                      {runningCommand === block.content
                        ? "Executing..."
                        : "Execute Command"}
                    </button>
                  </div>
                </div>
              );
            } else if (block.type === "write_file") {
              return (
                <div
                  key={idx}
                  className="my-2 border border-indigo-900/50 bg-indigo-950/10 p-3 rounded-lg space-y-2"
                >
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide">
                    Proposed Code Writing:{" "}
                    <span className="font-mono text-slate-200">
                      {block.fileName}
                    </span>
                  </div>
                  <div className="border border-slate-850 rounded overflow-hidden max-h-36 overflow-y-auto">
                    <CodeMirror
                      value={block.content}
                      height="100%"
                      theme={oneDark}
                      extensions={[javascript()]}
                      readOnly
                      className="text-xs"
                    />
                  </div>
                  <div className="flex space-x-2 pt-1">
                    <button
                      onClick={() =>
                        onWriteFile(
                          block.fileName || "unnamed.txt",
                          block.content
                        )
                      }
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded transition-colors"
                    >
                      Approve & Write File
                    </button>
                  </div>
                </div>
              );
            } else {
              return (
                <div
                  key={idx}
                  className="my-2 border border-emerald-900/50 bg-emerald-950/10 p-3 rounded-lg space-y-2"
                >
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                    Proposed Code Patching (Diff):{" "}
                    <span className="font-mono text-slate-200">
                      {block.fileName}
                    </span>
                  </div>
                  <div className="border border-slate-850 rounded overflow-hidden max-h-48 overflow-y-auto">
                    <CodeMirror
                      value={block.content}
                      height="100%"
                      theme={oneDark}
                      extensions={[javascript()]}
                      readOnly
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="flex space-x-2 pt-1">
                    <button
                      onClick={() =>
                        onPatchFile(
                          block.fileName || "unnamed.txt",
                          block.content
                        )
                      }
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded transition-colors"
                    >
                      Approve & Apply Patch
                    </button>
                  </div>
                </div>
              );
            }
          })}
        </div>
      ) : (
        <div className="whitespace-pre-wrap font-sans text-slate-300 leading-relaxed">
          {msg.content}
        </div>
      )}
    </div>
  );
};

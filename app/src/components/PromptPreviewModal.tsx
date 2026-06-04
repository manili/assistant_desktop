import React, { useState, useRef, useEffect } from "react";

interface PromptPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  endpoint: string;
  modelName: string;
  systemInstructions: string;
  userPrompt: string;
  onSend: (combinedPayload: string) => void;
}

export const PromptPreviewModal: React.FC<PromptPreviewModalProps> = ({
  isOpen,
  onClose,
  endpoint,
  modelName,
  systemInstructions,
  userPrompt,
  onSend,
}) => {
  const [isEditable, setIsEditable] = useState(false);
  const [combinedPayload, setCombinedPayload] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setIsEditable(false);
      // Pre-compile the full prompt payload including System instructions & User prompt
      const fullString = `--- SYSTEM INSTRUCTIONS ---\n${systemInstructions}\n\n--- USER PROMPT ---\n${userPrompt}`;
      setCombinedPayload(fullString);
    }
  }, [isOpen, systemInstructions, userPrompt]);

  if (!isOpen) return null;

  const handleEditClick = () => {
    setIsEditable(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Intercept Enter key to instantly dispatch the payload (shift+enter allowed for newlines)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend(combinedPayload);
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 p-6"
      onKeyDown={handleKeyDown}
    >
      {/* Upgraded modal footprint (max-w-5xl, h-[80vh]) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-5xl w-full h-[80vh] p-6 space-y-4 shadow-2xl relative flex flex-col">
        {/* Modal Header */}
        <div className="flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold text-indigo-400">
            Payload Stream Preview (Full Prompt Context)
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 font-bold text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Read-Only Configuration Info Row */}
        <div className="flex flex-col sm:flex-row gap-4 shrink-0 min-w-0">
          {/* Horizontally Scrollable API Endpoint Box */}
          <div className="space-y-1.5 flex-1 min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              API Endpoint Address
            </label>
            <div
              tabIndex={0}
              className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono overflow-x-auto whitespace-nowrap select-all focus:outline-none focus:border-indigo-500/50"
            >
              {endpoint}
            </div>
          </div>

          {/* Horizontally Scrollable Model Box */}
          <div className="space-y-1.5 flex-1 min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Target Model Name
            </label>
            <div
              tabIndex={0}
              className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono overflow-x-auto whitespace-nowrap select-all focus:outline-none focus:border-indigo-500/50"
            >
              {modelName}
            </div>
          </div>
        </div>

        {/* Big Scrollable Textarea */}
        <div className="space-y-1.5 relative group/modal-text flex-1 flex flex-col min-h-0">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 shrink-0">
            Full Unified System + User Context
          </label>
          <div className="relative flex-1 min-h-0">
            <textarea
              ref={textareaRef}
              value={combinedPayload}
              onChange={(e) => setCombinedPayload(e.target.value)}
              readOnly={!isEditable}
              className={`w-full h-full bg-slate-950 border rounded-lg p-3 text-sm font-mono focus:outline-none overflow-y-auto resize-none transition-colors ${
                isEditable
                  ? "border-indigo-500 text-slate-100"
                  : "border-slate-850 text-slate-300"
              }`}
            />

            {/* One Hover Edit Pencil Button */}
            {!isEditable && (
              <button
                onClick={handleEditClick}
                className="absolute right-4 top-4 opacity-0 group-hover/modal-text:opacity-100 transition-opacity p-2 bg-slate-900/90 border border-slate-800 rounded text-slate-400 hover:text-indigo-400"
                title="Edit Final Payload Content"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Modal Buttons */}
        <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800/50 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSend(combinedPayload)}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-md shadow-indigo-950/50"
          >
            Send (Enter)
          </button>
        </div>
      </div>
    </div>
  );
};

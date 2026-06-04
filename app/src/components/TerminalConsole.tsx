import React, { useRef, useEffect } from "react";

interface TerminalConsoleProps {
  terminalLogs: string[];
  isTerminalOpen: boolean;
  setIsTerminalOpen: (v: boolean) => void;
  onClearLogs: () => void;
}

export const TerminalConsole: React.FC<TerminalConsoleProps> = ({
  terminalLogs,
  isTerminalOpen,
  setIsTerminalOpen,
  onClearLogs,
}) => {
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isTerminalOpen) {
      consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalLogs, isTerminalOpen]);

  if (!isTerminalOpen) return null;

  return (
    <div className="h-48 border-t border-slate-800 bg-slate-950 flex flex-col shrink-0">
      <div className="bg-slate-900 px-4 py-2 flex justify-between items-center text-xs border-b border-slate-800 select-none">
        <span className="font-mono text-slate-400 font-semibold uppercase tracking-wider">
          Terminal Output Streams (Workspace Mode)
        </span>
        <div className="flex space-x-4">
          <button
            onClick={onClearLogs}
            className="text-slate-500 hover:text-slate-300 font-semibold transition-colors"
          >
            Clear Logs
          </button>
          <button
            onClick={() => setIsTerminalOpen(false)}
            className="text-rose-400 hover:text-rose-300 font-semibold transition-colors"
          >
            Minimize
          </button>
        </div>
      </div>
      <div className="flex-1 p-3 font-mono text-xs text-emerald-400 overflow-y-auto space-y-1 bg-slate-950 selection:bg-indigo-800">
        {terminalLogs.length === 0 ? (
          <div className="text-slate-600">
            Terminal idling. Proposed tools will output live parameters here.
          </div>
        ) : (
          terminalLogs.map((log, i) => (
            <div key={i} className="whitespace-pre-wrap leading-relaxed">
              {log}
            </div>
          ))
        )}
        <div ref={consoleEndRef} />
      </div>
    </div>
  );
};

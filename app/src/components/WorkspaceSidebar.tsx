import React from "react";

interface WorkspaceSidebarProps {
  workspacePath: string | null;
  files: string[];
  activeFileName: string;
  onSelectWorkspace: () => void;
  onOpenFile: (fileName: string) => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  workspacePath,
  files,
  activeFileName,
  onSelectWorkspace,
  onOpenFile,
}) => {
  return (
    <div className="w-64 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0">
      <div className="p-4 border-b border-slate-800">
        <button
          onClick={onSelectWorkspace}
          className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors"
        >
          {workspacePath ? "Change Workspace" : "Open Folder"}
        </button>
        {workspacePath && (
          <div
            className="mt-2 text-xs text-slate-500 truncate"
            title={workspacePath}
          >
            Path: {workspacePath}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="text-xs text-slate-600 text-center mt-4">
            No files loaded
          </div>
        ) : (
          files.map((f) => (
            <button
              key={f}
              onClick={() => onOpenFile(f)}
              className={`w-full text-left px-3 py-2 text-sm rounded transition-colors truncate block ${
                activeFileName === f
                  ? "bg-indigo-900/50 text-indigo-300"
                  : "hover:bg-slate-800 text-slate-400"
              }`}
            >
              📄 {f}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

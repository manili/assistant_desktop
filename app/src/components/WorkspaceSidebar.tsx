import React, { useState, useMemo, useEffect } from "react";

interface WorkspaceSidebarProps {
  workspacePath: string | null;
  files: string[];
  activeFileName: string;
  onSelectWorkspace: () => void;
  onOpenFile: (fileName: string) => void;
  selectedPaths: { [path: string]: boolean };
  onToggleCheckbox: (
    path: string,
    type: "file" | "directory",
    checked: boolean
  ) => void;
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children: FileNode[];
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  workspacePath,
  files,
  activeFileName,
  onSelectWorkspace,
  onOpenFile,
  selectedPaths,
  onToggleCheckbox,
}) => {
  const [collapsedFolders, setCollapsedFolders] = useState<{
    [path: string]: boolean;
  }>({});

  // Reset collapse states back to default (collapsed mode) when switching workspace roots [1]
  useEffect(() => {
    setCollapsedFolders({});
  }, [workspacePath]);

  // Parse relative paths into a nested tree structure
  const fileTree = useMemo(() => {
    const root: FileNode = {
      name: "root",
      path: "",
      type: "directory",
      children: [],
    };

    for (const p of files) {
      const parts = p.split("/");
      let current = root;
      let currentPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = i === parts.length - 1;

        let child = current.children.find((c) => c.name === part);
        if (!child) {
          child = {
            name: part,
            path: currentPath,
            type: isLast ? "file" : "directory",
            children: [],
          };
          current.children.push(child);
        }
        current = child;
      }
    }

    // Sort: directories first (alphabetical), then files (alphabetical)
    const sortTree = (node: FileNode) => {
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortTree);
    };

    sortTree(root);
    return root;
  }, [files]);

  // Toggles the folder state. If undefined, it was default-collapsed, so expand it (false) [1]
  const toggleFolder = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedFolders((prev) => {
      const currentlyCollapsed = prev[path] !== false; // defaults to true
      return { ...prev, [path]: !currentlyCollapsed };
    });
  };

  // Iterates and isolates all subdirectories, setting them to false (explicitly expanded)
  const expandAll = () => {
    const dirs: { [path: string]: boolean } = {};
    files.forEach((f) => {
      const parts = f.split("/");
      let current = "";
      // Loop through all parent segments (skipping the trailing filename)
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        dirs[current] = false; // false = expanded
      }
    });
    setCollapsedFolders(dirs);
  };

  // Reverts all folders back to default-collapsed by clearing state
  const collapseAll = () => {
    setCollapsedFolders({});
  };

  // Recursive tree item node renderer
  const renderTreeItem = (node: FileNode, depth: number = 0) => {
    // Defaults to collapsed (true) if undefined
    const isCollapsed = collapsedFolders[node.path] !== false;
    const isActive = activeFileName === node.path;
    const paddingLeft = `${depth * 12 + 12}px`;
    const isChecked = !!selectedPaths[node.path];

    if (node.type === "directory") {
      return (
        <div key={node.path} className="select-none">
          <button
            onClick={(e) => toggleFolder(node.path, e)}
            style={{ paddingLeft }}
            className="w-full text-left py-1 text-xs rounded hover:bg-slate-800 text-slate-300 font-semibold flex items-center space-x-1.5 transition-colors group relative"
          >
            <span className="text-slate-500 text-[10px] w-3 text-center shrink-0">
              {isCollapsed ? "▶" : "▼"}
            </span>

            {/* Folder Checkbox (Hover-Only and Checked-Only Transition Style) */}
            <input
              type="checkbox"
              checked={isChecked}
              onClick={(e) => e.stopPropagation()} // Prevents toggling directory expansion [1]
              onChange={(e) =>
                onToggleCheckbox(node.path, "directory", e.target.checked)
              }
              className={`rounded border border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-slate-900 focus:ring-2 w-3.5 h-3.5 shrink-0 cursor-pointer transition-all duration-150 ${
                isChecked
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100"
              }`}
            />

            <span>📁 {node.name}</span>
          </button>

          {!isCollapsed && (
            <div className="space-y-0.5">
              {node.children.map((child) => renderTreeItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    } else {
      return (
        <button
          key={node.path}
          onClick={() => onOpenFile(node.path)}
          style={{ paddingLeft: `${depth * 12 + 24}px` }}
          className={`w-full text-left py-1 text-xs rounded transition-all flex items-center space-x-1.5 truncate group relative ${
            isActive
              ? "bg-indigo-900/40 text-indigo-300 font-semibold"
              : "hover:bg-slate-850 text-slate-400 hover:text-slate-200"
          }`}
        >
          {/* File Checkbox (Hover-Only and Checked-Only Transition Style) */}
          <input
            type="checkbox"
            checked={isChecked}
            onClick={(e) => e.stopPropagation()} // Prevents loading file into CodeMirror [1]
            onChange={(e) =>
              onToggleCheckbox(node.path, "file", e.target.checked)
            }
            className={`rounded border border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-slate-900 focus:ring-2 w-3.5 h-3.5 shrink-0 cursor-pointer transition-all duration-150 ${
              isChecked
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100"
            }`}
          />

          <span>📄</span>
          <span className="truncate">{node.name}</span>
        </button>
      );
    }
  };

  return (
    <div className="w-full border-r border-slate-800 bg-slate-900 flex flex-col shrink-0 overflow-hidden">
      <div className="p-4 border-b border-slate-800 shrink-0 flex flex-col">
        <button
          onClick={onSelectWorkspace}
          className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors shrink-0"
        >
          {workspacePath ? "Change Workspace" : "Open Folder"}
        </button>

        {/* Workspace Controls Row */}
        {workspacePath && (
          <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-800 shrink-0">
            <span
              className="text-[10px] text-slate-500 font-mono truncate max-w-[100px]"
              title={workspacePath}
            >
              {workspacePath.split("/").pop()}
            </span>
            <div className="flex space-x-1.5 shrink-0 select-none">
              <button
                onClick={expandAll}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-750 text-[10px] text-indigo-400 font-semibold rounded hover:text-indigo-300 transition-colors"
                title="Expand All Folders"
              >
                Expand
              </button>
              <button
                onClick={collapseAll}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-750 text-[10px] text-slate-400 font-semibold rounded hover:text-slate-300 transition-colors"
                title="Collapse All Folders"
              >
                Collapse
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
        {workspacePath ? (
          fileTree.children.map((child) => renderTreeItem(child, 0))
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-slate-600 text-center px-4">
            No workspace folder loaded.
          </div>
        )}
      </div>
    </div>
  );
};

import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

interface CodeViewerProps {
  activeFileName: string;
  activeFileContent: string;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  activeFileName,
  activeFileContent,
}) => {
  return (
    <div className="flex-1 border-r border-slate-800 flex flex-col bg-slate-950 min-w-0">
      {activeFileName ? (
        <>
          <div className="p-2 border-b border-slate-800 bg-slate-900 text-sm text-slate-400 font-mono truncate">
            {activeFileName}
          </div>
          <div className="flex-1 overflow-auto">
            <CodeMirror
              value={activeFileContent}
              height="100%"
              theme={oneDark}
              extensions={[javascript()]}
              readOnly
              className="h-full text-sm"
            />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-600 px-4 text-center">
          Select a workspace file to load context
        </div>
      )}
    </div>
  );
};

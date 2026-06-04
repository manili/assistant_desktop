import "./App.css";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { parseAgentOutput } from "./utils/parser";

interface ProviderStatus {
  id: string;
  name: string;
  provider_type: string;
  api_url: string;
  has_key: boolean;
  is_local_online: boolean;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "settings">("chat");

  // Settings State
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [apiKeys, setApiKeys] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [testResults, setTestResults] = useState<{
    [key: string]: { success: boolean; message: string };
  }>({});

  // Workspace State
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [activeFileContent, setActiveFileContent] = useState<string>("");
  const [activeFileName, setActiveFileName] = useState<string>("");

  // Chat State
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Terminal Logs Pane State
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProviders();
    loadDefaultProvider();

    const unlistenChat = listen<{ token: string }>("chat-token", (event) => {
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          lastMsg.content += event.payload.token;
        } else {
          newMessages.push({ role: "assistant", content: event.payload.token });
        }
        return newMessages;
      });
    });

    const unlistenStdout = listen<string>("terminal-stdout", (event) => {
      setTerminalLogs((prev) => [...prev, `[STDOUT] ${event.payload}`]);
    });

    const unlistenStderr = listen<string>("terminal-stderr", (event) => {
      setTerminalLogs((prev) => [...prev, `[STDERR] ${event.payload}`]);
    });

    return () => {
      unlistenChat.then((f) => f());
      unlistenStdout.then((f) => f());
      unlistenStderr.then((f) => f());
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isTerminalOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalLogs, isTerminalOpen]);

  // --- SETTINGS LOGIC ---
  const loadProviders = async () => {
    try {
      const statusList = await invoke<ProviderStatus[]>("get_providers_status");
      setProviders(statusList);
    } catch (err) {
      console.error("Failed to load providers: ", err);
    }
  };

  const loadDefaultProvider = async () => {
    try {
      const saved = await invoke<string>("get_setting", {
        key: "default_provider",
      });
      if (saved) setSelectedProvider(saved);
    } catch (err) {}
  };

  const handleSaveKey = async (providerId: string) => {
    const key = apiKeys[providerId];
    if (!key) return;
    try {
      await invoke("save_api_key", { providerId, apiKey: key });
      setApiKeys((prev) => ({ ...prev, [providerId]: "" }));
      loadProviders();
      alert("API Key saved securely.");
    } catch (err: any) {
      alert("Error saving key: " + err);
    }
  };

  const handleDeleteKey = async (providerId: string) => {
    if (!confirm(`Remove API Key for ${providerId}?`)) return;
    try {
      await invoke("delete_api_key", { providerId });
      loadProviders();
      alert("API Key removed.");
    } catch (err: any) {
      alert("Error deleting key: " + err);
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setLoading((prev) => ({ ...prev, [providerId]: true }));
    setTestResults((prev) => {
      const copy = { ...prev };
      delete copy[providerId];
      return copy;
    });
    try {
      const message = await invoke<string>("test_provider_connection", {
        providerId,
      });
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { success: true, message },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { success: false, message: err },
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleSelectDefaultProvider = async (id: string) => {
    setSelectedProvider(id);
    await invoke("save_setting", { key: "default_provider", value: id });
  };

  // --- WORKSPACE & FILE LOGIC ---
  const refreshWorkspaceFiles = async (root: string) => {
    try {
      const fileList = await invoke<string[]>("list_files_in_workspace", {
        rootPath: root,
      });
      setFiles(fileList);
    } catch (err) {
      console.error("Failed to refresh file structures: ", err);
    }
  };

  const handleSelectWorkspace = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setWorkspacePath(selected);
        refreshWorkspaceFiles(selected);
      }
    } catch (err) {
      alert("Failed to open folder dialog: " + err);
    }
  };

  const handleOpenFile = async (fileName: string) => {
    if (!workspacePath) return;
    try {
      const content = await invoke<string>("read_workspace_file", {
        rootPath: workspacePath,
        fileName,
      });
      setActiveFileName(fileName);
      setActiveFileContent(content);
    } catch (err) {
      alert("Failed to open file: " + err);
    }
  };

  // --- STREAMING CHAT EXECUTION ---
  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || prompt;
    if (!textToSend.trim() || !selectedProvider) return;

    if (!customPrompt) {
      setMessages((prev) => [...prev, { role: "user", content: textToSend }]);
      setPrompt("");
    } else {
      setMessages((prev) => [...prev, { role: "system", content: textToSend }]);
    }

    setIsStreaming(true);

    try {
      let finalPrompt = textToSend;
      if (activeFileName && !customPrompt) {
        finalPrompt = `Context from active editor file '${activeFileName}':\n\`\`\`\n${activeFileContent}\n\`\`\`\n\nUser Message: ${textToSend}`;
      }

      await invoke("stream_chat", {
        providerId: selectedProvider,
        prompt: finalPrompt,
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `**Error starting connection:** ${err}` },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  // --- SUPERVISED TERMINAL COMMAND EXECUTION ---
  const handleRunCommand = async (command: string) => {
    if (!workspacePath) {
      alert(
        "Please select a workspace folder first before running terminal tools!"
      );
      return;
    }

    setIsTerminalOpen(true);
    setRunningCommand(command);
    setTerminalLogs((prev) => [
      ...prev,
      `[SYS] Spawning command: "${command}"...`,
    ]);

    try {
      const result = await invoke<{
        exit_code: number;
        message: string;
        stdout: string;
        stderr: string;
      }>("execute_terminal_command", {
        workspacePath: workspacePath,
        commandLine: command,
      });

      setTerminalLogs((prev) => [
        ...prev,
        `[SYS] Complete. Exit code: ${result.exit_code}.`,
      ]);

      const loopFeedback = `Terminal command [${command}] executed with exit code ${
        result.exit_code
      }.

--- terminal stdout ---
${result.stdout || "(no stdout)"}

--- terminal stderr ---
${result.stderr || "(no stderr)"}`;

      handleSendMessage(loopFeedback);
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[SYS_ERR] Execution failed: ${err}`,
      ]);
      handleSendMessage(`Terminal tool failed to spawn: ${err}`);
    } finally {
      setRunningCommand(null);
    }
  };

  // --- SECURE CODE MODIFICATION ENGINE ---
  const handleWriteFile = async (fileName: string, content: string) => {
    if (!workspacePath) {
      alert("Please select a workspace folder first!");
      return;
    }

    try {
      const result = await invoke<string>("write_workspace_file", {
        rootPath: workspacePath,
        fileName,
        content,
      });

      alert(result);

      // Refresh files list
      await refreshWorkspaceFiles(workspacePath);

      // Hot-reload CodeMirror if the modified file is currently open
      if (activeFileName === fileName) {
        setActiveFileContent(content);
      }

      // Sync completed modifications to the Agent Loop context
      handleSendMessage(
        `System Feedback: Code modifications to file [${fileName}] were approved and successfully written.`
      );
    } catch (err: any) {
      alert("Failed to write modifications: " + err);
      handleSendMessage(
        `System Feedback: Failed to write file modifications to [${fileName}]: ${err}`
      );
    }
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      <header className="border-b border-slate-800 bg-slate-900/50 px-6 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold text-indigo-400">Assistant Desktop</h1>
        <nav className="flex space-x-2">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
              activeTab === "chat"
                ? "bg-indigo-600 text-white"
                : "text-slate-400"
            }`}
          >
            Workspace
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
              activeTab === "settings"
                ? "bg-indigo-600 text-white"
                : "text-slate-400"
            }`}
          >
            Settings
          </button>
        </nav>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "chat" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Left Sidebar: Workspace Files */}
              <div className="w-64 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0">
                <div className="p-4 border-b border-slate-800">
                  <button
                    onClick={handleSelectWorkspace}
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
                  {files.map((f) => (
                    <button
                      key={f}
                      onClick={() => handleOpenFile(f)}
                      className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                        activeFileName === f
                          ? "bg-indigo-900/50 text-indigo-300"
                          : "hover:bg-slate-800 text-slate-400"
                      }`}
                    >
                      📄 {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Middle: Code Editor */}
              <div className="flex-1 border-r border-slate-800 flex flex-col bg-slate-950 min-w-0">
                {activeFileName ? (
                  <>
                    <div className="p-2 border-b border-slate-800 bg-slate-900 text-sm text-slate-400 font-mono">
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
                  <div className="flex-1 flex items-center justify-center text-slate-600">
                    Select a workspace file to load context
                  </div>
                )}
              </div>

              {/* Right: Chat Panel */}
              <div className="w-96 flex flex-col bg-slate-900 shrink-0">
                <div className="p-3 border-b border-slate-800 bg-slate-950 text-xs text-slate-400 text-center uppercase tracking-wider font-semibold flex justify-between items-center">
                  <span>Engine: {selectedProvider || "None Selected"}</span>
                  <button
                    onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                    className="px-2 py-0.5 bg-slate-800 rounded text-xs hover:bg-slate-700"
                  >
                    Terminal Panel
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-sm ${
                        m.role === "user"
                          ? "bg-indigo-900/40 border border-indigo-800/50 ml-6"
                          : m.role === "system"
                          ? "bg-slate-950/50 border border-slate-850/50 text-slate-400 mx-6 text-xs"
                          : "bg-slate-800 border border-slate-700 mr-6"
                      }`}
                    >
                      <span className="text-xs font-bold uppercase mb-1 block text-slate-500">
                        {m.role}
                      </span>

                      {m.role === "assistant" ? (
                        <div className="space-y-3">
                          {parseAgentOutput(m.content).map((block, idx) => {
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
                                      onClick={() =>
                                        handleRunCommand(block.content)
                                      }
                                      disabled={!!runningCommand}
                                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-slate-950 text-xs font-bold rounded"
                                    >
                                      {runningCommand === block.content
                                        ? "Executing..."
                                        : "Execute Command"}
                                    </button>
                                  </div>
                                </div>
                              );
                            } else {
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
                                        handleWriteFile(
                                          block.fileName || "unnamed.txt",
                                          block.content
                                        )
                                      }
                                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded"
                                    >
                                      Approve & Write File
                                    </button>
                                  </div>
                                </div>
                              );
                            }
                          })}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap font-sans text-slate-300 leading-relaxed">
                          {m.content}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-4 bg-slate-950 border-t border-slate-800">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Ask a question about your code... (Press Enter)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 resize-none h-20"
                    disabled={isStreaming}
                  />
                </div>
              </div>
            </div>

            {/* Bottom: Real-time terminal output stream container */}
            {isTerminalOpen && (
              <div className="h-48 border-t border-slate-800 bg-slate-950 flex flex-col shrink-0">
                <div className="bg-slate-900 px-4 py-2 flex justify-between items-center text-xs border-b border-slate-800">
                  <span className="font-mono text-slate-400 font-semibold uppercase tracking-wider">
                    Terminal Output Streams (Workspace Mode)
                  </span>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setTerminalLogs([])}
                      className="text-slate-500 hover:text-slate-300 font-semibold"
                    >
                      Clear Logs
                    </button>
                    <button
                      onClick={() => setIsTerminalOpen(false)}
                      className="text-rose-400 hover:text-rose-300 font-semibold"
                    >
                      Minimize
                    </button>
                  </div>
                </div>
                <div className="flex-1 p-3 font-mono text-xs text-emerald-400 overflow-y-auto space-y-1 bg-slate-950 selection:bg-indigo-800">
                  {terminalLogs.length === 0 ? (
                    <div className="text-slate-600">
                      Terminal idling. Proposed tools will output live
                      parameters here.
                    </div>
                  ) : (
                    terminalLogs.map((log, i) => (
                      <div
                        key={i}
                        className="whitespace-pre-wrap leading-relaxed"
                      >
                        {log}
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-8 w-full max-w-5xl mx-auto space-y-8">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4 text-slate-200">
                Active Shell Engine Target
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectDefaultProvider(p.id)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      selectedProvider === p.id
                        ? "border-indigo-500 bg-indigo-950/20 shadow-md"
                        : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-semibold text-slate-200">{p.name}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row gap-6"
                >
                  <div className="space-y-2 max-w-sm">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-lg font-bold text-slate-200">
                        {p.name}
                      </h4>
                      {p.id === "ollama" || p.id === "lmstudio" ? (
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                            p.is_local_online
                              ? "bg-emerald-950 text-emerald-400"
                              : "bg-rose-950 text-rose-400"
                          }`}
                        >
                          {p.is_local_online
                            ? "Online"
                            : "Offline / Unreachable"}
                        </span>
                      ) : (
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                            p.has_key
                              ? "bg-indigo-950 text-indigo-400"
                              : "bg-slate-850 text-slate-500 border border-slate-800"
                          }`}
                        >
                          {p.has_key ? "Configured" : "No Key Set"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">
                      Endpoint:{" "}
                      <code className="bg-slate-950 px-1 rounded text-indigo-300 text-xs">
                        {p.api_url}
                      </code>
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col space-y-3">
                    {p.id !== "ollama" && p.id !== "lmstudio" && (
                      <div className="flex items-center space-x-2">
                        <input
                          type="password"
                          placeholder={
                            p.has_key
                              ? "••••••••••••••••••••"
                              : "Enter API Token"
                          }
                          value={apiKeys[p.id] || ""}
                          onChange={(e) =>
                            setApiKeys((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={() => handleSaveKey(p.id)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-semibold"
                        >
                          Save
                        </button>
                        {p.has_key && (
                          <button
                            onClick={() => handleDeleteKey(p.id)}
                            className="px-3 py-2 bg-rose-950 text-rose-300 rounded-lg text-sm font-semibold"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                    <div>
                      <button
                        onClick={() => handleTestConnection(p.id)}
                        disabled={loading[p.id]}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold"
                      >
                        {loading[p.id]
                          ? "Executing..."
                          : "Test Endpoint Connection"}
                      </button>
                      {testResults[p.id] && (
                        <div
                          className={`mt-3 p-3 rounded-lg text-xs font-mono border ${
                            testResults[p.id].success
                              ? "bg-emerald-950/20 border-emerald-900/50 text-emerald-300"
                              : "bg-rose-950/20 border-rose-900/50 text-rose-300"
                          }`}
                        >
                          <strong>
                            {testResults[p.id].success ? "SUCCESS" : "ERROR"}:
                          </strong>{" "}
                          {testResults[p.id].message}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

import "./App.css";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

// Shared Types
import { ProviderStatus, ChatMessage } from "./types";

// Submodules
import { Header } from "./components/Header";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { CodeViewer } from "./components/CodeViewer";
import { ChatPanel } from "./components/ChatPanel";
import { TerminalConsole } from "./components/TerminalConsole";
import { SettingsPanel } from "./components/SettingsPanel";
import { PromptPreviewModal } from "./components/PromptPreviewModal";

const FACTORY_DEFAULT_PROMPT = `You are an advanced desktop AI coding agent with shell execution and code writing/patching capabilities.

1. If you want to suggest executing a terminal command, wrap your command inside <execute_command>YOUR_SHELL_COMMAND</execute_command> tags.

2. If you want to modify, edit, or write a code file inside the user's workspace, you have two options:

   A. [For minor edits / patching (Highly Optimized)]: If you are editing an existing file, propose a search-and-replace patch using the <patch_file file_name="TARGET_FILENAME"> tag containing one or more original/updated blocks:
      <patch_file file_name="src/main.rs">
      <<<<<<< SEARCH
      fn main() {
          println!("Hello, World!");
      }
      =======
      fn main() {
          println!("Hello, Agentic World!");
      }
      >>>>>>> REPLACE
      </patch_file>
      Make sure your SEARCH block matches the original file content exactly, including whitespace.

   B. [For creating new files / full rewrites]: Propose a full file write using the <write_file file_name="TARGET_FILENAME">YOUR_NEW_CODE</write_file> tag. Always supply the full file content inside the tag.

Your proposals will be securely intercepted, presented to the user, and will only execute upon explicit click authorization.`;

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

  // Proxy state
  const [proxyBypassRules, setProxyBypassRules] = useState<string>("");

  // Model Selection States
  const [selectedModels, setSelectedModels] = useState<{
    [key: string]: string;
  }>({});
  const [providerModels, setProviderModels] = useState<{
    [key: string]: string[];
  }>({});
  const [fetchingModels, setFetchingModels] = useState<{
    [key: string]: boolean;
  }>({});

  // Global System Prompt state
  const [systemInstruction, setSystemInstruction] = useState<string>("");

  // Prompt Debug Modal States
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewEndpoint, setPreviewEndpoint] = useState("");
  const [previewModel, setPreviewModel] = useState("");
  const [previewUserPrompt, setPreviewUserPrompt] = useState("");

  // Workspace State
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [activeFileContent, setActiveFileContent] = useState<string>("");
  const [activeFileName, setActiveFileName] = useState<string>("");

  // Chat State
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Message Interactive Actions State
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>("");

  // Terminal Console State
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
    loadDefaultProvider();
    loadProxyRules();
    loadSystemInstruction();

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

  // --- SETTINGS CONTROLS ---
  const loadProviders = async () => {
    try {
      const statusList = await invoke<ProviderStatus[]>("get_providers_status");
      setProviders(statusList);
      await loadSelectedModels(statusList);
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

  const loadProxyRules = async () => {
    try {
      const saved = await invoke<string>("get_setting", {
        key: "proxy_bypass_rules",
      });
      setProxyBypassRules(saved);
    } catch (err) {}
  };

  const loadSystemInstruction = async () => {
    try {
      const saved = await invoke<string>("get_setting", {
        key: "system_instruction",
      });
      setSystemInstruction(saved || FACTORY_DEFAULT_PROMPT);
    } catch (err) {
      setSystemInstruction(FACTORY_DEFAULT_PROMPT);
    }
  };

  const handleSaveProxyRules = async () => {
    try {
      await invoke("save_setting", {
        key: "proxy_bypass_rules",
        value: proxyBypassRules,
      });
      alert("Proxy exceptions updated successfully.");
    } catch (err: any) {
      alert("Failed to save rules: " + err);
    }
  };

  const handleSaveSystemInstruction = async () => {
    try {
      await invoke("save_setting", {
        key: "system_instruction",
        value: systemInstruction,
      });
      alert("Global system prompt updated successfully.");
    } catch (err: any) {
      alert("Failed to save system prompt: " + err);
    }
  };

  const handleRestoreDefaultSystemInstruction = async () => {
    if (
      !confirm(
        "Are you sure you want to restore the factory default prompt? This will revert any custom rules you've written."
      )
    )
      return;
    setSystemInstruction(FACTORY_DEFAULT_PROMPT);
    try {
      await invoke("save_setting", {
        key: "system_instruction",
        value: FACTORY_DEFAULT_PROMPT,
      });
      alert("Factory default prompt restored.");
    } catch (err: any) {
      alert("Failed to save system prompt: " + err);
    }
  };

  const loadSelectedModels = async (providersList: ProviderStatus[]) => {
    const modelsMap: { [key: string]: string } = {};
    for (const p of providersList) {
      try {
        const saved = await invoke<string>("get_setting", {
          key: `active_model:${p.id}`,
        });
        if (saved) {
          modelsMap[p.id] = saved;
        }
      } catch (err) {}
    }
    setSelectedModels(modelsMap);
  };

  const handleFetchModels = async (providerId: string) => {
    setFetchingModels((prev) => ({ ...prev, [providerId]: true }));
    try {
      const modelsList = await invoke<string[]>("fetch_provider_models", {
        providerId,
      });
      setProviderModels((prev) => ({ ...prev, [providerId]: modelsList }));
      if (!selectedModels[providerId] && modelsList.length > 0) {
        handleSelectModel(providerId, modelsList[0]);
      }
    } catch (err: any) {
      alert("Failed to fetch available models from provider: " + err);
    } finally {
      setFetchingModels((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleSelectModel = async (providerId: string, modelName: string) => {
    setSelectedModels((prev) => ({ ...prev, [providerId]: modelName }));
    try {
      await invoke("save_setting", {
        key: `active_model:${providerId}`,
        value: modelName,
      });
    } catch (err: any) {
      alert("Failed to save target model configuration: " + err);
    }
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

  // --- DIRECTORY & FILE CONTROLS ---
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

  // --- STREAMING PIPELINE TRIGGER ---
  const handleSendMessage = async (
    customPrompt?: string,
    role: "user" | "system" = "user"
  ) => {
    const textToSend = customPrompt || prompt;
    if (!textToSend.trim() || !selectedProvider) return;

    // Push prompt to messages log
    setMessages((prev) => [...prev, { role, content: textToSend }]);

    if (!customPrompt) {
      setPrompt("");
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

  // --- PREVIEW MODAL LOGIC ---
  const handleOpenPreviewModal = () => {
    if (!selectedProvider) {
      alert("Please select an active provider first!");
      return;
    }
    const provider = providers.find((p) => p.id === selectedProvider);
    const endpoint = provider ? provider.api_url : "Unknown Endpoint";
    const modelName = selectedModels[selectedProvider] || "Default fallback";

    let finalPrompt = prompt;
    if (activeFileName) {
      finalPrompt = `Context from active editor file '${activeFileName}':\n\`\`\`\n${activeFileContent}\n\`\`\`\n\nUser Message: ${prompt}`;
    }

    setPreviewEndpoint(endpoint);
    setPreviewModel(modelName);
    setPreviewUserPrompt(finalPrompt);
    setIsPreviewModalOpen(true);
  };

  const handleSendFromPreview = async (combinedPayload: string) => {
    setIsPreviewModalOpen(false);
    setPrompt(""); // Clear original text box
    // Dispatch the combined layout which Rust will split
    await handleSendMessage(combinedPayload, "user");
  };

  // --- SUPERVISED TERMINAL COMMAND INTERCEPTOR ---
  const handleRunCommand = async (command: string) => {
    if (!workspacePath) {
      alert("Please select a workspace folder first!");
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

      handleSendMessage(loopFeedback, "system");
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[SYS_ERR] Execution failed: ${err}`,
      ]);
      handleSendMessage(`Terminal tool failed to spawn: ${err}`, "system");
    } finally {
      setRunningCommand(null);
    }
  };

  // --- SUPERVISED FILE WRITING INTERCEPTOR ---
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
      await refreshWorkspaceFiles(workspacePath);

      if (activeFileName === fileName) {
        setActiveFileContent(content);
      }

      handleSendMessage(
        "System Feedback: Code modifications were approved and successfully written.",
        "system"
      );
    } catch (err: any) {
      alert("Failed to write modifications: " + err);
      handleSendMessage(
        `System Feedback: Failed to write file modifications to [${fileName}]: ${err}`,
        "system"
      );
    }
  };

  // --- SUPERVISED FILE PATCHING INTERCEPTOR ---
  const handlePatchFile = async (fileName: string, patchContent: string) => {
    if (!workspacePath) {
      alert("Please select a workspace folder first!");
      return;
    }

    try {
      const result = await invoke<string>("patch_workspace_file", {
        rootPath: workspacePath,
        fileName,
        patchContent,
      });

      alert(result);
      await refreshWorkspaceFiles(workspacePath);

      // Reload active code viewer content if the file we just patched is open
      if (activeFileName === fileName) {
        const content = await invoke<string>("read_workspace_file", {
          rootPath: workspacePath,
          fileName,
        });
        setActiveFileContent(content);
      }

      handleSendMessage(
        "System Feedback: Code patches were approved and successfully applied.",
        "system"
      );
    } catch (err: any) {
      alert("Failed to apply patch: " + err);
      handleSendMessage(
        `System Feedback: Failed to apply patch blocks to [${fileName}]: ${err}`,
        "system"
      );
    }
  };

  // --- CHAT INTERACTION HANDLERS ---
  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error("Failed to copy content: ", err);
    }
  };

  const handleStartEdit = (index: number, content: string) => {
    setEditingIndex(index);
    setEditingText(content);
  };

  const handleSaveEdit = (index: number) => {
    setMessages((prev) => {
      const updated = [...prev];
      updated[index].content = editingText;
      return updated;
    });
    setEditingIndex(null);
    setEditingText("");
  };

  const handleDeleteMessage = (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const handleRerunMessage = async (index: number) => {
    if (!selectedProvider) return;
    const targetMsg = messages[index];
    if (targetMsg.role !== "user") return;

    const truncated = messages.slice(0, index + 1);
    setMessages(truncated);
    setIsStreaming(true);

    try {
      await invoke("stream_chat", {
        providerId: selectedProvider,
        prompt: targetMsg.content,
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `**Error rerunning stream:** ${err}` },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "chat" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex overflow-hidden min-h-0">
              <WorkspaceSidebar
                workspacePath={workspacePath}
                files={files}
                activeFileName={activeFileName}
                onSelectWorkspace={handleSelectWorkspace}
                onOpenFile={handleOpenFile}
              />

              <CodeViewer
                activeFileName={activeFileName}
                activeFileContent={activeFileContent}
              />

              <ChatPanel
                messages={messages}
                selectedProvider={selectedProvider}
                prompt={prompt}
                setPrompt={setPrompt}
                isStreaming={isStreaming}
                isTerminalOpen={isTerminalOpen}
                setIsTerminalOpen={setIsTerminalOpen}
                onSendMessage={handleSendMessage}
                // Forwarded Item Event Handlers
                editingIndex={editingIndex}
                editingText={editingText}
                setEditingText={setEditingText}
                runningCommand={runningCommand}
                onCopy={handleCopyMessage}
                onStartEdit={handleStartEdit}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setEditingIndex(null)}
                onDelete={handleDeleteMessage}
                onRerun={handleRerunMessage}
                onRunCommand={handleRunCommand}
                onWriteFile={handleWriteFile}
                onPatchFile={handlePatchFile}
                // Preview Event Handler
                onOpenPreview={handleOpenPreviewModal}
              />
            </div>

            <TerminalConsole
              terminalLogs={terminalLogs}
              isTerminalOpen={isTerminalOpen}
              setIsTerminalOpen={setIsTerminalOpen}
              onClearLogs={() => setTerminalLogs([])}
            />
          </div>
        ) : (
          <SettingsPanel
            providers={providers}
            selectedProvider={selectedProvider}
            apiKeys={apiKeys}
            setApiKeys={setApiKeys}
            loading={loading}
            testResults={testResults}
            onSelectDefaultProvider={handleSelectDefaultProvider}
            onSaveKey={handleSaveKey}
            onDeleteKey={handleDeleteKey}
            onTestConnection={handleTestConnection}
            proxyBypassRules={proxyBypassRules}
            setProxyBypassRules={setProxyBypassRules}
            onSaveProxyRules={handleSaveProxyRules}
            // Model Selection Props
            selectedModels={selectedModels}
            providerModels={providerModels}
            fetchingModels={fetchingModels}
            onFetchModels={handleFetchModels}
            onSelectModel={handleSelectModel}
            // Global System Instructions Props
            systemInstruction={systemInstruction}
            setSystemInstruction={setSystemInstruction}
            onSaveSystemInstruction={handleSaveSystemInstruction}
            onRestoreDefaultSystemInstruction={
              handleRestoreDefaultSystemInstruction
            }
          />
        )}
      </main>

      {/* Expanded Prompt Preview Modal Overlay */}
      <PromptPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        endpoint={previewEndpoint}
        modelName={previewModel}
        systemInstructions={systemInstruction} // Forwards system constants down
        userPrompt={previewUserPrompt}
        onSend={handleSendFromPreview}
      />
    </div>
  );
}

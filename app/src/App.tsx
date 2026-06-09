import "./App.css";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

// Shared Types
import { ProviderStatus, ChatMessage, EditorTab } from "./types";

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

  // Persistent Workspace & Layout State
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeTabName, setActiveTabName] = useState<string>("");
  const [selectedPaths, setSelectedPaths] = useState<{
    [path: string]: boolean;
  }>({});

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Active Streaming Message Target Pointer (In-Place Streaming Redirection)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );

  // Message Interactive Actions State
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>("");

  // Terminal Console State
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);

  // Layout Resizer States
  const [sidebarWidth, setSidebarWidth] = useState(240); // px
  const [chatWidth, setChatWidth] = useState(384); // px
  const [terminalHeight, setTerminalHeight] = useState(192); // px

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Use a mutable ref to hold the current streaming message ID.
  // This allows our useEffect listener (which is registered once on mount) to always access the latest ID.
  const streamingMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    streamingMsgIdRef.current = streamingMessageId;
  }, [streamingMessageId]);

  useEffect(() => {
    loadProviders();
    loadDefaultProvider();
    loadProxyRules();
    loadSystemInstruction();

    const unlistenChat = listen<{ token: string }>("chat-token", (event) => {
      setMessages((prev) => {
        const currentStreamingId = streamingMsgIdRef.current;
        if (!currentStreamingId) return prev;

        const newMessages = prev.map((msg) => {
          if (msg.id === currentStreamingId) {
            const updatedContent = msg.content + event.payload.token;
            // Dynamically save the growing token stream content to SQLite in real-time
            if (workspaceId) {
              invoke("save_workspace_message", {
                workspaceId,
                messageId: msg.id,
                role: msg.role,
                content: updatedContent,
                isSelected: msg.isSelected !== false,
              }).catch(console.error);
            }
            return { ...msg, content: updatedContent };
          }
          return msg;
        });
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
  }, [workspaceId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isTerminalOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalLogs, isTerminalOpen]);

  // --- LAYOUT DRAG RESIZERS ---
  const handleSidebarResize = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setSidebarWidth(Math.max(160, Math.min(480, startWidth + deltaX)));
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleChatResize = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = chatWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      // Inverted offset delta because sidebar drags leftwards to increase scale
      const deltaX = startX - moveEvent.clientX;
      setChatWidth(Math.max(240, Math.min(600, startWidth + deltaX)));
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleTerminalResize = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startY = mouseDownEvent.clientY;
    const startHeight = terminalHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      setTerminalHeight(Math.max(80, Math.min(400, startHeight + deltaY)));
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

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
    if (!confirm("Revert any custom rules and restore factory default prompt?"))
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
        if (saved) modelsMap[p.id] = saved;
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
      alert("Failed to fetch available models: " + err);
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
      alert("Failed to save model: " + err);
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

  // --- SQL WORKSPACE CONTROLLER BOOTSTRAPPER ---
  const handleSelectWorkspace = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setWorkspacePath(selected);

        // 1. Fetch or initialize the target workspace entry in SQL database
        const ws: any = await invoke("load_or_create_workspace", {
          rootPath: selected,
        });
        setWorkspaceId(ws.id);

        // 2. Parse opened tabs
        const parsedTabs: EditorTab[] = [];
        for (const tabFile of ws.tabs) {
          try {
            const content = await invoke<string>("read_workspace_file", {
              rootPath: selected,
              fileName: tabFile,
            });
            parsedTabs.push({ fileName: tabFile, content, isDirty: false });
          } catch (err) {}
        }
        setEditorTabs(parsedTabs);
        setActiveTabName(ws.active_tab || "");

        // 3. Populate selected directories list
        const fileSelMap: { [path: string]: boolean } = {};
        ws.selected_files.forEach((f: string) => {
          fileSelMap[f] = true;
        });
        setSelectedPaths(fileSelMap);

        // 4. Populate historical message thread
        setMessages(ws.messages);

        // 5. Populate disk structure tree
        await refreshWorkspaceFiles(selected);
      }
    } catch (err) {
      alert("Failed to open workspace directory: " + err);
    }
  };

  const refreshWorkspaceFiles = async (root: string) => {
    try {
      const fileList = await invoke<string[]>("list_files_in_workspace", {
        rootPath: root,
      });
      setFiles(fileList);
    } catch (err) {
      console.error("Failed to refresh files list: ", err);
    }
  };

  const handleOpenFile = async (fileName: string) => {
    if (!workspacePath || !workspaceId) return;

    const alreadyOpen = editorTabs.some((t) => t.fileName === fileName);
    if (alreadyOpen) {
      setActiveTabName(fileName);
      await invoke("sync_workspace_tabs", {
        workspaceId,
        activeTab: fileName,
        tabs: editorTabs.map((t) => t.fileName),
      });
      return;
    }

    try {
      const content = await invoke<string>("read_workspace_file", {
        rootPath: workspacePath,
        fileName,
      });
      const newTabs = [...editorTabs, { fileName, content, isDirty: false }];
      setEditorTabs(newTabs);
      setActiveTabName(fileName);

      await invoke("sync_workspace_tabs", {
        workspaceId,
        activeTab: fileName,
        tabs: newTabs.map((t) => t.fileName),
      });
    } catch (err) {
      alert("Failed to open file: " + err);
    }
  };

  const handleCloseTab = async (fileName: string) => {
    if (!workspaceId) return;
    const updatedTabs = editorTabs.filter((t) => t.fileName !== fileName);
    setEditorTabs(updatedTabs);

    let nextActive = activeTabName;
    if (activeTabName === fileName) {
      nextActive =
        updatedTabs.length > 0
          ? updatedTabs[updatedTabs.length - 1].fileName
          : "";
      setActiveTabName(nextActive);
    }

    await invoke("sync_workspace_tabs", {
      workspaceId,
      activeTab: nextActive,
      tabs: updatedTabs.map((t) => t.fileName),
    });
  };

  const handleSelectTab = async (fileName: string) => {
    if (!workspaceId) return;
    setActiveTabName(fileName);
    await invoke("sync_workspace_tabs", {
      workspaceId,
      activeTab: fileName,
      tabs: editorTabs.map((t) => t.fileName),
    });
  };

  const handleToggleCheckbox = async (
    path: string,
    type: "file" | "directory",
    checked: boolean
  ) => {
    if (!workspaceId) return;
    setSelectedPaths((prev) => {
      const next = { ...prev };
      next[path] = checked;

      if (type === "directory") {
        const prefix = `${path}/`;
        files.forEach((f) => {
          if (f === path || f.startsWith(prefix)) {
            next[f] = checked;
          }
          const parts = f.split("/");
          let current = "";
          for (let i = 0; i < parts.length - 1; i++) {
            current = current ? `${current}/${parts[i]}` : parts[i];
            if (current === path || current.startsWith(prefix)) {
              next[current] = checked;
            }
          }
        });
      }

      // Sync checkboxes list with SQLite
      const checkedFiles = files.filter((f) => !!next[f]);
      invoke("sync_workspace_selected_files", {
        workspaceId,
        selectedFiles: checkedFiles,
      }).catch(console.error);

      return next;
    });
  };

  // --- LOCAL EDIT & SAVE TRIGGERS ---
  const handleEditTabContent = (fileName: string, content: string) => {
    setEditorTabs((prev) =>
      prev.map((t) =>
        t.fileName === fileName ? { ...t, content, isDirty: true } : t
      )
    );
  };

  const handleSaveTabContent = async (fileName: string) => {
    const tab = editorTabs.find((t) => t.fileName === fileName);
    if (!tab || !workspacePath) return;

    try {
      await invoke("write_workspace_file", {
        rootPath: workspacePath,
        fileName,
        content: tab.content,
      });

      setEditorTabs((prev) =>
        prev.map((t) =>
          t.fileName === fileName ? { ...t, isDirty: false } : t
        )
      );

      // Update historical stream content to context
      await handleSendMessage(
        `System Event: Local modifications saved directly to disk file [${fileName}]`,
        "system"
      );
    } catch (err: any) {
      alert("Failed to save changes: " + err);
    }
  };

  // --- CONSOLE HISTORY SELECT CHECKBOX ---
  const handleToggleMessageSelect = async (index: number, checked: boolean) => {
    if (!workspaceId) return;
    const targetMsg = messages[index];
    setMessages((prev) => {
      const copy = [...prev];
      copy[index].isSelected = checked;
      return copy;
    });
    try {
      await invoke("update_message_selection", {
        messageId: targetMsg.id,
        isSelected: checked,
      });
    } catch (err) {}
  };

  // --- COMPILE THREE-TIER STREAM PAYLOADS ---
  const compileStreamPayload = async (textToSend: string): Promise<string> => {
    let finalPrompt = textToSend;

    // 1. Files Context Compile
    const selectedFilePaths = files.filter((f) => !!selectedPaths[f]);
    let filesContext = "";
    if (selectedFilePaths.length > 0) {
      try {
        filesContext = await invoke<string>("compile_selected_files_prompt", {
          rootPath: workspacePath,
          selectedFiles: selectedFilePaths,
        });
      } catch (err) {}
    }

    // 2. Chat Context Selection Compile (Standard dispatch compiles entire selected context)
    const activeHistory = messages.filter((m) => m.isSelected !== false);
    let historyContext = "";
    if (activeHistory.length > 0) {
      historyContext = "--- SELECTED CONVERSATION HISTORY ---\n";
      activeHistory.forEach((h) => {
        historyContext += `[${h.role}]: ${h.content}\n\n`;
      });
    }

    // Assemble payload
    if (filesContext || historyContext) {
      finalPrompt = `${filesContext}\n${historyContext}\nUser Message: ${textToSend}`;
    }

    return finalPrompt;
  };

  // --- RERUN PROMPT COMPILER ENGINE (Targeted context construction) [1] ---
  const compileRerunPayload = async (
    userMsgIndex: number,
    currentMsgContent: string
  ): Promise<string> => {
    // 1. Files Context Compile
    const selectedFilePaths = files.filter((f) => !!selectedPaths[f]);
    let filesContext = "";
    if (selectedFilePaths.length > 0) {
      try {
        filesContext = await invoke<string>("compile_selected_files_prompt", {
          rootPath: workspacePath,
          selectedFiles: selectedFilePaths,
        });
      } catch (err) {}
    }

    // 2. Compile all selected messages occurring strictly BEFORE the rerun index (0 through index - 1)
    const previousMessages = messages.slice(0, userMsgIndex);
    const activeHistory = previousMessages.filter(
      (m) => m.isSelected !== false
    );
    let historyContext = "";
    if (activeHistory.length > 0) {
      historyContext = "--- SELECTED CONVERSATION HISTORY ---\n";
      activeHistory.forEach((h) => {
        historyContext += `[${h.role}]: ${h.content}\n\n`;
      });
    }

    // Assemble payload
    let finalPrompt = currentMsgContent;
    if (filesContext || historyContext) {
      finalPrompt = `${filesContext}\n${historyContext}\nUser Message: ${currentMsgContent}`;
    }

    return finalPrompt;
  };

  const handleSendMessage = async (
    textToSend: string,
    role: "user" | "system" = "user"
  ) => {
    if (!textToSend.trim() || !selectedProvider || !workspaceId) return;

    const userMsgId = `msg_u_${Date.now()}`;
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      role,
      content: textToSend,
      isSelected: role !== "system",
    };

    // Save user message to SQLite
    await invoke("save_workspace_message", {
      workspaceId,
      messageId: userMsgId,
      role,
      content: textToSend,
      isSelected: role !== "system",
    });

    let assistantMsgId = "";
    let finalMessages = [...messages, newUserMsg];

    if (role === "user") {
      assistantMsgId = `msg_a_${Date.now()}`;
      const emptyAssistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        isSelected: true,
      };
      finalMessages.push(emptyAssistantMsg);

      // Save empty assistant message wrapper to SQLite
      await invoke("save_workspace_message", {
        workspaceId,
        messageId: assistantMsgId,
        role: "assistant",
        content: "",
        isSelected: true,
      });
    }

    setMessages(finalMessages);
    setIsStreaming(true);

    if (role === "user") {
      setStreamingMessageId(assistantMsgId);
    }

    try {
      const compiledPayload = role === "system"
        ? textToSend
        : await compileStreamPayload(textToSend);
      await invoke("stream_chat", {
        providerId: selectedProvider,
        prompt: compiledPayload,
      });
    } catch (err) {
      if (role === "user") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: `**Error starting connection:** ${err}` }
              : msg
          )
        );
      } else {
        const errId = `msg_err_${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: errId,
            role: "assistant",
            content: `**Error starting connection:** ${err}`,
          },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setStreamingMessageId(null);
    }
  };

  const handleOpenPreviewModal = async (currentPrompt: string) => {
    if (!selectedProvider) {
      alert("Please select an active provider first!");
      return;
    }
    const provider = providers.find((p) => p.id === selectedProvider);
    const endpoint = provider ? provider.api_url : "Unknown Endpoint";
    const modelName = selectedModels[selectedProvider] || "Default fallback";

    const compiledPayload = await compileStreamPayload(currentPrompt);

    setPreviewEndpoint(endpoint);
    setPreviewModel(modelName);
    setPreviewUserPrompt(compiledPayload);
    setIsPreviewModalOpen(true);
  };

  const handleSendFromPreview = async (combinedPayload: string) => {
    setIsPreviewModalOpen(false);
    await handleSendMessage(combinedPayload, "user");
  };

  // --- CONTEXTUAL IN-PLACE RERUN TRIGGER (Middle-of-array streaming execution) ---
  const handleRerunMessage = async (index: number) => {
    if (!selectedProvider || !workspaceId) return;
    const targetUserMsg = messages[index];
    if (targetUserMsg.role !== "user") return;

    setIsStreaming(true);

    // 1. Rebuild prompt using exactly: selected files + PREVIOUS messages (0 to index-1) + target user message content
    const compiledPayload = await compileRerunPayload(
      index,
      targetUserMsg.content
    );

    let assistantMsgId = "";
    const nextMsg = messages[index + 1];

    if (nextMsg && nextMsg.role === "assistant") {
      // Clean and re-use the adjacent assistant message block in place
      assistantMsgId = nextMsg.id;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId ? { ...msg, content: "" } : msg
        )
      );
      // Sync cleared wrapper inside SQLite
      await invoke("save_workspace_message", {
        workspaceId,
        messageId: assistantMsgId,
        role: "assistant",
        content: "",
        isSelected: nextMsg.isSelected !== false,
      });
    } else {
      // Insert a fresh assistant block directly under the target user message
      assistantMsgId = `msg_rerun_a_${Date.now()}`;
      const newAssistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        isSelected: true,
      };

      setMessages((prev) => {
        const updated = [...prev];
        updated.splice(index + 1, 0, newAssistantMsg);
        return updated;
      });

      // Persist inside SQLite database
      await invoke("save_workspace_message", {
        workspaceId,
        messageId: assistantMsgId,
        role: "assistant",
        content: "",
        isSelected: true,
      });
    }

    // Set streaming destination target
    setStreamingMessageId(assistantMsgId);

    try {
      await invoke("stream_chat", {
        providerId: selectedProvider,
        prompt: compiledPayload,
      });
    } catch (err) {
      // Render stream errors inside our active block
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: `**Error starting connection:** ${err}` }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
      setStreamingMessageId(null);
    }
  };

  const handleRunCommand = async (command: string) => {
    if (!workspacePath || !workspaceId) {
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

      setEditorTabs((prev) =>
        prev.map((t) =>
          t.fileName === fileName ? { ...t, content, isDirty: false } : t
        )
      );

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

      const content = await invoke<string>("read_workspace_file", {
        rootPath: workspacePath,
        fileName,
      });
      setEditorTabs((prev) =>
        prev.map((t) =>
          t.fileName === fileName ? { ...t, content, isDirty: false } : t
        )
      );

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

  const handleClearMessages = async () => {
    if (!workspaceId) return;
    if (
      !confirm("Clear this workspace's complete historical messaging thread?")
    )
      return;
    try {
      await invoke("clear_workspace_messages", { workspaceId });
      setMessages([]);
    } catch (err) {}
  };

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

  const handleSaveEdit = async (index: number) => {
    const targetMsg = messages[index];
    setMessages((prev) => {
      const updated = [...prev];
      updated[index].content = editingText;
      return updated;
    });
    setEditingIndex(null);
    setEditingText("");
    try {
      await invoke("update_workspace_message_content", {
        messageId: targetMsg.id,
        content: editingText,
      });
    } catch (err) {}
  };

  const handleDeleteMessage = async (index: number) => {
    const targetMsg = messages[index];
    setMessages((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
    try {
      await invoke("delete_workspace_message", { messageId: targetMsg.id });
    } catch (err) {}
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "chat" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex overflow-hidden min-h-0 relative">
              {/* Resizable Sidebar Node */}
              <div
                style={{ width: `${sidebarWidth}px` }}
                className="h-full flex shrink-0"
              >
                <WorkspaceSidebar
                  workspacePath={workspacePath}
                  files={files}
                  activeFileName={activeTabName}
                  selectedPaths={selectedPaths}
                  onToggleCheckbox={handleToggleCheckbox}
                  onSelectWorkspace={handleSelectWorkspace}
                  onOpenFile={handleOpenFile}
                />
              </div>

              {/* Sidebar Drag Resizer Line */}
              <div
                onMouseDown={handleSidebarResize}
                className="w-[3px] hover:w-[5px] bg-slate-800 hover:bg-indigo-500 cursor-col-resize transition-all shrink-0 z-20 h-full"
              />

              {/* Code Canvas Tabbed Editor */}
              <div className="flex-1 h-full min-w-0">
                <CodeViewer
                  tabs={editorTabs}
                  activeTabName={activeTabName}
                  onSelectTab={handleSelectTab}
                  onCloseTab={handleCloseTab}
                  onEditTabContent={handleEditTabContent}
                  onSaveTabContent={handleSaveTabContent}
                />
              </div>

              {/* Chat Panel Drag Resizer Line */}
              <div
                onMouseDown={handleChatResize}
                className="w-[3px] hover:w-[5px] bg-slate-800 hover:bg-indigo-500 cursor-col-resize transition-all shrink-0 z-20 h-full"
              />

              {/* Resizable Chat Panel Node */}
              <div
                style={{ width: `${chatWidth}px` }}
                className="h-full flex shrink-0"
              >
                <ChatPanel
                  messages={messages}
                  activeModel={selectedModels[selectedProvider]}
                  isStreaming={isStreaming}
                  isTerminalOpen={isTerminalOpen}
                  setIsTerminalOpen={setIsTerminalOpen}
                  onSendMessage={handleSendMessage}
                  onClearMessages={handleClearMessages}
                  editingIndex={editingIndex}
                  editingText={editingText}
                  setEditingText={setEditingText}
                  runningCommand={runningCommand}
                  onCopy={handleCopyMessage}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={() => setEditingIndex(null)}
                  onDelete={handleDeleteMessage}
                  onRerun={handleRerunMessage} // Middle-of-array in-place rerun
                  onRunCommand={handleRunCommand}
                  onWriteFile={handleWriteFile}
                  onPatchFile={handlePatchFile}
                  onToggleMessageSelect={handleToggleMessageSelect} // Context Pruning
                  onOpenPreview={handleOpenPreviewModal}
                />
              </div>
            </div>

            {/* Terminal Resizer Header bar */}
            {isTerminalOpen && (
              <div
                onMouseDown={handleTerminalResize}
                className="h-[3px] hover:h-[5px] bg-slate-800 hover:bg-indigo-500 cursor-row-resize transition-all shrink-0 z-20"
              />
            )}

            <TerminalConsole
              terminalLogs={terminalLogs}
              isTerminalOpen={isTerminalOpen}
              setIsTerminalOpen={setIsTerminalOpen}
              onClearLogs={() => setTerminalLogs([])}
              terminalEndRef={terminalEndRef}
              terminalHeight={terminalHeight}
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
            selectedModels={selectedModels}
            providerModels={providerModels}
            fetchingModels={fetchingModels}
            onFetchModels={handleFetchModels}
            onSelectModel={handleSelectModel}
            systemInstruction={systemInstruction}
            setSystemInstruction={setSystemInstruction}
            onSaveSystemInstruction={handleSaveSystemInstruction}
            onRestoreDefaultSystemInstruction={
              handleRestoreDefaultSystemInstruction
            }
          />
        )}
      </main>

      <PromptPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        endpoint={previewEndpoint}
        modelName={previewModel}
        systemInstructions={systemInstruction}
        userPrompt={previewUserPrompt}
        onSend={handleSendFromPreview}
      />
    </div>
  );
}

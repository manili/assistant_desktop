import React from "react";
import { ProviderStatus } from "../types";

interface SettingsPanelProps {
  providers: ProviderStatus[];
  selectedProvider: string;
  apiKeys: { [key: string]: string };
  setApiKeys: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  loading: { [key: string]: boolean };
  testResults: { [key: string]: { success: boolean; message: string } };
  onSelectDefaultProvider: (id: string) => void;
  onSaveKey: (id: string) => void;
  onDeleteKey: (id: string) => void;
  onTestConnection: (id: string) => void;

  proxyBypassRules: string;
  setProxyBypassRules: (v: string) => void;
  onSaveProxyRules: () => void;

  // New interactive model selection props
  selectedModels: { [key: string]: string };
  providerModels: { [key: string]: string[] };
  fetchingModels: { [key: string]: boolean };
  onFetchModels: (providerId: string) => void;
  onSelectModel: (providerId: string, modelName: string) => void;

  // Global System Instructions Props
  systemInstruction: string;
  setSystemInstruction: (v: string) => void;
  onSaveSystemInstruction: () => void;
  onRestoreDefaultSystemInstruction: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  providers,
  selectedProvider,
  apiKeys,
  setApiKeys,
  loading,
  testResults,
  onSelectDefaultProvider,
  onSaveKey,
  onDeleteKey,
  onTestConnection,
  proxyBypassRules,
  setProxyBypassRules,
  onSaveProxyRules,
  selectedModels,
  providerModels,
  fetchingModels,
  onFetchModels,
  onSelectModel,
  systemInstruction,
  setSystemInstruction,
  onSaveSystemInstruction,
  onRestoreDefaultSystemInstruction,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-8 w-full max-w-5xl mx-auto space-y-8">
      {/* 1. Global System Instruction Editor */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-200">
            Global System Prompt
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Configure the baseline instructions and behaviors sent to all
            language models.
          </p>
        </div>

        {/* Informative Guidelines Box */}
        <div className="border border-amber-900/40 bg-amber-950/10 p-4 rounded-lg space-y-3">
          <div className="text-xs font-bold text-amber-500 uppercase tracking-wide flex items-center space-x-2">
            <svg
              className="w-4 h-4 text-amber-500 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>Agentic Capability Guidelines</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            This desktop assistant parses LLM outputs in real-time. If you wish
            to maintain terminal executions and automatic file writing, the
            prompt must instruct the model on how to construct these structural
            tags:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 font-mono text-[11px] text-slate-300">
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="text-amber-500 font-bold">
                1. Terminal Command Executions:
              </span>
              <div className="text-slate-400 mt-1 select-all">
                {
                  "Wrap commands in <execute_command>YOUR_SHELL_COMMAND</execute_command>"
                }
              </div>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="text-amber-500 font-bold">
                2. Local File Writing/Modifying:
              </span>
              <div className="text-slate-400 mt-1 select-all">
                {
                  'Wrap code in <write_file file_name="filename">CODE_BODY</write_file>'
                }
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed italic pt-1">
            Editing out these structural tag specifications will disable the
            corresponding supervised execution cards in the workspace.
          </p>
        </div>

        {/* Text Area */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            System Instructions Editor
          </label>
          <textarea
            value={systemInstruction}
            onChange={(e) => setSystemInstruction(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm font-mono text-slate-200 focus:outline-none focus:border-indigo-500 h-64 resize-y leading-relaxed"
            placeholder="Write your customized system guidelines..."
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-between gap-3 pt-2">
          <button
            onClick={onRestoreDefaultSystemInstruction}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-lg transition-colors border border-slate-700/50"
          >
            Restore Default Prompt
          </button>
          <button
            onClick={onSaveSystemInstruction}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-md shadow-indigo-950/20"
          >
            Update System Prompt
          </button>
        </div>
      </div>

      {/* 2. Proxy Bypass Config Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-200">
          Proxy Bypass Configuration
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Specify a space-separated list of IP addresses, subnets, or hostnames
          that should bypass your system proxies (e.g. for accessing localized
          servers or restricted VPN subnets). Loopbacks like{" "}
          <code className="bg-slate-950 px-1 rounded text-indigo-300">
            localhost
          </code>{" "}
          and{" "}
          <code className="bg-slate-950 px-1 rounded text-indigo-300">
            127.0.0.1
          </code>{" "}
          are always bypassed.
        </p>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Bypass Exceptions / IPs
            </label>
            <input
              type="text"
              value={proxyBypassRules}
              onChange={(e) => setProxyBypassRules(e.target.value)}
              placeholder="192.168 10.0 custom.domain"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <button
            onClick={onSaveProxyRules}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-semibold transition-colors shrink-0"
          >
            Update Exceptions
          </button>
        </div>
      </div>

      {/* 3. Provider selection block */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 text-slate-200">
          Active Shell Engine Target
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectDefaultProvider(p.id)}
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

      {/* 4. Per-provider configurations */}
      <div className="space-y-4">
        {providers.map((p) => (
          <div
            key={p.id}
            className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col space-y-4"
          >
            {/* Main credentials block */}
            <div className="flex flex-col md:flex-row gap-6">
              <div className="space-y-2 max-w-sm w-full shrink-0">
                <div className="flex items-center space-x-3">
                  <h4 className="text-lg font-bold text-slate-200">{p.name}</h4>
                  {p.id === "ollama" || p.id === "lmstudio" ? (
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                        p.is_local_online
                          ? "bg-emerald-950 text-emerald-400"
                          : "bg-rose-950 text-rose-400"
                      }`}
                    >
                      {p.is_local_online ? "Online" : "Offline / Unreachable"}
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
                        p.has_key ? "••••••••••••••••••••" : "Enter API Token"
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
                      onClick={() => onSaveKey(p.id)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-semibold transition-colors"
                    >
                      Save
                    </button>
                    {p.has_key && (
                      <button
                        onClick={() => onDeleteKey(p.id)}
                        className="px-3 py-2 bg-rose-950 text-rose-300 rounded-lg text-sm font-semibold hover:bg-rose-900 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
                <div>
                  <button
                    onClick={() => onTestConnection(p.id)}
                    disabled={loading[p.id]}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
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

            {/* Model Selector Row [1] */}
            <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-950/20 p-3 rounded-lg border border-slate-850/50">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Target Model Context
                </div>
                <div className="text-xs text-indigo-400 font-mono">
                  Active selection:{" "}
                  <span className="text-slate-300 font-bold">
                    {selectedModels[p.id] || "Default fallback"}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {providerModels[p.id] && providerModels[p.id].length > 0 ? (
                  <select
                    value={selectedModels[p.id] || ""}
                    onChange={(e) => onSelectModel(p.id, e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono min-w-[200px]"
                  >
                    {providerModels[p.id].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-500">
                    No models cached. Click fetch to load.
                  </span>
                )}
                <button
                  onClick={() => onFetchModels(p.id)}
                  disabled={fetchingModels[p.id]}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded transition-colors disabled:opacity-50"
                >
                  {fetchingModels[p.id]
                    ? "Fetching..."
                    : "Fetch Available Models"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

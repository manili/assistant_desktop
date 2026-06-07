export interface ProviderStatus {
  id: string;
  name: string;
  provider_type: string;
  api_url: string;
  has_key: boolean;
  is_local_online: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  isSelected?: boolean;
}

export interface EditorTab {
  fileName: string;
  content: string;
  isDirty?: boolean;
}

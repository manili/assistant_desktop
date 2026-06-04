export interface ProviderStatus {
  id: string;
  name: string;
  provider_type: string;
  api_url: string;
  has_key: boolean;
  is_local_online: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

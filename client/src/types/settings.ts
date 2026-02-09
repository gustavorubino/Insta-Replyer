// Shared type definitions for settings across the application

export interface SettingsData {
  operationMode: "manual" | "semi_auto" | "auto";
  confidenceThreshold: number;
  systemPrompt: string;
  aiTone?: "professional" | "friendly" | "casual";
  instagramConnected?: boolean;
  instagramUsername?: string;
  instagramAccountId?: string;
  autoReplyEnabled?: boolean;
  isPersonalized?: {
    operationMode: boolean;
    confidenceThreshold: boolean;
    systemPrompt: boolean;
    aiTone: boolean;
  };
  globalDefaults?: {
    operationMode: string;
    confidenceThreshold: number;
    systemPrompt: string;
    aiTone: string;
  };
}

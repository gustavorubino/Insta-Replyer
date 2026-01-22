type EnvConfig = {
  value?: string;
  source?: string;
};

const API_KEY_CANDIDATES = [
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "OPENAI_API_KEY",
];

const BASE_URL_CANDIDATES = [
  "AI_INTEGRATIONS_OPENAI_BASE_URL",
  "OPENAI_BASE_URL",
  "OPENAI_API_BASE_URL",
];

function readFirstEnv(keys: string[]): EnvConfig {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return { value, source: key };
    }
  }
  return {};
}

export function getOpenAIConfig(): {
  apiKey?: string;
  baseURL?: string;
  apiKeySource?: string;
  baseURLSource?: string;
} {
  const apiKey = readFirstEnv(API_KEY_CANDIDATES);
  const baseURL = readFirstEnv(BASE_URL_CANDIDATES);

  return {
    apiKey: apiKey.value,
    baseURL: baseURL.value,
    apiKeySource: apiKey.source,
    baseURLSource: baseURL.source,
  };
}

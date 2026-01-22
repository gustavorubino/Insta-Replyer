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
  const isProduction = process.env.NODE_ENV === "production";

  // Prefer explicit OpenAI key in production
  const apiKeyCandidates = isProduction
    ? ["OPENAI_API_KEY", "AI_INTEGRATIONS_OPENAI_API_KEY"]
    : API_KEY_CANDIDATES;

  const apiKey = readFirstEnv(apiKeyCandidates);
  const baseURL = readFirstEnv(BASE_URL_CANDIDATES);

  let baseURLValue = baseURL.value;
  let baseURLSource = baseURL.source;

  // Ignore localhost base URLs in production (Replit integration often sets this in dev)
  if (
    isProduction &&
    baseURLValue &&
    (baseURLValue.includes("localhost") || baseURLValue.includes("127.0.0.1"))
  ) {
    console.warn(`[OpenAI] Ignoring base URL in production: ${baseURLValue}`);
    baseURLValue = undefined;
    baseURLSource = baseURL.source
      ? `${baseURL.source} (ignored: localhost in production)`
      : undefined;
  }

  let apiKeyValue = apiKey.value;
  let apiKeySource = apiKey.source;

  // If we ignored the base URL in production and only have the Replit key,
  // force a clear missing key error to avoid confusing OpenAI auth failures.
  if (
    isProduction &&
    !baseURLValue &&
    apiKeySource === "AI_INTEGRATIONS_OPENAI_API_KEY" &&
    !process.env.OPENAI_API_KEY
  ) {
    apiKeyValue = undefined;
    apiKeySource = "AI_INTEGRATIONS_OPENAI_API_KEY (ignored: use OPENAI_API_KEY in production)";
  }

  return {
    apiKey: apiKeyValue,
    baseURL: baseURLValue,
    apiKeySource: apiKeySource,
    baseURLSource: baseURLSource,
  };
}

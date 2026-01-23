type EnvConfig = {
  value?: string;
  source?: string;
};

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
  
  // Log all available env vars for debugging (safe - no values)
  const envVarsPresent = {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    AI_INTEGRATIONS_OPENAI_API_KEY: !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    AI_INTEGRATIONS_OPENAI_BASE_URL: !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    OPENAI_BASE_URL: !!process.env.OPENAI_BASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
  console.log("[OpenAI Config] Environment check:", JSON.stringify(envVarsPresent));

  // In production, ALWAYS prefer OPENAI_API_KEY and ignore Replit integration vars
  if (isProduction) {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (apiKey && apiKey.trim().length > 0) {
      console.log("[OpenAI Config] Production mode: Using OPENAI_API_KEY");
      return {
        apiKey: apiKey,
        baseURL: undefined, // Use default OpenAI URL
        apiKeySource: "OPENAI_API_KEY",
        baseURLSource: "default (https://api.openai.com/v1)",
      };
    }
    
    // No OPENAI_API_KEY in production - this is an error
    console.error("[OpenAI Config] CRITICAL: No OPENAI_API_KEY found in production!");
    return {
      apiKey: undefined,
      baseURL: undefined,
      apiKeySource: "MISSING - configure OPENAI_API_KEY in Deployment Secrets",
      baseURLSource: undefined,
    };
  }

  // Development mode - try Replit integration first, then fallback
  const apiKeyCandidates = [
    "AI_INTEGRATIONS_OPENAI_API_KEY",
    "OPENAI_API_KEY",
  ];
  
  const baseURLCandidates = [
    "AI_INTEGRATIONS_OPENAI_BASE_URL",
    "OPENAI_BASE_URL",
    "OPENAI_API_BASE_URL",
  ];

  const apiKey = readFirstEnv(apiKeyCandidates);
  const baseURL = readFirstEnv(baseURLCandidates);

  console.log(`[OpenAI Config] Development mode: API Key from ${apiKey.source || 'none'}, Base URL from ${baseURL.source || 'default'}`);

  return {
    apiKey: apiKey.value,
    baseURL: baseURL.value,
    apiKeySource: apiKey.source,
    baseURLSource: baseURL.source,
  };
}

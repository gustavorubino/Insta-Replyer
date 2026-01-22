
import OpenAI from "openai";

async function testAI() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL;

  console.log("Config:");
  console.log("- API Key exists:", !!apiKey);
  console.log("- Base URL:", baseURL || "https://api.openai.com/v1");

  if (!apiKey) {
    console.error("ERROR: No API Key found!");
    process.exit(1);
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  });

  const modelsToTest = ["gpt-4.1", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"];

  for (const model of modelsToTest) {
    console.log(`\nTesting model: ${model}...`);
    try {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: "Say OK" }],
        max_completion_tokens: 5,
      });
      console.log(`✅ Success with ${model}:`, response.choices[0].message.content);
      process.exit(0);
    } catch (err: any) {
      console.error(`❌ Failed with ${model}:`, err.message);
    }
  }
}

testAI();

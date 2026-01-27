import { getOpenAIConfig } from "./openai-config";
import OpenAI from "openai";

// Calculate embedding for text
export async function generateEmbedding(text: string): Promise<number[]> {
  const config = getOpenAIConfig();
  if (!config.apiKey) {
    throw new Error("OpenAI API Key not configured");
  }

  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    });

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error("Invalid embedding response");
    }

    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

// Calculate cosine similarity
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

import { getOpenAIConfig } from "./utils/openai-config";

interface TranscriptionResult {
  transcription: string | null;
  error?: string;
}

export async function transcribeVideoAudio(videoUrl: string): Promise<TranscriptionResult> {
  console.log("[Transcription] Starting video audio transcription...");

  const config = getOpenAIConfig();

  if (!config.apiKey) {
    console.error("[Transcription] API key not available");
    return {
      transcription: null,
      error: "Chave da API OpenAI não configurada"
    };
  }

  try {
    console.log("[Transcription] Downloading video from:", videoUrl.substring(0, 50) + "...");

    const videoResponse = await fetch(videoUrl);

    if (!videoResponse.ok) {
      console.error("[Transcription] Failed to download video:", videoResponse.status);
      return {
        transcription: null,
        error: "Falha ao baixar o vídeo"
      };
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const videoBlob = new Blob([videoBuffer], { type: "video/mp4" });

    console.log("[Transcription] Video downloaded, size:", Math.round(videoBuffer.byteLength / 1024), "KB");

    if (videoBuffer.byteLength > 25 * 1024 * 1024) {
      console.warn("[Transcription] Video too large for Whisper API (>25MB)");
      return {
        transcription: null,
        error: "Vídeo muito grande para transcrição (limite: 25MB)"
      };
    }

    const formData = new FormData();
    formData.append("file", videoBlob, "video.mp4");
    formData.append("model", "whisper-1");
    formData.append("language", "pt");
    formData.append("response_format", "text");

    console.log("[Transcription] Sending to Whisper API...");

    const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: formData,
    });

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error("[Transcription] Whisper API error:", transcriptionResponse.status, errorText);

      if (transcriptionResponse.status === 400 && errorText.includes("Could not process audio")) {
        return {
          transcription: null,
          error: "Não foi possível extrair áudio do vídeo (pode não ter áudio)"
        };
      }

      return {
        transcription: null,
        error: "Erro na API de transcrição"
      };
    }

    const transcription = await transcriptionResponse.text();

    if (!transcription || transcription.trim().length === 0) {
      console.log("[Transcription] No speech detected in video");
      return {
        transcription: null,
        error: "Nenhuma fala detectada no vídeo"
      };
    }

    console.log("[Transcription] Successfully transcribed:", transcription.substring(0, 100) + (transcription.length > 100 ? "..." : ""));

    return { transcription: transcription.trim() };

  } catch (error) {
    console.error("[Transcription] Error:", error instanceof Error ? error.message : error);
    return {
      transcription: null,
      error: "Erro ao processar transcrição do vídeo"
    };
  }
}

export async function getOrCreateTranscription(
  messageId: number,
  userId: string,
  videoUrl: string | null | undefined,
  cachedTranscription: string | null | undefined
): Promise<string | null> {
  if (cachedTranscription) {
    console.log("[Transcription] Using cached transcription");
    return cachedTranscription;
  }

  if (!videoUrl) {
    console.log("[Transcription] No video URL available");
    return null;
  }

  const result = await transcribeVideoAudio(videoUrl);

  if (result.transcription) {
    try {
      const { storage } = await import("./storage");
      // 🛡️ SECURITY FIX: Pass userId to ensure we own the message we are tagging
      await storage.updateMessageTranscription(messageId, userId, result.transcription);
      console.log("[Transcription] Cached transcription in database");
    } catch (cacheError) {
      console.warn("[Transcription] Failed to cache transcription:", cacheError);
    }
  }

  return result.transcription;
}

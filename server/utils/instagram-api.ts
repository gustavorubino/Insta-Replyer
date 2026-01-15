import axios, { AxiosError } from 'axios';

interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  backoffMultiplier: 2
};

export async function instagramApiCall<T>(
  url: string,
  config: any = {},
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const response = await axios.get(url, config);
      return response.data as T;
    } catch (error) {
      lastError = error as Error;
      const axiosError = error as AxiosError;

      // Não fazer retry em erros 4xx (cliente)
      if (axiosError.response && axiosError.response.status < 500) {
        throw error;
      }

      // Se não for a última tentativa, aguardar e tentar novamente
      if (attempt < retryConfig.maxRetries) {
        const delay = retryConfig.retryDelay * Math.pow(retryConfig.backoffMultiplier, attempt);
        console.log(`[Instagram API] Tentativa ${attempt + 1} falhou. Aguardando ${delay}ms antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Instagram API call failed after retries');
}

export async function sendInstagramMessage(
  recipientId: string,
  message: string,
  accessToken: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await axios.post(
      `https://graph.instagram.com/v21.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      messageId: response.data.message_id
    };
  } catch (error: any) {
    console.error('[Instagram API] Erro ao enviar mensagem:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}
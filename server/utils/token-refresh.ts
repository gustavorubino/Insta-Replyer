import { decrypt, encrypt } from "../encryption";

interface RefreshResult {
  success: boolean;
  newToken?: string;
  expiresAt?: Date;
  error?: string;
}

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;

export async function refreshInstagramToken(encryptedToken: string): Promise<RefreshResult> {
  try {
    const currentToken = decrypt(encryptedToken);
    
    if (!currentToken) {
      return {
        success: false,
        error: "Token inválido ou não pode ser descriptografado"
      };
    }

    const response = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`
    );

    const data = await response.json() as any;

    if (data.error) {
      console.error("[Token Refresh] API error:", data.error);
      return {
        success: false,
        error: data.error.message || "Erro ao renovar token"
      };
    }

    const { access_token, expires_in } = data;
    
    if (!access_token) {
      return {
        success: false,
        error: "Resposta da API não contém access_token"
      };
    }

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (expires_in || 5184000));

    const encryptedNewToken = encrypt(access_token);

    return {
      success: true,
      newToken: encryptedNewToken,
      expiresAt: expiresAt
    };

  } catch (error: any) {
    console.error("[Token Refresh] Erro:", error.message);
    return {
      success: false,
      error: error.message || "Erro desconhecido"
    };
  }
}

export function calculateTokenExpiry(expiresIn: number = 5184000): Date {
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
  return expiresAt;
}

import { instagramApiCall } from './instagram-api';

interface InstagramUserInfo {
  id: string;
  username?: string;
  name?: string;
  profile_pic?: string;
  profile_picture_url?: string;
}

export async function fetchUserProfilePicture(
  igsid: string,
  accessToken: string,
  username?: string
): Promise<string | null> {
  // Estratégia em cascata para buscar foto de perfil

  // 1. Tentar endpoint direto com IGSID
  try {
    const data = await instagramApiCall<InstagramUserInfo>(
      `https://graph.instagram.com/v21.0/${igsid}?fields=profile_pic,profile_picture_url&access_token=${accessToken}`
    );

    if (data.profile_pic) return data.profile_pic;
    if (data.profile_picture_url) return data.profile_picture_url;
  } catch (error) {
    console.log(`[Profile] Falha ao buscar foto pelo IGSID direto: ${error}`);
  }

  // 2. Tentar via Facebook Graph API
  try {
    const data = await instagramApiCall<InstagramUserInfo>(
      `https://graph.facebook.com/v21.0/${igsid}?fields=profile_pic&access_token=${accessToken}`
    );

    if (data.profile_pic) return data.profile_pic;
  } catch (error) {
    console.log(`[Profile] Falha ao buscar foto via Facebook Graph: ${error}`);
  }

  // 3. Se tiver username, tentar Business Discovery API
  if (username) {
    try {
      const cleanUsername = username.replace('@', '');
      const data = await instagramApiCall<any>(
        `https://graph.instagram.com/v21.0/me?fields=business_discovery.username(${cleanUsername}){profile_picture_url}&access_token=${accessToken}`
      );

      if (data.business_discovery?.profile_picture_url) {
        return data.business_discovery.profile_picture_url;
      }
    } catch (error) {
      console.log(`[Profile] Falha ao buscar foto via Business Discovery: ${error}`);
    }
  }

  // 4. Retornar null para usar avatar em gradiente
  console.log(`[Profile] Não foi possível obter foto de perfil para ${username || igsid}`);
  return null;
}

// Função para gerar avatar gradiente como fallback
export function generateGradientAvatar(username: string): string {
  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  ];

  // Usar username para escolher gradiente consistentemente
  const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradientIndex = hash % gradients.length;

  return gradients[gradientIndex];
}
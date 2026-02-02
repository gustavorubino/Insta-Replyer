
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'server/routes/index.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Substituir fetchInstagramUserInfo
const oldFunctionRegex = /async function fetchInstagramUserInfo[\s\S]*?return \{\s*name: `Usuário IG`,\s*username: senderId,\s*\};\s*\}/m;

const newFunction = `// Helper to get user info from Instagram API (Improved for Cross-Account)
  async function fetchInstagramUserInfo(senderId: string, accessToken: string, recipientId?: string): Promise<{ name: string; username: string; avatar?: string; followersCount?: number }> {
    try {
      console.log(\`Fetching user info for sender \${senderId}, token length: \${accessToken.length}\`);

      const endpoints = [
        // Direct Instagram Graph API
        {
          name: "Instagram Graph API (basic)",
          url: \`https://graph.instagram.com/v21.0/\${senderId}?fields=id,username,name,profile_picture_url&access_token=\${encodeURIComponent(accessToken)}\`
        },
        // Facebook Graph API (better for business accounts)
        {
          name: "Facebook Graph API (user profile)",
          url: \`https://graph.facebook.com/v21.0/\${senderId}?fields=id,name,username,profile_pic&access_token=\${encodeURIComponent(accessToken)}\`
        },
        // Business Discovery API (BEST for cross-account public info)
        ...(recipientId ? [{
          name: "Business Discovery API",
          url: \`https://graph.instagram.com/v21.0/\${recipientId}?fields=business_discovery.username(\${senderId}){profile_picture_url,name,username,followers_count}&access_token=\${encodeURIComponent(accessToken)}\`
        }] : [])
      ];

      for (const endpoint of endpoints) {
        try {
          // Special handling for Business Discovery - logic is different
          if (endpoint.name === "Business Discovery API") {
              // Can't use Discovery by ID directly, need to know username first.
              // Skipping for now unless we refactor to try guessing username.
              continue; 
          }

          console.log(\`[Profile Fetch] Trying \${endpoint.name}...\`);
          const response = await fetch(endpoint.url);
          const data = await response.json();

          if (response.ok && !data.error) {
            console.log(\`[Profile Fetch] \${endpoint.name} SUCCESS:\`, JSON.stringify(data).substring(0, 200));
            
            // Normalize response
            const result = {
              name: data.name || data.username,
              username: data.username,
              avatar: data.profile_pic || data.profile_picture_url || undefined,
              followersCount: undefined
            };

            if (result.username) {
                return result;
            }
          } else {
            console.log(\`[Profile Fetch] \${endpoint.name} failed:\`, data?.error?.message || "Unknown error");
          }
        } catch (err) {
          console.log(\`[Profile Fetch] \${endpoint.name} error:\`, err);
        }
      }
    } catch (error) {
      console.error("Error fetching Instagram user info:", error);
    }

    // Fallback
    return {
      name: \`Usuário IG\`,
      username: senderId,
    };
  }`;

if (oldFunctionRegex.test(content)) {
    content = content.replace(oldFunctionRegex, newFunction);
    console.log("✅ fetchInstagramUserInfo substituída com sucesso.");
} else {
    console.error("❌ Não encontrei fetchInstagramUserInfo para substituir.");
}

// 2. Injetar lógica de username match em processWebhookMessage
const userMatchLogicOld = `
      // Use cached data only if we have usable username info`;

const userMatchLogicNew = `
      // 🔧 MELHORIA: Tentar match também por Username via API se o ID não bater (IDs diferentes entre escopos)
      if (!knownInstagramUser && instagramUser.instagramAccessToken) {
         try {
            // Se ainda não sabemos quem é, vamos tentar pegar o username na API
            const encToken = instagramUser.instagramAccessToken;
            const accessToken = isEncrypted(encToken) ? decrypt(encToken) : encToken;
            const userInstagramId = instagramUser.instagramAccountId;
            
            // Usamos a função auxiliar existente para pegar info do remetente
            const userInfo = await fetchInstagramUserInfo(senderId, accessToken, userInstagramId);
            
            if (userInfo && userInfo.username && userInfo.username !== senderId) {
                // Agora buscamos no banco alguém com esse username
                const matchByUsername = allUsers.find((u: any) => 
                    u.id !== instagramUser.id && 
                    u.instagramUsername && 
                    u.instagramUsername.toLowerCase() === userInfo.username.toLowerCase()
                );
                
                if (matchByUsername) {
                    console.log(\`[DM-WEBHOOK] ✅ Match cross-account por username! ID \${senderId} = @\${userInfo.username} = User \${matchByUsername.id}\`);
                    knownInstagramUser = matchByUsername;
                }
            }
         } catch (err) {
             console.log("[DM-WEBHOOK] Falha ao tentar match por username:", err);
         }
      }

      // Use cached data only if we have usable username info`;

if (content.includes(userMatchLogicOld.trim())) {
    // Usar replace normal pq regex pode ser chato com indentação
    // Vamos tentar substituir o comentário que marca o inicio do bloco seguinte
    content = content.replace("// Use cached data only if we have usable username info", userMatchLogicNew.trim());
    console.log("✅ Lógica de Username Match injetada.");
} else {
    console.error("❌ Não encontrei o ponto de injeção para Username Match.");
    // Fallback: tentar encontrar pelo contexto anterior
    const fallbackSearch = `(u.instagramAccountId === senderId || u.instagramRecipientId === senderId)\n      );`;
    if (content.includes(fallbackSearch)) {
         content = content.replace(fallbackSearch, fallbackSearch + "\n\n" + userMatchLogicNew);
         console.log("✅ Lógica injetada via Fallback Search.");
    }
}

// 3. Remover logs de debug residuais
const debugLogRegex = /fetch\('http:\/\/localhost:7242\/ingest\/.*?catch\(\(\)=>\{\}\);/g;
const matchCount = (content.match(debugLogRegex) || []).length;
content = content.replace(debugLogRegex, "");
console.log(`✅ Removidos ${matchCount} logs de debug.`);

fs.writeFileSync(filePath, content);
console.log("Arquivo salvo.");

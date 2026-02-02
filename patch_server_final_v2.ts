
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'server/routes/index.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Adicionar Import
if (!content.includes('import { resolveInstagramSender }')) {
    const importStatement = 'import { resolveInstagramSender } from "../utils/instagram-identity";\n';
    // Find the last import and append
    content = content.replace(/(import .*?;\n)(?!import)/, '$1' + importStatement);
}

// 2. Substituir fetchInstagramUserInfo por wrapper
const oldFunctionRegex = /async function fetchInstagramUserInfo[\s\S]*?return \{\s*name: `Usuário IG`,\s*username: senderId,\s*\};\s*\}/m;

const newFunction = `// Helper to get user info from Instagram API (Improved for Cross-Account)
  // DEPRECATED: Use resolveInstagramSender instead
  async function fetchInstagramUserInfo(senderId: string, accessToken: string, recipientId?: string) {
    const result = await resolveInstagramSender(senderId, accessToken, recipientId);
    return {
        name: result.name,
        username: result.username,
        avatar: result.avatar,
        followersCount: result.followersCount
    };
  }`;

// Tentativa de replace inteligente (busca por assinatura e final da função)
// Como o regex anterior pode falhar devido ao corpo complexo, vamos buscar pelo inicio e fim conhecidos
const startMarker = "async function fetchInstagramUserInfo(senderId: string, accessToken: string, recipientId?: string): Promise<{ name: string; username: string; avatar?: string; followersCount?: number }> {";
const endMarker = "name: `Usuário IG`,\n      username: senderId,\n    };\n  }";

const startIndex = content.indexOf(startMarker);
if (startIndex !== -1) {
    // Achar o fechamento da função (aproximado, pois o endMarker pode variar whitespace)
    // Vamos usar uma heurística simples: buscar o próximo "async function processWebhookMessage"
    const nextFunction = "async function processWebhookMessage";
    const endIndex = content.indexOf(nextFunction, startIndex);
    
    if (endIndex !== -1) {
        // Cortar o espaço entre o inicio da fetch e o inicio da process
        // Deixar um espaço antes da process
        const before = content.substring(0, startIndex);
        const after = content.substring(endIndex);
        content = before + newFunction + "\n\n  " + after;
        console.log("✅ fetchInstagramUserInfo substituída com sucesso (via range replacement).");
    } else {
        console.error("❌ Não encontrei o fim da função fetchInstagramUserInfo.");
    }
} else {
    // Tentar buscar pela assinatura sem tipagem explicita se tiver mudado
    console.error("❌ Não encontrei o início da função fetchInstagramUserInfo.");
}

// 3. Refatorar processWebhookMessage para usar a nova lógica simplificada
// Vamos procurar o bloco onde definimos senderName, senderUsername etc.
const logicStartMarker = "// Then get username from conversations API using instagramAccountId";
const logicEndMarker = "// Process attachments (photos, videos, audio, gifs, etc.)";

const logicStartIndex = content.indexOf(logicStartMarker);
const logicEndIndex = content.indexOf(logicEndMarker);

if (logicStartIndex !== -1 && logicEndIndex !== -1) {
    const newLogic = `
        // RESOLUTION STRATEGY: Use robust identity resolver
        // This handles API calls, DB matching, and fallbacks in one place
        const identity = await resolveInstagramSender(senderId, instagramUser.instagramAccessToken, userInstagramId);
        
        senderName = identity.name;
        senderUsername = identity.username;
        senderAvatar = identity.avatar;
        senderFollowersCount = identity.followersCount;
        
        console.log(\`[Identity] Final Resolved: \${senderName} (@\${senderUsername})\`);

        // If matched with a known user (DB match), update cross-account ID mapping
        if (identity.isKnownUser && identity.userId) {
             const matchedUser = allUsers.find((u: any) => u.id === identity.userId);
             if (matchedUser) {
                 // Persist the mapping so next time we find it instantly via ID match
                 try {
                    if (!matchedUser.instagramRecipientId || matchedUser.instagramRecipientId !== senderId) {
                         console.log(\`[Identity] 💾 Persisting new scope ID (\${senderId}) for user \${matchedUser.email}\`);
                         await authStorage.updateUser(matchedUser.id, {
                             instagramRecipientId: senderId
                         });
                    }
                 } catch (err) {
                    console.error("[Identity] Failed to persist ID mapping:", err);
                 }
             }
        }
    `;
    
    const before = content.substring(0, logicStartIndex);
    const after = content.substring(logicEndIndex);
    content = before + newLogic + "\n\n      " + after;
    console.log("✅ Lógica de resolução injetada em processWebhookMessage.");
} else {
    console.error("❌ Não encontrei o bloco de lógica para substituir em processWebhookMessage.");
}

fs.writeFileSync(filePath, content);
console.log("Arquivo salvo.");

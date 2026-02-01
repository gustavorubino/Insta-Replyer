/**
 * Teste de Lógica de Auto-Associação (Simulação Local)
 * Verifica se o desempate funciona com múltiplos usuários
 */

import { storage } from "./server/storage"; // Importar storage real (vai usar o banco conectado)
import { authStorage } from "./server/replit_integrations/auth/storage";
import { processWebhookMessage_MOCK } from "./server/routes/index"; // Precisamos exportar ou mockar isso... difícil.

// Vamos recriar a lógica crítica aqui para testar isoladamente
async function testAutoAssociationLogic() {
  console.log("🧪 Iniciando Teste de Lógica de Auto-Associação...");

  // 1. Setup: Buscar usuários reais para não precisar criar fakes que quebram constraints
  const allUsers = await authStorage.getAllUsers();
  console.log(`📊 Usuários encontrados no banco: ${allUsers.length}`);

  const recipientId = "17841401958671989"; // O ID do Webhook (Correto)
  const wrongId = "25941877765449078"; // O ID do Login (Errado)

  // Filtrar candidatos (simulando o filtro do código)
  const usersWithInstagram = allUsers.filter((u: any) =>
    u.instagramAccessToken &&
    u.instagramUsername &&
    u.instagramAccountId &&
    u.instagramAccountId !== recipientId // Diferente do ID do webhook
  );

  console.log(`🎯 Candidatos encontrados (com ID diferente do webhook): ${usersWithInstagram.length}`);
  usersWithInstagram.forEach(u => console.log(`   - ${u.email} (ID: ${u.instagramAccountId})`));

  if (usersWithInstagram.length > 1) {
    console.log(`\n⚡ Cenário de Múltiplos Candidatos Detectado! Testando desempate...`);

    let bestCandidate = null;
    let recentConnectionsCount = 0;

    for (const candidate of usersWithInstagram) {
      console.log(`   🔍 Verificando user ${candidate.email}...`);
      
      // Verificar marcador real no banco
      const pendingMarker = await storage.getSetting(`pending_webhook_${candidate.id}`);
      console.log(`      Marker pending_webhook_${candidate.id}:`, pendingMarker);

      const isRecentConnection = pendingMarker?.value &&
        (Date.now() - new Date(pendingMarker.value).getTime()) < 24 * 60 * 60 * 1000;
      
      console.log(`      É recente (<24h)? ${isRecentConnection ? 'SIM' : 'NÃO'}`);

      if (isRecentConnection) {
        bestCandidate = candidate;
        recentConnectionsCount++;
      }
    }

    console.log(`\n📊 Resultado do Desempate:`);
    console.log(`   Conexões recentes encontradas: ${recentConnectionsCount}`);
    
    if (recentConnectionsCount === 1 && bestCandidate) {
      console.log(`   ✅ VENCEDOR: ${bestCandidate.email}`);
      console.log(`   🏁 CONCLUSÃO: A lógica IRIA corrigir este usuário.`);
    } else {
      console.log(`   ❌ FALHA: Ninguém ganhou ou houve empate.`);
      console.log(`   🏁 CONCLUSÃO: A lógica NÃO faria nada.`);
    }

  } else if (usersWithInstagram.length === 1) {
    console.log(`\n⚡ Cenário de Candidato Único. A lógica padrão funcionaria se houver marker.`);
    const candidate = usersWithInstagram[0];
    const pendingMarker = await storage.getSetting(`pending_webhook_${candidate.id}`);
    console.log(`   Marker:`, pendingMarker);
  } else {
    console.log(`\n⚡ Nenhum candidato encontrado. Todos já estão certos ou desconectados.`);
  }
}

testAutoAssociationLogic().catch(console.error);

# PLANO.md — Diagnóstico: DMs Reais do Instagram Não Chegam

## 📋 Problema e Impacto

**Problema:** Mensagens diretas (DMs) reais do Instagram **NÃO aparecem** na Fila de Aprovação do app, enquanto:
- Webhooks de **teste do Meta** funcionam (sender=123456789, mid=m_test_*)
- Webhooks de **comentários** funcionam (field="comments")

**Impacto:** O sistema não consegue automatizar respostas a DMs reais de clientes.

---

## 🔍 Diagnóstico Realizado

### O que eu verifiquei (read-only):

1. **Arquivo `server/routes/index.ts`** (linhas 2703-2859):
   - O webhook POST `/api/webhooks/instagram` processa:
     - `entry.messaging[]` → chama `processWebhookMessage()` para DMs
     - `entry.changes[]` → só trata `field="comments"` e `field="mentions"`
   - Para qualquer **outro campo** em `entry.changes`, apenas loga: `"Unknown field type: ${change.field}"`

2. **Arquivo `webhook_audit.log`**:
   - Apenas 2 registros de teste: `SENDER:123456789` (ID fake do Meta)
   - Nenhuma DM real registrada

3. **Verificação de PROD_DB_URL**: ✅ Presente

---

## 🎯 Hipóteses de Causa

| # | Hipótese | Sinal para Confirmar | Sinal para Refutar |
|---|----------|---------------------|-------------------|
| 1 | **DMs reais chegam via `entry.changes` com `field="messages"`** (formato diferente do teste) | Log mostra "Unknown field type: messages" quando DM real é enviada | Entry tem `messaging[]` com dados |
| 2 | **Webhook de Instagram Messaging não está inscrito** (só comentários) | Meta não envia nenhum POST para DMs reais | Log mostra POST chegando com objeto "instagram" |
| 3 | **Permissão `instagram_manage_messages` ausente** | Nenhum webhook de DM chega; API retorna erro de permissão | Webhook chega com dados |

### Hipótese mais provável: **#1 + #2 combinadas**

O código espera DMs em `entry.messaging[]` (formato Messenger Platform), mas DMs reais do Instagram Business API podem chegar em `entry.changes[]` com `field="messages"` (formato Graph API), e esse campo **não é processado** (linha 2818: "Unknown field type").

Além disso, a subscrição do webhook pode não incluir o campo "messages" para a conta do Instagram Business.

---

## ✅ Solução Proposta

### Fase 1: Diagnóstico Definitivo (read-only, seguro)
1. Adicionar log detalhado para **qualquer payload** que chegue no webhook
2. Enviar uma DM real de @gustavorubino para @rodolfodonetti
3. Verificar os logs para determinar o formato exato do payload

### Fase 2: Correção do Parser (se confirmar Hipótese #1)
1. Adicionar suporte para `field="messages"` no loop de `changes`
2. Mapear o formato `entry.changes[].value` para o formato esperado por `processWebhookMessage()`

### Fase 3: Verificar Subscrição (se confirmar Hipótese #2)
1. Verificar no Facebook Developers Console se "messages" está nos campos subscritos
2. Se não estiver, adicionar via UI do Meta ou via API `subscribed_fields`

---

## 📝 Passos de Execução

### Passo 1: Adicionar log diagnóstico (mínimo, seguro)
**Arquivo:** `server/routes/index.ts`
**Localização:** Dentro do loop `for (const change of changes)` (após linha 2807)

```diff
} else if (change.field === "mentions") {
  console.log(">>> Processing MENTION webhook");
  await processWebhookComment(change.value, entryItem.id);
+ } else if (change.field === "messages") {
+   console.log("╔════════════════════════════════════════════════════════════════════╗");
+   console.log("║  📨 WEBHOOK field='messages' DETECTADO - FORMATO GRAPH API DM     ║");
+   console.log("╚════════════════════════════════════════════════════════════════════╝");
+   console.log("[DM-GRAPH] Change value keys:", Object.keys(change.value || {}));
+   console.log("[DM-GRAPH] Change value (parcial):", JSON.stringify(change.value).substring(0, 800));
+   // TODO: Processar DM no formato Graph API (entry.changes com field="messages")
+   // Por agora, apenas logamos para diagnóstico
} else {
  console.log(`>>> Unknown field type: ${change.field}`);
}
```

### Passo 2: Testar com DM real
1. Enviar DM real de @gustavorubino para @rodolfodonetti
2. Verificar logs do deploy público (ou local via `npm run dev`)
3. Capturar o formato do payload

### Passo 3: Implementar parser se necessário
- Só após confirmar o formato real do payload

---

## 🔒 Segurança e Privacidade

- **Logs:** Apenas keys e previews truncados (sem tokens/URLs completas)
- **Dados:** Não expor conteúdo completo das mensagens nos logs
- **Isolamento:** Manter verificação por `userId` em todas as queries

---

## 🧪 Verificação Proposta

### Critérios de Aceite (DoD):
1. ✅ DM real "teste 2" aparece na Fila de Aprovação (DMs)
2. ✅ senderUsername mostra o @username real (não "123456789")
3. ✅ Comentários continuam funcionando normalmente
4. ✅ Nenhum segredo é exposto em logs

### Teste Manual:
1. Enviar nova DM real de @gustavorubino para @rodolfodonetti
2. Verificar logs no terminal/deployment
3. Confirmar registro no banco (`instagram_messages` com `type='dm'`)
4. Verificar na UI: Fila de Aprovação > Mensagens Diretas

---

## ⏪ Plano de Rollback

Se algo quebrar:
```bash
git checkout -- server/routes/index.ts
npm run build
# Republicar
```

---

## ⚠️ Aviso Importante

**Antes de implementar**, preciso que você:
1. Confirme se quer que eu adicione o log diagnóstico primeiro (Fase 1)
2. Ou se prefere que eu já implemente o parser completo para `field="messages"` (Fase 2)

**Recomendação:** Fase 1 primeiro para confirmar o formato exato do payload.

---

## 📊 Resumo Visual

```
DM Real Enviada
       ↓
Meta Webhook POST /api/webhooks/instagram
       ↓
┌─────────────────────────────────────────┐
│ Payload atual (suspeita):               │
│ {                                       │
│   "object": "instagram",                │
│   "entry": [{                           │
│     "id": "...",                        │
│     "changes": [{                       │
│       "field": "messages",    ← NÃO TRATADO!
│       "value": { ... }                  │
│     }]                                  │
│   }]                                    │
│ }                                       │
└─────────────────────────────────────────┘
       ↓
Código atual: "Unknown field type: messages"
       ↓
DM NÃO É PROCESSADA ❌
```

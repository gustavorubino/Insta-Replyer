# PLANO — Diagnóstico e Correção Webhook

## Objetivo
Resolver o erro de "MATCH:NENHUM (BLOQUEADO)" relatado/encontrado nos logs, que parece ser o problema de 3 dias do usuário.
Validar e seguir o protocolo `BOOT.md`.

## Diagnóstico (Fase 0)
- **Repo**: Node/TypeScript + Express + Drizzle + React.
- **Branch**: `fix/webhook-pageid-autoassoc`.
- **Logs**: `webhook_audit.log` mostra erro:
  `[2026-02-04T13:07:12.249Z] MID:mid_... RECIPIENT:51200739 -> MATCH:NENHUM (BLOQUEADO)`
- **Interpretação**: O sistema recebeu um webhook para o ID `51200739`, mas não encontrou usuário correspondente ou bloqueou explicitamente.

## Hipóteses (CONFIRMADO)
1. **BUG CRÍTICO ENCONTRADO**: A função `autoAssociatePageId` **existe** (linha 90 de `routes/index.ts`) mas **NÃO É CHAMADA** dentro de `processWebhookMessage`.
2. O código tenta usar `autoAssociateIgBusinessId(recipientId)` (linha 3888).
3. Porém, em DMs, o `recipientId` é um **Facebook Page ID**, que não bate com o ID retornada por `/me` (Instagram Business ID).
4. Resultado: O sistema recebe o Page ID, tenta validar como se fosse IG ID, falha, não encontra match e BLOQUEIA (`MATCH:NENHUM`).

## Plano de Correção
1. Em `server/routes/index.ts`, dentro de `processWebhookMessage`:
   - Adicionar chamada para `autoAssociatePageId(recipientId, allUsers)` ANTES de tentar `autoAssociateIgBusinessId`.
   - Se `autoAssociatePageId` retornar usuário, usar esse usuário.


## Riscos
- Mexer na lógica de routing pode quebrar o que já funciona (regressão).
- **Mitigação**: Diagnóstico primeiro (leitura), teste local depois.

## Próximos Passos
1. `grep "(BLOQUEADO)"` para achar a origem.
2. Ler a lógica de `webhook` que gera essa resposta.
3. Propor a correção.

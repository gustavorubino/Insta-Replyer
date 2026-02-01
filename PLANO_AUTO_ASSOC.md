# PLANO — Auto-Associação Segura de Webhooks

## Problema
O Instagram retorna um ID no Login (OAuth) e outro ID nos Webhooks. 
Atualmente, o sistema usa "match estrito", então quando o ID do webhook não bate com o do login, a mensagem é bloqueada com o erro "Webhook não mapeado".

## Solução Proposta
Implementar uma **Auto-Associação Segura** que "aprende" o ID do webhook no momento em que o usuário se conecta.

### Como funciona:
1. **No Login:** Quando o usuário clica em "Conectar", o sistema salva um marcador temporário `pending_webhook_${userId}` válido por 15 minutos.
2. **No Webhook:** Se chegar um ID desconhecido (`entryId`):
   - O sistema verifica se o ID já pertence a alguém (para evitar vazamento).
   - Se o ID for novo, o sistema procura se existe **exatamente um usuário** que acabou de se conectar (possui o marcador `pending_webhook`).
   - Se encontrar, o sistema associa o novo ID a esse usuário automaticamente.
   - O marcador é deletado para não permitir novas associações automáticas.

### Por que é seguro?
- **Sem adivinhação:** Só associa se houver um marcador de conexão recente.
- **Prevenção de conflito:** Se o ID já pertence a outro usuário, a associação automática é bloqueada.
- **Prevenção de ambiguidade:** Se dois usuários se conectarem exatamente ao mesmo tempo, o sistema bloqueia para evitar erro.

## Alterações
- Modificar `processWebhookMessage` em `server/routes/index.ts`.
- Modificar `processWebhookComment` em `server/routes/index.ts`.
- Garantir que o marcador `pending_webhook` é verificado corretamente.

## Validação
- O usuário deve desconectar e conectar a conta uma última vez.
- O sistema deve aprender o ID `17841401958671989` (ou qualquer outro que venha) automaticamente no primeiro webhook que chegar.

## GATE #1: Aprova o plano?
(Vou restaurar a lógica de auto-associação, mas de forma muito mais rígida e segura que a anterior para evitar vazamentos).

# PLANO — Correção definitiva de “Webhook não mapeado”

## Problema (em português simples)
Depois de um tempo, o sistema volta a mostrar “Webhook não mapeado” com IDs novos, e você precisa desconectar/conectar de novo.  
Isso acontece porque o webhook de DM está tentando achar o usuário pelo **recipientId**, mas o ID correto do “dono da conta” vem no **entry.id**.  
Quando esses IDs não batem, o sistema não encontra o usuário e bloqueia o webhook.

## Contexto (stack e restrições)
- Backend Node.js/Express, banco Postgres via Drizzle.
- Multi-tenant: nunca pode haver “adivinhação” de usuário.
- Já existe bloqueio de segurança quando não há match explícito.
- Precisamos corrigir o mapeamento sem criar novos riscos de vazamento.

## Hipóteses de causa (com sinais)
1) **DM usa ID errado para match**  
   - Sinal: “Webhook não mapeado” aparece mesmo com conta conectada.
   - Sinal: `entry.id` e `recipient.id` são diferentes no payload.
2) **Auto-associação antiga ainda roda no DM**  
   - Sinal: trechos de código tentando “auto-associar” usuário pelo marker.
   - Risco: pode criar associação errada quando há vários usuários.

## Solução proposta (segura)
1) **Usar `entry.id` como ID principal para DM** (mesma lógica do comentário).  
2) **Remover/neutralizar auto-associação por “guess” no DM**.  
3) **Atualizar somente dados do usuário já identificado**:  
   - Se `entry.id` casa com o usuário, salvar `instagramRecipientId` quando vier no webhook (para sincronizar).
4) **Continuar bloqueando webhooks sem match explícito** (segurança).

### Por que isso resolve
- O webhook sempre identifica “qual conta recebeu” pelo `entry.id`.  
- Ao usar esse ID, o match fica estável e não depende de reconectar.  
- Sem auto-associação, não há risco de misturar contas.

## Plano de execução (passos pequenos)
1) Ajustar `processWebhookMessage` para usar `entryId` como chave principal.  
2) Remover o bloco de auto-associação “inteligente” no DM.  
3) Quando houver match por `entryId`, salvar `instagramRecipientId` se necessário.  
4) Manter logs e bloqueio de segurança quando não houver match.

## Comandos exatos que serão executados
- Nenhum comando de banco ou deploy nesta etapa.
- Apenas edição de código.

## Arquivos exatos que serão alterados
- `server/routes/index.ts`

## Validações (critérios de aceite)
- Webhook DM com `entry.id` conhecido é aceito sem “Webhook não mapeado”.
- Se o `entry.id` não existir no banco, o webhook é bloqueado (segurança).
- Não há auto-associação em DM.

## Plano de rollback
- Reverter o arquivo `server/routes/index.ts` para o commit anterior.

## Threat Model (Microsoft SDL)
- **Componentes e fluxos:** Webhook → API → Match de usuário → Persistência.
- **Fronteiras de confiança:** Entrada externa (webhook) é não confiável.
- **Ameaças prováveis:**
  - Injeção de webhook com ID falso para “sequestrar” conta.
  - Vazamento multi-tenant por associação errada.
- **Mitigação:**
  - Match explícito por `entry.id`.
  - Bloqueio quando não há match.
  - Sem heurística/“chute”.
- **Como validar:**
  - Teste com IDs não existentes → deve bloquear.
  - Teste com ID correto → deve processar.

## Privacidade por design (LGPD)
- Minimização: processar apenas IDs necessários.
- Retenção: não aumentar logs com dados sensíveis.
- Logs: sem token/segredos.
- Multi-tenant: match explícito por ID, sem adivinhação.

## Gestão de variáveis de ambiente
- Nenhuma nova variável.
- Nenhuma mudança em `.env`.

## Débito técnico consciente (se houver)
- Sem débito técnico planejado.

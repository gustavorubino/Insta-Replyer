# Plano de Correção: Sincronização de Respostas Manuais (Echo)

## Problema
O usuário responde a DMs e Comentários diretamente pelo aplicativo do Instagram, mas essas respostas não aparecem no painel do sistema ("Instagram AI"). Isso causa inconsistência, pois o sistema continua achando que a conversa está "Sem resposta".

**Causa Raiz:** O código atual do Webhook (`server/routes/index.ts`) descarta explicitamente qualquer evento identificado como "Echo" (DMs enviadas pela própria conta) ou onde o remetente é igual ao proprietário da conta (Comentários).

## User Review Required
> [!IMPORTANT]
> A partir de agora, **todas** as mensagens enviadas pelo usuário no Instagram serão salvas no banco de dados do sistema. Isso aumentará o volume de dados armazenados.

## Proposed Changes

### Backend (`server/routes/index.ts`)

#### [MODIFY] [index.ts](file:///home/runner/workspace/server/routes/index.ts)
1.  **Rota de Comentários (`processWebhookMessage`):**
    *   Alterar a lógica que faz `return` quando `senderMatchesUser` é verdadeiro.
    *   Em vez de retornar, permitir o fluxo prosseguir para `storage.createMessage`.
    *   Adicionar uma flag `isManualReply = true` nesse fluxo.
    *   Envolver a chamada de `generateAIResponse` (linha ~3267) em um `if (!isManualReply)`. Se for resposta manual, **PULAR** a geração de IA e apenas logar "Sincronização de resposta manual realizada".

2.  **Rota de DMs (`processWebhookMessage` para DMs - *nota: o nome da função no código analisado parece ser o mesmo, preciso verificar se a lógica de DM está na mesma função ou separada. O código que li parecia ser mais genérico ou misturado. Na análise vi `isEcho` (linha 3490).***
    *   Localizar o bloco `if (isEcho) { ... return; }`.
    *   Substituir o `return` por lógica de persistência.
    *   Buscar a conversa (Thread) existente.
    *   Criar a mensagem com `role: 'assistant'` (ou equivalente no schema, verificar `senderId`).
    *   **PULAR** qualquer lógica de auto-resposta ou análise de IA para essas mensagens.

**Schema de Dados:**
*   Verificar se precisaremos de novos campos. Provavelmente não, apenas usar o `senderId` correto (o ID do usuário/negócio) já indica que foi uma resposta.

## Verification Plan

### Teste de Regressão (Manual)
1.  **DMs de Clientes:** Enviar mensagem de uma conta de teste para a conta conectada.
    *   *Resultado Esperado:* Sistema recebe, processa e IA gera sugestão (como normal).
2.  **Comentários de Clientes:** Comentar num post da conta conectada.
    *   *Resultado Esperado:* Sistema recebe, processa e IA sugere resposta.

### Teste da Correção
1.  **Resposta Manual (DM):**
    *   Enviar DM de uma conta teste.
    *   Responder essa DM **pelo app do Instagram** (celular ou web).
    *   *Resultado Esperado:* A resposta manual deve aparecer no histórico da conversa no painel do sistema em poucos segundos. O status da conversa deve sair de "Sem resposta" (se aplicável).
2.  **Resposta Manual (Comentário):**
    *   Fazer um comentário teste.
    *   Responder esse comentário **pelo app do Instagram**.
    *   *Resultado Esperado:* A resposta deve aparecer na lista de mensagens/comentários no painel. A IA **NÃO** deve tentar responder a essa resposta manual.

### Comandos de Validação
Não há testes unitários cobrindo o webhook. Usarei logs detalhados:
- Monitorar logs no terminal do Replit: `[DM-WEBHOOK] ECHO recebido e processado: <mid>`

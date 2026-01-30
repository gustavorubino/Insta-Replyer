# PLANO.md — Correção de Sincronização de Threads/Replies

## 1. Problema
O sistema de "Sincronizar Minha Conta Oficial" não está importando corretamente as **respostas do dono da conta** (replies) aos comentários dos seguidores.
**Sintoma:** O usuário vê "Sem resposta registrada" em interações que ele sabe que respondeu.
**Impacto:** A "Personalidade da IA" fica incompleta, pois ela não aprende como o usuário responde de fato.

## 2. Contexto
- **Arquivo Alvo:** `server/lib/instagram/processor.ts` (Função `parseCommentsForInteractions`).
- **Lógica Atual:** O código busca os comentários e suas respostas (replies). Para identificar se uma resposta é do dono, ele compara `reply.username === ownerUsername`.
- **Falha Provável:** A comparação por *string* (username) é frágil (pode haver divergência de case, espaços ou mudança de nome). Além disso, a API pode não estar retornando todas as replies se houver paginação.

## 3. Solução Proposta
Refatorar a lógica de identificação de respostas para usar **IDs** (que são imutáveis e precisos) em vez de usernames, e garantir que estamos "pegando" a conversa correta.

### Mudanças Específicas:
1.  **Matching por ID:** Usar `instagramAccountId` (ID numérico do usuário) para verificar a autoria da resposta, em vez do username.
2.  **Captura de Contexto:** Se houver múltiplas respostas no fio (thread), concatenar ou estruturar melhor para o "Dataset".
3.  **Logs Detalhados:** Adicionar logs para mostrar exatamente *por que* um reply foi ignorado (ex: "ID mismatch: esperado X, recebeu Y").

## 4. Plano de Execução

### Passo 1: Preparação
- [ ] Verificar se temos o `instagramAccountId` disponível na função `syncInstagramProcessor`. (Temos, ele é passado como argumento).

### Passo 2: Refatoração (`server/lib/instagram/processor.ts`)
- [ ] Alterar assinatura de `parseCommentsForInteractions` para receber `ownerId`.
- [ ] Atualizar a lógica de loop de replies:
    ```typescript
    // ANTES: if (replyUsername === ownerUsername)
    // DEPOIS: if (reply.from.id === ownerId)
    ```
- [ ] Melhorar a query da API para garantir que `replies` traga o campo `from`.

### Passo 3: Validação
- [ ] Rodar o comando de Sync manualmente via UI.
- [ ] Verificar nos logs do servidor se aparece: `[SYNC] ✅ Found owner reply (matched by ID)`.
- [ ] Verificar na UI (Dataset) se as respostas apareceram.

## 5. Rollback
- Reverter o arquivo `server/lib/instagram/processor.ts` para o estado anterior caso a API pare de retornar IDs.

## 6. Riscos & Mitigação
- **Risco:** A API do Instagram Graph v21 às vezes esconde o ID de usuários "Business" em certos contextos.
- **Mitigação:** Manter o *fallback* por Username caso o ID falhe. (Lógica híbrida: Tenta ID, se falhar, tenta Username).

## Threat Model (Segurança)
- **Dados:** Apenas leitura de comentários públicos.
- **Privacidade:** IDs são públicos na API Graph. Nenhuma PII sensível exposta além do público.
- **Limites:** Continuaremos respeitando o limite de 50 posts para não estourar quotas.

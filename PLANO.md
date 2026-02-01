# PLANO — Correção de Vazamento Multi-Tenant e Inconsistência de IDs

## Problema
1. **Vazamento de Dados:** Comentários do usuário "Rodolfo" aparecem no painel do usuário "Gustavo".
2. **Erro Persistente:** Aviso de "Webhook não mapeado" devido a IDs de Instagram que não correspondem aos salvos no banco.
3. **Causa Raiz:** O sistema tenta "adivinhar" o dono do webhook quando o ID não bate, usando lógicas inseguras (como "quem logou por último"). Além disso, o Instagram usa IDs diferentes para Login (User ID) e Webhook (Page ID), causando descompasso.

## Solução Proposta: "Zero Trust" Webhook Processing

Em vez de tentar associar webhooks desconhecidos, vamos implementar uma política de **Confiança Zero**: só aceitar webhooks onde temos certeza absoluta do dono.

### 1. Unificação de IDs no Login (OAuth)
- **Ação:** No callback do OAuth, vamos capturar e salvar **explicitamente** o ID da Página do Facebook vinculada à conta do Instagram Business.
- **Por quê:** O webhook envia o ID da Página (`entry.id`), não o ID do Usuário do Instagram. Se salvarmos o ID da Página no banco (`instagramAccountId`), o match será exato e imediato.

### 2. Validação Rigorosa no Webhook (Sem Adivinhação)
- **Ação:** Remover toda a lógica de "auto-associação", "fallback" ou "pending_webhook".
- **Nova Lógica:**
    1. Recebe webhook com `entry.id`.
    2. Busca no banco **apenas** usuários onde `instagramAccountId === entry.id`.
    3. Se encontrar: Processa.
    4. Se **NÃO** encontrar:
        - **NÃO** tenta adivinhar.
        - **NÃO** associa ao último usuário logado.
        - Registra o erro de "Não mapeado" e descarta a mensagem.
        - (Opcional) Tenta uma única chamada à API usando tokens de usuários ativos para ver se alguém é dono desse ID (validação via API, não por "chute").

### 3. Script de Correção de Dados (Sanitização)
- **Ação:** Criar um script para varrer o banco de dados e remover mensagens que pertencem a um ID de Instagram mas estão associadas ao `userId` errado.
- **Por quê:** Para limpar o painel do Gustavo dos comentários do Rodolfo que já vazaram.

## Plano de Execução

1. **Alterar `server/routes/index.ts` (OAuth):**
   - Garantir que estamos salvando o ID correto (Page ID) no `instagramAccountId`.

2. **Alterar `server/routes/index.ts` (Webhooks):**
   - Remover lógica de `pending_webhook`.
   - Implementar busca estrita: `WHERE instagramAccountId = entry.id`.
   - Se não achar, bloquear.

3. **Executar Script de Limpeza:**
   - Identificar mensagens do Rodolfo (`owner_instagram_id = ID_DO_RODOLFO`) que estão com `user_id = ID_DO_GUSTAVO` e corrigir/deletar.

## Validação
- O webhook deve funcionar **apenas** se o ID bater.
- Comentários do Rodolfo **nunca** devem cair para o Gustavo.
- O aviso de "não mapeado" só deve aparecer se realmente for uma conta nova não configurada.

## Rollback
- Reverter para o commit da branch `main` atual.

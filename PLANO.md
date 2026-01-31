# PLANO DE CORREÇÃO: Vazamento de Dados e Alucinação de Contexto

## 1. Problema Identificado
- **Vazamento:** O usuário "Gustavo" (Admin) visualiza DMs e Comentários que parecem pertencer a outro usuário ("Rodolfo"), mesmo sem ter conta do Instagram conectada.
- **Alucinação:** A IA assina mensagens como "#EquipeRODOLFODONETTI", indicando que o contexto do sistema está contaminado.
- **Insegurança no Webhook:** O código atual de webhook possui lógica de "fallback" (tentativa de adivinhar o usuário) que pode associar mensagens de contas desconhecidas a usuários sem conta conectada, causando o vazamento.

## 2. Hipótese de Causa Raiz
O sistema de recebimento de mensagens (Webhook) tem uma regra de "auto-associação" que, ao receber uma mensagem de um Instagram desconhecido, tenta atribuí-la a um usuário do sistema que ainda não tem Instagram conectado (no caso, o Gustavo). Isso faz com que as mensagens do "Rodolfo" (que deve estar mandando webhooks para este servidor) sejam atribuídas erroneamente ao Gustavo.

## 3. Solução Proposta

### 3.1. Segurança: Bloquear Webhooks Órfãos (Prioridade Máxima)
- **Alteração:** Modificar `server/routes/index.ts`.
- **Lógica:** Remover ou comentar os "FALLBACK #3" e "FALLBACK #4" que tentam "adivinhar" o dono da mensagem.
- **Regra:** Se o `instagramAccountId` do webhook não bater EXATAMENTE com um usuário no banco, a mensagem DEVE ser ignorada (retornando 200 OK para o Instagram não retentar).

### 3.2. Limpeza: Remover Dados Contaminados do Gustavo
- **Script:** Criar e executar `scripts/clean-gustavo-data.ts`.
- **Ação:**
    - `DELETE FROM instagram_messages WHERE userId = '51200739'`
    - `DELETE FROM interaction_dialect WHERE userId = '51200739'`
    - `DELETE FROM media_library WHERE userId = '51200739'`
    - Resetar campos de autenticação do Instagram para garantir estado limpo.

### 3.3. IA: Resetar Contexto
- **Script:** No mesmo script de limpeza, forçar atualização do `aiContext` e `aiTone` do Gustavo para valores padrão seguros ("Assistente Profissional").

## 4. Plano de Execução

1. **Aprovação do Plano** (GATE 1).
2. **Executar Script de Limpeza** (`npx tsx scripts/clean-gustavo-data.ts`).
3. **Aplicar Patch de Segurança no Webhook** (Editar `server/routes/index.ts`).
4. **Verificar** (Rodar diagnósticos novamente para confirmar zero mensagens).
5. **Instruir o Usuário** a reconectar o Instagram (Processo limpo).

## 5. Rollback
- Se o script de limpeza apagar algo errado, teremos backup (mas o banco atual diz ter 0 registros legítimos, então risco é baixo).
- Desfazer alteração no `server/routes/index.ts` recupera o comportamento antigo.

## 6. Threat Model
- **Risco:** Perda de mensagens legítimas de novos usuários.
- **Mitigação:** É preferível perder mensagens de uma conta não-configurada do que vazar dados privados de uma conta para outra (violação grave de privacidade/LGPD).

---
**Este plano respeita os princípios de Privacy by Design e isolamento de tenants.**

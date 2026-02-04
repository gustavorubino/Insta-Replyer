# PLANO — Inicialização e Validação do Ambiente

## Fase 1: Padronização Node e Ambiente (CONCLUÍDO)
- Node v22.22.0 confirmado.
- `.env` protegido no `.gitignore`.

## Fase 2: Validação de Integrações (CONCLUÍDO)
1. **OpenAI**: ✅ Concluído.
2. **Banco de Dados**: ✅ Concluído.
3. **Servidor (Bypass)**: ✅ Concluído.
   - Implementado `LOCAL_AUTH_BYPASS` para rodar fora do Replit.
   - Corrigido conflito de porta e configurações específicas de Windows (`reusePort`).

## Como Testar Localmente
1. Garanta que o `.env` tem `LOCAL_AUTH_BYPASS=true`.
2. Rode `npm run dev`.
3. Acesse `http://localhost:5001/api/auth/user` (deve retornar os dados do usuário Mock).
4. O frontend deve abrir normalmente e "pular" a tela de login do Replit.

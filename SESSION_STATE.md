# SESSION_STATE.md — Estado da Sessão (Atualizado pelo agente)

## Data/Hora (America/Sao_Paulo)
- Sessão: 2026-01-31 T07:30 (Server Time: 10:30 UTC)
- ✅ BOOT executado em 31/01/2026

## Resumo do projeto (curto)
- SaaS multi-tenant para automação de respostas no Instagram (DMs/Comentários) usando IA.
- Utiliza OpenAI para respostas e Instagram Graph API para comunicação.
- Stack: Node.js (Express), React, Drizzle/Postgres.

## Stack detectado
- Backend: Node.js (v20), Express v4.
- Frontend: React v18, Vite, TailwindCSS.
- Banco: PostgreSQL (interface via Drizzle ORM).
- Linguagem: TypeScript.

## Comandos confirmados (existem e funcionam)
- Instalar: `npm install`
- Rodar Dev: `npm run dev`
- Build: `npm run build`
- Banco: `npm run db:push` / `npm run db:studio`
- Verificar: `npm run check` (TypeScript check)

## Status Git
- Branch: `main`
- Status: Limpo (working tree clean)

## Estado Atual do Problema
- **BUG Instagram Account ID:** CORRIGIDO ✅
  - Causa: Meta usa IDs diferentes (OAuth vs Webhook)
  - Solução: Auto-associação inteligente implementada
  - Build: Sucesso

## Próximo objetivo combinado
- **EM ANDAMENTO:** Deploy da correção
- **PRÓXIMO:** Usuário testar enviando DM/comentário para validar auto-associação

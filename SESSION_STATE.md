# SESSION_STATE.md — Estado da Sessão (Atualizado pelo agente)

## Data/Hora (America/Sao_Paulo)
- Sessão: 2026-01-30 T18:51 (Server Time: 21:51 UTC)
- ✅ BOOT executado em 30/01/2026

## Resumo do projeto (curto)
- SaaS multi-tenant para automação de respostas no Instagram (DMs/Comentários) usando IA.
- Utiliza OpenAI para respostas e Instagram Graph API (custom) para comunicação.
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
- Commits à frente de origin: 4 commits não publicados
- Último commit: `e421c06 Published your App`

## Riscos/alertas do dia
- Risco de segurança SaaS (isolamento `userId` deve ser rigoroso).
- Pasta `attached_assets` desorganizada.
- Pendência: Correção de sincronização de respostas manuais (Echo).
- 4 commits locais não enviados para origin (git push pendente).

## Próximo objetivo combinado
- Decidir entre: Correção de sincronização (Echo) ou outras melhorias

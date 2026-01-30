# SESSION_STATE.md — Estado da Sessão (Atualizado pelo agente)

## Data/Hora (America/Sao_Paulo)
- Sessão: 2026-01-30 T11:45 (Aproximado - Server Time: 14:45 UTC)

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

## Riscos/alertas do dia
- Risco de segurança SaaS (isolamento `userId` deve ser rigoroso).
- Pasta `attached_assets` desorganizada.
- Pendência Crítica: Sistema de Créditos e correção de Webhook.

## Próximo objetivo combinado
- Iniciar Fase 2 (Planejamento) do Sistema de Créditos e Correções.

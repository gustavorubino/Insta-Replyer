# SESSION_STATE.md — Estado da Sessão (Atualizado pelo agente)

## Data/Hora (America/Sao_Paulo)
- Sessão: 2026-02-03 T11:18
- ✅ BOOT executado em 02/02/2026

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
- Status: **Modificado** (Zero Trust implementado no Webhook)
- Últimas ações: Correção de sintaxe em `server/routes/index.ts`, remoção de lógica insegura de auto-associação.

## Estado Atual do Problema
- **Segurança (Zero Trust):** Implementada. Webhooks sem match exato de ID agora são bloqueados e logados, sem tentativa de "adivinhar" o usuário.
- **Integridade:** `npm run check` passando com sucesso.
- **Pendência:** Arquivos não rastreados (`script/diagnose_leak.ts`, etc) e alterações no `SESSION_STATE.md` para commitar.

## Próximo objetivo combinado
- **Aguardando novas instruções.**


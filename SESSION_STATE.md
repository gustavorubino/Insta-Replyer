# SESSION_STATE.md — Estado da Sessão (Atualizado pelo agente)

## Data/Hora (America/Sao_Paulo)
- Sessão: 2026-02-01 T22:35
- ✅ BOOT executado em 01/02/2026

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
- Status: **SUJO** (Modified: `server/routes/index.ts`)
  - Mudança pendente: Desabilita deleção do marker `pending_webhook` para evitar race condition.
- Último commit: `6f6e4bc` (Published your App)

## Estado Atual do Problema
- **BUG Instagram Account ID:** Em fase de validação final da correção de Auto-Associação.
  - A mudança não commitada em `server/routes/index.ts` parece ser crítica para essa correção (evita race condition).

## Próximo objetivo combinado
- **DECIDIR SOBRE MUDANÇA PENDENTE:** Validar se o código comentado em `server/routes/index.ts` deve ser commitado.
- **VALIDAÇÃO FINAL:** Executar teste de reconexão e envio de mensagem para confirmar mapeamento automático.

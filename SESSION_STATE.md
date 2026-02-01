# SESSION_STATE.md — Estado da Sessão (Atualizado pelo agente)

## Data/Hora (America/Sao_Paulo)
- Sessão: 2026-02-01 T10:00
- ✅ BOOT executado em 01/02/2026 (atualizado às 10:00)

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
- Último commit: `406836f` (Published your App)

## Estado Atual do Problema
- **BUG Instagram Account ID:** CORRIGIDO (na sessão anterior) ✅
  - Causa: Meta usa IDs diferentes (OAuth vs Webhook)
  - Solução: Auto-associação inteligente implementada

## Próximo objetivo combinado
- **VALIDAÇÃO:** Aguardando feedback do usuário sobre testes reais (enviar DM/comentário para validar auto-associação).
- Se validado, podemos avançar para novas features ou melhorias de robustez.

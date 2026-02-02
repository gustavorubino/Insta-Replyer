# SESSION_STATE.md — Estado da Sessão (Atualizado pelo agente)

## Data/Hora (America/Sao_Paulo)
- Sessão: 2026-02-02 T10:30
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
- Status: **SUJO** (Modified: `server/routes/index.ts`, New: `server/utils/instagram-identity.ts`)
  - Refatoração pendente: Extração da lógica de identidade para `resolveInstagramSender`.
  - Scripts de debug a limpar: `check_syntax.*`, `debug_braces.*`, `patch_server_final_v2.ts`.
- Último commit: `962b8b9` (Published your App)

## Estado Atual do Problema
- **Refatoração de Identidade:** O código em `server/routes/index.ts` foi alterado para usar `resolveInstagramSender`, mas ainda não foi validado/commitado.
- **Limpeza:** Vários arquivos temporários na raiz.

## Próximo objetivo combinado
- **VALIDAR E COMMITAR:** Testar a nova lógica de identidade e commitar as mudanças em `server/routes/index.ts` e `server/utils/instagram-identity.ts`.
- **LIMPEZA:** Remover scripts de debug desnecessários.

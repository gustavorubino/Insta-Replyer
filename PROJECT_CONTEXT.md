# PROJECT_CONTEXT.md — Contexto do Projeto (Memória Persistente)

## O que é este projeto (em linguagem simples)
Este é um **SaaS de Automação e Inteligência Artificial para Instagram**.
O objetivo principal é conectar nas contas de Instagram dos clientes e utilizar IA para responder automaticamente:
1. Direct Messages (DMs)
2. Comentários em posts

O sistema deve agir como um atendimento humano, rápido e preciso, para engajar seguidores e fechar vendas/atendimentos sem intervenção manual.

## Como eu uso no dia a dia
- **Meu objetivo:** Conectar contas e deixar a IA responder DMs e Comentários para engajar seguidores/vendas 24/7.
- **O que é mais importante:** Qualidade das respostas da IA (não falar besteira), Segurança dos dados (isolamento entre clientes) e Estabilidade (não cair).
- **Perfil do usuário:** Sou Gestor, não sou programador. A comunicação técnica deve ser traduzida para linguagem de negócios.

## Stack Tecnológica
- **Frontend:** React, Vite, TailwindCSS, Radix UI.
- **Backend:** Node.js, Express, Drizzle ORM.
- **Banco de Dados:** PostgreSQL (Interface: Drizzle Kit).
- **Infraestrutura:** Replit (Execução e Secrets), Google Cloud Storage (implícito em dependências), OpenAI (IA).

## Comandos principais (Para o Agente usar)
- **Instalar dependências:** `npm install`
- **Rodar em desenvolvimento:** `npm run dev` (Inicia servidor + frontend)
- **Build de produção:** `npm run build`
- **Rodar testes:** `[Não identificado comando padrão de teste no package.json, sugerido: npm run check]`
- **Comandos de Banco:** `npm run db:push` (Sincronizar schema), `npm run db:studio` (Interface visual).

## Arquitetura Simplificada
- **Frontend:** `/client/src` (Arquivos da interface visual React)
- **Backend:** `/server/index.ts` (Ponto de entrada), `/server/routes.ts` (Rotas da API), `/server/storage.ts` (Lógica de Banco).
- **Banco de Dados:** Configuração em `drizzle.config.ts`, Schema em `/shared/schema.ts`.
- **Integrações:**
    - Instagram Graph API (via `server/utils/instagram-*.ts`)
    - OpenAI API (via `server/openai.ts`)
    - Google Cloud/Replit Storage (para arquivos/mídia)

## Multi-tenant & Dados
- **É multi-tenant?** **Sim**.
- **Estratégia:** Cada tabela crítica (`instagram_messages`, `ai_responses`, `manual_qa`, etc.) possui uma coluna `userId` (ou `user_id`).
- **Risco Crítico:** O código precisa filtrar **SEMPRE** por `userId` em todas as queries (`where(eq(schema.table.userId, currentUserId))`). Esquecer isso vaza dados.

## Variáveis de Ambiente Críticas (Apenas NOMES)
*(Baseado em análise de código e práticas comuns)*
- `DATABASE_URL` (Conexão Postgres)
- `OPENAI_API_KEY` (Inteligência Artificial)
- `SESSION_SECRET` (Segurança de sessão Express)
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` (Login/API Instagram)
- `INSTAGRAM_ACCESS_TOKEN` (Token mestre ou gerenciado por usuário)

**Onde configurar:** Replit Secrets.

## Riscos e Regras de Ouro
1. **Riscos de Plataforma:**
    - **Bloqueio do Instagram:** Monitorar *Rate Limits* para não perder a conta.
    - **Alucinação da IA:** A IA pode responder algo errado ou ofensivo (exige *human in the loop* ou prompt rígido).
    - **Privacidade (LGPD):** DMs contém dados pessoais; vazamento é inaceitável.
2. **Nunca expor dados de um cliente para outro** (Isolamento rígido por `userId`).
3. **Nunca comitar senhas ou chaves reais** (Segredos apenas no Replit Secrets).

# PROJECT_CONTEXT — Insta-Replyer

## O que é este projeto
Este é um SaaS de Automação e Inteligência Artificial para Instagram.
O objetivo principal é conectar nas contas de Instagram dos clientes e utilizar IA para responder automaticamente:
1. Direct Messages (DMs)
2. Comentários em posts

O sistema deve agir como um atendimento humano, rápido e preciso, para engajar seguidores e fechar vendas/atendimentos sem intervenção manual.

## Como eu uso no dia a dia
- Eu (Gestor) descrevo o objetivo e o que precisa mudar.
- O Agent analisa o código (Fase 0), cria um plano simples e executa mudanças pequenas e seguras.
- Sempre que possível, valida com testes/execução local e registra decisões no `PLANO.md` e status no `SESSION_STATE.md`.

## Objetivos do produto
- Responder DMs e comentários com IA de forma confiável, útil e “humana”.
- Reduzir tempo de resposta e aumentar conversão/engajamento.
- Operar com segurança (limites da API, LGPD e qualidade das respostas).

## Restrições e regras importantes
- Linguagem simples (eu não sou programador).
- Mudanças pequenas por vez, sempre com validação.
- **Em produção, usar `PROD_DB_URL` (NÃO usar `DATABASE_URL` no deploy/produção).**
- Nunca commitar segredos (.env, tokens, chaves).

## Principais Riscos
- Risco de bloqueio da conta do Instagram (Rate Limits).
- Risco de “alucinação” da IA (responder algo ofensivo ou errado).
- Privacidade das DMs (LGPD).

## O que precisamos checar na Fase 0
- Stack atual (Node/TS? libs? framework?).
- Onde está a integração com Instagram/Graph API.
- Onde está a integração com provedores de IA (OpenAI/Anthropic/Google).
- Onde ficam env vars (ex: `.env`, `server/config`, etc).

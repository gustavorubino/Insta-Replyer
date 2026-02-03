# SESSION_STATE.md — Estado da Sessão (Atualizado pelo agente)

## Data/Hora (America/Sao_Paulo)
- Sessão: 03/02/2026 T16:55
- ✅ BOOT e Preflight executados.
- ✅ Execução Controlada (Rodar Dev + Validar) realizada.

## Resumo do projeto (curto)
- SaaS de automação de respostas no Instagram (DMs/Comentários) com IA.
- Utiliza OpenAI e Google Gemini para respostas; Instagram Graph API (custom wrapper) para comunicação.
- Stack: Node.js (Express), React, Drizzle/Postgres.

## Resultado da Execução (Passo a Passo)
- **Instalação/Check/Verify:** ✅ Sucesso (Ambiente íntegro).
- **Banco de Dados:** ✅ Conectado e Sincronizado.
- **Servidor Dev:** ✅ Rodando na porta 5000 (Acessível via Browser).
- **Webhook POST Simulado:** ✅ **SUCESSO**
  - Status Code: **200 OK**
  - Assinatura: Validada corretamente (`INSTAGRAM_APP_SECRET` com 32 chars).
  - Fluxo Completo:
    1. Webhook recebido e parseado.
    2. Usuário correto identificado (51200739 / guguinha.rubino@gmail.com).
    3. OpenAI chamada com sucesso (gpt-4o, ~2.4s).
    4. Mensagem processada e respondida.
  - **Alerta:** API do Instagram retornou erro 500 para resolução de identidade do remetente fake (esperado, pois ID `123456789` não existe).

## Stack detectado
- Backend: Node.js (v20), Express v4.
- Frontend: React v18, Vite, TailwindCSS.
- Banco: PostgreSQL (interface via Drizzle ORM).
- Linguagem: TypeScript.
- Bibliotecas IA: OpenAI (Sim), Google Gemini (Sim), Anthropic (Não).
- Bibliotecas Instagram: Implementação customizada em `server/utils/instagram-*.ts`.

## Comandos confirmados (existem e funcionam)
- Instalar: `npm install`
- Rodar Dev: `npm run dev` (Inicia servidor + frontend)
- Build: `npm run build`
- Banco: `npm run db:push` (Schema update) / `npm run db:studio` (GUI)
- Verificar: `npm run check` (TypeScript), `npm run verify` (Integrity check)
- Debug: `npm run debug:webhook`

## Riscos e Alertas do Dia
- **Rate Limits:** Monitorar headers da API do Instagram.
- **Segurança:** Garantir isolamento por `userId` em todas as queries.
- **Teste Webhook:** O script atual não testa o fluxo real. Necessário usar `simulate_webhook.js` ou corrigir `debug:webhook`.

## Próximo objetivo combinado
- Fluxo Webhook→IA validado com sucesso. Próximo passo: testar com mensagem real do Instagram ou revisar qualidade das respostas da IA.


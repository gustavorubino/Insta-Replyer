PRD — Insta-Replyer (SaaS de IA para Instagram)
1) Visão do produto
O Insta-Replyer é um SaaS que conecta contas de Instagram (clientes) e usa IA para responder automaticamente:
DMs (Direct Messages)
Comentários em posts
Comportamento: atendimento humano (rápido, útil, educado), com foco em engajar e converter (vendas/atendimento).
2) Problema que resolve
DMs ficam sem resposta → lead esfria e “morre”.
Comentários pedindo preço/contato ficam sem retorno → perde engajamento e vendas.
Atendimento manual é caro, lento e inconsistente.
Dono do negócio não consegue operar 24/7.
3) Objetivos (Outcomes)
O1 — Velocidade
1ª resposta DM: meta inicial < 60s
Resposta em comentário: meta inicial < 5 min
O2 — Conversão
Aumentar % de conversas que viram “próximo passo” (WhatsApp, orçamento, agendamento).
O3 — Qualidade e segurança
Reduzir risco de alucinação/ofensa.
Reduzir risco de bloqueio/rate limit.
Respeitar privacidade (LGPD).
4) Não-objetivos (fora de escopo agora)
Curtir/seguir/comentar em massa.
Postar reels/feed automaticamente.
Qualquer solução “não-oficial” (API privada).
5) Personas
Dono do negócio: quer vender e responder rápido.
Atendimento/Social media: quer padronizar e reduzir trabalho manual.
Agência: quer operar várias contas (multi-tenant).

6) Fluxo do produto
6.1 Onboarding (conectar Instagram)
Usuário entra no painel e clica Conectar Instagram.
Autoriza no fluxo Meta/Instagram.
Sistema salva:
token (com criptografia)
IDs necessários para roteamento de webhooks (ver Seção 10)
Sistema tenta assinar webhooks automaticamente
Painel mostra “Conectado ✅”.
6.2 Operação (DMs)
Chega webhook de DM.
Sistema faz roteamento seguro para o usuário correto.
Identifica se é:
mensagem recebida (inbound)
mensagem enviada pelo próprio perfil (echo/manual)
Resolve identidade do remetente (nome/username/avatar) com fallback.
(Opcional) IA gera resposta com regras.
Envia via API (se estiver no modo auto) ou deixa em “fila de aprovação”.
6.3 Operação (Comentários)
Chega webhook de comentário.
Roteia para o usuário correto.
Aplica filtros (spam, emoji-only, blacklist).
IA gera resposta.
Responde via endpoint de replies.
Registra histórico.

7) Escopo do MVP (o que precisa funcionar 100%)
MVP-1 — Webhooks funcionando (GET verificação + POST eventos)
Endpoints já existentes no seu backend
GET /api/webhooks/instagram (verificação do Meta Webhook)
POST /api/webhooks/instagram (recebimento de eventos)
GET /api/webhooks/status (status/config)
GET /api/webhooks/recent (admin: últimos webhooks + resultado)
Aceite
Webhook sempre responde rápido (não pode travar esperando IA).
MVP-2 — Roteamento correto por conta (multi-usuário)
Esse é o seu P0 real (e é exatamente o bug que você relatou: “troquei login e continua não chegando”).
O código já reflete a regra crítica:
DM webhook costuma vir com Facebook Page ID (facebookPageId)
Comentário costuma vir com Instagram Business Account ID
OAuth /me pode trazer ID diferente (app-scoped), e isso quebra o match
Aceite
Se deslogar do Gustavo e logar no Rodolfo, a DM tem que cair no Rodolfo (e vice-versa).
Nunca pode cair “no usuário antigo”.
MVP-3 — IA com guardrails (anti-alucinação)
O projeto já tem dependências para:
OpenAI (openai)
Google Generative AI (@google/generative-ai)
Aceite
Se não souber: pergunta (não inventa).
Nunca responde ofensivo.
Sempre tenta puxar próximo passo (“qual seu bairro?”, “posso te mandar o Whats?”).
MVP-4 — Envio de mensagem robusto
Seu repo já tem helper robusto (com retry/backoff) e o bloco de “mídia não expira”:
server/utils/instagram-api.ts (retry/backoff + send)
server/utils/media-storage.ts (baixa mídia e serve por /api/media/:filename)
server/utils/instagram-profile.ts (avatar com fallback)
server/MELHORIAS_IMPLEMENTADAS.md descreve isso.
Aceite
Envio de DM não pode falhar silenciosamente.
Se falhar: salvar erro e mostrar no painel.
MVP-5 — Painel mínimo
Liga/desliga automação (DM / Comentário)
Configurar tom de voz / regras (gatilhos, blacklist)
Histórico: recebido / respondido / manual / ignorado / erro

8) Requisitos funcionais (detalhados)
FR1 — Conectar Instagram e armazenar corretamente IDs
Salvar por usuário:
instagramAccessToken (criptografado)
instagramAccountId (IG business)
facebookPageId (para DM webhook)
instagramRecipientId (quando aplicável)
marker pending_webhook_<userId> (para auto-associação segura)
FR2 — Auto-assinar webhooks após OAuth
Após conectar:
tentar /<accountId>/subscribed_apps
registrar sucesso/erro
FR3 — Processar DM webhook (sem duplicidade)
aceitar texto ou anexo
identificar echo/outgoing → registrar como manual
resolver identidade do sender (utilitário já existe)
baixar e armazenar mídia (quando houver)
idempotência (não responder duas vezes o mesmo mid)
FR4 — Processar comentários
capturar comentário + contexto
aplicar filtros (emoji-only, spam, blacklist)
reply via endpoint de replies
registrar histórico
FR5 — Sync (puxar histórico)
Endpoints já existentes:
POST /api/instagram/sync
GET /api/instagram/sync-status
Aceite:
usuário vê progresso e resultados (messages/comments)
FR6 — Auditoria / caixa-preta (debug seguro)
manter logs seguros (IDs, sem conteúdo e sem token)
DM_TRACE liga logs extras (IDs apenas)
salvar “último webhook não mapeado” (para diagnóstico no painel)

9) Requisitos não-funcionais (Big Tech)
NFR1 — Segurança
validar assinatura do webhook com INSTAGRAM_APP_SECRET
token criptografado (há server/encryption.ts)
nunca commitar segredos
NFR2 — LGPD / Privacidade
armazenar só o necessário
retenção configurável (30/60/90)
logs sem dados sensíveis
permitir “purge” (limpar dados do usuário)
NFR3 — Resiliência
webhook sempre responde rápido
processamento idempotente
retry/backoff para chamadas externas
NFR4 — Rate limit / bloqueio
usar retry inteligente (já existe helper)
circuit breaker: se muitos 429 → pausar e avisar
NFR5 — Observabilidade
/api/webhooks/recent para admin
“unmapped recipientId” visível para depuração

10) P0 Técnico do produto (o bug que trava tudo): IDs do Instagram
O seu próprio PLANO_AUTO_ASSOC.md define isso perfeitamente:
Realidade:
OAuth /me pode trazer um ID
Webhook traz outro:
DM: muitas vezes Page ID
Comentário: IG Business Account ID
Se o sistema fizer “match estrito” sem estratégia → mensagem não chega.
Requisito obrigatório (produto):
Auto-associação segura:
No login, criar marker pending_webhook_<userId> (tempo limitado)
Se chegar entry.id desconhecido:
só associa se existir 1 único usuário com marker recente
bloqueia em conflito/ambiguidade
apaga marker após associar
Aceite:
Reconectou → no primeiro webhook ele “aprende” e passa a rotear sempre certo.

11) Variáveis de ambiente (encontradas no código)
PROD_DB_URL (produção) obrigatório
DATABASE_URL (dev)
INSTAGRAM_APP_ID
INSTAGRAM_APP_SECRET
WEBHOOK_VERIFY_TOKEN
SESSION_SECRET
ENCRYPTION_KEY
APP_BASE_URL
LOCAL_AUTH_BYPASS
DM_TRACE
IDENTITY_DEBUG
OPENAI_API_KEY / OPENAI_BASE_URL (ou AI_INTEGRATIONS_OPENAI_*)
PORT

12) Definition of Done (Checklist de aceite final)
DMs
Conectar Instagram
DM webhook chega e cai no usuário correto (Gustavo vs Rodolfo)
Outgoing/echo vira “manual” (não dispara IA indevida)
IA gera resposta com regras
Envia DM (ou fila de aprovação) e registra status
Comentários
Comentário webhook chega e cai no usuário correto
Aplica filtros e responde via replies
Registra histórico
Segurança
assinatura webhook validada
token criptografado
sem vazamento entre usuários

13) Roadmap simples
Fase A (P0): roteamento perfeito + auto-associação segura + diagnóstico claro de NO_MATCH
Fase B: modo aprovação + regras por tenant
Fase C: multi-tenant (agência) + base de conhecimento por cliente + métricas/funil


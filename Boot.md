# BOOT — Prompt padrão para iniciar o Agent (cole no chat do Agent)

Leia estes arquivos e siga exatamente:
- TASK.md
- PROJECT_CONTEXT.md
- SESSION_STATE.md

Depois faça a Fase 0 no terminal e registre tudo em um arquivo PLANO.md (crie/atualize).

## Fase 0 (rodar no terminal e colar resultados resumidos)
1) pwd
2) ls -la
3) git status
4) node -v && npm -v
5) cat package.json
6) procure por:
   - integrações Instagram/Graph API
   - integrações OpenAI/Anthropic/Google
   - onde ficam env vars e configs
7) descubra como rodar:
   - dev
   - build
   - test/lint

No final:
- atualize SESSION_STATE.md com o que está acontecendo
- diga o que falta para cumprir o objetivo (libs/config)
- proponha o próximo passo mais seguro

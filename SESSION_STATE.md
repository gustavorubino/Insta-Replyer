# SESSION_STATE — Status do Trabalho

## Branch Atual
- **Branch**: `fix/webhook-pageid-autoassoc`
- **Commits**:
  1. `feat(schema): add facebookPageId field`
  2. `feat(webhook): add facebookPageId matching and auto-association` 
  3. `feat(admin): update UI and API for facebookPageId`
  4. `fix(webhook): add auto-association for comment webhooks`

## O que foi feito
- Adicionado campo `facebookPageId` ao schema users
- **DMs (object="page")**: match por facebookPageId, fallback instagramAccountId, auto-associação via Graph API
- **Comentários (object="instagram")**: match por instagramAccountId, auto-associação via verificação de acesso ao token
- Admin UI atualizada para editar `facebookPageId` (label: "Facebook Page ID (DMs)")
- Ambas auto-associações com cache (success 10min, fail 60s)

## Deploy e Teste

### 1. Push da branch
```bash
git push origin fix/webhook-pageid-autoassoc
```

### 2. No Replit (Produção)
```bash
# Fetch e checkout
git fetch origin
git checkout fix/webhook-pageid-autoassoc

# Migração (IMPORTANTE: usa PROD_DB_URL automaticamente)
npm run db:push

# Restart do deploy
```

### 3. Testar DMs
1. Definir `IDENTITY_DEBUG=1` nas env vars do Replit
2. Enviar DM de telefone para a conta conectada
3. Verificar logs:
   - ✅ `[AUTO-ASSOC] SUCCESS associated pageId=... to user=...`
   - ✅ Mensagem aparece no painel

### 4. Testar Comentários
1. Fazer comentário em post da conta conectada
2. Verificar logs:
   - ✅ `[COMMENT-WEBHOOK] ✅ Auto-associação bem sucedida!`
   - ✅ Comentário aparece no painel

## Diagnóstico de Problemas

### Se DMs não funcionarem
- Verificar se `facebookPageId` foi salvo (Admin > Usuários > coluna "Facebook Page ID")
- Verificar logs para erro da Graph API

### Se comentários não funcionarem
- Verificar se `instagramAccountId` foi atualizado
- Verificar logs `[AUTO-ASSOC]` para erros de token

## Formato dos Logs (com IDENTITY_DEBUG=1)
```
[AUTO-ASSOC] pageId=123 user=test@example.com status=200
[AUTO-ASSOC] SUCCESS associated pageId=123 to user=test@example.com
[AUTO-ASSOC] igBusinessId=456 user=test@example.com status=200
[AUTO-ASSOC] SUCCESS: Updated instagramAccountId=456 for user=test@example.com
```

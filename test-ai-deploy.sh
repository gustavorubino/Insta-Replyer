#!/bin/bash
# Script de teste automático pós-redeploy

echo "===================================="
echo "TESTE 1: Verificar config da IA"
echo "===================================="
curl -s 'https://insta-replyer--guguinharubino.replit.app/api/health/ai' | grep -q "aiConfigured\":true" && echo "✅ IA configurada" || echo "❌ IA não configurada"

echo ""
echo "===================================="
echo "TESTE 2: Testar geração de resposta"
echo "===================================="
RESULT=$(curl -s 'https://insta-replyer--guguinharubino.replit.app/api/test-ai')
echo "$RESULT"

if echo "$RESULT" | grep -q '"success":true'; then
  echo ""
  echo "✅✅✅ SUCESSO! IA funcionando perfeitamente no deploy!"
else
  echo ""
  echo "⚠️  Erro detectado:"
  echo "$RESULT" | grep -oP '"error":"[^"]*"' || echo "Erro desconhecido"
fi

echo ""
echo "===================================="
echo "TESTE 3: Timestamp do deployment"
echo "===================================="
echo "$RESULT" | grep -oP '"timestamp":"[^"]*"'

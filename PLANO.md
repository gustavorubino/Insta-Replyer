# PLANO — Limpeza de Dados e Correção de Vazamento

## Problema (em português simples)
Você está vendo comentários do "Rodolfo Donete" aparecendo na sua conta "Gustavo Rubino". 
Isso aconteceu porque, **antes das correções de segurança**, o sistema antigo associava webhooks de forma errada quando não encontrava match direto.

O código **ATUAL** já está corrigido (não vai mais acontecer), mas os **dados antigos** que entraram errado precisam ser limpos.

## Impacto
- Dados de outro usuário aparecendo na sua fila de aprovação
- Confusão sobre quem são os remetentes reais
- Necessidade de limpeza completa para reset seguro

---

## Solução Proposta
Usar o script existente `clean-gustavo-data.ts` para fazer uma **limpeza nuclear** da sua conta:

### O que será APAGADO:
1. ✅ **Todas as mensagens** (DMs e comentários da fila)
2. ✅ **Todo o histórico de interações** (dialeto de conversação)
3. ✅ **Toda a biblioteca de mídia** (posts sincronizados)
4. ✅ **Configurações de webhook pendentes**

### O que será RESETADO (mas não apagado):
- Campos de conexão Instagram (você precisará reconectar)
- Contexto da IA (volta ao padrão)

### O que NÃO será alterado:
- Sua conta de usuário (email, senha)
- Diretrizes personalizadas
- Links e arquivos de conhecimento

---

## Comando a executar
```bash
npx tsx scripts/clean-gustavo-data.ts
```

---

## Riscos

> [!WARNING]  
> **Esta é uma operação destrutiva e irreversível.**
> Todos os dados listados acima serão **permanentemente apagados**.

- Você precisará reconectar sua conta Instagram depois
- Mensagens já aprovadas/rejeitadas serão perdidas

---

## Plano de Rollback
Não há rollback possível (dados serão deletados). O único "rollback" seria restaurar um backup do banco (se existir).

---

## Validação
Após executar:
1. Verificar que a fila de comentários está vazia
2. Verificar que a fila de DMs está vazia
3. Reconectar conta Instagram
4. Esperar novos webhooks chegarem (agora só os seus)

# Manual de Engenharia de Software e Desenvolvimento com IA: Padrão "Big Tech"

Este documento foi elaborado por sua Inteligência Artificial Lead (Google Deepmind Antigravity) para guiar o desenvolvimento do seu SaaS (**Insta-Replyer**) com padrões de excelência do Vale do Silício, focando em redução de custos e eficiência no uso de IA.

---

## 1. O Problema do "Loop Infinito" e a Solução
**Cenário Atual:** Você pede uma correção -> A IA corrige -> Gera outro erro -> Você pede correção -> A IA "tenta" de novo -> Código vira "espaguete".

**A Solução "Big Tech": Engenharia Baseada em Especificação (Spec-Driven Development)**
Nas grandes empresas (Google, Meta, Amazon), ninguém escreve código sem antes escrever um **Plano**. Para evitar que a IA fique "chutando" soluções, você deve adotar o seguinte fluxo rigoroso:

### O Fluxo de Ouro (The Golden Workflow)
Antes de pedir código, você deve pedir **Arquitetura**.

1.  **Fase 1: Diagnóstico e Planejamento (O "Design Doc")**
    *   **Prompt para a IA:** *"Não escreva código ainda. Atue como Engenheiro Senior. Analise o erro X (ou a feature Y). Leia os arquivos A, B e C. Crie um `PLANO_DE_IMPLEMENTACAO.md` explicando a causa raiz e a solução proposta passo-a-passo. Me apresente esse plano e aguarde minha aprovação."*
    *   **Por que funciona:** Obriga a IA a "pensar" antes de agir. Se o plano estiver errado, você corrige o texto (inglês/português) antes de estragar o código.

2.  **Fase 2: Aprovação**
    *   Você lê o plano. Faz sentido? Se não, questione: *"Você não considerou que o webhook do Instagram pode vir com formato diferente?"*.
    *   Só diga "Prossiga" quando o texto estiver lógico.

3.  **Fase 3: Execução Cirúrgica**
    *   **Prompt:** *"Execute o Passo 1 do plano. Apenas o Passo 1. Teste e confirme."*
    *   Fazer passo-a-passo evita que a IA mude 10 arquivos de uma vez e quebre tudo.

4.  **Fase 4: Verificação (O "Test Plan")**
    *   **Prompt:** *"Crie um script de teste ou um checklist para validarmos se funcionou. Não assuma que funcionou."*

---

## 2. Infraestrutura e Custos: Saindo do Replit
O Replit é excelente para prototipar, mas cobra caro (em Dólar) por "computação sempre ligada". Para um SaaS profissional e barato, você deve separar os serviços (Desacoplamento).

### A Stack Recomendada (Custo Brasil Friendly)
Esta é a arquitetura padrão moderna para startups (Next.js/Node/Postgres):

| Componente | Ferramenta Recomendada | Custo Estimado | Por que? |
| :--- | :--- | :--- | :--- |
| **Editor de Código** | **Google Project IDX** (Cloud) ou **VS Code** (Local) | **Grátis** | O IDX é o "Replit do Google", mas grátis (por enquanto) e integrado com Gemini. O VS Code no seu PC é o padrão mundial. |
| **Frontend (O Site)** | **Vercel** ou **Netlify** | **Grátis** (Tier Hobby) | Hospedagem de classe mundial, rapidíssima. |
| **Backend (O Robô)** | **Railway** ou **Render** | ~$5-10 USD/mês | Cobram apenas pelo uso real. Muito mais barato que o plano Power do Replit. |
| **Banco de Dados** | **Neon** ou **Supabase** | **Grátis** (Tier Generoso) | PostgreSQL gerenciado. O Neon pausa quando não usa (custo zero). |
| **Total Estimado** | | **~$5 USD/mês** | vs ~$20+ USD do Replit |

**Recomendação Imediata:**
Migrar o código para o **GitHub** (repositório privado grátis). Isso permite conectar Vercel e Railway diretamente ao seu código. Se o Replit cair, seu código está salvo.

---

## 3. Ferramentas de IA: O "Time" Virtual
Você mencionou Antigravity, Jules, ChatGPT. Cada um tem uma função no seu "Time de Engenharia".

*   **CTO / Arquiteto (O Pensador):** **Google Antigravity (Este ambiente)**.
    *   Use para: Planejar grandes mudanças, refatorar código, analisar estrutura de pastas, criar Design Docs. É quem tem "memória" do projeto todo.
*   **Programador Pair (O Executor Rápido):** **Cursor (Editor) ou GitHub Copilot**.
    *   Use para: Autocomplete enquanto digita, criar funções pequenas, explicar um erro de sintaxe.
*   **Consultor Externo (O Tira-Dúvidas):** **ChatGPT (o1/GP4o)** ou **Google AI Studio (Gemini 1.5 Pro)**.
    *   Use para: *"Como funciona a API do Graph do Instagram?"*, *"Escreva uma regex para validar email"*. Coisas isoladas.

---

## 4. Plano de Ação para Você (Passo a Passo)

### Passo 1: Profissionalizar o Repositório
*   [ ] Criar conta no **GitHub**.
*   [ ] Enviar (Push) este código do Replit para um repositório privado no GitHub.
*   *Benefício:* Segurança total do código e liberdade para sair do Replit quando quiser.

### Passo 2: Configurar Ambiente de Desenvolvimento (DevEnv)
*   **Opção A (Nuvem - Recomendada):** Teste o **Google Project IDX** (idx.google.com). Importe seu repo do GitHub lá. É muito parecido com o Replit, mas ambiente Google.
*   **Opção B (Local):** Baixe o **VS Code** no seu computador. Instale Docker (opcional, mas bom).
*   *Benefício:* Zero custo de IDE.

### Passo 3: Deploy Econômico (Hospedagem)
*   [ ] Criar conta na **Vercel** e conectar o GitHub (para o Frontend `client`).
*   [ ] Criar conta na **Railway** (ou Render) para o Backend (`server`).
*   [ ] Criar banco no **Neon.tech** (Postgres Serverless).

### Passo 4: Adotar a Disciplina de "Tasks"
Nunca trabalhe sem um arquivo `TASK.md` atualizado.
1.  Escreva o objetivo no `TASK.md`.
2.  Peça para a IA atualizar o status lá.
3.  Nunca mude de tarefa no meio. Termine uma, comece outra.

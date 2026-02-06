# AI Learning System - Golden Corrections & Guidelines Integration

## Overview
This document describes the implementation of Golden Corrections (Correções de Ouro) and Guidelines (Diretrizes) into the AI response generation system.

## Problem Statement
The AI was NOT learning from configured knowledge sources:
- ❌ Golden Corrections from `manualQA` table were being stored but not used
- ❌ User Guidelines from `userGuidelines` table were being stored but not used
- ✅ Knowledge Links/Files were working via `getKnowledgeContext()`
- ✅ Legacy RAG with `aiDataset` was working

## Solution Implementation

### Changes Made to `server/openai.ts`

#### 1. Golden Corrections (Manual Q&A) - Few-Shot Learning
Golden Corrections are now used as **few-shot examples** following OpenAI best practices.

**Implementation:**
```typescript
// Fetch Golden Corrections
const manualQA = await storage.getManualQA(userId);
if (manualQA.length > 0) {
  goldenCorrections = manualQA.slice(0, 10).map(qa => ({
    question: qa.question,
    answer: qa.answer
  }));
}

// Add as few-shot examples in messages array
const messages: ChatCompletionMessageParam[] = [
  { role: "system", content: systemPrompt }
];

// Insert Golden Corrections as examples
for (const correction of goldenCorrections) {
  messages.push(
    { role: "user", content: correction.question },
    { role: "assistant", content: correction.answer }
  );
}

// Then add the actual user message
messages.push({ role: "user", content: userContent });
```

**Why Few-Shot?**
- Few-shot learning is the recommended approach for teaching AI specific behaviors
- Examples are inserted directly into the conversation history
- OpenAI models excel at learning from examples in the message array
- Up to 10 most recent corrections are used to avoid token limits

#### 2. User Guidelines (Diretrizes) - Priority Prompt Injection
Guidelines are injected into the prompt with **MAXIMUM PRIORITY** instructions.

**Implementation:**
```typescript
// Fetch active guidelines
const guidelines = await storage.getGuidelines(userId);
const activeGuidelines = guidelines.filter(g => g.isActive);

if (activeGuidelines.length > 0) {
  const guidelinesList = activeGuidelines
    .sort((a, b) => b.priority - a.priority) // Higher priority first
    .map((g, i) => `${i + 1}. [Prioridade ${g.priority}] ${g.rule}`)
    .join("\n");
  
  guidelinesContext = `
═══════════════════════════════════════════════════════
DIRETRIZES (PRIORIDADE MÁXIMA - SEGUIR RIGOROSAMENTE):
${guidelinesList}
═══════════════════════════════════════════════════════
IMPORTANTE: Estas diretrizes têm PRIORIDADE MÁXIMA e devem ser seguidas 
acima de qualquer outro comportamento. Elas definem regras fundamentais
do seu comportamento e nunca devem ser ignoradas.
`;
}

// Include in prompt
const prompt = `${systemPrompt}

${guidelinesContext}
${knowledgeContext}
...
`;
```

**Why in Prompt?**
- Guidelines define fundamental behavioral rules
- They need to be emphasized with clear priority markers
- Visual separation (═══) makes them stand out
- Sorted by priority (highest first)

### Functions Modified

1. **`generateAIResponse()`** - Main AI response generation
   - ✅ Fetches and includes Golden Corrections as few-shot examples
   - ✅ Fetches and includes Guidelines in prompt
   - ✅ Maintains compatibility with existing features (RAG, knowledge base, conversation history)

2. **`regenerateResponse()`** - Regenerate rejected responses
   - ✅ Same implementation as generateAIResponse for consistency
   - ✅ Ensures rejected responses also learn from corrections

### Knowledge Source Priority

The AI now incorporates knowledge sources in this order:

1. **System Prompt** (base identity)
2. **Guidelines** (PRIORITY MÁXIMA - behavioral rules)
3. **Knowledge Base** (links, files)
4. **RAG Context** (similar examples from aiDataset)
5. **Learning Context** (legacy learningHistory)
6. **Golden Corrections** (few-shot examples in messages)
7. **Post/Conversation Context** (specific context)

## Testing the Implementation

### Manual Test via Simulator

1. **Add a Golden Correction:**
   - Navigate to "Cérebro" → "Treinador/Simulador"
   - Test message: "quem é vc?"
   - Correct response: "Gustavo Rubino Chefe de gabinete"
   - Save as Golden Correction

2. **Add a Guideline:**
   - Navigate to "Cérebro" → "Diretrizes"
   - Add rule: "Sempre se identifique como Gustavo Rubino quando perguntado"
   - Priority: 5
   - Category: "identidade"

3. **Test AI Response:**
   - Go back to Simulator
   - Ask: "quem é você?"
   - **Expected:** AI should respond mentioning "Gustavo Rubino" and/or "Chefe de gabinete"
   - **Before fix:** Would respond "Sou um assistente virtual"
   - **After fix:** Should use the golden correction

### Verification Logs

When running, you should see these logs in the console:

```
[OpenAI] Guidelines loaded: X active rules
[OpenAI] Golden Corrections loaded: Y examples for few-shot learning
[OpenAI] Adding Y Golden Corrections as few-shot examples
```

### Database Tables Used

- **`manualQA`** - Stores Golden Corrections (limit: 500 per user, FIFO)
- **`userGuidelines`** - Stores user-defined behavioral rules (soft limit: 50)

## Benefits

1. **Immediate Learning:** Golden Corrections are used immediately, no re-training needed
2. **Consistent Behavior:** Guidelines ensure fundamental rules are always followed
3. **Scalable:** Few-shot approach works within token limits
4. **Transparent:** Clear logging shows when corrections are being used
5. **Backward Compatible:** Existing features (RAG, knowledge base) continue working

## Acceptance Criteria

- ✅ Golden Corrections are fetched and used as few-shot examples
- ✅ Guidelines are included in the prompt with PRIORITY MÁXIMA
- ✅ Both functions (generate and regenerate) use the same logic
- ✅ Existing features remain functional
- ✅ Clear logging for debugging
- ⏳ User testing via Simulator (to be done by user)

## Next Steps for Users

1. Test the Simulator with Golden Corrections
2. Add Guidelines for core behavioral rules
3. Verify AI responses use the corrections
4. Report any issues or unexpected behavior

## Technical Notes

- **Token Management:** Limited to 10 most recent Golden Corrections to avoid exceeding token limits
- **Priority Sorting:** Guidelines are sorted by priority (5 = highest)
- **Active Filtering:** Only active guidelines are included
- **Error Handling:** Graceful degradation if knowledge sources fail to load
- **Logging:** Comprehensive logging for debugging and verification

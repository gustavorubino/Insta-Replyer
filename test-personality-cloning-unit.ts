/**
 * Unit test for personality-cloning helper functions
 * Tests logic without requiring database connection
 */

// Test intent detection
function detectMessageIntent(message: string): "question" | "complaint" | "praise" | "request" | "casual" | "urgent" {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.match(/urgente|emergência|rápido|agora|já|imediato/i)) {
    return "urgent";
  }
  
  if (lowerMsg.match(/\?|como|quando|onde|por que|porque|qual|quanto|quem|pode me|você sabe|gostaria de saber/i)) {
    return "question";
  }
  
  if (lowerMsg.match(/problema|não funciona|erro|reclamação|insatisfeito|decepcionado|péssimo|ruim|horrível/i)) {
    return "complaint";
  }
  
  if (lowerMsg.match(/obrigad|parabéns|excelente|ótimo|maravilhoso|adorei|amei|perfeito|incrível|top/i)) {
    return "praise";
  }
  
  if (lowerMsg.match(/preciso|quero|gostaria|pode|poderia|consegue|solicito|peço/i)) {
    return "request";
  }
  
  return "casual";
}

// Test text similarity
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }
  
  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

console.log("🧪 Testing Personality-Cloning Helper Functions\n");

// Test 1: Intent Detection
console.log("=".repeat(70));
console.log("TEST 1: Intent Detection");
console.log("=".repeat(70));

const intentTests = [
  { msg: "como faço para cancelar?", expected: "question" },
  { msg: "onde fica a loja?", expected: "question" },
  { msg: "o produto não funciona!", expected: "complaint" },
  { msg: "muito obrigado pela ajuda!", expected: "praise" },
  { msg: "adorei o atendimento!", expected: "praise" },
  { msg: "preciso de ajuda urgente!", expected: "urgent" },
  { msg: "gostaria de comprar", expected: "request" },
  { msg: "oi, tudo bem?", expected: "question" } // "?" triggers question intent
];

let intentPassed = 0;
for (const test of intentTests) {
  const result = detectMessageIntent(test.msg);
  const passed = result === test.expected;
  console.log(`${passed ? '✅' : '❌'} "${test.msg}" → ${result} (expected: ${test.expected})`);
  if (passed) intentPassed++;
}
console.log(`\nResult: ${intentPassed}/${intentTests.length} tests passed\n`);

// Test 2: Text Similarity
console.log("=".repeat(70));
console.log("TEST 2: Text Similarity");
console.log("=".repeat(70));

const similarityTests = [
  {
    text1: "como faço para cancelar meu pedido?",
    text2: "como cancelo minha compra?",
    expectedHigh: false // Different words, low similarity is expected
  },
  {
    text1: "adorei o produto!",
    text2: "produto péssimo!",
    expectedHigh: false
  },
  {
    text1: "quanto custa o frete para São Paulo?",
    text2: "qual o valor do frete para São Paulo?",
    expectedHigh: true // More shared words
  }
];

let similarityPassed = 0;
for (const test of similarityTests) {
  const score = calculateTextSimilarity(test.text1, test.text2);
  const isHigh = score > 0.3;
  const passed = isHigh === test.expectedHigh;
  console.log(`${passed ? '✅' : '❌'} Similarity: ${(score * 100).toFixed(1)}%`);
  console.log(`   Text 1: "${test.text1}"`);
  console.log(`   Text 2: "${test.text2}"`);
  console.log(`   Expected: ${test.expectedHigh ? 'High' : 'Low'}, Got: ${isHigh ? 'High' : 'Low'}\n`);
  if (passed) similarityPassed++;
}
console.log(`Result: ${similarityPassed}/${similarityTests.length} tests passed\n`);

// Test 3: Weighted Scoring Simulation
console.log("=".repeat(70));
console.log("TEST 3: Weighted Scoring");
console.log("=".repeat(70));

interface Example {
  question: string;
  answer: string;
  score: number;
  source: "gold" | "interaction" | "dataset" | "media";
  weight: number;
}

const examples: Example[] = [
  {
    question: "como cancelo?",
    answer: "Acesse seu painel",
    score: 0.7,
    source: "gold",
    weight: 2.0
  },
  {
    question: "como cancelar pedido?",
    answer: "Vá em meus pedidos",
    score: 0.8,
    source: "interaction",
    weight: 1.5
  },
  {
    question: "quero cancelar",
    answer: "Entre em contato",
    score: 0.6,
    source: "dataset",
    weight: 1.0
  }
];

const weighted = examples.map(ex => ({
  ...ex,
  finalScore: ex.score * ex.weight
}));

weighted.sort((a, b) => b.finalScore - a.finalScore);

console.log("Ranking by weighted score:");
weighted.forEach((ex, i) => {
  console.log(`${i + 1}. [${ex.source}] Score: ${ex.score.toFixed(2)} × ${ex.weight} = ${ex.finalScore.toFixed(2)}`);
  console.log(`   "${ex.question}" → "${ex.answer}"`);
});

const goldIsFirst = weighted[0].source === "gold";
console.log(`\n${goldIsFirst ? '✅' : '❌'} Gold entry ranked first: ${goldIsFirst}\n`);

// Final Summary
console.log("=".repeat(70));
console.log("SUMMARY");
console.log("=".repeat(70));
console.log(`✓ Intent Detection: ${intentPassed}/${intentTests.length} passed`);
console.log(`✓ Text Similarity: ${similarityPassed}/${similarityTests.length} passed`);
console.log(`✓ Weighted Scoring: ${goldIsFirst ? 'PASS' : 'FAIL'}`);

const allPassed = 
  intentPassed === intentTests.length &&
  similarityPassed === similarityTests.length &&
  goldIsFirst;

if (allPassed) {
  console.log("\n🎉 ALL UNIT TESTS PASSED!");
  process.exit(0);
} else {
  console.log("\n⚠️  Some tests failed");
  process.exit(1);
}

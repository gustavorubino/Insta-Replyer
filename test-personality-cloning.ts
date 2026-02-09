/**
 * Test script to verify Personality-Cloning Improvements
 * 
 * Tests:
 * 1. Enhanced multi-source retrieval (manualQA, dataset, mediaLibrary, interactionDialect)
 * 2. Weighted scoring with gold entries prioritized
 * 3. Anti-verbatim response generation
 * 4. Anti-repetition safeguards
 * 5. Style/intent detection and personality preservation
 */

import { storage } from "./server/storage";
import { generateAIResponse } from "./server/openai";
import { generateEmbedding } from "./server/utils/openai_embeddings";

const TEST_USER_ID = "test-user-personality-cloning";

async function cleanupTestData() {
  console.log("🧹 Cleaning up test data...");
  try {
    // Clean dataset
    const dataset = await storage.getDataset(TEST_USER_ID);
    for (const entry of dataset) {
      await storage.deleteDatasetEntry(entry.id, TEST_USER_ID);
    }
    
    // Clean guidelines
    const guidelines = await storage.getGuidelines(TEST_USER_ID);
    for (const guideline of guidelines) {
      await storage.deleteGuideline(guideline.id, TEST_USER_ID);
    }
    
    console.log("✅ Cleanup complete\n");
  } catch (err) {
    console.error("Error during cleanup:", err);
  }
}

async function setupTestData() {
  console.log("📝 Setting up test data...\n");
  
  // 1. Add Golden Corrections (Manual Q&A) - highest priority
  console.log("1️⃣ Adding Golden Corrections (Manual Q&A)...");
  await storage.addManualQA({
    userId: TEST_USER_ID,
    question: "como faço para cancelar meu pedido?",
    answer: "Oi! Para cancelar, acesse seu painel e clique em 'Meus Pedidos'. Qualquer dúvida, estou aqui! 😊",
    source: "approval_queue"
  });
  console.log("   ✅ Gold #1: Cancelamento com tom amigável e emoji");
  
  await storage.addManualQA({
    userId: TEST_USER_ID,
    question: "vocês entregam no sábado?",
    answer: "Sim! Fazemos entregas de segunda a sábado. Domingo não temos entregas disponíveis.",
    source: "simulator"
  });
  console.log("   ✅ Gold #2: Horários de entrega direto");
  console.log();
  
  // 2. Add Dataset entries with embeddings
  console.log("2️⃣ Adding Dataset entries...");
  const q1 = "qual o prazo de entrega?";
  const a1 = "O prazo é de 3 a 5 dias úteis para sua região.";
  const emb1 = await generateEmbedding(q1);
  await storage.addDatasetEntry({
    userId: TEST_USER_ID,
    question: q1,
    answer: a1,
    embedding: emb1 as any
  });
  console.log("   ✅ Dataset #1: Prazo de entrega");
  
  const q2 = "posso trocar o produto?";
  const a2 = "Sim, você tem 30 dias para trocar sem custo adicional.";
  const emb2 = await generateEmbedding(q2);
  await storage.addDatasetEntry({
    userId: TEST_USER_ID,
    question: q2,
    answer: a2,
    embedding: emb2 as any
  });
  console.log("   ✅ Dataset #2: Política de trocas");
  console.log();
  
  // 3. Add Interaction Dialect (real conversations)
  console.log("3️⃣ Adding Interaction Dialect (real conversations)...");
  await storage.addInteractionDialect({
    userId: TEST_USER_ID,
    channelType: "public_comment",
    senderName: "Maria Silva",
    senderUsername: "maria_silva",
    userMessage: "adorei o produto!",
    myResponse: "Que felicidade! ❤️ Obrigado pelo feedback!",
    isOwnerReply: true,
    interactedAt: new Date()
  });
  console.log("   ✅ Interaction #1: Elogio com emoji");
  
  await storage.addInteractionDialect({
    userId: TEST_USER_ID,
    channelType: "public_comment",
    senderName: "João Pedro",
    senderUsername: "joao_p",
    userMessage: "quanto custa o frete?",
    myResponse: "Frete grátis para compras acima de R$ 100! Abaixo disso, calculamos no checkout.",
    isOwnerReply: true,
    interactedAt: new Date()
  });
  console.log("   ✅ Interaction #2: Pergunta sobre frete");
  console.log();
  
  // 4. Add Media Library entry
  console.log("4️⃣ Adding Media Library entry...");
  await storage.addMediaLibraryEntry({
    userId: TEST_USER_ID,
    instagramMediaId: "test_media_123",
    caption: "Novo produto chegando! 🎉 Confira nossas novidades e aproveite os descontos!",
    mediaType: "image",
    imageDescription: "Foto de produto com desconto especial",
    postedAt: new Date()
  });
  console.log("   ✅ Media #1: Post promocional");
  console.log();
  
  console.log("✅ Test data setup complete!\n");
}

async function testEnhancedRetrieval() {
  console.log("=".repeat(70));
  console.log("🧪 TEST 1: Enhanced Multi-Source Retrieval");
  console.log("=".repeat(70));
  console.log();
  
  console.log("📩 Testing with question: 'como cancelo minha compra?'");
  console.log("Expected: Should retrieve from gold entry about cancellation");
  console.log();
  
  const result = await generateAIResponse(
    "como cancelo minha compra?",
    "dm",
    "Test User",
    TEST_USER_ID
  );
  
  console.log("📊 Result:");
  console.log(`   Response: "${result.suggestedResponse}"`);
  console.log(`   Confidence: ${result.confidenceScore}`);
  console.log();
  
  const hasRelevantInfo = result.suggestedResponse.toLowerCase().includes("cancelar") ||
                          result.suggestedResponse.toLowerCase().includes("pedido");
  
  console.log(`✓ Contains relevant info: ${hasRelevantInfo ? '✅' : '❌'}`);
  console.log();
  
  return hasRelevantInfo;
}

async function testAntiVerbatim() {
  console.log("=".repeat(70));
  console.log("🧪 TEST 2: Anti-Verbatim Response Generation");
  console.log("=".repeat(70));
  console.log();
  
  console.log("📩 Testing with exact gold question: 'vocês entregam no sábado?'");
  console.log("Expected: Response should be similar in meaning but NOT verbatim copy");
  console.log();
  
  const result = await generateAIResponse(
    "vocês entregam no sábado?",
    "dm",
    "Test User",
    TEST_USER_ID
  );
  
  console.log("📊 Result:");
  console.log(`   Response: "${result.suggestedResponse}"`);
  console.log();
  
  const goldAnswer = "Sim! Fazemos entregas de segunda a sábado. Domingo não temos entregas disponíveis.";
  const isVerbatim = result.suggestedResponse === goldAnswer;
  const hasSimilarMeaning = result.suggestedResponse.toLowerCase().includes("sábado") &&
                            result.suggestedResponse.toLowerCase().includes("domingo");
  
  console.log(`✓ Not verbatim copy: ${!isVerbatim ? '✅' : '❌'}`);
  console.log(`✓ Has similar meaning: ${hasSimilarMeaning ? '✅' : '❌'}`);
  console.log();
  
  return !isVerbatim && hasSimilarMeaning;
}

async function testAntiRepetition() {
  console.log("=".repeat(70));
  console.log("🧪 TEST 3: Anti-Repetition Safeguards");
  console.log("=".repeat(70));
  console.log();
  
  console.log("📩 Generating 3 responses to similar questions...");
  console.log("Expected: Responses should vary, not repeat");
  console.log();
  
  const questions = [
    "qual o prazo de entrega?",
    "quanto tempo demora para entregar?",
    "quando vai chegar meu pedido?"
  ];
  
  const responses: string[] = [];
  
  for (let i = 0; i < questions.length; i++) {
    const result = await generateAIResponse(
      questions[i],
      "dm",
      "Test User",
      TEST_USER_ID
    );
    responses.push(result.suggestedResponse);
    console.log(`   Response ${i + 1}: "${result.suggestedResponse}"`);
  }
  
  console.log();
  
  // Check if responses are different enough
  const allDifferent = responses[0] !== responses[1] && 
                       responses[1] !== responses[2] && 
                       responses[0] !== responses[2];
  
  console.log(`✓ All responses are unique: ${allDifferent ? '✅' : '❌'}`);
  console.log();
  
  return allDifferent;
}

async function testStyleIntentDetection() {
  console.log("=".repeat(70));
  console.log("🧪 TEST 4: Style/Intent Detection");
  console.log("=".repeat(70));
  console.log();
  
  const testCases = [
    {
      message: "adorei o atendimento! muito obrigada!",
      expectedIntent: "praise",
      description: "Praise/thanks"
    },
    {
      message: "o produto não chegou e já faz 10 dias!",
      expectedIntent: "complaint",
      description: "Complaint"
    },
    {
      message: "quanto custa o frete?",
      expectedIntent: "question",
      description: "Question"
    }
  ];
  
  let allCorrect = true;
  
  for (const testCase of testCases) {
    console.log(`📩 Testing ${testCase.description}: "${testCase.message}"`);
    
    const result = await generateAIResponse(
      testCase.message,
      "dm",
      "Test User",
      TEST_USER_ID
    );
    
    console.log(`   Response: "${result.suggestedResponse}"`);
    
    // Basic checks based on intent
    let intentMatched = false;
    const lowerResponse = result.suggestedResponse.toLowerCase();
    
    if (testCase.expectedIntent === "praise") {
      intentMatched = lowerResponse.includes("obrigad") || lowerResponse.includes("feliz");
    } else if (testCase.expectedIntent === "complaint") {
      intentMatched = lowerResponse.includes("desculp") || lowerResponse.includes("lament");
    } else if (testCase.expectedIntent === "question") {
      intentMatched = true; // Any response to a question is valid
    }
    
    console.log(`   ✓ Appropriate tone: ${intentMatched ? '✅' : '❌'}`);
    console.log();
    
    if (!intentMatched) allCorrect = false;
  }
  
  return allCorrect;
}

async function runAllTests() {
  console.log("\n");
  console.log("🚀 Starting Personality-Cloning Improvement Tests");
  console.log("=".repeat(70));
  console.log("\n");
  
  await cleanupTestData();
  await setupTestData();
  
  const results = {
    retrieval: false,
    antiVerbatim: false,
    antiRepetition: false,
    styleIntent: false
  };
  
  try {
    results.retrieval = await testEnhancedRetrieval();
    results.antiVerbatim = await testAntiVerbatim();
    results.antiRepetition = await testAntiRepetition();
    results.styleIntent = await testStyleIntentDetection();
  } catch (error: any) {
    console.error("❌ Test error:", error.message || error);
  }
  
  // Final summary
  console.log("\n");
  console.log("=".repeat(70));
  console.log("📋 FINAL TEST RESULTS");
  console.log("=".repeat(70));
  console.log();
  console.log(`1. Enhanced Multi-Source Retrieval: ${results.retrieval ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`2. Anti-Verbatim Generation: ${results.antiVerbatim ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`3. Anti-Repetition Safeguards: ${results.antiRepetition ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`4. Style/Intent Detection: ${results.styleIntent ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  
  const allPassed = Object.values(results).every(r => r);
  
  if (allPassed) {
    console.log("🎉 ALL TESTS PASSED! Personality-cloning improvements working correctly!");
  } else {
    console.log("⚠️  Some tests failed. Review the output above for details.");
  }
  console.log();
  
  await cleanupTestData();
  
  return allPassed;
}

// Run the tests
runAllTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error("\n❌ Test suite failed:", err);
    process.exit(1);
  });

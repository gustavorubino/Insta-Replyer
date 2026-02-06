/**
 * Test script to verify Golden Corrections and Guidelines are being used
 * 
 * This test simulates the issue reported:
 * 1. Add a Golden Correction: "quem é vc?" -> "Gustavo Rubino Chefe de gabinete"
 * 2. Add a Guideline
 * 3. Simulate AI response to verify it uses the golden correction
 */

import { storage } from "./server/storage";
import { generateAIResponse } from "./server/openai";

const TEST_USER_ID = "test-user-golden-corrections";

async function cleanupTestData() {
  console.log("🧹 Cleaning up test data...");
  try {
    // Get and delete test user's manual QA
    const manualQAs = await storage.getManualQA(TEST_USER_ID);
    console.log(`Found ${manualQAs.length} manual QA entries for test user`);
    
    // Get and delete test user's guidelines
    const guidelines = await storage.getGuidelines(TEST_USER_ID);
    console.log(`Found ${guidelines.length} guidelines for test user`);
    
    for (const guideline of guidelines) {
      await storage.deleteGuideline(guideline.id, TEST_USER_ID);
    }
    
    console.log("✅ Cleanup complete\n");
  } catch (err) {
    console.error("Error during cleanup:", err);
  }
}

async function testGoldenCorrections() {
  console.log("=".repeat(70));
  console.log("🧪 TEST: Golden Corrections Integration");
  console.log("=".repeat(70));
  console.log();

  await cleanupTestData();

  // Step 1: Add a Golden Correction (Manual Q&A)
  console.log("📝 Step 1: Adding Golden Correction...");
  const goldenCorrection = await storage.addManualQA({
    userId: TEST_USER_ID,
    question: "quem é vc?",
    answer: "Gustavo Rubino Chefe de gabinete",
    source: "simulator"
  });
  console.log(`✅ Golden Correction added: ID=${goldenCorrection.id}`);
  console.log(`   Question: "${goldenCorrection.question}"`);
  console.log(`   Answer: "${goldenCorrection.answer}"`);
  console.log();

  // Step 2: Add a Guideline
  console.log("📝 Step 2: Adding Guideline...");
  const guideline = await storage.addGuideline({
    userId: TEST_USER_ID,
    rule: "Sempre se identifique como Gustavo Rubino quando perguntado",
    priority: 5,
    category: "identidade",
    isActive: true
  });
  console.log(`✅ Guideline added: ID=${guideline.id}`);
  console.log(`   Rule: "${guideline.rule}"`);
  console.log(`   Priority: ${guideline.priority}`);
  console.log();

  // Step 3: Test AI response
  console.log("🤖 Step 3: Testing AI Response with Golden Correction...");
  console.log("Question: 'quem é você?'");
  console.log();
  
  try {
    const result = await generateAIResponse(
      "quem é você?",
      "dm",
      "Test User",
      TEST_USER_ID
    );

    console.log("📊 AI Response Result:");
    console.log(`   Response: "${result.suggestedResponse}"`);
    console.log(`   Confidence: ${result.confidenceScore}`);
    
    if (result.error) {
      console.log(`   ❌ Error: ${result.error}`);
    }
    console.log();

    // Verification
    const response = result.suggestedResponse.toLowerCase();
    const hasGustavo = response.includes("gustavo");
    const hasRubino = response.includes("rubino");
    const mentionsGoldenAnswer = hasGustavo || hasRubino || response.includes("chefe de gabinete");

    console.log("=".repeat(70));
    console.log("📋 TEST RESULTS:");
    console.log("=".repeat(70));
    console.log(`✓ Golden Correction was ${mentionsGoldenAnswer ? 'USED ✅' : 'NOT USED ❌'}`);
    console.log(`✓ Mentions Gustavo: ${hasGustavo ? '✅' : '❌'}`);
    console.log(`✓ Mentions Rubino: ${hasRubino ? '✅' : '❌'}`);
    console.log();

    if (mentionsGoldenAnswer) {
      console.log("🎉 SUCCESS! The AI is using Golden Corrections!");
    } else {
      console.log("❌ FAILED! The AI is NOT using Golden Corrections!");
      console.log("   Expected response to mention 'Gustavo Rubino' or 'Chefe de gabinete'");
      console.log(`   Got: "${result.suggestedResponse}"`);
    }

  } catch (error: any) {
    console.error("❌ Error testing AI response:");
    console.error(error.message || error);
  }

  // Cleanup
  await cleanupTestData();
}

// Run the test
testGoldenCorrections()
  .then(() => {
    console.log("\n✅ Test completed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  });

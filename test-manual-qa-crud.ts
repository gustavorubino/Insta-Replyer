/**
 * Test script to verify ManualQA CRUD operations (Create, Read, Update, Delete)
 * 
 * This test verifies:
 * 1. Creating a ManualQA entry
 * 2. Reading it back
 * 3. Updating it
 * 4. Deleting it
 */

import { storage } from "./server/storage";

const TEST_USER_ID = "test-user-manual-qa-crud";

async function testManualQACRUD() {
  console.log("=".repeat(70));
  console.log("🧪 TEST: ManualQA CRUD Operations");
  console.log("=".repeat(70));
  console.log();

  // Cleanup before test
  console.log("🧹 Cleaning up existing test data...");
  const existing = await storage.getManualQA(TEST_USER_ID);
  for (const entry of existing) {
    await storage.deleteManualQA(entry.id, TEST_USER_ID);
  }
  console.log("✅ Cleanup complete\n");

  // Test 1: Create
  console.log("📝 Test 1: CREATE - Adding ManualQA entry...");
  const created = await storage.addManualQA({
    userId: TEST_USER_ID,
    question: "What is the test question?",
    answer: "This is the test answer.",
    source: "test"
  });
  console.log(`✅ Created: ID=${created.id}`);
  console.log(`   Question: "${created.question}"`);
  console.log(`   Answer: "${created.answer}"`);
  console.log();

  // Test 2: Read
  console.log("📖 Test 2: READ - Fetching ManualQA entries...");
  const entries = await storage.getManualQA(TEST_USER_ID);
  console.log(`✅ Found ${entries.length} entries`);
  if (entries.length > 0) {
    console.log(`   First entry ID: ${entries[0].id}`);
    console.log(`   Question: "${entries[0].question}"`);
  }
  console.log();

  // Test 3: Update
  console.log("✏️  Test 3: UPDATE - Updating ManualQA entry...");
  const updated = await storage.updateManualQA(created.id, TEST_USER_ID, {
    question: "What is the UPDATED question?",
    answer: "This is the UPDATED answer."
  });
  
  if (!updated) {
    console.error("❌ Update failed - entry not found");
    process.exit(1);
  }
  
  console.log(`✅ Updated: ID=${updated.id}`);
  console.log(`   New Question: "${updated.question}"`);
  console.log(`   New Answer: "${updated.answer}"`);
  console.log();

  // Verify update
  console.log("🔍 Verifying update...");
  const afterUpdate = await storage.getManualQA(TEST_USER_ID);
  const updatedEntry = afterUpdate.find(e => e.id === created.id);
  if (updatedEntry && 
      updatedEntry.question === "What is the UPDATED question?" && 
      updatedEntry.answer === "This is the UPDATED answer.") {
    console.log("✅ Update verified successfully");
  } else {
    console.error("❌ Update verification failed");
    process.exit(1);
  }
  console.log();

  // Test 4: Delete
  console.log("🗑️  Test 4: DELETE - Deleting ManualQA entry...");
  await storage.deleteManualQA(created.id, TEST_USER_ID);
  console.log(`✅ Deleted entry with ID=${created.id}`);
  console.log();

  // Verify delete
  console.log("🔍 Verifying delete...");
  const afterDelete = await storage.getManualQA(TEST_USER_ID);
  if (afterDelete.length === 0) {
    console.log("✅ Delete verified - no entries remaining");
  } else {
    console.error("❌ Delete verification failed - entries still exist");
    process.exit(1);
  }
  console.log();

  console.log("=".repeat(70));
  console.log("🎉 ALL TESTS PASSED!");
  console.log("=".repeat(70));
}

// Run the test
testManualQACRUD()
  .then(() => {
    console.log("\n✅ Test completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Test failed:", err);
    console.error(err.stack);
    process.exit(1);
  });

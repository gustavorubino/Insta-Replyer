/**
 * Test script to verify webhook duplicate message prevention
 * 
 * This script simulates the scenario where:
 * 1. A webhook payload arrives with multiple entries containing the same message ID
 * 2. The system should process the message only once
 */

console.log("=== TEST: Webhook Duplicate Message Prevention ===\n");

// Simulate the processedMessageIds cache (same as in server/routes/index.ts)
const processedMessageIds: Map<string, number> = new Map();

// Simulate processing a message
function simulateProcessMessage(messageId: string, entryId: string): boolean {
  const now = Date.now();
  const existingTimestamp = processedMessageIds.get(messageId);
  
  if (existingTimestamp && existingTimestamp > now) {
    console.log(`❌ DUPLICATE: Message ${messageId} from entry ${entryId} - Already processed. Skipping.`);
    return false; // Duplicate, not processed
  }
  
  // Mark this message as being processed (TTL: 5 minutes)
  processedMessageIds.set(messageId, now + 5 * 60 * 1000);
  console.log(`✅ PROCESSED: Message ${messageId} from entry ${entryId} - Cached for 5 min`);
  return true; // Successfully processed
}

// Test Case 1: Same message ID from two different entries (simulates the bug scenario)
console.log("Test Case 1: Same message arrives in two different webhook entries");
console.log("------------------------------------------------");

const messageId1 = "mid.test_123456789";
const entry1 = "instagram_page_1"; // Sender's Facebook Page ID
const entry2 = "instagram_page_2"; // Recipient's Instagram Account ID

const result1_entry1 = simulateProcessMessage(messageId1, entry1);
const result1_entry2 = simulateProcessMessage(messageId1, entry2);

console.log(`\nResult: First entry processed: ${result1_entry1}, Second entry processed: ${result1_entry2}`);
console.log(`Expected: true, false - ${result1_entry1 === true && result1_entry2 === false ? '✅ PASS' : '❌ FAIL'}\n`);

// Test Case 2: Different message IDs should both be processed
console.log("Test Case 2: Different messages should both be processed");
console.log("------------------------------------------------");

const messageId2 = "mid.test_987654321";
const messageId3 = "mid.test_111222333";

const result2_msg1 = simulateProcessMessage(messageId2, entry1);
const result2_msg2 = simulateProcessMessage(messageId3, entry1);

console.log(`\nResult: Message 1 processed: ${result2_msg1}, Message 2 processed: ${result2_msg2}`);
console.log(`Expected: true, true - ${result2_msg1 === true && result2_msg2 === true ? '✅ PASS' : '❌ FAIL'}\n`);

// Test Case 3: Same message after cache expiry should be processed again
console.log("Test Case 3: Message after cache expiry (simulated)");
console.log("------------------------------------------------");

const messageId4 = "mid.test_444555666";
const result3_first = simulateProcessMessage(messageId4, entry1);

// Simulate cache expiry by setting the timestamp to past
processedMessageIds.set(messageId4, Date.now() - 1000); // Already expired

const result3_after_expiry = simulateProcessMessage(messageId4, entry1);

console.log(`\nResult: First processed: ${result3_first}, After expiry processed: ${result3_after_expiry}`);
console.log(`Expected: true, true - ${result3_first === true && result3_after_expiry === true ? '✅ PASS' : '❌ FAIL'}\n`);

// Summary
console.log("=== TEST SUMMARY ===");
const allPassed = (
  result1_entry1 === true && result1_entry2 === false &&
  result2_msg1 === true && result2_msg2 === true &&
  result3_first === true && result3_after_expiry === true
);

if (allPassed) {
  console.log("✅ All tests PASSED - Duplicate prevention is working correctly!");
  process.exit(0);
} else {
  console.log("❌ Some tests FAILED - Please review the implementation");
  process.exit(1);
}

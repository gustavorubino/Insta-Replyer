/**
 * Test for DM Message Deduplication Enhancement
 * 
 * Validates that the enhanced content-based deduplication correctly identifies
 * duplicate messages using both senderId and senderUsername as stable identifiers.
 * 
 * Scenarios tested:
 * 1. Same content + same senderId + within 60s window -> Duplicate detected
 * 2. Same content + different senderId + same username + within 60s -> Duplicate detected
 * 3. Same content + same username + outside 60s window -> Not a duplicate
 * 4. Different content + same sender -> Not a duplicate
 */

interface MockMessage {
  senderId: string | null;
  senderUsername: string;
  content: string | null;
  mediaType: string | null;
  createdAt: Date;
}

/**
 * Test the deduplication logic (mirroring server/routes/index.ts lines 4389-4415)
 */
function testDeduplicationLogic(
  recentMessages: MockMessage[],
  newMessage: {
    senderId: string | null;
    senderUsername: string | null;
    content: string | null;
    mediaType: string | null;
  }
): boolean {
  const messageContent = newMessage.content;
  const senderId = newMessage.senderId;
  const senderUsername = newMessage.senderUsername;
  const mediaType = newMessage.mediaType;

  const isDuplicateContent = recentMessages.some(m => {
    const isWithin60s = (Date.now() - new Date(m.createdAt).getTime()) < 60000; // 60 seconds window
    const hasMatchingContent = m.content === messageContent && m.mediaType === mediaType;
    // Match by senderId OR senderUsername to handle cases where senderId is inconsistent
    // Ensure at least one identifier is present to avoid false positives
    const hasSameSender = (senderId && m.senderId && m.senderId === senderId) || 
                          (senderUsername && m.senderUsername && m.senderUsername === senderUsername);
    return hasMatchingContent && hasSameSender && isWithin60s;
  });

  return isDuplicateContent;
}

async function runTests() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║     DM DEDUPLICATION ENHANCEMENT - TEST SUITE                  ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  let passedTests = 0;
  let failedTests = 0;

  // Test 1: Same senderId + same content -> Duplicate
  {
    console.log("Test 1: Same senderId + same content within 60s");
    const recentMessages: MockMessage[] = [
      {
        senderId: "123456",
        senderUsername: "rodolfo",
        content: "Hello from Rodolfo",
        mediaType: null,
        createdAt: new Date(Date.now() - 30000), // 30 seconds ago
      }
    ];

    const newMessage = {
      senderId: "123456",
      senderUsername: "rodolfo",
      content: "Hello from Rodolfo",
      mediaType: null,
    };

    const isDuplicate = testDeduplicationLogic(recentMessages, newMessage);
    if (isDuplicate) {
      console.log("✅ PASS - Duplicate correctly detected\n");
      passedTests++;
    } else {
      console.log("❌ FAIL - Should have detected duplicate\n");
      failedTests++;
    }
  }

  // Test 2: Different senderId + same username + same content -> Duplicate (KEY FIX)
  {
    console.log("Test 2: Different senderId + same username + same content within 60s");
    const recentMessages: MockMessage[] = [
      {
        senderId: "123456",  // Graph API ID
        senderUsername: "rodolfo",
        content: "Hello from Rodolfo",
        mediaType: null,
        createdAt: new Date(Date.now() - 30000), // 30 seconds ago
      }
    ];

    const newMessage = {
      senderId: "789012",  // Messenger Platform ID (different!)
      senderUsername: "rodolfo",
      content: "Hello from Rodolfo",
      mediaType: null,
    };

    const isDuplicate = testDeduplicationLogic(recentMessages, newMessage);
    if (isDuplicate) {
      console.log("✅ PASS - Duplicate correctly detected by username match\n");
      passedTests++;
    } else {
      console.log("❌ FAIL - Should have detected duplicate using username\n");
      failedTests++;
    }
  }

  // Test 3: Same content but outside 60s window -> Not duplicate
  {
    console.log("Test 3: Same content + same username but outside 60s window");
    const recentMessages: MockMessage[] = [
      {
        senderId: "123456",
        senderUsername: "rodolfo",
        content: "Hello from Rodolfo",
        mediaType: null,
        createdAt: new Date(Date.now() - 120000), // 120 seconds ago (outside window)
      }
    ];

    const newMessage = {
      senderId: "123456",
      senderUsername: "rodolfo",
      content: "Hello from Rodolfo",
      mediaType: null,
    };

    const isDuplicate = testDeduplicationLogic(recentMessages, newMessage);
    if (!isDuplicate) {
      console.log("✅ PASS - Not a duplicate (outside time window)\n");
      passedTests++;
    } else {
      console.log("❌ FAIL - Should not be a duplicate (outside time window)\n");
      failedTests++;
    }
  }

  // Test 4: Different content, same sender -> Not duplicate
  {
    console.log("Test 4: Different content + same sender");
    const recentMessages: MockMessage[] = [
      {
        senderId: "123456",
        senderUsername: "rodolfo",
        content: "First message",
        mediaType: null,
        createdAt: new Date(Date.now() - 10000), // 10 seconds ago
      }
    ];

    const newMessage = {
      senderId: "123456",
      senderUsername: "rodolfo",
      content: "Second message",
      mediaType: null,
    };

    const isDuplicate = testDeduplicationLogic(recentMessages, newMessage);
    if (!isDuplicate) {
      console.log("✅ PASS - Not a duplicate (different content)\n");
      passedTests++;
    } else {
      console.log("❌ FAIL - Should not be a duplicate (different content)\n");
      failedTests++;
    }
  }

  // Test 5: Same content + different mediaType -> Not duplicate
  {
    console.log("Test 5: Same content + different mediaType");
    const recentMessages: MockMessage[] = [
      {
        senderId: "123456",
        senderUsername: "rodolfo",
        content: "Check this out",
        mediaType: "image",
        createdAt: new Date(Date.now() - 10000), // 10 seconds ago
      }
    ];

    const newMessage = {
      senderId: "123456",
      senderUsername: "rodolfo",
      content: "Check this out",
      mediaType: "video",
    };

    const isDuplicate = testDeduplicationLogic(recentMessages, newMessage);
    if (!isDuplicate) {
      console.log("✅ PASS - Not a duplicate (different mediaType)\n");
      passedTests++;
    } else {
      console.log("❌ FAIL - Should not be a duplicate (different mediaType)\n");
      failedTests++;
    }
  }

  // Test 6: Username match fallback when senderId is null
  {
    console.log("Test 6: Username match when senderId is null in new message");
    const recentMessages: MockMessage[] = [
      {
        senderId: "123456",
        senderUsername: "rodolfo",
        content: "Hello",
        mediaType: null,
        createdAt: new Date(Date.now() - 30000), // 30 seconds ago
      }
    ];

    const newMessage = {
      senderId: null,
      senderUsername: "rodolfo",
      content: "Hello",
      mediaType: null,
    };

    const isDuplicate = testDeduplicationLogic(recentMessages, newMessage);
    if (isDuplicate) {
      console.log("✅ PASS - Duplicate detected using username fallback\n");
      passedTests++;
    } else {
      console.log("❌ FAIL - Should detect duplicate using username\n");
      failedTests++;
    }
  }

  // Test 7: Different username -> Not duplicate even if content matches
  {
    console.log("Test 7: Different username + same content");
    const recentMessages: MockMessage[] = [
      {
        senderId: "123456",
        senderUsername: "rodolfo",
        content: "Hi there!",
        mediaType: null,
        createdAt: new Date(Date.now() - 10000), // 10 seconds ago
      }
    ];

    const newMessage = {
      senderId: "789012",
      senderUsername: "gustavo",
      content: "Hi there!",
      mediaType: null,
    };

    const isDuplicate = testDeduplicationLogic(recentMessages, newMessage);
    if (!isDuplicate) {
      console.log("✅ PASS - Not a duplicate (different sender)\n");
      passedTests++;
    } else {
      console.log("❌ FAIL - Should not be a duplicate (different sender)\n");
      failedTests++;
    }
  }

  // Summary
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║                      TEST SUMMARY                              ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📊 Total:  ${passedTests + failedTests}\n`);

  if (failedTests === 0) {
    console.log("🎉 All tests passed!");
    process.exit(0);
  } else {
    console.log("⚠️  Some tests failed!");
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error("Test execution error:", error);
  process.exit(1);
});

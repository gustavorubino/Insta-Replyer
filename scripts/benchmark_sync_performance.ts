import { performance } from 'perf_hooks';

// Mock types
interface Message {
  id: number;
  instagramId: string;
  userId: string;
  status: string;
}

// Mock Storage
class MockStorage {
  private messages: Map<string, Message> = new Map();
  private dbDelay = 5; // 5ms delay per DB call to simulate latency

  constructor() {
    // Seed some data
    for (let i = 0; i < 1000; i++) {
      const id = `comment_${i}`;
      this.messages.set(id, {
        id: i,
        instagramId: id,
        userId: 'user1',
        status: 'pending'
      });
    }
  }

  private async delay() {
    await new Promise(resolve => setTimeout(resolve, this.dbDelay));
  }

  async getMessagesByInstagramIds(ids: string[], userId: string): Promise<Message[]> {
    await this.delay();
    return ids.map(id => this.messages.get(id)).filter((m): m is Message => !!m);
  }

  async getMessageByInstagramId(instagramId: string, userId: string): Promise<Message | undefined> {
    await this.delay();
    return this.messages.get(instagramId);
  }

  async createMessage(data: any): Promise<Message> {
    await this.delay();
    const newMsg = {
      id: Math.floor(Math.random() * 100000),
      instagramId: data.instagramId,
      userId: data.userId,
      status: 'pending'
    };
    this.messages.set(data.instagramId, newMsg);
    return newMsg;
  }

  async updateMessage(id: number, userId: string, updates: any): Promise<void> {
    await this.delay();
    // In a real DB, we would find by ID, but here let's just pretend
  }
}

// Generate test data
const generateComments = (count: number, repliesPerComment: number) => {
  const comments = [];
  for (let i = 0; i < count; i++) {
    const commentId = `comment_${i}`; // matches seeded data
    const replies = [];
    for (let j = 0; j < repliesPerComment; j++) {
      replies.push({
        id: `reply_${i}_${j}`,
        text: `Reply ${j} to comment ${i}`,
        username: 'me', // simulate owner reply
        from: { username: 'me' }
      });
    }
    comments.push({
      id: commentId,
      text: `Comment ${i}`,
      username: 'user_x',
      replies: { data: replies }
    });
  }
  return comments;
};

// Legacy Implementation (with N+1 in replies)
async function processCommentsLegacy(storage: MockStorage, comments: any[], userId: string) {
  // Batch fetch outer
  const allCommentIds = comments.map(c => c.id);
  const allReplyIds = comments.flatMap(c => c.replies.data.map((r: any) => r.id));
  const idsToCheck = Array.from(new Set([...allCommentIds, ...allReplyIds]));

  const existingMessages = await storage.getMessagesByInstagramIds(idsToCheck, userId);
  const existingIdsSet = new Set(existingMessages.map(m => m.instagramId));

  for (const comment of comments) {
    const messageExists = existingIdsSet.has(comment.id);

    if (!messageExists) {
        // Create logic
        await storage.createMessage({ instagramId: comment.id, userId });
    }

    // Process replies
    if (comment.replies && comment.replies.data) {
        for (const reply of comment.replies.data) {
            // Check if reply exists
            const replyExists = existingIdsSet.has(reply.id);
            if (!replyExists) {
                // create reply...
                await storage.createMessage({ instagramId: reply.id, userId });
            }

            // CHECK OWNER REPLY - N+1 ISSUE HERE
            if (reply.username === 'me') {
                const parentMessage = await storage.getMessageByInstagramId(comment.id, userId);
                if (parentMessage && parentMessage.status !== 'replied') {
                    await storage.updateMessage(parentMessage.id, userId, { status: 'replied' });
                }
            }
        }
    }
  }
}

// Optimized Implementation
async function processCommentsOptimized(storage: MockStorage, comments: any[], userId: string) {
  // Batch fetch outer
  const allCommentIds = comments.map(c => c.id);
  const allReplyIds = comments.flatMap(c => c.replies.data.map((r: any) => r.id));
  const idsToCheck = Array.from(new Set([...allCommentIds, ...allReplyIds]));

  const existingMessages = await storage.getMessagesByInstagramIds(idsToCheck, userId);
  // OPTIMIZATION: Use Map instead of Set
  const existingMessagesMap = new Map(existingMessages.map(m => [m.instagramId, m]));

  for (const comment of comments) {
    const existingMessage = existingMessagesMap.get(comment.id);
    const messageExists = !!existingMessage;

    if (!messageExists) {
        // Create logic
        const newMessage = await storage.createMessage({ instagramId: comment.id, userId });
        // OPTIMIZATION: Update Map
        existingMessagesMap.set(comment.id, newMessage);
    }

    // Process replies
    if (comment.replies && comment.replies.data) {
        for (const reply of comment.replies.data) {
            const replyExists = existingMessagesMap.has(reply.id);
            if (!replyExists) {
                // create reply...
                const newReply = await storage.createMessage({ instagramId: reply.id, userId });
                existingMessagesMap.set(reply.id, newReply);
            }

            // CHECK OWNER REPLY - OPTIMIZED
            if (reply.username === 'me') {
                // OPTIMIZATION: Use Map lookup
                const parentMessage = existingMessagesMap.get(comment.id);
                if (parentMessage && parentMessage.status !== 'replied') {
                    await storage.updateMessage(parentMessage.id, userId, { status: 'replied' });
                    // OPTIMIZATION: Update local state to avoid redundant updates
                    parentMessage.status = 'replied';
                }
            }
        }
    }
  }
}

async function runBenchmark() {
    console.log("Starting Benchmark (5ms DB Delay)...");
    console.log("Scenario: 50 comments, 5 replies each (all owner replies)");

    const commentsCount = 50;
    const repliesPerComment = 5;
    const comments = generateComments(commentsCount, repliesPerComment);
    const userId = 'user1';

    // Run Legacy
    console.log("\nRunning Legacy...");
    const storageLegacy = new MockStorage();
    const startLegacy = performance.now();
    await processCommentsLegacy(storageLegacy, comments, userId);
    const endLegacy = performance.now();
    console.log(`Legacy Time: ${(endLegacy - startLegacy).toFixed(2)}ms`);

    // Run Optimized
    console.log("\nRunning Optimized...");
    const storageOptimized = new MockStorage();
    const startOptimized = performance.now();
    await processCommentsOptimized(storageOptimized, comments, userId);
    const endOptimized = performance.now();
    console.log(`Optimized Time: ${(endOptimized - startOptimized).toFixed(2)}ms`);

    const improvement = ((endLegacy - endOptimized) / endLegacy) * 100;
    console.log(`\nImprovement: ${improvement.toFixed(2)}%`);
}

runBenchmark();

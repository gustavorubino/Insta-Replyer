
import { db } from '../server/db';
import { aiResponses, instagramMessages } from '../shared/schema';
import { count, eq } from 'drizzle-orm';

async function checkUsage() {
  const totalAI = await db.select({ count: count() }).from(aiResponses);
  const totalMsgs = await db.select({ count: count() }).from(instagramMessages);
  
  console.log('Total AI Responses:', totalAI[0].count);
  console.log('Total Messages:', totalMsgs[0].count);
  process.exit(0);
}

checkUsage().catch(console.error);


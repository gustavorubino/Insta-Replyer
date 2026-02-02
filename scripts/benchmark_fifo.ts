import { storage } from "../server/storage";
import { db } from "../server/db";
import { mediaLibrary } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

async function runBenchmark() {
  const userId = `bench_${randomUUID()}`;
  console.log(`Starting benchmark for user: ${userId}`);

  // Seed 60 items (Limit is 50)
  const itemsToSeed = 60;
  console.log(`Seeding ${itemsToSeed} items...`);

  const entries = [];
  for (let i = 0; i < itemsToSeed; i++) {
    entries.push({
      userId,
      instagramMediaId: `media_${i}`,
      mediaType: "image",
      syncedAt: new Date(Date.now() - (itemsToSeed - i) * 1000), // Ensure order
    });
  }

  // Bulk insert for speed in setup
  await db.insert(mediaLibrary).values(entries);

  console.log("Seeding complete. Measuring addMediaLibraryEntry...");

  const newEntry = {
    userId,
    instagramMediaId: `media_new`,
    mediaType: "image",
  };

  const start = performance.now();
  await storage.addMediaLibraryEntry(newEntry);
  const end = performance.now();

  console.log(`Time taken: ${(end - start).toFixed(2)}ms`);

  // Verify count
  const remaining = await db.select().from(mediaLibrary).where(eq(mediaLibrary.userId, userId));
  console.log(`Remaining items: ${remaining.length} (Expected: 50)`);

  // Cleanup
  await db.delete(mediaLibrary).where(eq(mediaLibrary.userId, userId));
  console.log("Cleanup complete.");
  process.exit(0);
}

runBenchmark().catch(err => {
  console.error(err);
  process.exit(1);
});

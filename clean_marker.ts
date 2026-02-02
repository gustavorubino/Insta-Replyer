
import { db } from "./server/db";
import { settings } from "./shared/schema";
import { eq } from "drizzle-orm";

async function cleanGustavoMarker() {
  const GUSTAVO_ID = "51200739";
  console.log(`Limpando marker pending_webhook_${GUSTAVO_ID}...`);
  await db.delete(settings).where(eq(settings.key, `pending_webhook_${GUSTAVO_ID}`));
  console.log("Limpeza concluída.");
  process.exit(0);
}

cleanGustavoMarker().catch(console.error);

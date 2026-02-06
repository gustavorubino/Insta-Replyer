# Fix for Duplicate Instagram DM Messages

## Problem Summary

When Rodolfo sends a DM to Gustavo (message "teste A"), Gustavo's panel shows **two duplicate messages**:

1. ✅ **rodolfodonetti** `@rodolfodonetti` — "teste A" (correct, Instagram profile)
2. ❌ **Rodolfo Donetti | Segurança Pública |** `@rodolfodonetti` — "teste A" (duplicate, Facebook Page name)

## Root Cause

The Instagram webhook for DMs arrives with `object: "page"` and can contain **multiple entries** in the same payload:
- One entry for the sender's Facebook Page ID
- One entry for the recipient's Instagram Business Account ID

The system was processing **both entries**, creating duplicate messages for the same `message.mid` (message ID).

## Solution Implemented

### 1. Webhook-Level Idempotency Cache

Added an in-memory cache that tracks processed message IDs:

```typescript
// In-memory cache for webhook message deduplication (idempotency)
const processedMessageIds: Map<string, number> = new Map(); // messageId -> expiry timestamp (5 min TTL)
```

### 2. Idempotency Check in processWebhookMessage

Before processing any message, check if its ID is already in the cache:

```typescript
// Check if this message ID was already processed recently (within 5 minutes)
const now = Date.now();
const existingTimestamp = processedMessageIds.get(messageId);
if (existingTimestamp && existingTimestamp > now) {
  console.log(`[DM-WEBHOOK] ⚠️ DUPLICATE DETECTED: Message ${messageId} already processed. Skipping.`);
  return;
}

// Mark this message as being processed (TTL: 5 minutes)
processedMessageIds.set(messageId, now + 5 * 60 * 1000);
```

### 3. Cache Maintenance

Added cleanup logic to remove expired entries every minute:

```typescript
function cleanAssocCache() {
  const now = Date.now();
  // ... existing cleanup ...
  
  // Clean processed message IDs
  for (const [key, expiry] of processedMessageIds) {
    if (expiry < now) processedMessageIds.delete(key);
  }
}
setInterval(cleanAssocCache, 60000); // Clean every minute
```

## How It Works

### Before Fix:
```
Webhook arrives with 2 entries:
├─ Entry 1 (Facebook Page ID): Process message mid.123 → Create message in DB
└─ Entry 2 (Instagram Account ID): Process message mid.123 → Create duplicate in DB ❌
```

### After Fix:
```
Webhook arrives with 2 entries:
├─ Entry 1 (Facebook Page ID): Process message mid.123 → Create message in DB ✅
└─ Entry 2 (Instagram Account ID): Check cache → mid.123 found → Skip ✅
```

## Defense in Depth

The solution provides multiple layers of protection:

1. **In-memory cache** (Primary): Prevents processing same message ID within 5 minutes
2. **Database unique constraint** (Failsafe): `instagramId` column has `.unique()` constraint
3. **User-scoped check** (Secondary): `getMessageByInstagramId(messageId, userId)` provides additional filtering

## Testing

Created comprehensive test suite (`test-duplicate-prevention.ts`) that validates:

1. ✅ Same message ID from different entries: Second one is skipped
2. ✅ Different message IDs: Both are processed
3. ✅ Message after cache expiry: Can be processed again

All tests pass successfully.

## Deployment Considerations

### Single-Instance Deployment (Current)
The in-memory cache works perfectly for single-instance deployments. This is the current setup.

### Multi-Instance Deployment (Future)
If the application is scaled to multiple instances, consider:
- Using Redis or similar distributed cache for `processedMessageIds`
- Implementing distributed locks for atomic operations
- The database unique constraint will still prevent duplicates as final safeguard

## Security

- CodeQL security scan: **0 alerts** ✅
- No sensitive data stored in cache (only message IDs)
- Cache expires automatically (5 min TTL)
- Proper error handling and logging

## Files Changed

1. **server/routes/index.ts**
   - Added `processedMessageIds` cache map (lines 77-80)
   - Added cache cleanup logic (lines 91-93)
   - Added idempotency check in `processWebhookMessage` (lines 3770-3782)

2. **test-duplicate-prevention.ts** (new file)
   - Comprehensive test suite for duplicate prevention
   - All tests pass

## Expected Behavior After Fix

When Rodolfo sends a DM to Gustavo:
- ✅ **Only ONE message** appears in the panel
- ✅ Shows correct Instagram profile: **rodolfodonetti** `@rodolfodonetti`
- ✅ No duplicate with Facebook Page name

## Monitoring

The fix includes logging for monitoring:
- `[DM-WEBHOOK] ✅ Message ${messageId} marked as processing (cached for 5 min)` - First processing
- `[DM-WEBHOOK] ⚠️ DUPLICATE DETECTED: Message ${messageId} already processed. Skipping.` - Duplicate skipped
- DM-TRACE logs (if enabled): Track the full flow with `SKIPPED=true reason=ALREADY_PROCESSING`

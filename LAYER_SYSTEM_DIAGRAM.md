# Instagram Reply Detection - 4-Layer System

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    INSTAGRAM SYNC PROCESS                                │
│                                                                          │
│  1. Fetch posts with nested comments/replies                           │
│  2. For each follower comment, search for owner reply using 4 layers   │
│  3. Track statistics on which layer found each reply                   │
└─────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌─────────────────────────────────────────────────────────────────────────┐
│                         FOR EACH COMMENT                                 │
└─────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 1: Nested Replies (from initial fetch)                          │
│                                                                          │
│  ✓ Fast - No additional API calls                                      │
│  ✓ Includes replies from initial nested fetch                          │
│  ✗ Instagram API often omits owner replies from this field             │
│                                                                          │
│  Example:                                                               │
│    comment.replies.data[0].from.username === ownerUsername              │
└─────────────────────────────────────────────────────────────────────────┘

                    │
                    │ No reply found?
                    ▼

┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 2: /{comment-id}/replies Endpoint                               │
│                                                                          │
│  ✓ More comprehensive than nested replies                              │
│  ✗ Instagram API still frequently omits owner replies                  │
│  ✗ Requires 1 API call per comment                                     │
│                                                                          │
│  Example:                                                               │
│    GET /{comment-id}/replies?fields=id,text,username,from{id,username} │
└─────────────────────────────────────────────────────────────────────────┘

                    │
                    │ No reply found?
                    ▼

┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 3: parent_id Matching                                           │
│                                                                          │
│  ✓ Fetches ALL comments on the post                                    │
│  ✓ Finds replies by matching parent_id field                           │
│  ✗ parent_id field often missing/undefined in API response             │
│  ✗ Requires 1 API call per post (lazy loaded, cached)                 │
│                                                                          │
│  Example:                                                               │
│    GET /{media-id}/comments?fields=...,parent_id                       │
│    filter: parent_id === comment.id && from.username === ownerUsername │
└─────────────────────────────────────────────────────────────────────────┘

                    │
                    │ No reply found?
                    ▼

┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 4: Temporal Proximity + Username Matching (NEW!)                │
│                                                                          │
│  ✓ Works even when parent_id is missing                                │
│  ✓ Solves the reported issue with @willianrezende660's comment         │
│  ✓ Prefers replies that mention the original commenter (@username)     │
│  ✗ Requires all comments already fetched (uses Layer 3 cache)          │
│                                                                          │
│  Algorithm:                                                             │
│  1. Get all owner comments made AFTER original comment                 │
│  2. Filter to 7-day temporal window                                    │
│  3. Exclude replies to other comments (if parent_id exists & mismatches)│
│  4. PREFER replies with @username mention                              │
│  5. Otherwise, take first chronological reply                          │
│                                                                          │
│  Example scenario:                                                      │
│    Original: @willianrezende660 at 10:00 AM                            │
│    Owner reply: "Obrigado pelo carinho, Willian! 👏" at 10:10 AM      │
│    ✅ Found via temporal proximity (10 minutes later)                  │
└─────────────────────────────────────────────────────────────────────────┘

                    │
                    ▼

┌─────────────────────────────────────────────────────────────────────────┐
│  RESULT: Save interaction with myResponse                               │
│                                                                          │
│  If reply found:  myResponse = "Obrigado pelo carinho, Willian! 👏"   │
│  If not found:    myResponse = null                                    │
└─────────────────────────────────────────────────────────────────────────┘

                    │
                    ▼

┌─────────────────────────────────────────────────────────────────────────┐
│                     LAYER STATISTICS SUMMARY                             │
│                                                                          │
│  📊 Layer 1 (nested):    X replies                                      │
│  📊 Layer 2 (/replies):  X replies                                      │
│  📊 Layer 3 (parent_id): X replies                                      │
│  📊 Layer 4 (temporal):  X replies  ⭐ NEW                             │
│  📊 Not found:           X comments                                     │
│  📊 TOTAL:               X replies found out of Y comments              │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Benefits of Layer 4

1. **Solves API Limitations**: Works when `parent_id` is missing or undefined
2. **Smart Matching**: Prefers replies with @username mentions for higher confidence
3. **Temporal Logic**: Only matches replies within 7 days to avoid false positives
4. **Fallback Safety**: Won't match replies clearly meant for other comments

## Success Criteria

✅ The specific case mentioned in the issue:
   - Comment from @willianrezende660
   - Reply "Obrigado pelo carinho, Willian! 👏" from @gustavorubino
   - Should now be detected via Layer 4 (temporal proximity)

## Debug Output Example

```
[SYNC] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[SYNC] 📝 Processing comment 12345 by @willianrezende660
[SYNC] 🔍 DEBUG - Comment fields: from.id=67890, from.username=willianrezende660
[SYNC] 🔍 Layer 1: Checking 0 nested replies for comment 12345
[SYNC] 🔍 Layer 2: Comment 12345 has 0 replies from /replies endpoint
[SYNC] 🔍 Layer 3: Fetching all comments from /{media-id}/comments...
[SYNC] 📊 Fetched 15 total comments from media level
[SYNC] 📋 Comment 12346: @gustavorubino, parent_id=NO, from.id=YES
[SYNC] 🔍 Layer 3: Comment 12346 has parent_id=undefined
[SYNC] 🔍 Layer 4: Searching for owner replies within 7 days after 2024-02-01T10:00:00Z
[SYNC] 🔍 Layer 4: Found 1 potential owner replies after the comment
[SYNC] ✅ Layer 4 (temporal): Found owner reply 10 minutes after comment: "Obrigado pelo carinho, Willian! 👏..."
[SYNC] ✅ Found reply via Layer 4 for comment by @willianrezende660
[SYNC] 💾 Saved WITH owner reply: @willianrezende660
```

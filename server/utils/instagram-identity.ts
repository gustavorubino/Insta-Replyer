
import { authStorage } from "../replit_integrations/auth/storage";
import { User } from "../../shared/schema";

export interface ResolvedIdentity {
  name: string;
  username: string;
  avatar: string;
  followersCount?: number;
  isKnownUser: boolean; // True if matched with a registered user
  userId?: string; // Internal User ID if matched
}

/**
 * Robustly resolves the identity of an Instagram sender, handling cross-account ID mismatches.
 * 
 * Strategy:
 * 1. Try to fetch profile from Instagram/Facebook API using the Recipient's Token.
 * 2. If API returns a username, try to match it with a registered user in our database (Cross-Account Match).
 * 3. If match found, use the registered user's data (Name, Avatar) as source of truth.
 * 4. If no match, use API data.
 * 5. If API fails, use robust fallbacks (UI Avatars).
 */
export async function resolveInstagramSender(
  senderId: string, 
  recipientAccessToken: string, 
  recipientInstagramId?: string
): Promise<ResolvedIdentity> {
  
  console.log(`[Identity] Resolving sender ${senderId}...`);
  
  let apiData: any = { name: null, username: null, avatar: null };
  let dbMatch: User | undefined;

  // 0. First, try to find sender in our database by senderId (ASID match)
  try {
    const allUsers = await authStorage.getAllUsers();
    dbMatch = allUsers.find(u => 
      u.instagramAccountId === senderId || 
      u.instagramRecipientId === senderId
    );
    
    if (dbMatch) {
      console.log(`[Identity] ✅ Early DB Match by ID: User ${dbMatch.id} (@${dbMatch.instagramUsername || 'no-username'})`);
      // If we have a match with complete data, we can skip API call
      if (dbMatch.instagramUsername && (dbMatch.instagramProfilePic || dbMatch.profileImageUrl)) {
        console.log(`[Identity] Using cached DB data, skipping API call`);
        return {
          name: [dbMatch.firstName, dbMatch.lastName].filter(Boolean).join(" ") || dbMatch.instagramUsername || "Instagram User",
          username: dbMatch.instagramUsername || senderId,
          avatar: dbMatch.instagramProfilePic || dbMatch.profileImageUrl || generateFallbackAvatar(senderId, dbMatch.instagramUsername || senderId),
          followersCount: undefined,
          isKnownUser: true,
          userId: dbMatch.id
        };
      }
    }
  } catch (e) {
    console.error("[Identity] Early DB Match failed:", e);
  }

  // 1. Fetch from API (Best Effort)
  try {
    apiData = await fetchFromApi(senderId, recipientAccessToken, recipientInstagramId);
    console.log(`[Identity] API Result: @${apiData.username || 'unknown'} (${apiData.name || 'no-name'})`);
  } catch (e) {
    console.error("[Identity] API Fetch failed:", e);
  }

  // 2. Cross-Account Match by Username
  if (apiData.username) {
    try {
      const allUsers = await authStorage.getAllUsers();
      // Case-insensitive match
      dbMatch = allUsers.find(u => 
        u.instagramUsername && 
        u.instagramUsername.toLowerCase() === apiData.username.toLowerCase()
      );
      
      if (dbMatch) {
        console.log(`[Identity] ✅ DB Match found: User ${dbMatch.id} (@${dbMatch.instagramUsername})`);
      }
    } catch (e) {
      console.error("[Identity] DB Match failed:", e);
    }
  }

  // 3. Construct Final Identity
  const finalUsername = dbMatch?.instagramUsername || apiData.username || senderId;
  
  // Name Priority: DB Name > API Name > Username > "Instagram User"
  let finalName = "Instagram User";
  if (dbMatch?.firstName || dbMatch?.lastName) {
    finalName = [dbMatch.firstName, dbMatch.lastName].filter(Boolean).join(" ");
  } else if (apiData.name) {
    finalName = apiData.name;
  } else if (finalUsername !== senderId) {
    finalName = finalUsername;
  }

  // Avatar Priority: DB Avatar > API Avatar > Fallback Generator
  let finalAvatar = dbMatch?.instagramProfilePic || dbMatch?.profileImageUrl || apiData.avatar;
  
  if (!finalAvatar) {
    // Generate robust fallback
    finalAvatar = generateFallbackAvatar(senderId, finalUsername);
    console.log(`[Identity] Generated fallback avatar for ${finalUsername}`);
  }

  return {
    name: finalName,
    username: finalUsername,
    avatar: finalAvatar,
    followersCount: apiData.followersCount,
    isKnownUser: !!dbMatch,
    userId: dbMatch?.id
  };
}

// Internal helper to try multiple API endpoints
async function fetchFromApi(userId: string, token: string, userIgId?: string) {
  const endpoints = [
    {
      name: "IG Graph (Basic)",
      url: `https://graph.instagram.com/v21.0/${userId}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(token)}`
    },
    {
      name: "FB Graph (Profile)",
      url: `https://graph.facebook.com/v21.0/${userId}?fields=id,name,username,profile_pic&access_token=${encodeURIComponent(token)}`
    }
  ];

  // Try standard endpoints first
  for (const ep of endpoints) {
    try {
      console.log(`[Identity API] Trying ${ep.name}: ${ep.url.substring(0, 100)}...`);
      const res = await fetch(ep.url);
      const data = await res.json();
      
      console.log(`[Identity API] ${ep.name} Response Status: ${res.status}`);
      console.log(`[Identity API] ${ep.name} Response Data:`, JSON.stringify(data, null, 2));
      
      if (res.ok && !data.error && (data.username || data.name)) {
        console.log(`[Identity API] ✅ ${ep.name} succeeded!`);
        return {
          username: data.username,
          name: data.name,
          avatar: data.profile_picture_url || data.profile_pic,
          followersCount: undefined
        };
      } else if (data.error) {
        console.log(`[Identity API] ❌ ${ep.name} error: ${data.error.message || JSON.stringify(data.error)}`);
      }
    } catch (e) { 
      console.error(`[Identity API] ${ep.name} exception:`, e); 
    }
  }

  return { name: null, username: null, avatar: null };
}

function generateFallbackAvatar(senderId: string, displayName: string): string {
  const name = displayName.length > 20 ? "User" : displayName;
  const colors = ['9b59b6', '3498db', '1abc9c', 'e74c3c', 'f39c12', '2ecc71', 'e91e63', '00bcd4'];
  const colorIndex = senderId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % colors.length;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${colors[colorIndex]}&color=fff&size=128&bold=true`;
}

import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, inArray, isNotNull, and, sql, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { encrypt, decrypt, isEncrypted } from "../../encryption";

// Fields that should be encrypted in the database
const ENCRYPTED_FIELDS = ['instagramAccessToken', 'facebookAppSecret'] as const;

// Helper to decrypt sensitive user fields
function decryptUserFields(user: User): User {
  const decrypted = { ...user };

  if (decrypted.instagramAccessToken && isEncrypted(decrypted.instagramAccessToken)) {
    try {
      const originalLength = decrypted.instagramAccessToken.length;
      decrypted.instagramAccessToken = decrypt(decrypted.instagramAccessToken);
      console.log(`Decrypted instagramAccessToken for user ${user.id}: ${originalLength} chars -> ${decrypted.instagramAccessToken.length} chars`);
    } catch (e) {
      console.error(`Failed to decrypt instagramAccessToken for user ${user.id}:`, e);
      // Set to null to prevent using encrypted token as API key
      decrypted.instagramAccessToken = null;
    }
  }

  if (decrypted.facebookAppSecret && isEncrypted(decrypted.facebookAppSecret)) {
    try {
      decrypted.facebookAppSecret = decrypt(decrypted.facebookAppSecret);
    } catch (e) {
      console.error(`Failed to decrypt facebookAppSecret for user ${user.id}:`, e);
      decrypted.facebookAppSecret = null;
    }
  }

  return decrypted;
}

// Helper to encrypt sensitive fields before saving
function encryptSensitiveFields(updates: Partial<UpsertUser>): Partial<UpsertUser> {
  const encrypted = { ...updates };

  if (encrypted.instagramAccessToken && !isEncrypted(encrypted.instagramAccessToken)) {
    encrypted.instagramAccessToken = encrypt(encrypted.instagramAccessToken);
  }

  if (encrypted.facebookAppSecret && !isEncrypted(encrypted.facebookAppSecret)) {
    encrypted.facebookAppSecret = encrypt(encrypted.facebookAppSecret);
  }

  return encrypted;
}

// Interface for auth storage operations
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User | undefined>;
  createUserWithPassword(userData: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<User>;
  verifyPassword(email: string, password: string): Promise<User | null>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<boolean>;
  syncInstagramIds(userIds: string[]): Promise<User[]>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    if (process.env.LOCAL_AUTH_BYPASS === "true" && id === "local-dev-user") {
      return {
        id: "local-dev-user",
        email: "local@dev.internal",
        firstName: "Dev",
        lastName: "Local",
        profileImageUrl: null,
        isAdmin: true,
        instagramRecipientId: null,
        instagramAccountId: null,
        instagramAccessToken: null,
        facebookAppId: null,
        facebookAppSecret: null,
        aiContext: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        password: null,
      } as User;
    }
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ? decryptUserFields(user) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user ? decryptUserFields(user) : undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const encryptedData = encryptSensitiveFields(userData);
    const [user] = await db
      .insert(users)
      .values(encryptedData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...encryptedData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return decryptUserFields(user);
  }

  async updateUserById(id: string, updates: Partial<UpsertUser>): Promise<User | undefined> {
    const encryptedUpdates = encryptSensitiveFields(updates);
    const [user] = await db
      .update(users)
      .set({
        ...encryptedUpdates,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user ? decryptUserFields(user) : undefined;
  }

  async updateUser(id: string, updates: Partial<UpsertUser>): Promise<User | undefined> {
    return this.updateUserById(id, updates);
  }

  async createUserWithPassword(userData: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const [user] = await db
      .insert(users)
      .values({
        email: userData.email,
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        isAdmin: false,
      })
      .returning();
    return user;
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.password) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async getAllUsers(): Promise<User[]> {
    const allUsers = await db.select().from(users);
    return allUsers.map(user => decryptUserFields(user));
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async syncInstagramIds(userIds: string[]): Promise<User[]> {
    if (userIds.length === 0) return [];

    const results = await db
      .update(users)
      .set({
        instagramAccountId: users.instagramRecipientId,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(users.id, userIds),
          isNotNull(users.instagramRecipientId),
          ne(users.instagramRecipientId, ""),
          sql`${users.instagramAccountId} IS DISTINCT FROM ${users.instagramRecipientId}`,
        ),
      )
      .returning();

    return results.map((user) => decryptUserFields(user));
  }
}

export const authStorage = new AuthStorage();

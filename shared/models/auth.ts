import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, boolean } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// Supports both Replit Auth (admin) and email/password (regular users)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  facebookAppId: varchar("facebook_app_id"),
  facebookAppSecret: varchar("facebook_app_secret"),
  instagramAccountId: varchar("instagram_account_id"),
  instagramUsername: varchar("instagram_username"),
  instagramAccessToken: varchar("instagram_access_token"),
  instagramRecipientId: varchar("instagram_recipient_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

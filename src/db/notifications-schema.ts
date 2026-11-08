import { sql } from "drizzle-orm";
import {
  pgEnum,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const notificationChannel = pgEnum("notification_channel", [
  "inapp",
  "email",
  "telegram",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** When the Telegram dispatcher looked at it, sent or not (D237). */
    telegramCheckedAt: timestamp("telegram_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    index("notifications_user_read_idx").on(
      table.userId,
      table.readAt,
      table.createdAt,
    ),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull(),
    type: text("type").notNull(),
    channel: notificationChannel("channel").notNull(),
    enabled: boolean("enabled").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.type, table.channel] }),
  ],
);

/** Outgoing mail queue. Not in section 4.1; recorded in D125. */
export const notificationEmails = pgTable(
  "notification_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id").references(() => notifications.id, {
      onDelete: "set null",
    }),
    batchKey: text("batch_key"),
    userId: uuid("user_id")
      .notNull(),
    type: text("type").notNull(),
    locale: text("locale").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    sendAfter: timestamp("send_after", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "notification_emails_status_check",
      sql`${table.status} in ('pending', 'sent', 'skipped', 'failed')`,
    ),
    check(
      "notification_emails_attempts_check",
      sql`${table.attempts} between 0 and 5`,
    ),
    check(
      "notification_emails_locale_check",
      sql`${table.locale} in ('en', 'ru', 'es', 'pt-BR', 'de', 'fr', 'it')`,
    ),
    uniqueIndex("notification_emails_pending_batch_idx")
      .on(table.batchKey)
      .where(
        sql`${table.batchKey} is not null and ${table.status} = 'pending'`,
      ),
    index("notification_emails_due_idx").on(table.status, table.sendAfter),
  ],
);

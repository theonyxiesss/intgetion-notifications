import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@intgetion/kit";
import {
  notificationEmails,
  notificationPreferences,
  notifications,
} from "../../../db/notifications-schema";
import type { NotificationChannel, NotificationType } from "../lib/catalog";
import { toAppLocale } from "@intgetion/kit";
import type { AppLocale } from "@intgetion/kit";

type Database = ReturnType<typeof getDb>;
type Conn = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function preferencesFor(userId: string, conn: Conn = getDb()) {
  return conn
    .select({
      type: notificationPreferences.type,
      channel: notificationPreferences.channel,
      enabled: notificationPreferences.enabled,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
}

export async function userLocale(
  userId: string,
  conn: Conn = getDb(),
): Promise<AppLocale> {
  const rows = await conn.execute<{ locale: string | null }>(
    sql`select locale from public.users where id = ${userId} limit 1`,
  );
  return toAppLocale(rows[0]?.locale);
}

export async function insertNotification(
  conn: Conn,
  input: { userId: string; type: NotificationType; payload: unknown },
) {
  const [row] = await conn
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      payload: input.payload as Record<string, unknown>,
    })
    .returning({ id: notifications.id });
  return row?.id ?? null;
}

export async function insertEmail(
  conn: Conn,
  input: {
    userId: string;
    type: string;
    locale: AppLocale;
    payload: unknown;
    sendAfter: Date;
    notificationId?: string | null;
    batchKey?: string | null;
  },
) {
  const [row] = await conn
    .insert(notificationEmails)
    .values({
      userId: input.userId,
      type: input.type,
      locale: input.locale,
      payload: input.payload as Record<string, unknown>,
      sendAfter: input.sendAfter,
      status: "pending",
      notificationId: input.notificationId ?? null,
      batchKey: input.batchKey ?? null,
    })
    .returning({ id: notificationEmails.id });
  return row?.id ?? null;
}

export async function findPendingBatch(batchKey: string, conn: Conn = getDb()) {
  const [row] = await conn
    .select({
      id: notificationEmails.id,
      payload: notificationEmails.payload,
    })
    .from(notificationEmails)
    .where(
      and(
        eq(notificationEmails.batchKey, batchKey),
        eq(notificationEmails.status, "pending"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateEmailPayload(
  id: string,
  payload: unknown,
  conn: Conn = getDb(),
) {
  await conn
    .update(notificationEmails)
    .set({ payload: payload as Record<string, unknown> })
    .where(eq(notificationEmails.id, id));
}

export type InboxCursor = { createdAt: Date; id: string };

export async function listForUser(
  userId: string,
  cursor: InboxCursor | undefined,
  limit: number,
) {
  const older = cursor
    ? or(
        lt(notifications.createdAt, cursor.createdAt),
        and(
          eq(notifications.createdAt, cursor.createdAt),
          lt(notifications.id, cursor.id),
        ),
      )
    : undefined;
  return getDb()
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      older
        ? and(eq(notifications.userId, userId), older)
        : eq(notifications.userId, userId),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
}

export async function countUnread(userId: string) {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

export async function markRead(userId: string, ids: readonly string[] | "all") {
  const own = eq(notifications.userId, userId);
  const unread = isNull(notifications.readAt);
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      ids === "all"
        ? and(own, unread)
        : and(own, unread, inArray(notifications.id, [...ids])),
    );
}

export async function upsertPreference(input: {
  userId: string;
  type: string;
  channel: NotificationChannel;
  enabled: boolean;
}) {
  await getDb()
    .insert(notificationPreferences)
    .values(input)
    .onConflictDoUpdate({
      target: [
        notificationPreferences.userId,
        notificationPreferences.type,
        notificationPreferences.channel,
      ],
      set: { enabled: input.enabled },
    });
}

export async function deleteReadOlderThan(cutoff: Date) {
  const rows = await getDb()
    .delete(notifications)
    .where(lt(notifications.readAt, cutoff))
    .returning({ id: notifications.id });
  return rows.length;
}

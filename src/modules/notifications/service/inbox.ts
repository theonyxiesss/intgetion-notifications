import { notFound, validationError } from "@intgetion/kit";
import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  isNotificationType,
  resolveDelivery,
  type NotificationChannel,
  type NotificationType,
} from "../lib/catalog";
import { verifyUnsubscribe } from "../lib/unsubscribe";
import {
  countUnread,
  listForUser,
  markRead,
  preferencesFor,
  upsertPreference,
  type InboxCursor,
} from "../repo/notifications";
import { unsubscribeSecret } from "./notify";

const PAGE_DEFAULT = 20;

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): InboxCursor {
  const text = Buffer.from(cursor, "base64url").toString("utf8");
  const separator = text.lastIndexOf("|");
  if (separator < 0) throw validationError();
  const createdAt = new Date(text.slice(0, separator));
  const id = text.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime())) throw validationError();
  return { createdAt, id };
}

export async function listNotifications(
  userId: string,
  input: { cursor?: string; limit?: number },
) {
  const limit = input.limit ?? PAGE_DEFAULT;
  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
  const rows = await listForUser(userId, cursor, limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      id: row.id,
      type: row.type,
      payload: row.payload,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(last.createdAt, last.id)
        : null,
    unreadCount: await countUnread(userId),
  };
}

export { countUnread };

export async function markNotificationsRead(
  userId: string,
  input: { ids?: string[]; all?: boolean },
) {
  if (input.all) {
    await markRead(userId, "all");
    return;
  }
  const ids = input.ids ?? [];
  if (ids.length === 0) return;
  await markRead(userId, ids);
}

export async function readPreferences(userId: string) {
  const rows = await preferencesFor(userId);
  return NOTIFICATION_TYPES.flatMap((type) =>
    NOTIFICATION_CHANNELS.map((channel) => {
      const decision = resolveDelivery(type, channel, rows);
      return { type, channel, enabled: decision.allowed };
    }),
  );
}

export async function writePreferences(
  userId: string,
  items: { type: string; channel: string; enabled: boolean }[],
) {
  for (const item of items) {
    if (!isNotificationType(item.type)) throw notFound();
    if (!(NOTIFICATION_CHANNELS as readonly string[]).includes(item.channel)) {
      throw notFound();
    }
    await upsertPreference({
      userId,
      type: item.type,
      channel: item.channel as NotificationChannel,
      enabled: item.enabled,
    });
  }
}

export async function unsubscribeByToken(token: string, now = new Date()) {
  // Without a real secret any token could be forged: refuse them all.
  const secret = unsubscribeSecret();
  if (secret.length < 32) throw notFound();
  const result = verifyUnsubscribe(token, secret, now);
  if (!result.valid) throw notFound();
  await upsertPreference({
    userId: result.claims.userId,
    type: result.claims.type,
    channel: "email",
    enabled: false,
  });
  return { type: result.claims.type as NotificationType };
}

export function preferenceChannel(value: string): NotificationChannel {
  if (value !== "inapp" && value !== "email") throw notFound();
  return value;
}

export function catalogTitleKey(type: string): string | null {
  if (!isNotificationType(type)) return null;
  return NOTIFICATION_CATALOG[type].i18nKey;
}

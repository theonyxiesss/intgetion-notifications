import { getDb } from "@intgetion/kit";
import { logger } from "@intgetion/kit";
import {
  NOTIFICATION_CATALOG,
  notificationPayloadSchema,
  resolveDelivery,
  type NotificationType,
} from "../lib/catalog";
import { signUnsubscribe } from "../lib/unsubscribe";
import {
  batchKey,
  mergeApplicationBatch,
  utcHourStart,
  type ApplicationBatch,
} from "./batch-mail";
import {
  findPendingBatch,
  insertEmail,
  insertNotification,
  preferencesFor,
  updateEmailPayload,
  userLocale,
} from "../repo/notifications";
import { localePrefix } from "@intgetion/kit";
import type { AppLocale } from "@intgetion/kit";

const HOUR_MS = 60 * 60 * 1000;

let injectedFailure: Error | null = null;

/** Test seam. The next `notify` throws, and `safeNotify` swallows it (D127). */
export function failNextNotify(error = new Error("notify failed")) {
  injectedFailure = error;
}

export function unsubscribeSecret(): string {
  return process.env.UNSUBSCRIBE_SECRET ?? "";
}

export function unsubscribeUrl(
  locale: AppLocale,
  userId: string,
  type: NotificationType,
  now = new Date(),
): string {
  const token = signUnsubscribe(
    {
      userId,
      type,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
    unsubscribeSecret(),
  );
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";
  return `${site}${localePrefix(locale)}/unsubscribe?token=${encodeURIComponent(token)}`;
}

async function queueEmail(
  userId: string,
  type: NotificationType,
  payload: unknown,
  notificationId: string | null,
  now: Date,
) {
  const locale = await userLocale(userId);
  const policy = NOTIFICATION_CATALOG[type].policy;
  if (policy === "daily_digest") return;
  if (policy === "hourly_batch" && type === "application.created") {
    const record = payload as {
      jobId?: string;
      jobTitle?: string;
    };
    const hour = utcHourStart(now);
    const key = batchKey(userId, hour);
    const existing = await findPendingBatch(key);
    const current = existing ? (existing.payload as ApplicationBatch) : null;
    const merged = mergeApplicationBatch(current, {
      jobId: String(record.jobId ?? ""),
      jobTitle: String(record.jobTitle ?? ""),
    });
    if (!merged.created && existing) {
      await updateEmailPayload(existing.id, merged.batch);
      return;
    }
    await insertEmail(getDb(), {
      userId,
      type,
      locale,
      payload: merged.batch,
      sendAfter: new Date(hour.getTime() + HOUR_MS),
      notificationId,
      batchKey: key,
    });
    return;
  }
  await insertEmail(getDb(), {
    userId,
    type,
    locale,
    payload,
    sendAfter: now,
    notificationId,
  });
}

export async function notify(
  type: NotificationType,
  recipientIds: readonly string[],
  payload: unknown,
  now = new Date(),
  options?: { email?: boolean },
): Promise<void> {
  if (injectedFailure) {
    const error = injectedFailure;
    injectedFailure = null;
    throw error;
  }
  const parsed = notificationPayloadSchema(type).parse(payload);
  const unique = [...new Set(recipientIds)];
  for (const userId of unique) {
    const preferences = await preferencesFor(userId);
    const inapp = resolveDelivery(type, "inapp", preferences);
    let notificationId: string | null = null;
    if (inapp.allowed) {
      notificationId = await insertNotification(getDb(), {
        userId,
        type,
        payload: parsed,
      });
    }
    const email = resolveDelivery(type, "email", preferences);
    if (email.allowed && options?.email !== false) {
      await queueEmail(userId, type, parsed, notificationId, now);
    }
  }
}

/** A failed notification never rolls back the caller's write (D127). */
export async function safeNotify(
  type: NotificationType,
  recipientIds: readonly string[],
  payload: unknown,
  options?: { email?: boolean },
): Promise<void> {
  try {
    await notify(type, recipientIds, payload, new Date(), options);
  } catch (error) {
    logger.error({ type, err: error }, "notify failed");
  }
}

import { sql } from "drizzle-orm";
import { resolveDelivery, type NotificationType } from "../lib/catalog";
import { insertEmail, insertNotification } from "../repo/notifications";
import type { AppLocale } from "@intgetion/kit";

type Tx = Parameters<
  Parameters<ReturnType<typeof import("@intgetion/kit").getDb>["transaction"]>[0]
>[0];

/**
 * One scheduled notification inside the caller's transaction (D188, D234):
 * in-app and a queued email, each by the user's preferences. The 9A
 * dispatcher renders and sends the email and skips placeholder addresses.
 */
export async function deliverInTransaction(
  tx: Tx,
  input: {
    userId: string;
    type: NotificationType;
    locale: AppLocale;
    payload: Record<string, unknown>;
    /** Extra fields only the email needs, such as job titles. */
    emailPayload?: Record<string, unknown>;
    now: Date;
  },
): Promise<{ inapp: boolean; email: boolean }> {
  const preferences = await tx.execute<{
    type: string;
    channel: string;
    enabled: boolean;
  }>(sql`
    select type, channel, enabled from public.notification_preferences
    where user_id = ${input.userId}
  `);
  let notificationId: string | null = null;
  const inapp = resolveDelivery(input.type, "inapp", preferences).allowed;
  if (inapp) {
    notificationId = await insertNotification(tx, {
      userId: input.userId,
      type: input.type,
      payload: input.payload,
    });
  }
  const email = resolveDelivery(input.type, "email", preferences).allowed;
  if (email) {
    await insertEmail(tx, {
      userId: input.userId,
      type: input.type,
      locale: input.locale,
      payload: { ...input.payload, ...input.emailPayload },
      sendAfter: input.now,
      notificationId,
    });
  }
  return { inapp, email };
}

import { sql } from "drizzle-orm";
import { getDb } from "@intgetion/kit";
import { logger } from "@intgetion/kit";
import type { TelegramSender } from "@intgetion/kit";
import {
  isNotificationType,
  resolveDelivery,
  type NotificationPreferenceRow,
} from "../lib/catalog";
import { telegramButtons, telegramText } from "./render";
import { toAppLocale } from "@intgetion/kit";

/** Notifications this old are not pushed any more (D237). */
const MAX_AGE = "24 hours";
const BATCH = 100;

type Claimed = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  telegram_id: string;
  locale: string;
};

/**
 * Every few minutes (D237): fresh in-app notifications of users with a
 * linked Telegram go out as bot messages, if the "telegram" channel of that
 * type is on. Each notification is claimed once (telegram_checked_at), sent
 * or not, so nothing is pushed twice; a failed send is not retried.
 */
export async function runTelegramDispatch(input: {
  sender: TelegramSender;
  siteUrl: string;
  /** Signs «Accept»/«Decline» on a freelance request (D456); none, no buttons. */
  actionSecret?: string;
  now?: Date;
}): Promise<{
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const now = input.now ?? new Date();
  const claimed = await getDb().execute<Claimed>(sql`
    with due as (
      select n.id from public.notifications n
      join public.telegram_accounts ta on ta.user_id = n.user_id
      join public.users u on u.id = n.user_id and u.status = 'active'
      where n.telegram_checked_at is null
        and n.created_at > ${now.toISOString()}::timestamptz - ${MAX_AGE}::interval
      order by n.created_at
      limit ${BATCH}
      for update of n skip locked
    )
    update public.notifications n
    set telegram_checked_at = ${now.toISOString()}::timestamptz
    from due, public.telegram_accounts ta, public.users u
    where n.id = due.id and ta.user_id = n.user_id and u.id = n.user_id
    returning n.id, n.user_id, n.type, n.payload, ta.telegram_id, u.locale
  `);
  const preferences = new Map<string, NotificationPreferenceRow[]>();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of claimed) {
    if (!isNotificationType(row.type)) {
      skipped += 1;
      continue;
    }
    if (!preferences.has(row.user_id)) {
      preferences.set(
        row.user_id,
        (await getDb().execute<{
          type: string;
          channel: string;
          enabled: boolean;
        }>(sql`
          select type, channel, enabled from public.notification_preferences
          where user_id = ${row.user_id}
        `)) as NotificationPreferenceRow[],
      );
    }
    const allowed = resolveDelivery(
      row.type,
      "telegram",
      preferences.get(row.user_id)!,
    ).allowed;
    const text = allowed
      ? telegramText({
          locale: toAppLocale(row.locale),
          type: row.type,
          payload: row.payload ?? {},
          siteUrl: input.siteUrl,
        })
      : null;
    if (!text) {
      skipped += 1;
      continue;
    }
    const result = await input.sender(
      Number(row.telegram_id),
      text,
      telegramButtons({
        locale: toAppLocale(row.locale),
        type: row.type,
        payload: row.payload ?? {},
        actionSecret: input.actionSecret,
      }),
    );
    if (result === "sent") sent += 1;
    else {
      failed += 1;
      if (result === "blocked") {
        logger.info({ userId: row.user_id }, "telegram: bot blocked by user");
      }
    }
  }
  return { claimed: claimed.length, sent, skipped, failed };
}

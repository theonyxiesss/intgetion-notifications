import { sql } from "drizzle-orm";
import { getDb } from "@intgetion/kit";
import { notificationsPorts } from "../../../ports";
import { notificationEmails } from "../../../db/notifications-schema";
import { isNotificationType, type NotificationType } from "../lib/catalog";
import { readEmailJobs } from "../lib/email-jobs";
import { nextSendAfter } from "./batch-mail";
import { senderFromEnv, type EmailSender } from "./email-sender";
import { notificationPath, renderEmail, templateValues } from "./render";
import { unsubscribeUrl } from "./notify";
import { deleteReadOlderThan } from "../repo/notifications";
import { toAppLocale } from "@intgetion/kit";

const BATCH = 50;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

type DueRow = {
  id: string;
  user_id: string;
  type: string;
  locale: string;
  attempts: number;
  payload: Record<string, unknown>;
};

export async function dispatchEmails(input?: {
  now?: Date;
  sender?: EmailSender;
  limit?: number;
}) {
  const now = input?.now ?? new Date();
  const sender = input?.sender ?? senderFromEnv();
  const limit = input?.limit ?? BATCH;
  return getDb().transaction(async (tx) => {
    const rows = await tx.execute<DueRow>(sql`
      select id, user_id, type, locale, attempts, payload
      from public.notification_emails
      where status = 'pending' and send_after <= ${now.toISOString()}::timestamptz
        and attempts < 5
      order by send_after
      limit ${limit}
      for update skip locked
    `);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      const outcome = await deliverOne(tx, row, sender, now);
      if (outcome === "sent") sent += 1;
      else if (outcome === "skipped") skipped += 1;
      else if (outcome === "failed") failed += 1;
    }
    return { sent, skipped, failed, claimed: rows.length };
  });
}

async function deliverOne(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  row: DueRow,
  sender: EmailSender,
  now: Date,
): Promise<"sent" | "skipped" | "failed" | "pending"> {
  const locale = toAppLocale(row.locale);
  if (!isNotificationType(row.type)) {
    await mark(tx, row.id, {
      status: "failed",
      error: "unknown_type",
      attempts: row.attempts,
    });
    return "failed";
  }
  const type = row.type as NotificationType;
  const rendered = renderEmail({
    locale,
    type,
    values: templateValues(row.payload ?? {}),
    unsubscribeUrl: unsubscribeUrl(locale, row.user_id, type, now),
    actionPath: notificationPath(type, row.payload ?? {}),
    jobs: readEmailJobs(row.payload ?? {}),
  });
  if (!rendered) {
    await mark(tx, row.id, {
      status: "skipped",
      error: "no_template",
      attempts: row.attempts,
    });
    return "skipped";
  }
  const address = await lookupLoginEmail(row.user_id, tx);
  if (process.env.RESEND_API_KEY?.trim() && !address) {
    await mark(tx, row.id, {
      status: "skipped",
      attempts: row.attempts,
      error: "address_unavailable",
    });
    return "skipped";
  }
  try {
    const result = await sender.send({
      to: address ?? "notifications@localhost",
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (result === "skipped") {
      await mark(tx, row.id, { status: "skipped", attempts: row.attempts });
      return "skipped";
    }
    await mark(tx, row.id, {
      status: "sent",
      sentAt: now,
      attempts: row.attempts,
    });
    return "sent";
  } catch {
    const attempts = row.attempts + 1;
    const status = attempts >= 5 ? "failed" : "pending";
    await mark(tx, row.id, {
      status,
      attempts,
      error: "send_failed",
      sendAfter: nextSendAfter(attempts, now),
    });
    return status === "failed" ? "failed" : "pending";
  }
}

async function mark(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  id: string,
  input: {
    status: string;
    attempts: number;
    error?: string | null;
    sentAt?: Date;
    sendAfter?: Date;
  },
) {
  await tx
    .update(notificationEmails)
    .set({
      status: input.status,
      attempts: input.attempts,
      error: input.error ?? null,
      ...(input.sentAt ? { sentAt: input.sentAt } : {}),
      ...(input.sendAfter ? { sendAfter: input.sendAfter } : {}),
    })
    .where(sql`${notificationEmails.id} = ${id}`);
}

/**
 * Login email lives in Supabase Auth, not in `users` (D7, D126). It is
 * read through the Auth Admin API with the service-role key (D166); only
 * active users get mail. Null without the key or for a deleted user.
 * Inside dispatch it reads through the open transaction: the pool has one
 * connection, so a second one would wait forever.
 */
export async function lookupLoginEmail(
  userId: string,
  db: Pick<ReturnType<typeof getDb>, "execute"> = getDb(),
): Promise<string | null> {
  const rows = await db.execute<{ auth_uid: string; status: string }>(
    sql`select auth_uid, status from public.users where id = ${userId}`,
  );
  const user = rows[0];
  if (!user || user.status !== "active") return null;
  return notificationsPorts().loginEmail(user.auth_uid);
}

export async function hasJobExpiringNotice(jobId: string): Promise<boolean> {
  const rows = await getDb().execute<{ id: string }>(sql`
    select id from public.notifications
    where type = 'job.expiring' and payload->>'jobId' = ${jobId}
    limit 1
  `);
  return rows.length > 0;
}

export async function retainNotifications(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const deleted = await deleteReadOlderThan(cutoff);
  return { deleted };
}

export async function runNotificationCron(input?: {
  now?: Date;
  sender?: EmailSender;
}) {
  const mail = await dispatchEmails(input);
  const retained = await retainNotifications(input?.now);
  return { ...mail, ...retained };
}

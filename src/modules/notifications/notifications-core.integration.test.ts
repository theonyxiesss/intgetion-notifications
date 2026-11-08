import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@intgetion/kit";
import { setNotificationsPorts } from "../../ports";
import {
  countUnread,
  dispatchEmails,
  listNotifications,
  markNotificationsRead,
  notify,
  readPreferences,
  unsubscribeByToken,
  type EmailSender,
} from "./service";

const owner = randomUUID();
const ownerAuth = randomUUID();
const outbox: { to: string; subject: string; text: string }[] = [];
const sender: EmailSender = {
  async send(message) {
    outbox.push(message);
    return "sent";
  },
};
const payload = () => ({
  jobId: randomUUID(),
  jobTitle: "Solidity engineer",
  expiresAt: "2031-02-01T00:00:00.000Z",
});

beforeAll(async () => {
  process.env.UNSUBSCRIBE_SECRET = "x".repeat(40);
  process.env.NEXT_PUBLIC_SITE_URL = "https://intgetion.test";
  setNotificationsPorts({
    loginEmail: async (authUid) => (authUid === ownerAuth ? "owner@example.com" : null),
  });
  await getDb().execute(sql`
    insert into public.users (id, auth_uid, locale) values (${owner}, ${ownerAuth}, 'en')
  `);
});

afterAll(async () => {
  await getDb().execute(sql`delete from public.users where id = ${owner}`);
});

describe("notification core in Postgres", () => {
  it("puts a notice in the inbox and counts it as unread", async () => {
    await notify("job.expiring", [owner], payload(), new Date());
    const page = await listNotifications(owner, {});
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ type: "job.expiring" });
    expect(await countUnread(owner)).toBe(1);

    await markNotificationsRead(owner, { all: true });
    expect(await countUnread(owner)).toBe(0);
  });

  it("refuses a payload that does not match the type", async () => {
    await expect(notify("job.expiring", [owner], { jobId: "nope" })).rejects.toThrow();
  });

  it("queues the email and sends it to the login address", async () => {
    const result = await dispatchEmails({ sender, now: new Date(Date.now() + 60_000) });
    expect(result.sent).toBeGreaterThanOrEqual(1);
    const mail = outbox.find((message) => message.to === "owner@example.com");
    expect(mail?.subject).toBeTruthy();
    expect(mail?.text).toContain("https://intgetion.test/unsubscribe?token=");

    const again = await dispatchEmails({ sender, now: new Date(Date.now() + 120_000) });
    expect(again.claimed).toBe(0);
  });

  it("turns email off by the unsubscribe link and stops queueing", async () => {
    const mail = outbox.find((message) => message.to === "owner@example.com")!;
    const token = decodeURIComponent(/token=([^\s"&]+)/.exec(mail.text)![1]!);
    await expect(unsubscribeByToken(token)).resolves.toEqual({ type: "job.expiring" });
    const prefs = await readPreferences(owner);
    expect(
      prefs.find((p) => p.type === "job.expiring" && p.channel === "email")?.enabled,
    ).toBe(false);

    await notify("job.expiring", [owner], payload(), new Date());
    const rows = await getDb().execute<{ n: number }>(sql`
      select count(*)::int as n from public.notification_emails
      where user_id = ${owner} and status = 'pending'
    `);
    expect(rows[0]?.n).toBe(0);
    expect(await countUnread(owner)).toBe(1);
  });

  it("refuses a forged unsubscribe token", async () => {
    await expect(unsubscribeByToken("forged.token")).rejects.toMatchObject({ status: 404 });
  });
});

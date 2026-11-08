import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  listNotifications: vi.fn(async () => ({ items: [], nextCursor: null })),
  countUnread: vi.fn(async () => 3),
  markNotificationsRead: vi.fn(async () => {}),
  notify: vi.fn(async () => {}),
  runNotificationCron: vi.fn(async () => ({ sent: 1, deleted: 0 })),
  runTelegramDispatch: vi.fn(async () => ({ sent: 0, skipped: 0 })),
}));

vi.mock("../modules/notifications/service", async (orig) => ({
  ...(await orig<typeof import("../modules/notifications/service")>()),
  ...service,
}));

const { createApp } = await import("./app");

const TOKEN = "test-notifications-token";
const USER = "22222222-2222-4222-8222-222222222222";
const handle = createApp({ serviceToken: TOKEN, siteUrl: "https://intgetion.test" });

function call(path: string, init: RequestInit & { user?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${TOKEN}`);
  if (init.user) headers.set("x-user-id", init.user);
  return handle(new Request(`http://notifications${path}`, { ...init, headers }));
}

beforeEach(() => vi.clearAllMocks());

describe("notifications service HTTP", () => {
  it("refuses a wrong token and needs the person on inbox routes", async () => {
    const refused = await handle(
      new Request("http://notifications/v1/me/notifications", {
        headers: { authorization: "Bearer nope", "x-user-id": USER },
      }),
    );
    expect(refused.status).toBe(401);
    expect((await call("/v1/me/notifications")).status).toBe(401);
  });

  it("lists with a bounded page and counts unread", async () => {
    await call("/v1/me/notifications?limit=20", { user: USER });
    expect(service.listNotifications).toHaveBeenCalledWith(USER, { limit: 20 });
    expect((await call("/v1/me/notifications?limit=500", { user: USER })).status).toBe(400);
    expect(await (await call("/v1/me/notifications/unread-count", { user: USER })).json())
      .toEqual({ unread: 3 });
  });

  it("refuses an unknown type before notifying", async () => {
    const response = await call("/v1/notify", {
      method: "POST",
      body: JSON.stringify({ type: "made.up", recipientIds: [USER], payload: {} }),
    });
    expect(response.status).toBe(400);
    expect(service.notify).not.toHaveBeenCalled();
  });

  it("passes a known type through to notify", async () => {
    const response = await call("/v1/notify", {
      method: "POST",
      body: JSON.stringify({
        type: "job.expiring",
        recipientIds: [USER],
        payload: { jobId: USER },
        email: false,
      }),
    });
    expect(response.status).toBe(200);
    expect(service.notify).toHaveBeenCalledWith(
      "job.expiring",
      [USER],
      { jobId: USER },
      expect.any(Date),
      { email: false },
    );
  });

  it("keeps Telegram off without a bot token", async () => {
    const response = await call("/v1/tasks/dispatch-telegram", { method: "POST" });
    expect(await response.json()).toEqual({ ok: true, disabled: true });
    expect(service.runTelegramDispatch).not.toHaveBeenCalled();
  });
});

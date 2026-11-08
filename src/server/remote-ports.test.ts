import { describe, expect, it, vi } from "vitest";
import { httpNotificationsPorts } from "./remote-ports";

describe("notifications remote ports", () => {
  it("asks the platform for the login email with the callback token", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ email: "a@example.com" }));
    const ports = httpNotificationsPorts({
      platformUrl: "https://platform.test/",
      platformToken: "p-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(ports.loginEmail("uid-1")).resolves.toBe("a@example.com");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://platform.test/api/internal/notifications/login-email?authUid=uid-1",
    );
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer p-token");
  });

  it("fails loudly when the platform refuses", async () => {
    const ports = httpNotificationsPorts({
      platformUrl: "https://platform.test",
      platformToken: "p",
      fetchImpl: (async () => new Response(null, { status: 503 })) as typeof fetch,
    });
    await expect(ports.loginEmail("x")).rejects.toThrow("503");
  });
});

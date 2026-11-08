import { describe, expect, it } from "vitest";
import { resolveDelivery } from "../lib/catalog";
import { telegramText } from "../service/render";

describe("Telegram notifications (D236, D237)", () => {
  it("renders the in-app text with a link to the right page", () => {
    const text = telegramText({
      locale: "ru",
      type: "search.alert",
      payload: { searchName: "Rust", matchCount: 3 },
      siteUrl: "https://intgetion.com",
    });
    expect(text).toContain("«Rust»");
    expect(text).toContain("3");
    expect(text).toMatch(/https:\/\/intgetion\.com\/ru\/saved-searches$/);
  });

  it("lists each digest job and a link to turn the brief off", () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    const text = telegramText({
      locale: "ru",
      type: "matches.digest",
      payload: {
        matchCount: 1,
        sampleJobIds: [jobId],
        sampleJobs: [{ jobId, title: "Rust engineer", companyName: "Acme" }],
      },
      siteUrl: "https://intgetion.com",
    });
    expect(text).toContain("Rust engineer — Acme");
    expect(text).toContain(`https://intgetion.com/ru/jobs/${jobId}`);
    expect(text).toContain("https://intgetion.com/ru/matches");
    expect(text).toContain("https://intgetion.com/ru/notifications");
    expect(text).toContain("Выключить");
  });

  it("follows the email default unless the user decided", () => {
    expect(resolveDelivery("matches.digest", "telegram", []).allowed).toBe(
      true,
    );
    expect(resolveDelivery("job.closed", "telegram", []).allowed).toBe(false);
    expect(
      resolveDelivery("matches.digest", "telegram", [
        { type: "matches.digest", channel: "telegram", enabled: false },
      ]).allowed,
    ).toBe(false);
  });
});

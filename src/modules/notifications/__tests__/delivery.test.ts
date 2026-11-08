import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES, resolveDelivery } from "../lib/catalog";
import {
  mergeApplicationBatch,
  nextSendAfter,
  utcHourStart,
} from "../service/batch-mail";
import { noopEmailSender } from "../service/email-sender";
import { emailCopy, renderEmail } from "../service/render";

describe("notification delivery rules", () => {
  it("lets an explicit preference turn email off while in-app stays on", () => {
    const preferences = [
      {
        type: "application.status_changed",
        channel: "email",
        enabled: false,
      },
    ];
    expect(
      resolveDelivery("application.status_changed", "email", preferences),
    ).toEqual({ allowed: false, reason: "disabled_by_preference" });
    expect(
      resolveDelivery("application.status_changed", "inapp", preferences)
        .allowed,
    ).toBe(true);
  });

  it("keeps one application.created batch per recipient per hour", () => {
    const hour = utcHourStart(new Date("2026-10-03T12:40:00.000Z"));
    expect(hour.toISOString()).toBe("2026-10-03T12:00:00.000Z");
    const first = mergeApplicationBatch(null, {
      jobId: "job-1",
      jobTitle: "First",
    });
    const second = mergeApplicationBatch(first.batch, {
      jobId: "job-2",
      jobTitle: "Second",
    });
    const repeat = mergeApplicationBatch(second.batch, {
      jobId: "job-1",
      jobTitle: "First",
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(repeat.batch.applicationCount).toBe(3);
    expect(repeat.batch.jobs).toHaveLength(2);
  });

  it("marks mail skipped when the sender is a noop", async () => {
    await expect(
      noopEmailSender.send({
        to: "person@example.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
      }),
    ).resolves.toBe("skipped");
  });

  it("renders en and ru email templates with an unsubscribe link", () => {
    for (const type of NOTIFICATION_TYPES) {
      for (const locale of ["en", "ru"] as const) {
        if (!emailCopy(locale, type)) continue;
        const rendered = renderEmail({
          locale,
          type,
          values: {
            count: 2,
            jobs: "Backend",
            jobTitle: "Backend",
            status: "viewed",
            decision: "approved",
            companyName: "Acme",
            date: "2026-10-06",
          },
          unsubscribeUrl: "https://example.com/en/unsubscribe?token=abc",
        });
        expect(rendered?.text).toContain(
          "https://example.com/en/unsubscribe?token=abc",
        );
        expect(rendered?.html).toContain(
          "https://example.com/en/unsubscribe?token=abc",
        );
        expect(rendered?.html).toContain("INTGETION JOB LIST");
        expect(rendered?.html).toContain("max-width:560px");
        expect(rendered?.subject.length).toBeGreaterThan(0);
      }
    }
  });

  it("backs off before the fifth attempt", () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    expect(nextSendAfter(1, now).toISOString()).toBe(
      "2026-10-03T12:01:00.000Z",
    );
    expect(nextSendAfter(5, now).toISOString()).toBe(
      "2026-10-03T12:16:00.000Z",
    );
  });
});

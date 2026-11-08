import { describe, expect, it } from "vitest";
import {
  AUTH_EMAIL_TYPES,
  NOTIFICATION_CATALOG,
  NOTIFICATION_TYPES,
  isAuthEmailType,
  isNotificationType,
  notificationPayloadSchema,
  resolveDelivery,
} from "../lib/catalog";
import type { NotificationType } from "../lib/catalog";
import { notificationPath } from "../service/render";

/** Section 15 table, in order: type → email default. */
const SECTION_15_EMAIL_DEFAULTS: [NotificationType, boolean][] = [
  ["application.created", true],
  ["application.viewed", false],
  ["application.status_changed", true],
  ["application.withdrawn", false],
  ["mutual_interest.revealed", true],
  ["job.moderation_decided", true],
  ["job.expiring", true],
  ["job.closed", false],
  ["company.verification_decided", true],
  ["matches.digest", true],
  ["report.decided", false],
  // D234: saved-search alerts, added after section 15.
  ["search.alert", true],
  // D240: new jobs of a followed company.
  ["company.new_jobs", true],
  // D368: the employer side of the morning brief.
  ["company.candidates_digest", true],
  // D456: freelance orders and services.
  ["freelance.request_created", true],
  ["freelance.order_updated", true],
  ["freelance.service_decided", true],
  // D569: new task proposals and hires use the normal freelance notice channels.
  ["freelance.task_proposal", true],
  // D457: creative tests. Invite email is skipped per call when opt-in is off.
  ["ugc.campaign_decided", true],
  ["ugc.application", false],
  ["ugc.invite", true],
  ["ugc.submission", false],
  ["ugc.submission_decided", true],
  ["ugc.deadline", true],
  // U4b (D574): review reminders and room messages.
  ["ugc.review_due", true],
  ["ugc.review_late", true],
  ["ugc.message", false],
  // U7: a problem raised on an order and its outcome.
  ["ugc.dispute", true],
];

describe("notification catalog (15, D100)", () => {
  it("contains every configured event in catalog order", () => {
    expect(NOTIFICATION_TYPES).toHaveLength(28);
    expect([...NOTIFICATION_TYPES]).toEqual(
      SECTION_15_EMAIL_DEFAULTS.map(([type]) => type),
    );
  });

  it("matches the section 15 email defaults", () => {
    for (const [type, emailDefault] of SECTION_15_EMAIL_DEFAULTS) {
      expect(NOTIFICATION_CATALOG[type].emailDefault).toBe(emailDefault);
    }
  });

  it("batches application.created; matches.digest and search.alert are daily", () => {
    expect(NOTIFICATION_CATALOG["application.created"].policy).toBe(
      "hourly_batch",
    );
    expect(NOTIFICATION_CATALOG["matches.digest"].policy).toBe("daily_digest");
    // D234: saved-search alerts are scheduled by their own cron.
    expect(NOTIFICATION_CATALOG["search.alert"].policy).toBe("daily_digest");
    const scheduled = [
      "application.created",
      "matches.digest",
      "search.alert",
      "company.new_jobs",
      "company.candidates_digest",
    ];
    for (const type of NOTIFICATION_TYPES) {
      if (!scheduled.includes(type)) {
        expect(NOTIFICATION_CATALOG[type].policy).toBe("immediate");
      }
    }
  });

  it("accepts a valid payload and rejects contact data and junk", () => {
    const schema = notificationPayloadSchema("application.created");
    const valid = {
      applicationId: "a1",
      jobId: "j1",
      jobTitle: "Backend Developer",
      candidateId: "u1",
    };
    expect(schema.safeParse(valid).success).toBe(true);
    // no contacts in payloads (D16, D23)
    expect(schema.safeParse({ ...valid, email: "a@b.c" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, phone: "+491701234567" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...valid, telegram: "@user" }).success).toBe(
      false,
    );
    const { candidateId: _omitted, ...missingField } = valid;
    void _omitted;
    expect(schema.safeParse(missingField).success).toBe(false); // missing candidateId
  });

  it("catalogs task proposal notices without exposing message content", () => {
    const schema = notificationPayloadSchema("freelance.task_proposal");
    const payload = {
      taskId: "task-1",
      taskTitle: "Landing page",
      proposalId: "proposal-1",
      decision: "received",
    };
    expect(schema.safeParse(payload).success).toBe(true);
    expect(
      schema.safeParse({ ...payload, cover: "private proposal text" }).success,
    ).toBe(false);
    expect(NOTIFICATION_CATALOG["freelance.task_proposal"].emailDefault).toBe(
      true,
    );
    expect(notificationPath("freelance.task_proposal", payload)).toBe(
      "/freelance/tasks/mine",
    );
  });

  it("validates enums and digest payload shapes", () => {
    expect(
      notificationPayloadSchema("application.status_changed").safeParse({
        applicationId: "a1",
        jobId: "j1",
        jobTitle: "Backend Developer",
        status: "fired",
      }).success,
    ).toBe(false);
    expect(
      notificationPayloadSchema("application.status_changed").safeParse({
        applicationId: "a1",
        jobId: "j1",
        jobTitle: "Backend Developer",
        status: "offer",
      }).success,
    ).toBe(true);
    expect(
      notificationPayloadSchema("matches.digest").safeParse({
        matchCount: -1,
        sampleJobIds: [],
      }).success,
    ).toBe(false);
    expect(
      notificationPayloadSchema("matches.digest").safeParse({
        matchCount: 3,
        sampleJobIds: ["j1", "j2", "j3", "j4", "j5", "j6"],
      }).success,
    ).toBe(false);
  });

  it("keeps freelance payloads to ids, the service title and a known status (D456)", () => {
    const schema = notificationPayloadSchema("freelance.order_updated");
    const valid = { orderId: "o1", serviceTitle: "Logo", status: "accepted" };
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, status: "paid" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, contacts: "@seller" }).success).toBe(
      false,
    );
    expect(
      notificationPayloadSchema("freelance.request_created").safeParse({
        orderId: "o1",
        serviceTitle: "Logo",
        brief: "my phone is +49170",
      }).success,
    ).toBe(false);
    expect(
      notificationPayloadSchema("freelance.service_decided").safeParse({
        serviceId: "s1",
        serviceTitle: "Logo",
        decision: "removed",
      }).success,
    ).toBe(true);
  });

  it("keeps auth emails outside the catalog in a separate type domain", () => {
    expect(AUTH_EMAIL_TYPES).toHaveLength(3);
    for (const authType of AUTH_EMAIL_TYPES) {
      expect(isNotificationType(authType)).toBe(false);
      expect(isAuthEmailType(authType)).toBe(true);
    }
    expect(isAuthEmailType("application.created")).toBe(false);
  });
});

describe("resolveDelivery (15, D102)", () => {
  it("applies catalog defaults when there are no rows", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(resolveDelivery(type, "inapp", [])).toEqual({ allowed: true });
      expect(resolveDelivery(type, "email", []).allowed).toBe(
        NOTIFICATION_CATALOG[type].emailDefault,
      );
    }
  });

  it("lets preferences turn channels off", () => {
    const preferences = [
      { type: "application.status_changed", channel: "email", enabled: false },
    ];
    expect(
      resolveDelivery("application.status_changed", "email", preferences),
    ).toEqual({
      allowed: false,
      reason: "disabled_by_preference",
    });
  });

  it("lets preferences turn a default-off channel on", () => {
    const preferences = [
      { type: "application.viewed", channel: "email", enabled: true },
    ];
    expect(resolveDelivery("application.viewed", "email", preferences)).toEqual(
      {
        allowed: true,
      },
    );
    // inapp stays on by default even with unrelated rows
    expect(resolveDelivery("application.viewed", "inapp", preferences)).toEqual(
      {
        allowed: true,
      },
    );
  });

  it("rejects unknown types and channels", () => {
    expect(() =>
      resolveDelivery("made.up" as NotificationType, "email", []),
    ).toThrow();
    expect(() =>
      resolveDelivery("application.created", "sms" as "email", []),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  DIGEST_MIN_SCORE,
  nextDigestAt,
  shouldSendDigest,
} from "../lib/digest";
import type { NotificationPreferenceRow } from "../lib/catalog";

const noPreferences: NotificationPreferenceRow[] = [];

describe("nextDigestAt (15, D101)", () => {
  it("schedules the 08:00 local morning in Europe/Berlin", () => {
    expect(
      nextDigestAt("Europe/Berlin", null, new Date("2026-01-12T06:00:00Z")),
    ).toEqual(new Date("2026-01-12T07:00:00Z")); // 08:00 CET
  });

  it("schedules the 08:00 local morning in America/New_York", () => {
    expect(
      nextDigestAt("America/New_York", null, new Date("2026-01-12T12:00:00Z")),
    ).toEqual(new Date("2026-01-12T13:00:00Z")); // 08:00 EST
  });

  it("schedules the 08:00 local morning in Asia/Kolkata (+5:30)", () => {
    expect(
      nextDigestAt("Asia/Kolkata", null, new Date("2026-01-12T01:00:00Z")),
    ).toEqual(new Date("2026-01-12T02:30:00Z"));
  });

  it("schedules the 08:00 local morning in Australia/Lord_Howe (30-minute shift)", () => {
    // Standard +10:30 in July: local 07:30 Jul 15 → morning is Jul 14 21:30Z.
    expect(
      nextDigestAt(
        "Australia/Lord_Howe",
        null,
        new Date("2026-07-14T21:00:00Z"),
      ),
    ).toEqual(new Date("2026-07-14T21:30:00Z"));
    // DST +11:00 in January.
    expect(
      nextDigestAt(
        "Australia/Lord_Howe",
        null,
        new Date("2026-01-15T20:30:00Z"),
      ),
    ).toEqual(new Date("2026-01-15T21:00:00Z"));
  });

  it("waits at least 24 hours after the last digest", () => {
    const lastSent = new Date("2026-01-12T07:00:00Z"); // 08:00 CET
    const now = new Date("2026-01-12T08:00:00Z"); // 09:00 CET, same morning
    // Today's morning is 1h after the last send → tomorrow.
    expect(nextDigestAt("Europe/Berlin", lastSent, now)).toEqual(
      new Date("2026-01-13T07:00:00Z"),
    );
  });

  it("treats exactly 24 hours as due", () => {
    const lastSent = new Date("2026-01-11T07:00:00Z");
    expect(
      nextDigestAt("Europe/Berlin", lastSent, new Date("2026-01-12T07:00:00Z")),
    ).toEqual(new Date("2026-01-12T07:00:00Z"));
  });

  it("handles the DST spring transition (23-hour local day delays by a day)", () => {
    // EU switch 2026-03-29 01:00Z: the next local morning is only 23h after
    // the previous send, so the digest moves to the following morning.
    const lastSent = new Date("2026-03-28T07:00:00Z"); // 08:00 CET
    const now = new Date("2026-03-28T09:00:00Z");
    expect(nextDigestAt("Europe/Berlin", lastSent, now)).toEqual(
      new Date("2026-03-30T06:00:00Z"), // 08:00 CEST
    );
  });

  it("handles the DST fall transition (25-hour local day)", () => {
    const lastSent = new Date("2026-10-25T06:00:00Z"); // 08:00 CEST
    const now = new Date("2026-10-25T08:00:00Z");
    expect(nextDigestAt("Europe/Berlin", lastSent, now)).toEqual(
      new Date("2026-10-26T07:00:00Z"), // 08:00 CET, 25h later
    );
  });

  it("permits a late send when the scheduled morning was missed", () => {
    // Last digest 3 days ago: today's morning is already allowed even at 10:00.
    const lastSent = new Date("2026-01-09T07:00:00Z");
    expect(
      nextDigestAt("Europe/Berlin", lastSent, new Date("2026-01-12T09:00:00Z")),
    ).toEqual(new Date("2026-01-12T07:00:00Z"));
  });
});

describe("shouldSendDigest (15, 12.6, D101)", () => {
  const due = {
    timeZone: "Europe/Berlin",
    lastSentAt: new Date("2026-01-09T07:00:00Z"),
    now: new Date("2026-01-12T08:00:00Z"),
    preferences: noPreferences,
  };

  it("requires a score of at least 0.65", () => {
    expect(shouldSendDigest({ ...due, score: 0.64 })).toEqual({
      send: false,
      reason: "below_score_threshold",
    });
    expect(shouldSendDigest({ ...due, score: DIGEST_MIN_SCORE })).toEqual({
      send: true,
    });
    expect(shouldSendDigest({ ...due, score: null })).toEqual({
      send: false,
      reason: "below_score_threshold",
    });
  });

  it("refuses to send before the scheduled morning", () => {
    expect(
      shouldSendDigest({
        ...due,
        score: 0.8,
        now: new Date("2026-01-12T06:59:59Z"),
      }),
    ).toEqual({ send: false, reason: "not_due" });
  });

  it("respects disabled digest preferences on either channel", () => {
    const inappOff: NotificationPreferenceRow[] = [
      { type: "matches.digest", channel: "inapp", enabled: false },
    ];
    expect(
      shouldSendDigest({ ...due, score: 0.8, preferences: inappOff }),
    ).toEqual({
      send: false,
      reason: "delivery_disabled",
    });
    const emailOff: NotificationPreferenceRow[] = [
      { type: "matches.digest", channel: "email", enabled: false },
    ];
    expect(
      shouldSendDigest({ ...due, score: 0.8, preferences: emailOff }),
    ).toEqual({
      send: false,
      reason: "delivery_disabled",
    });
  });

  it("sends when due, on threshold and enabled", () => {
    expect(shouldSendDigest({ ...due, score: 0.9 })).toEqual({ send: true });
  });

  it("never sends more often than once per 24 hours", () => {
    expect(
      shouldSendDigest({
        ...due,
        score: 0.9,
        lastSentAt: new Date("2026-01-12T06:00:00Z"), // 2h ago
        now: new Date("2026-01-12T08:00:00Z"),
      }),
    ).toEqual({ send: false, reason: "not_due" });
  });
});

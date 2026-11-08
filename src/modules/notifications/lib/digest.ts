/**
 * Daily digest scheduling (15 matches.digest, 12.6, D101): morning 08:00 in
 * the recipient's IANA zone via localToUtc from src/lib/tz.ts, at most once
 * per 24 hours (instant math, so DST shifts push the digest by a day rather
 * than violating the interval), shown only for matches with score ≥ 0.65.
 */
import { localToUtc, timeZoneOffsetMinutes } from "@intgetion/kit";
import type { NotificationChannel, NotificationType } from "./catalog";
import { resolveDelivery } from "./catalog";

export const DIGEST_HOUR_LOCAL = 8;
/** "Не чаще раза в сутки" — instant arithmetic, DST days may delay a day. */
export const DIGEST_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Show threshold for the digest (22/9B, 12.6). */
export const DIGEST_MIN_SCORE = 0.65;

const DAY_MS = 24 * 60 * 60 * 1000;

function localMidnightUtc(timeZone: string, instant: Date): Date {
  const offsetMinutes = timeZoneOffsetMinutes(instant, timeZone);
  const local = new Date(+instant + offsetMinutes * 60000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

/**
 * The 08:00-local instant of the day whose morning is the next permitted
 * digest send. With no lastSentAt this is the next upcoming morning; with
 * lastSentAt the first morning that is at least 24h after it (D101). The
 * returned instant can lie in the past (a missed tick) — sending is then
 * already permitted.
 */
export function nextDigestAt(
  timeZone: string,
  lastSentAt: Date | null,
  now: Date,
): Date {
  let dayStart = localMidnightUtc(timeZone, now);
  for (;;) {
    const candidate = localToUtc(dayStart, "08:00", timeZone);
    const tooSoon =
      lastSentAt !== null && +candidate - +lastSentAt < DIGEST_MIN_INTERVAL_MS;
    if (!tooSoon && (lastSentAt !== null || +candidate > +now)) {
      return candidate;
    }
    if (tooSoon) {
      dayStart = new Date(+dayStart + DAY_MS);
      continue;
    }
    // No lastSentAt and the morning already passed: next upcoming morning.
    if (+candidate > +now) {
      return candidate;
    }
    dayStart = new Date(+dayStart + DAY_MS);
  }
}

export interface DigestDecisionInput {
  timeZone: string;
  lastSentAt: Date | null;
  now: Date;
  /** Best match score for the recipient; null = no matches. */
  score: number | null;
  /** Preferences of the recipient for the digest type/channel. */
  preferences: readonly {
    type: string;
    channel: string;
    enabled: boolean;
  }[];
}

export type DigestDecision =
  | { send: true }
  | {
      send: false;
      reason: "below_score_threshold" | "not_due" | "delivery_disabled";
    };

/**
 * Whether the digest email may be sent right now: score ≥ 0.65, the
 * scheduled morning has arrived (or was missed), the 24h interval holds and
 * the recipient has not disabled the digest on either channel.
 */
export function shouldSendDigest(input: DigestDecisionInput): DigestDecision {
  const { timeZone, lastSentAt, now, score, preferences } = input;
  if (score === null || score < DIGEST_MIN_SCORE) {
    return { send: false, reason: "below_score_threshold" };
  }
  // nextDigestAt already enforces the 24h interval against lastSentAt.
  const scheduled = nextDigestAt(timeZone, lastSentAt, now);
  if (+scheduled > +now) {
    return { send: false, reason: "not_due" };
  }
  for (const channel of ["inapp", "email"] as const) {
    const delivery = resolveDelivery(
      "matches.digest" as NotificationType,
      channel as NotificationChannel,
      preferences,
    );
    if (!delivery.allowed) {
      return { send: false, reason: "delivery_disabled" };
    }
  }
  return { send: true };
}

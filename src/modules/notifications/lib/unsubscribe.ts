/**
 * Unsubscribe links (15): every catalog email carries a signed link; auth
 * emails never do (D103). Token = base64url(payload) + "." + base64url(
 * HMAC-SHA256(payload, secret)); the signature comparison is constant-time
 * (both sides normalized through SHA-256 before timingSafeEqual).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isNotificationType, type NotificationType } from "./catalog";

export interface UnsubscribeClaims {
  userId: string;
  type: NotificationType;
  /** Token is valid strictly before this instant. */
  expiresAt: Date;
}

export type UnsubscribeVerification =
  | { valid: true; claims: UnsubscribeClaims }
  | {
      valid: false;
      reason: "format" | "signature" | "expired" | "unknown_type";
    };

const claimsSchema = z.strictObject({
  userId: z.string().min(1),
  type: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function fromBase64Url(value: string): Buffer | null {
  try {
    const buffer = Buffer.from(value, "base64url");
    // Buffer.from is lenient; re-encode to detect malformed input.
    return buffer.length > 0 &&
      buffer.toString("base64url") === value.replace(/=+$/, "")
      ? buffer
      : null;
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

/** Constant-time comparison over normalized digests (D103). */
function constantTimeEquals(a: Buffer, b: Buffer): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function signUnsubscribe(
  claims: UnsubscribeClaims,
  secret: string,
): string {
  const payload = toBase64Url(
    Buffer.from(
      JSON.stringify({
        userId: claims.userId,
        type: claims.type,
        expiresAt: claims.expiresAt.toISOString(),
      }),
      "utf8",
    ),
  );
  return `${payload}.${toBase64Url(sign(payload, secret))}`;
}

export function verifyUnsubscribe(
  token: string,
  secret: string,
  now: Date,
): UnsubscribeVerification {
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) {
    return { valid: false, reason: "format" };
  }
  const payloadPart = token.slice(0, dotIndex);
  const signaturePart = token.slice(dotIndex + 1);
  const payloadBytes = fromBase64Url(payloadPart);
  const signatureBytes = fromBase64Url(signaturePart);
  if (payloadBytes === null || signatureBytes === null) {
    return { valid: false, reason: "format" };
  }
  if (!constantTimeEquals(signatureBytes, sign(payloadPart, secret))) {
    return { valid: false, reason: "signature" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    return { valid: false, reason: "format" };
  }
  const claims = claimsSchema.safeParse(parsed);
  if (!claims.success) {
    return { valid: false, reason: "format" };
  }
  if (!isNotificationType(claims.data.type)) {
    return { valid: false, reason: "unknown_type" };
  }
  const expiresAt = new Date(claims.data.expiresAt);
  if (!(+now < +expiresAt)) {
    return { valid: false, reason: "expired" };
  }
  return {
    valid: true,
    claims: {
      userId: claims.data.userId,
      type: claims.data.type as NotificationType,
      expiresAt,
    },
  };
}

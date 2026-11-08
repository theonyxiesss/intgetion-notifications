import { describe, expect, it } from "vitest";
import { signUnsubscribe, verifyUnsubscribe } from "../lib/unsubscribe";
import type { NotificationType } from "../lib/catalog";

const SECRET = "test-secret";
const USER = "user-1";
const NOW = new Date("2026-10-05T12:00:00Z");
const EXPIRES = new Date("2026-10-05T13:00:00Z");
const TYPE: NotificationType = "application.status_changed";

describe("signUnsubscribe / verifyUnsubscribe (15, D103)", () => {
  it("verifies a freshly signed token", () => {
    const token = signUnsubscribe(
      { userId: USER, type: TYPE, expiresAt: EXPIRES },
      SECRET,
    );
    const result = verifyUnsubscribe(token, SECRET, NOW);
    expect(result).toEqual({
      valid: true,
      claims: { userId: USER, type: TYPE, expiresAt: EXPIRES },
    });
  });

  it("rejects a tampered payload field", () => {
    const token = signUnsubscribe(
      { userId: USER, type: TYPE, expiresAt: EXPIRES },
      SECRET,
    );
    const [payload, signature] = token.split(".");
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    claims.userId = "user-2";
    const tampered = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;
    expect(verifyUnsubscribe(tampered, SECRET, NOW)).toEqual({
      valid: false,
      reason: "signature",
    });
  });

  it("rejects a tampered signature", () => {
    const token = signUnsubscribe(
      { userId: USER, type: TYPE, expiresAt: EXPIRES },
      SECRET,
    );
    const [payload, signature] = token.split(".");
    const tamperedSignature =
      signature.slice(0, -2) + (signature.endsWith("AA") ? "BB" : "AA");
    expect(
      verifyUnsubscribe(`${payload}.${tamperedSignature}`, SECRET, NOW),
    ).toEqual({
      valid: false,
      reason: "signature",
    });
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribe(
      { userId: USER, type: TYPE, expiresAt: EXPIRES },
      SECRET,
    );
    expect(verifyUnsubscribe(token, "other-secret", NOW)).toEqual({
      valid: false,
      reason: "signature",
    });
  });

  it("rejects a token 1 ms past its expiry", () => {
    const token = signUnsubscribe(
      { userId: USER, type: TYPE, expiresAt: EXPIRES },
      SECRET,
    );
    expect(verifyUnsubscribe(token, SECRET, new Date(+EXPIRES - 1)).valid).toBe(
      true,
    );
    expect(verifyUnsubscribe(token, SECRET, EXPIRES)).toEqual({
      valid: false,
      reason: "expired",
    });
    expect(verifyUnsubscribe(token, SECRET, new Date(+EXPIRES + 1))).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("rejects malformed tokens", () => {
    for (const token of ["", "no-dot", ".sig", "payload.", "###.###"]) {
      const result = verifyUnsubscribe(token, SECRET, NOW);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(["format", "signature"]).toContain(result.reason);
      }
    }
  });

  it("rejects well-signed tokens for types outside the catalog (auth emails)", () => {
    const token = signUnsubscribe(
      {
        userId: USER,
        type: "auth.magic_link" as unknown as NotificationType,
        expiresAt: EXPIRES,
      },
      SECRET,
    );
    expect(verifyUnsubscribe(token, SECRET, NOW)).toEqual({
      valid: false,
      reason: "unknown_type",
    });
  });
});

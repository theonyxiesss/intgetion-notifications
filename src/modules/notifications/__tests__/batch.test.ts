import { describe, expect, it } from "vitest";
import { groupHourlyBatch, type ApplicationCreatedEvent } from "../lib/batch";

const NOW = new Date("2026-10-05T12:30:00Z");
const HOUR_MS = 60 * 60 * 1000;

function event(
  overrides: Partial<ApplicationCreatedEvent> = {},
): ApplicationCreatedEvent {
  return {
    recipientId: "rec1",
    applicationId: "app1",
    jobId: "j1",
    jobTitle: "Backend Developer",
    createdAt: new Date("2026-10-05T12:10:00Z"),
    ...overrides,
  };
}

describe("groupHourlyBatch (15, D100)", () => {
  it("collapses several applications in the same hour into one email per recipient", () => {
    const batches = groupHourlyBatch(
      [
        event({ applicationId: "app1" }),
        event({ applicationId: "app2", jobId: "j2", jobTitle: "DevOps" }),
        event({ applicationId: "app3", jobId: "j1" }),
      ],
      NOW,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].recipientId).toBe("rec1");
    expect(batches[0].applicationCount).toBe(3);
    expect(batches[0].jobs).toEqual([
      { jobId: "j1", jobTitle: "Backend Developer" },
      { jobId: "j2", jobTitle: "DevOps" },
    ]);
  });

  it("does not mix different recipients", () => {
    const batches = groupHourlyBatch(
      [
        event({ recipientId: "rec1" }),
        event({ recipientId: "rec2", applicationId: "app2" }),
      ],
      NOW,
    );
    expect(batches.map((batch) => batch.recipientId).sort()).toEqual([
      "rec1",
      "rec2",
    ]);
    expect(batches.every((batch) => batch.applicationCount === 1)).toBe(true);
  });

  it("uses the UTC hour as the boundary: hour start inclusive, end exclusive", () => {
    const hourStart = Math.floor(+NOW / HOUR_MS) * HOUR_MS; // 12:00Z
    const batches = groupHourlyBatch(
      [
        event({ applicationId: "edge-start", createdAt: new Date(hourStart) }),
        event({
          applicationId: "edge-before",
          createdAt: new Date(hourStart - 1),
        }),
        event({
          applicationId: "edge-end",
          createdAt: new Date(hourStart + HOUR_MS),
        }),
        event({
          applicationId: "edge-inside",
          createdAt: new Date(hourStart + HOUR_MS - 1),
        }),
      ],
      NOW,
    );
    expect(batches[0].applicationCount).toBe(2);
    expect(batches[0].jobs.map((job) => job.jobId)).toEqual(["j1"]);
  });

  it("returns an empty list when nothing happened this hour", () => {
    expect(groupHourlyBatch([], NOW)).toEqual([]);
    expect(
      groupHourlyBatch(
        [event({ createdAt: new Date("2026-10-05T11:59:59Z") })],
        NOW,
      ),
    ).toEqual([]);
  });
});

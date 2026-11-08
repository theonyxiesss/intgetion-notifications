/**
 * Hourly batching for application.created emails (15, D100). Events created
 * within the same UTC hour as `now` collapse into one email per recipient;
 * the UTC hour is the batch boundary because deliveries are computed by a
 * server cron whose clock is UTC (D6 forbids storing offsets, and a local
 * hour would differ per recipient zone without adding information).
 */
export interface ApplicationCreatedEvent {
  recipientId: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  createdAt: Date;
}

export interface BatchedApplicationCreated {
  recipientId: string;
  applicationCount: number;
  /** Jobs of this hour, in first-seen order, without duplicates. */
  jobs: { jobId: string; jobTitle: string }[];
}

const HOUR_MS = 60 * 60 * 1000;

export function groupHourlyBatch(
  events: readonly ApplicationCreatedEvent[],
  now: Date,
): BatchedApplicationCreated[] {
  const hourStart = Math.floor(+now / HOUR_MS) * HOUR_MS;
  const hourEnd = hourStart + HOUR_MS;

  const byRecipient = new Map<string, BatchedApplicationCreated>();
  for (const event of events) {
    const createdAt = +event.createdAt;
    if (createdAt < hourStart || createdAt >= hourEnd) {
      continue;
    }
    let batch = byRecipient.get(event.recipientId);
    if (!batch) {
      batch = { recipientId: event.recipientId, applicationCount: 0, jobs: [] };
      byRecipient.set(event.recipientId, batch);
    }
    batch.applicationCount += 1;
    if (!batch.jobs.some((job) => job.jobId === event.jobId)) {
      batch.jobs.push({ jobId: event.jobId, jobTitle: event.jobTitle });
    }
  }
  return [...byRecipient.values()];
}

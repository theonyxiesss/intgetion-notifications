const HOUR_MS = 60 * 60 * 1000;

export type BatchJob = { jobId: string; jobTitle: string };

export type ApplicationBatch = {
  applicationCount: number;
  jobs: BatchJob[];
};

export function utcHourStart(instant: Date): Date {
  return new Date(Math.floor(instant.getTime() / HOUR_MS) * HOUR_MS);
}

export function batchKey(userId: string, hourStart: Date): string {
  return `${userId}|application.created|${hourStart.toISOString()}`;
}

/** One email per recipient per UTC hour (D100). A repeat merges into the same batch. */
export function mergeApplicationBatch(
  current: ApplicationBatch | null,
  event: BatchJob,
): { batch: ApplicationBatch; created: boolean } {
  if (!current) {
    return {
      created: true,
      batch: { applicationCount: 1, jobs: [event] },
    };
  }
  const jobs = current.jobs.some((job) => job.jobId === event.jobId)
    ? current.jobs
    : [...current.jobs, event];
  return {
    created: false,
    batch: { applicationCount: current.applicationCount + 1, jobs },
  };
}

/** 1, 2, 4, 8, 16 minutes. The fifth failure marks the row failed (D125). */
export function nextSendAfter(attempts: number, now: Date): Date {
  const minutes = 2 ** Math.max(attempts - 1, 0);
  return new Date(now.getTime() + minutes * 60 * 1000);
}

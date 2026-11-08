/**
 * Job cards in alert emails (D330). The queued email payload carries what
 * the card shows, frozen at enqueue time, so the dispatcher renders without
 * another query. Salary is formatted here, in the recipient's locale.
 */
import { formatMoneyDto, type MoneyDto } from "@intgetion/kit";
import type { AppLocale } from "@intgetion/kit";

export type EmailJobPayload = {
  jobId: string;
  /** "Title — Company": the plain-text line older templates use. */
  jobTitle: string;
  title: string;
  companyName: string;
  location: string | null;
  workFormat: "remote" | "hybrid" | "onsite" | null;
  salary: { min: string; max: string | null; period: string } | null;
  summary: string | null;
};

export type EmailJobSource = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  locationCountry: string | null;
  workFormat: string | null;
  salaryMin: MoneyDto | null;
  salaryMax: MoneyDto | null;
  company: { name: string };
};

const SUMMARY_MAX = 160;

/** First sentences of the description as plain text, cut at a word. */
export function jobSummary(description: string | null): string | null {
  if (!description) return null;
  const plain = description
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_`>[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  if (plain.length <= SUMMARY_MAX) return plain;
  const cut = plain.slice(0, SUMMARY_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** Like `formatMoneyDto`, without ",00" on whole amounts. */
function formatSalary(value: MoneyDto, locale: AppLocale): string {
  const full = formatMoneyDto(value, locale);
  const digits =
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: value.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const whole =
    BigInt(value.amountMinor) % BigInt(10) ** BigInt(digits) === BigInt(0);
  if (!whole || digits === 0) return full;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(BigInt(value.amountMinor) / BigInt(10) ** BigInt(digits));
}

function workFormatOf(value: string | null): EmailJobPayload["workFormat"] {
  return value === "remote" || value === "hybrid" || value === "onsite"
    ? value
    : null;
}

export function toEmailJob(
  job: EmailJobSource,
  locale: AppLocale,
): EmailJobPayload {
  let salary: EmailJobPayload["salary"] = null;
  if (job.salaryMin) {
    try {
      salary = {
        min: formatSalary(job.salaryMin, locale),
        max: job.salaryMax ? formatSalary(job.salaryMax, locale) : null,
        period: job.salaryMin.period,
      };
    } catch {
      salary = null;
    }
  }
  return {
    jobId: job.id,
    jobTitle: `${job.title} — ${job.company.name}`,
    title: job.title,
    companyName: job.company.name,
    location: job.location?.trim() || job.locationCountry || null,
    workFormat: workFormatOf(job.workFormat),
    salary,
    summary: jobSummary(job.description),
  };
}

/** Entries of a stored payload that carry a full card; older rows do not. */
export function readEmailJobs(
  payload: Record<string, unknown>,
): EmailJobPayload[] {
  if (!Array.isArray(payload.jobs)) return [];
  return payload.jobs.filter(
    (job): job is EmailJobPayload =>
      Boolean(job) &&
      typeof job === "object" &&
      typeof (job as EmailJobPayload).jobId === "string" &&
      typeof (job as EmailJobPayload).title === "string" &&
      typeof (job as EmailJobPayload).companyName === "string",
  );
}

import { renderEmailLayout, type EmailJobCard } from "@intgetion/kit";
import { messagesFor, type Messages } from "../../../i18n/messages";
import { localePrefix } from "@intgetion/kit";
import type { AppLocale } from "@intgetion/kit";
import type { TelegramCallbackButton } from "@intgetion/kit";
import { signTelegramAction } from "@intgetion/kit";
import { NOTIFICATION_CATALOG, type NotificationType } from "../lib/catalog";
import type { EmailJobPayload } from "../lib/email-jobs";

type EmailCopy = { subject: string; body: string };

export function emailCopy(
  locale: AppLocale,
  type: NotificationType,
): EmailCopy | null {
  const key = NOTIFICATION_CATALOG[type]
    .i18nKey as keyof Messages["notifications"]["types"];
  const block = messagesFor(locale).notifications.types[key] as {
    email?: EmailCopy;
  };
  return block.email ?? null;
}

export function unsubscribeLabel(locale: AppLocale): string {
  return messagesFor(locale).notifications.unsubscribe.link;
}

/**
 * `{name}` plus the `{count, plural, one {…} other {…}}` and
 * `{status, select, accepted {…} other {…}}` forms used in the catalog.
 * Branches hold plain text, no nested placeholders.
 */
export function fillTemplate(
  template: string,
  values: Record<string, string | number>,
  locale: AppLocale = "en",
): string {
  const rules = new Intl.PluralRules(locale);
  const withPlural = template.replace(
    /\{(\w+), (plural|select), ((?:[a-z_]+ \{[^}]*\} ?)+)\}/g,
    (_match, name: string, kind: string, forms: string) => {
      const branches = new Map(
        [...forms.matchAll(/([a-z_]+) \{([^}]*)\}/g)].map(
          ([, key, value]) => [key, value] as const,
        ),
      );
      if (kind === "select") {
        return (
          branches.get(String(values[name] ?? "")) ??
          branches.get("other") ??
          ""
        );
      }
      const count = Number(values[name] ?? 0);
      const branch =
        branches.get(rules.select(count)) ?? branches.get("other") ?? "";
      return branch.replaceAll("#", String(count));
    },
  );
  return withPlural.replace(/\{(\w+)\}/g, (_match, name: string) =>
    String(values[name] ?? ""),
  );
}

/** Cards for the email, at most DIGEST-size, with links to the job pages. */
function jobCards(
  jobs: EmailJobPayload[],
  locale: AppLocale,
  origin: string,
): EmailJobCard[] {
  const copy = messagesFor(locale).email.jobs;
  return jobs.slice(0, EMAIL_MAX_JOBS).map((job) => ({
    title: job.title,
    company: job.companyName,
    location: job.location,
    workFormat: job.workFormat ? copy.formats[job.workFormat] : null,
    salary: job.salary
      ? `${job.salary.min}${job.salary.max ? ` – ${job.salary.max}` : ""} / ${
          copy.per[job.salary.period as keyof typeof copy.per] ??
          job.salary.period
        }`
      : null,
    summary: job.summary,
    href: `${origin}${localePrefix(locale)}/jobs/${encodeURIComponent(job.jobId)}`,
  }));
}

/** At most this many cards in one email; the rest are one click away. */
export const EMAIL_MAX_JOBS = 5;

export function renderEmail(input: {
  locale: AppLocale;
  type: NotificationType;
  values: Record<string, string | number>;
  unsubscribeUrl: string;
  /** Page the email button opens, without locale (D188, D234, D240). */
  actionPath?: string;
  /** Full job cards (D330); without them the email lists titles in text. */
  jobs?: EmailJobPayload[];
}): { subject: string; text: string; html: string } | null {
  const copy = emailCopy(input.locale, input.type);
  if (!copy) return null;
  const subject = fillTemplate(copy.subject, input.values, input.locale);
  const filled = fillTemplate(copy.body, input.values, input.locale);
  // Morning briefs open with the agent's line (D370), then the list.
  const body =
    typeof input.values.intro === "string" && input.values.intro
      ? `${input.values.intro} ${filled}`
      : filled;
  const link = unsubscribeLabel(input.locale);
  const origin = new URL(input.unsubscribeUrl).origin;
  const mail = messagesFor(input.locale).email;
  const footer = {
    links: [
      {
        href: `${origin}${localePrefix(input.locale)}/settings/notifications`,
        label: mail.manage,
      },
      { href: input.unsubscribeUrl, label: link },
    ],
  };

  // New matching jobs (D330): cards instead of a run-on list of titles.
  const cards =
    input.type === "matches.digest" && input.jobs?.length
      ? jobCards(input.jobs, input.locale, origin)
      : [];
  if (cards.length > 0) {
    const title = mail.jobs.title;
    // The agent's own line when the brief has one (D370).
    const intro =
      typeof input.values.intro === "string" && input.values.intro
        ? input.values.intro
        : fillTemplate(
            mail.jobs.intro,
            { count: input.values.count ?? cards.length },
            input.locale,
          );
    const allHref = `${origin}${localePrefix(input.locale)}${input.actionPath ?? "/matches"}`;
    const text = [
      title,
      intro,
      ...cards.map((card) =>
        [
          card.title,
          [card.company, card.location].filter(Boolean).join(" · "),
          card.href,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
      `${mail.jobs.viewAll}: ${allHref}`,
      `${link}: ${input.unsubscribeUrl}`,
    ].join("\n\n");
    const html = renderEmailLayout({
      lang: input.locale,
      origin,
      preheader: intro,
      title,
      body: intro,
      jobs: cards,
      jobAction: mail.jobs.viewJob,
      moreAction: { href: allHref, label: mail.jobs.viewAll },
      footer: { reason: mail.footerAlerts, ...footer },
    });
    return { subject: title, text, html };
  }

  const text = `${subject}\n\n${body}\n\n${link}: ${input.unsubscribeUrl}`;
  const actionLabel =
    input.type === "matches.digest"
      ? messagesFor(input.locale).digest.openMatches
      : input.type === "search.alert"
        ? messagesFor(input.locale).savedSearches.openSearch
        : input.type === "company.new_jobs"
          ? messagesFor(input.locale).follows.openCompany
          : input.type === "company.candidates_digest"
            ? messagesFor(input.locale).notifications.brief.openCandidates
            : input.type === "freelance.service_decided"
              ? messagesFor(input.locale).notifications.freelance.openService
              : input.type === "freelance.task_proposal"
                ? messagesFor(input.locale).notifications.freelance.openTask
                : input.type.startsWith("freelance.")
                  ? messagesFor(input.locale).notifications.freelance.openOrder
                  : null;
  const action =
    actionLabel && input.actionPath
      ? {
          href: `${origin}${localePrefix(input.locale)}${input.actionPath}`,
          label: actionLabel,
        }
      : undefined;
  const html = renderEmailLayout({
    lang: input.locale,
    origin,
    preheader: body,
    title: subject,
    body,
    ...(action ? { action } : {}),
    footer,
  });
  return { subject, text, html };
}

export function templateValues(
  payload: Record<string, unknown>,
): Record<string, string | number> {
  const jobs = Array.isArray(payload.jobs)
    ? payload.jobs
        .map((job) =>
          job && typeof job === "object" && "jobTitle" in job
            ? String(job.jobTitle)
            : "",
        )
        .filter(Boolean)
        .join(", ")
    : "";
  const count =
    typeof payload.applicationCount === "number"
      ? payload.applicationCount
      : typeof payload.matchCount === "number"
        ? payload.matchCount
        : 1;
  const expires =
    typeof payload.expiresAt === "string" ? payload.expiresAt.slice(0, 10) : "";
  return {
    jobTitle: String(payload.jobTitle ?? jobs),
    status: String(payload.status ?? ""),
    decision: String(payload.decision ?? ""),
    companyName: String(payload.companyName ?? ""),
    searchName: String(payload.searchName ?? ""),
    serviceTitle: String(payload.serviceTitle ?? ""),
    taskTitle: String(payload.taskTitle ?? ""),
    intro: typeof payload.intro === "string" ? payload.intro : "",
    date: expires,
    count,
    jobs,
  };
}

/**
 * Where a notification leads, without locale (D237): the email button and
 * the Telegram link. Payload fields refine it where the type allows.
 */
export function notificationPath(
  type: NotificationType,
  payload: Record<string, unknown>,
): string {
  switch (type) {
    case "application.viewed":
    case "application.status_changed":
    case "job.closed":
      return "/applications";
    case "application.created":
    case "application.withdrawn":
    case "job.moderation_decided":
    case "job.expiring":
      return "/employer/jobs";
    case "mutual_interest.revealed":
      return "/contacts";
    case "company.verification_decided":
      return "/employer/company";
    case "matches.digest":
      return "/matches";
    case "search.alert":
      return typeof payload.query === "string" && payload.query
        ? `/jobs?${payload.query}`
        : "/saved-searches";
    case "company.candidates_digest": {
      const first = Array.isArray(payload.sampleCandidates)
        ? (payload.sampleCandidates[0] as { jobId?: unknown } | undefined)
        : undefined;
      return typeof first?.jobId === "string"
        ? `/employer/jobs/${encodeURIComponent(first.jobId)}`
        : "/employer/jobs";
    }
    case "company.new_jobs":
      return typeof payload.companySlug === "string"
        ? `/companies/${encodeURIComponent(payload.companySlug)}?tab=jobs`
        : "/saved-searches";
    case "freelance.request_created":
    case "freelance.order_updated":
      return typeof payload.orderId === "string"
        ? `/freelance/orders/${encodeURIComponent(payload.orderId)}`
        : "/freelance/orders";
    case "freelance.service_decided":
      return "/profile/freelance";
    case "freelance.task_proposal":
      return "/freelance/tasks/mine";
    default:
      return "/notifications";
  }
}

/**
 * «Accept» and «Decline» under a new freelance request (D456). Each opens a
 * second, confirming tap in the bot; nothing moves on the first one.
 */
export function telegramButtons(input: {
  locale: AppLocale;
  type: NotificationType;
  payload: Record<string, unknown>;
  actionSecret?: string;
}): TelegramCallbackButton[] | undefined {
  if (input.type !== "freelance.request_created" || !input.actionSecret) {
    return undefined;
  }
  const orderId = input.payload.orderId;
  if (typeof orderId !== "string") return undefined;
  const copy = messagesFor(input.locale).notifications.freelance;
  return [
    {
      label: copy.accept,
      data: signTelegramAction(input.actionSecret, 1, "accept", orderId),
    },
    {
      label: copy.decline,
      data: signTelegramAction(input.actionSecret, 1, "decline", orderId),
    },
  ];
}

/**
 * The in-app title and text of a notification as a Telegram message, with
 * a link to the page it is about (D237). Plain text, no markup.
 */
export function telegramText(input: {
  locale: AppLocale;
  type: NotificationType;
  payload: Record<string, unknown>;
  siteUrl: string;
}): string | null {
  const key = NOTIFICATION_CATALOG[input.type]
    .i18nKey as keyof Messages["notifications"]["types"];
  const block = messagesFor(input.locale).notifications.types[key] as {
    inapp?: { title: string; body: string };
  };
  if (!block.inapp) return null;
  const values = templateValues(input.payload);
  const title = fillTemplate(block.inapp.title, values, input.locale);
  const filled = fillTemplate(block.inapp.body, values, input.locale);
  // Morning briefs open with the agent's line (D370).
  const body = values.intro ? `${values.intro}\n${filled}` : filled;
  const link = `${input.siteUrl}${localePrefix(input.locale)}${notificationPath(input.type, input.payload)}`;
  if (input.type === "company.candidates_digest") {
    const lines = candidateLines(input);
    if (lines) {
      const copy = messagesFor(input.locale).notifications.brief;
      const root = `${input.siteUrl}${localePrefix(input.locale)}`;
      return `${title}
${body}

${lines}

${copy.turnOff}
${root}/notifications`;
    }
  }
  const jobs = input.type === "matches.digest" ? digestJobLines(input) : null;
  if (!jobs) {
    return `${title}
${body}

${link}`;
  }
  const copy = messagesFor(input.locale).notifications.brief;
  const root = `${input.siteUrl}${localePrefix(input.locale)}`;
  return `${title}
${body}

${jobs}

${copy.allMatches}
${root}/matches
${copy.turnOff}
${root}/notifications`;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Up to five "Title — Company" lines, each with an absolute job link (D349). */
function digestJobLines(input: {
  payload: Record<string, unknown>;
  siteUrl: string;
  locale: AppLocale;
}): string | null {
  const jobs = input.payload.sampleJobs;
  if (!Array.isArray(jobs)) return null;
  const lines = jobs.slice(0, 5).flatMap((job) => {
    if (!job || typeof job !== "object") return [];
    const row = job as Record<string, unknown>;
    const title = typeof row.title === "string" ? oneLine(row.title) : "";
    const company =
      typeof row.companyName === "string" ? oneLine(row.companyName) : "";
    const id = typeof row.jobId === "string" ? row.jobId : "";
    if (!title || !company || !id) return [];
    return [
      `${title} — ${company}`,
      `${input.siteUrl}${localePrefix(input.locale)}/jobs/${encodeURIComponent(id)}`,
    ];
  });
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Up to five anonymous cards (D368): "Role · N years — Job", skills and
 * why it fits, then a link to the job in the employer's cabinet.
 */
function candidateLines(input: {
  payload: Record<string, unknown>;
  siteUrl: string;
  locale: AppLocale;
}): string | null {
  const cards = input.payload.sampleCandidates;
  if (!Array.isArray(cards)) return null;
  const copy = messagesFor(input.locale).notifications.employerBrief;
  const reasons = copy.reasons as Record<string, string>;
  const lines = cards.slice(0, 5).flatMap((card) => {
    if (!card || typeof card !== "object") return [];
    const row = card as Record<string, unknown>;
    const jobId = typeof row.jobId === "string" ? row.jobId : "";
    const job = typeof row.jobTitle === "string" ? oneLine(row.jobTitle) : "";
    if (!jobId || !job) return [];
    const role =
      typeof row.role === "string" && row.role
        ? oneLine(row.role)
        : copy.noRole;
    const years =
      typeof row.experienceYears === "number"
        ? fillTemplate(copy.years, { count: row.experienceYears }, input.locale)
        : null;
    const skills = Array.isArray(row.skills)
      ? row.skills.filter((skill) => typeof skill === "string").join(", ")
      : "";
    const why = Array.isArray(row.reasons)
      ? row.reasons
          .map((reason) => reasons[String(reason)])
          .filter(Boolean)
          .join(", ")
      : "";
    return [
      `${[role, years].filter(Boolean).join(" · ")} — ${job}`,
      ...(skills ? [skills] : []),
      ...(why ? [`${copy.why}: ${why}`] : []),
      `${input.siteUrl}${localePrefix(input.locale)}/employer/jobs/${encodeURIComponent(jobId)}`,
    ];
  });
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Notification event catalog (spec 15) as data: the 11 event types of
 * section 15 plus saved-search alerts (D234), who
 * receives them, channels with defaults, delivery policy and zod payload
 * schemas. Payloads carry ids and short fields only — no contacts, no email
 * addresses, no phone numbers (D16, D23, D100).
 */
import { z } from "zod";

/** "telegram": a message from the platform bot to a linked account (D236). */
export const NOTIFICATION_CHANNELS = ["inapp", "email", "telegram"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type DeliveryPolicy = "immediate" | "hourly_batch" | "daily_digest";

/** Who receives the notification (15, column «Кому»). */
export type RecipientRole =
  | "candidate"
  | "companyMembers"
  | "companyMembersRecruiterPlus"
  | "jobCreator"
  | "companyOwner"
  | "reporter"
  | "candidateAndCompanyMembers"
  /** The owner of a saved search (D234). */
  | "searchOwner"
  /** A user following the company (D240). */
  | "companyFollower"
  /** Recruiter or higher of a company with the agent turned on (D368). */
  | "companyRecruiterPlusAgent"
  /** The buyer or the seller of a freelance order, per transition (D456). */
  | "freelanceParty"
  /** The seller of a freelance service (D456). */
  | "freelanceSeller"
  /** The client of a task or the freelancer who answered it (D569). */
  | "freelanceTaskParty"
  /** A company member or a creator on a creative test (D457). */
  | "ugcParty";

/** What happened to a freelance order, as the notice names it (D456). */
export const FREELANCE_ORDER_NOTICES = [
  "accepted",
  "declined",
  "cancelled",
  "expired",
  "started",
  "revision",
  "delivered",
  "completed",
] as const;
export type FreelanceOrderNotice = (typeof FREELANCE_ORDER_NOTICES)[number];

export const APPLICATION_STATUSES = [
  "applied",
  "viewed",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;

const idSchema = z.string().min(1);
const strict = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape);

export const NOTIFICATION_PAYLOAD_SCHEMAS = {
  applicationCreated: strict({
    applicationId: idSchema,
    jobId: idSchema,
    jobTitle: z.string().min(1),
    candidateId: idSchema,
  }),
  applicationViewed: strict({
    applicationId: idSchema,
    jobId: idSchema,
    jobTitle: z.string().min(1),
  }),
  applicationStatusChanged: strict({
    applicationId: idSchema,
    jobId: idSchema,
    jobTitle: z.string().min(1),
    status: z.enum(APPLICATION_STATUSES),
  }),
  applicationWithdrawn: strict({
    applicationId: idSchema,
    jobId: idSchema,
    jobTitle: z.string().min(1),
    candidateId: idSchema,
  }),
  mutualInterestRevealed: strict({
    applicationId: idSchema,
    jobId: idSchema,
    jobTitle: z.string().min(1),
  }),
  jobModerationDecided: strict({
    jobId: idSchema,
    jobTitle: z.string().min(1),
    decision: z.enum(["approved", "rejected"]),
  }),
  jobExpiring: strict({
    jobId: idSchema,
    jobTitle: z.string().min(1),
    expiresAt: z.iso.datetime(),
  }),
  jobClosed: strict({
    jobId: idSchema,
    jobTitle: z.string().min(1),
  }),
  companyVerificationDecided: strict({
    companyId: idSchema,
    companyName: z.string().min(1),
    decision: z.enum(["verified", "rejected"]),
  }),
  matchesDigest: strict({
    matchCount: z.number().int().min(0),
    sampleJobIds: z.array(idSchema).max(5),
    sampleJobs: z
      .array(
        strict({
          jobId: idSchema,
          title: z.string().min(1).max(200),
          companyName: z.string().min(1).max(200),
        }),
      )
      .max(5)
      .optional(),
    /** The agent's opening line (D370): LLM or template, plain text. */
    intro: z.string().min(1).max(300).optional(),
  }),
  searchAlert: strict({
    savedSearchId: idSchema,
    searchName: z.string().min(1).max(80),
    matchCount: z.number().int().min(1),
    sampleJobIds: z.array(idSchema).max(5),
  }),
  companyNewJobs: strict({
    companyId: idSchema,
    companySlug: z.string().min(1).max(120),
    companyName: z.string().min(1).max(200),
    matchCount: z.number().int().min(1),
    sampleJobIds: z.array(idSchema).max(5),
  }),
  // D368: anonymous cards only — no candidate id, name, email or phone.
  companyCandidatesDigest: strict({
    matchCount: z.number().int().min(1),
    sampleCandidates: z
      .array(
        strict({
          jobId: idSchema,
          jobTitle: z.string().min(1).max(200),
          role: z.string().min(1).max(160).nullable(),
          experienceYears: z.number().int().min(0).max(60).nullable(),
          skills: z.array(z.string().min(1).max(80)).max(5),
          reasons: z
            .array(
              z.enum([
                "skills",
                "role",
                "salary",
                "tzOverlap",
                "experience",
                "languages",
              ]),
            )
            .max(6),
        }),
      )
      .min(1)
      .max(5),
    /** The agent's opening line (D370): LLM or template, plain text. */
    intro: z.string().min(1).max(300).optional(),
  }),
  reportDecided: strict({
    reportId: idSchema,
    entityType: z.enum([
      "job",
      "company",
      "user",
      "freelance_service",
      "freelance_order",
    ]),
    decision: z.enum(["confirmed", "dismissed"]),
  }),
  // D456: the service title only — no names, contacts or order text.
  freelanceRequestCreated: strict({
    orderId: idSchema,
    serviceTitle: z.string().min(1).max(200),
  }),
  freelanceOrderUpdated: strict({
    orderId: idSchema,
    serviceTitle: z.string().min(1).max(200),
    status: z.enum(FREELANCE_ORDER_NOTICES),
  }),
  freelanceServiceDecided: strict({
    serviceId: idSchema,
    serviceTitle: z.string().min(1).max(200),
    decision: z.enum(["published", "rejected", "removed"]),
  }),
  freelanceTaskProposal: strict({
    taskId: idSchema,
    taskTitle: z.string().min(1).max(120),
    /** Absent for an invitation: there is no proposal yet (TZ 49). */
    proposalId: idSchema.optional(),
    decision: z.enum(["received", "accepted", "invited"]),
  }),
  ugcCampaignDecided: strict({
    campaignId: idSchema,
    productName: z.string().min(1).max(120),
    decision: z.enum(["open", "rejected"]),
  }),
  ugcApplication: strict({
    campaignId: idSchema,
    productName: z.string().min(1).max(120),
    inviteId: idSchema,
  }),
  ugcInvite: strict({
    campaignId: idSchema,
    inviteId: idSchema,
    productName: z.string().min(1).max(120),
    bountyMinor: z.string().regex(/^\d+$/),
  }),
  ugcSubmission: strict({
    campaignId: idSchema,
    productName: z.string().min(1).max(120),
    inviteId: idSchema,
  }),
  ugcSubmissionDecided: strict({
    campaignId: idSchema,
    productName: z.string().min(1).max(120),
    decision: z.enum([
      "changes_requested",
      "accepted",
      "rejected",
      "winner",
      "link_broken",
    ]),
  }),
  ugcDeadline: strict({
    campaignId: idSchema,
    productName: z.string().min(1).max(120),
  }),
  ugcReviewDue: strict({
    campaignId: idSchema,
    productName: z.string().min(1).max(120),
    inviteId: idSchema,
    stage: z.enum(["reminder", "last_day", "overdue"]),
  }),
  ugcReviewLate: strict({
    campaignId: idSchema,
    productName: z.string().min(1).max(120),
    inviteId: idSchema,
  }),
  ugcDispute: strict({
    campaignId: idSchema,
    productName: z.string().min(1).max(120),
    inviteId: idSchema,
    stage: z.enum(["opened", "resolved"]),
  }),
  ugcMessage: strict({
    campaignId: idSchema,
    productName: z.string().min(1).max(120),
    inviteId: idSchema,
  }),
} as const;

export const NOTIFICATION_TYPES = [
  "application.created",
  "application.viewed",
  "application.status_changed",
  "application.withdrawn",
  "mutual_interest.revealed",
  "job.moderation_decided",
  "job.expiring",
  "job.closed",
  "company.verification_decided",
  "matches.digest",
  "report.decided",
  "search.alert",
  "company.new_jobs",
  "company.candidates_digest",
  "freelance.request_created",
  "freelance.order_updated",
  "freelance.service_decided",
  "freelance.task_proposal",
  "ugc.campaign_decided",
  "ugc.application",
  "ugc.invite",
  "ugc.submission",
  "ugc.submission_decided",
  "ugc.deadline",
  "ugc.review_due",
  "ugc.review_late",
  "ugc.message",
  "ugc.dispute",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationPayloads = {
  [K in keyof typeof NOTIFICATION_PAYLOAD_SCHEMAS]: z.infer<
    (typeof NOTIFICATION_PAYLOAD_SCHEMAS)[K]
  >;
};

export interface NotificationEventDefinition {
  type: NotificationType;
  /** Prefix of the i18n keys under the top-level "notifications" key. */
  i18nKey: string;
  recipients: RecipientRole;
  policy: DeliveryPolicy;
  /** Default for the email channel (inapp is always true, 15). */
  emailDefault: boolean;
  payloadSchema: (typeof NOTIFICATION_PAYLOAD_SCHEMAS)[keyof typeof NOTIFICATION_PAYLOAD_SCHEMAS];
}

/** The 11 rows of the section 15 table, in order (D100). */
export const NOTIFICATION_CATALOG: Readonly<
  Record<NotificationType, NotificationEventDefinition>
> = {
  "application.created": {
    type: "application.created",
    i18nKey: "applicationCreated",
    recipients: "companyMembersRecruiterPlus",
    policy: "hourly_batch",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.applicationCreated,
  },
  "application.viewed": {
    type: "application.viewed",
    i18nKey: "applicationViewed",
    recipients: "candidate",
    policy: "immediate",
    emailDefault: false,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.applicationViewed,
  },
  "application.status_changed": {
    type: "application.status_changed",
    i18nKey: "applicationStatusChanged",
    recipients: "candidate",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.applicationStatusChanged,
  },
  "application.withdrawn": {
    type: "application.withdrawn",
    i18nKey: "applicationWithdrawn",
    recipients: "companyMembers",
    policy: "immediate",
    emailDefault: false,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.applicationWithdrawn,
  },
  "mutual_interest.revealed": {
    type: "mutual_interest.revealed",
    i18nKey: "mutualInterestRevealed",
    recipients: "candidateAndCompanyMembers",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.mutualInterestRevealed,
  },
  "job.moderation_decided": {
    type: "job.moderation_decided",
    i18nKey: "jobModerationDecided",
    recipients: "jobCreator",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.jobModerationDecided,
  },
  "job.expiring": {
    type: "job.expiring",
    i18nKey: "jobExpiring",
    recipients: "jobCreator",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.jobExpiring,
  },
  "job.closed": {
    type: "job.closed",
    i18nKey: "jobClosed",
    recipients: "candidate",
    policy: "immediate",
    emailDefault: false,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.jobClosed,
  },
  "company.verification_decided": {
    type: "company.verification_decided",
    i18nKey: "companyVerificationDecided",
    recipients: "companyOwner",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.companyVerificationDecided,
  },
  "matches.digest": {
    type: "matches.digest",
    i18nKey: "matchesDigest",
    recipients: "candidate",
    policy: "daily_digest",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.matchesDigest,
  },
  "report.decided": {
    type: "report.decided",
    i18nKey: "reportDecided",
    recipients: "reporter",
    policy: "immediate",
    emailDefault: false,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.reportDecided,
  },
  // Not in section 15: saved-search alerts (D234).
  "search.alert": {
    type: "search.alert",
    i18nKey: "searchAlert",
    recipients: "searchOwner",
    policy: "daily_digest",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.searchAlert,
  },
  // Not in section 15: new jobs of a followed company (D240).
  "company.new_jobs": {
    type: "company.new_jobs",
    i18nKey: "companyNewJobs",
    recipients: "companyFollower",
    policy: "daily_digest",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.companyNewJobs,
  },
  // Not in section 15: the employer side of the morning brief (D368).
  "company.candidates_digest": {
    type: "company.candidates_digest",
    i18nKey: "companyCandidatesDigest",
    recipients: "companyRecruiterPlusAgent",
    policy: "daily_digest",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.companyCandidatesDigest,
  },
  // Not in section 15: freelance orders and services (D456).
  "freelance.request_created": {
    type: "freelance.request_created",
    i18nKey: "freelanceRequestCreated",
    recipients: "freelanceSeller",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.freelanceRequestCreated,
  },
  "freelance.order_updated": {
    type: "freelance.order_updated",
    i18nKey: "freelanceOrderUpdated",
    recipients: "freelanceParty",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.freelanceOrderUpdated,
  },
  "freelance.service_decided": {
    type: "freelance.service_decided",
    i18nKey: "freelanceServiceDecided",
    recipients: "freelanceSeller",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.freelanceServiceDecided,
  },
  "freelance.task_proposal": {
    type: "freelance.task_proposal",
    i18nKey: "freelanceTaskProposal",
    recipients: "freelanceTaskParty",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.freelanceTaskProposal,
  },
  "ugc.campaign_decided": {
    type: "ugc.campaign_decided",
    i18nKey: "ugcCampaignDecided",
    recipients: "ugcParty",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.ugcCampaignDecided,
  },
  "ugc.application": {
    type: "ugc.application",
    i18nKey: "ugcApplication",
    recipients: "ugcParty",
    policy: "immediate",
    emailDefault: false,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.ugcApplication,
  },
  "ugc.invite": {
    type: "ugc.invite",
    i18nKey: "ugcInvite",
    recipients: "ugcParty",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.ugcInvite,
  },
  "ugc.submission": {
    type: "ugc.submission",
    i18nKey: "ugcSubmission",
    recipients: "ugcParty",
    policy: "immediate",
    emailDefault: false,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.ugcSubmission,
  },
  "ugc.submission_decided": {
    type: "ugc.submission_decided",
    i18nKey: "ugcSubmissionDecided",
    recipients: "ugcParty",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.ugcSubmissionDecided,
  },
  "ugc.deadline": {
    type: "ugc.deadline",
    i18nKey: "ugcDeadline",
    recipients: "ugcParty",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.ugcDeadline,
  },
  "ugc.review_due": {
    type: "ugc.review_due",
    i18nKey: "ugcReviewDue",
    recipients: "ugcParty",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.ugcReviewDue,
  },
  "ugc.review_late": {
    type: "ugc.review_late",
    i18nKey: "ugcReviewLate",
    recipients: "ugcParty",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.ugcReviewLate,
  },
  "ugc.message": {
    type: "ugc.message",
    i18nKey: "ugcMessage",
    recipients: "ugcParty",
    policy: "immediate",
    emailDefault: false,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.ugcMessage,
  },
  "ugc.dispute": {
    type: "ugc.dispute",
    i18nKey: "ugcDispute",
    recipients: "ugcParty",
    policy: "immediate",
    emailDefault: true,
    payloadSchema: NOTIFICATION_PAYLOAD_SCHEMAS.ugcDispute,
  },
};

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function assertNotificationType(value: string): NotificationType {
  if (!isNotificationType(value)) {
    throw new Error(`unknown notification type: ${value}`);
  }
  return value;
}

export function notificationPayloadSchema(
  type: NotificationType,
): NotificationEventDefinition["payloadSchema"] {
  return NOTIFICATION_CATALOG[type].payloadSchema;
}

/**
 * Auth emails (address confirmation, magic link, password reset) are
 * transactional, outside the catalog and cannot be turned off (15, D102).
 * They live in a separate type domain, so they cannot slip into the
 * preference machinery by accident.
 */
export const AUTH_EMAIL_TYPES = [
  "auth.confirmation",
  "auth.magic_link",
  "auth.password_reset",
] as const;

export type AuthEmailType = (typeof AUTH_EMAIL_TYPES)[number];

export function isAuthEmailType(value: string): value is AuthEmailType {
  return (AUTH_EMAIL_TYPES as readonly string[]).includes(value);
}

/** Unsubscribe links appear in every catalog email and never in auth emails. */
export function isUnsubscribable(value: string): value is NotificationType {
  return isNotificationType(value);
}

export interface NotificationPreferenceRow {
  /** notification_preferences.type */
  type: string;
  /** notification_preferences.channel */
  channel: string;
  enabled: boolean;
}

export type ResolveDeliveryResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "disabled_by_preference" | "disabled_by_default";
    };

/**
 * Delivery decision (15, D102): an explicit preference row wins; otherwise
 * the catalog default applies — inapp is enabled for every type, email per
 * the table. Auth emails never reach this function (typed out above).
 */
export function resolveDelivery(
  type: NotificationType,
  channel: NotificationChannel,
  preferences: readonly NotificationPreferenceRow[],
): ResolveDeliveryResult {
  const definition = NOTIFICATION_CATALOG[assertNotificationType(type)];
  if (!(NOTIFICATION_CHANNELS as readonly string[]).includes(channel)) {
    throw new Error(`unknown notification channel: ${channel}`);
  }
  const row = preferences.find(
    (preference) => preference.type === type && preference.channel === channel,
  );
  if (row) {
    return row.enabled
      ? { allowed: true }
      : { allowed: false, reason: "disabled_by_preference" };
  }
  if (channel === "inapp") {
    return { allowed: true };
  }
  // Telegram follows the email default: the same events are worth a push (D236).
  return definition.emailDefault
    ? { allowed: true }
    : { allowed: false, reason: "disabled_by_default" };
}

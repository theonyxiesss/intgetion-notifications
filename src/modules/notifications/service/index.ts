/**
 * Public service surface.
 * Other modules may import only this file, never this module's repo.
 */
export {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  NOTIFICATION_CATALOG,
  NOTIFICATION_PAYLOAD_SCHEMAS,
  AUTH_EMAIL_TYPES,
  APPLICATION_STATUSES,
  isNotificationType,
  isAuthEmailType,
  isUnsubscribable,
  assertNotificationType,
  notificationPayloadSchema,
  resolveDelivery,
  type NotificationType,
  type NotificationChannel,
  type NotificationPayloads,
  type DeliveryPolicy,
  type RecipientRole,
  type NotificationEventDefinition,
  type AuthEmailType,
  type NotificationPreferenceRow,
  type ResolveDeliveryResult,
  type FreelanceOrderNotice,
} from "../lib/catalog";
export {
  groupHourlyBatch,
  type ApplicationCreatedEvent,
  type BatchedApplicationCreated,
} from "../lib/batch";
export {
  DIGEST_HOUR_LOCAL,
  DIGEST_MIN_INTERVAL_MS,
  DIGEST_MIN_SCORE,
  nextDigestAt,
  shouldSendDigest,
  type DigestDecision,
  type DigestDecisionInput,
} from "../lib/digest";
export {
  signUnsubscribe,
  verifyUnsubscribe,
  type UnsubscribeClaims,
  type UnsubscribeVerification,
} from "../lib/unsubscribe";
export { failNextNotify, notify, safeNotify, unsubscribeUrl } from "./notify";
export {
  catalogTitleKey,
  countUnread,
  listNotifications,
  markNotificationsRead,
  readPreferences,
  unsubscribeByToken,
  writePreferences,
} from "./inbox";
export {
  dispatchEmails,
  hasJobExpiringNotice,
  lookupLoginEmail,
  runNotificationCron,
} from "./dispatch";
export { mergeApplicationBatch, utcHourStart } from "./batch-mail";
export { noopEmailSender, senderFromEnv } from "./email-sender";
export type { EmailSender } from "./email-sender";
export { emailCopy, renderEmail } from "./render";
export { setNotificationsPorts } from "../../../ports";
export type { NotificationsPorts } from "../../../ports";
export { deliverInTransaction } from "./deliver";
export { toEmailJob, type EmailJobPayload } from "../lib/email-jobs";
export { runTelegramDispatch } from "./telegram-dispatch";
export { telegramText } from "./render";

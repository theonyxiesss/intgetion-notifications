import type { NotificationsPorts } from "../ports";

export type RemoteConfig = {
  platformUrl: string;
  platformToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** The platform answers for the auth provider, so this service holds no auth admin key. */
export function httpNotificationsPorts(config: RemoteConfig): NotificationsPorts {
  const doFetch = config.fetchImpl ?? fetch;
  const base = config.platformUrl.replace(/\/+$/, "");
  return {
    async loginEmail(authUid) {
      const query = new URLSearchParams({ authUid });
      const response = await doFetch(
        `${base}/api/internal/notifications/login-email?${query}`,
        {
          headers: { authorization: `Bearer ${config.platformToken}` },
          signal: AbortSignal.timeout(config.timeoutMs ?? 5000),
        },
      );
      if (!response.ok) {
        throw new Error(`login-email answered ${response.status}`);
      }
      return ((await response.json()) as { email: string | null }).email;
    },
  };
}

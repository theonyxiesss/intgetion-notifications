export type NotificationsPorts = {
  /** Login email of an account, from the auth provider (Supabase Auth). */
  loginEmail: (authUid: string) => Promise<string | null>;
};

let ports: NotificationsPorts | null = null;

export function setNotificationsPorts(next: NotificationsPorts): void {
  ports = next;
}

export function notificationsPorts(): NotificationsPorts {
  if (!ports) throw new Error("notifications ports are not configured");
  return ports;
}

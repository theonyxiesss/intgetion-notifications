import { z, ZodError } from "zod";
import {
  getDb,
  HttpError,
  httpErrorResponse,
  notFound,
  toAppLocale,
  reportError,
  telegramActionSecret,
  telegramSender,
  validationError,
} from "@intgetion/kit";
import * as notifications from "../modules/notifications/service";
import { isUuid, requireCaller, requireServiceToken } from "./auth";

export type AppConfig = {
  serviceToken: string;
  siteUrl: string;
  telegramBotToken?: string;
};

const listQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
const readBody = z
  .object({
    ids: z.array(z.string().uuid()).max(200).optional(),
    all: z.boolean().optional(),
  })
  .strict();
const preferencesBody = z
  .object({
    items: z
      .array(
        z.object({
          type: z.string().max(64),
          channel: z.string().max(16),
          enabled: z.boolean(),
        }),
      )
      .max(200),
  })
  .strict();
const notifyBody = z
  .object({
    type: z.string().max(64),
    recipientIds: z.array(z.string().uuid()).min(1).max(500),
    payload: z.unknown(),
    email: z.boolean().optional(),
  })
  .strict();
const unsubscribeBody = z.object({ token: z.string().min(1).max(2000) }).strict();
const deliverBody = z
  .object({
    userId: z.string().uuid(),
    type: z.string().max(64),
    locale: z.string().max(8),
    payload: z.record(z.string(), z.unknown()),
    emailPayload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const MAX_BODY = 64 * 1024;

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const text = await request.text();
  if (text.length > MAX_BODY) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Body too large");
  }
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw validationError({ body: "invalid json" });
  }
  return schema.parse(json);
}

function uuidParam(value: string | undefined): string {
  if (!value || !isUuid(value)) throw notFound();
  return value;
}

type Route = {
  method: string;
  pattern: RegExp;
  run: (request: Request, params: string[], url: URL) => Promise<unknown>;
};

function routes(config: AppConfig): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/v1\/me\/notifications$/,
      run: async (request, _params, url) =>
        notifications.listNotifications(
          requireCaller(request).userId,
          listQuery.parse(Object.fromEntries(url.searchParams)),
        ),
    },
    {
      method: "GET",
      pattern: /^\/v1\/me\/notifications\/unread-count$/,
      run: async (request) => ({
        unread: await notifications.countUnread(requireCaller(request).userId),
      }),
    },
    {
      method: "POST",
      pattern: /^\/v1\/me\/notifications\/read$/,
      run: async (request) => {
        const { userId } = requireCaller(request);
        await notifications.markNotificationsRead(
          userId,
          await parseBody(request, readBody),
        );
        return { ok: true };
      },
    },
    {
      method: "GET",
      pattern: /^\/v1\/me\/preferences$/,
      run: async (request) => ({
        preferences: await notifications.readPreferences(
          requireCaller(request).userId,
        ),
      }),
    },
    {
      method: "PUT",
      pattern: /^\/v1\/me\/preferences$/,
      run: async (request) => {
        const { userId } = requireCaller(request);
        const { items } = await parseBody(request, preferencesBody);
        await notifications.writePreferences(userId, items);
        return { preferences: await notifications.readPreferences(userId) };
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/unsubscribe$/,
      run: async (request) => {
        const { token } = await parseBody(request, unsubscribeBody);
        return { ok: true, ...(await notifications.unsubscribeByToken(token)) };
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/notify$/,
      run: async (request) => {
        const input = await parseBody(request, notifyBody);
        if (!notifications.isNotificationType(input.type)) {
          throw validationError({ type: "unknown notification type" });
        }
        await notifications.notify(
          input.type,
          input.recipientIds,
          input.payload,
          new Date(),
          input.email === undefined ? undefined : { email: input.email },
        );
        return { ok: true };
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/deliver$/,
      run: async (request) => {
        const input = await parseBody(request, deliverBody);
        if (!notifications.isNotificationType(input.type)) {
          throw validationError({ type: "unknown notification type" });
        }
        const type = input.type;
        return getDb().transaction((tx) =>
          notifications.deliverInTransaction(tx, {
            userId: input.userId,
            type,
            locale: toAppLocale(input.locale),
            payload: input.payload,
            emailPayload: input.emailPayload,
            now: new Date(),
          }),
        );
      },
    },
    {
      method: "GET",
      pattern: /^\/v1\/jobs\/([^/]+)\/expiring-notice$/,
      run: async (_request, [id]) => ({
        sent: await notifications.hasJobExpiringNotice(uuidParam(id)),
      }),
    },
    {
      method: "POST",
      pattern: /^\/v1\/tasks\/dispatch-emails$/,
      run: async () => ({ ok: true, ...(await notifications.runNotificationCron()) }),
    },
    {
      method: "POST",
      pattern: /^\/v1\/tasks\/dispatch-telegram$/,
      run: async () => {
        const token = config.telegramBotToken;
        if (!token) return { ok: true, disabled: true };
        return {
          ok: true,
          ...(await notifications.runTelegramDispatch({
            sender: telegramSender(token),
            siteUrl: config.siteUrl,
            actionSecret: telegramActionSecret(token),
          })),
        };
      },
    },
  ];
}

export function toResponse(error: unknown): Response {
  if (error instanceof HttpError) return httpErrorResponse(error);
  if (error instanceof ZodError) {
    return httpErrorResponse(validationError(error.issues));
  }
  reportError(error, "notifications-service");
  return Response.json(
    { error: { code: "INTERNAL", message: "Internal error" } },
    { status: 500 },
  );
}

export function createApp(config: AppConfig) {
  const table = routes(config);
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return Response.json({ ok: true });
      }
      requireServiceToken(request, config.serviceToken);
      for (const route of table) {
        if (route.method !== request.method) continue;
        const match = route.pattern.exec(url.pathname);
        if (!match) continue;
        return Response.json(await route.run(request, match.slice(1), url), {
          headers: { "cache-control": "no-store" },
        });
      }
      throw notFound();
    } catch (error) {
      return toResponse(error);
    }
  };
}

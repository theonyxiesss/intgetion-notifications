import { z } from "zod";

export const listNotificationsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const markReadInput = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.uuid()).max(100) }),
]);

export const writePreferencesInput = z.object({
  preferences: z
    .array(
      z.object({
        type: z.string().min(1),
        channel: z.enum(["inapp", "email", "telegram"]),
        enabled: z.boolean(),
      }),
    )
    .max(50),
});

export const unsubscribeInput = z.object({
  token: z.string().min(1),
});

export const agentBriefsInput = z.object({
  enabled: z.boolean(),
});

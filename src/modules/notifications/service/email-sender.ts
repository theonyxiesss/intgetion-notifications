export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface EmailSender {
  /** `skipped` means nothing left the process (D126). */
  send(message: OutboundEmail): Promise<"sent" | "skipped">;
}

export const noopEmailSender: EmailSender = {
  async send() {
    return "skipped";
  },
};

export function resendEmailSender(apiKey: string, from: string): EmailSender {
  return {
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (!response.ok) {
        throw new Error(`resend ${response.status}`);
      }
      return "sent";
    },
  };
}

/** No key → noop. A key without EMAIL_FROM still refuses to call the network. */
export function senderFromEnv(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return noopEmailSender;
  return resendEmailSender(apiKey, from);
}

import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@intgetion/kit";
import {
  readTelegramAction,
  telegramActionSecret,
} from "@intgetion/kit";
import {
  fillTemplate,
  renderEmail,
  telegramButtons,
  telegramText,
  templateValues,
} from "../service/render";

const orderId = "11111111-2222-4333-8444-555555555555";
const site = "https://intgetion.com";

describe("freelance notifications (D456)", () => {
  it("fills select forms and falls back to other", () => {
    const template =
      "{status, select, accepted {Yes it is.} other {Something else.}} {name}";
    expect(fillTemplate(template, { status: "accepted", name: "X" })).toBe(
      "Yes it is. X",
    );
    expect(fillTemplate(template, { status: "paid", name: "X" })).toBe(
      "Something else. X",
    );
  });

  it("names the step and the service and links the order, in every locale", () => {
    for (const locale of APP_LOCALES) {
      const text = telegramText({
        locale,
        type: "freelance.order_updated",
        payload: { orderId, serviceTitle: "Logo design", status: "delivered" },
        siteUrl: site,
      });
      expect(text).toContain("Logo design");
      expect(text).toContain("7");
      expect(text).not.toMatch(/\{|\}/);
      expect(text).toMatch(new RegExp(`/freelance/orders/${orderId}$`));
    }
  });

  it("sends the seller to the services page after a review", () => {
    const text = telegramText({
      locale: "ru",
      type: "freelance.service_decided",
      payload: {
        serviceId: "s1",
        serviceTitle: "Logo design",
        decision: "rejected",
      },
      siteUrl: site,
    });
    expect(text).toContain("не прошла проверку");
    expect(text).toMatch(/https:\/\/intgetion\.com\/ru\/profile\/freelance$/);
  });

  it("gives the order email a button to the order", () => {
    const email = renderEmail({
      locale: "en",
      type: "freelance.request_created",
      values: templateValues({ orderId, serviceTitle: "Logo design" }),
      unsubscribeUrl: `${site}/api/unsubscribe?t=x`,
      actionPath: `/freelance/orders/${orderId}`,
    });
    expect(email?.subject).toBe("New request: Logo design");
    expect(email?.html).toContain(`/freelance/orders/${orderId}`);
    expect(email?.html).toContain("Open the order");
  });

  it("puts signed Accept and Decline under a new request only", () => {
    const secret = telegramActionSecret("123:test-token");
    const buttons = telegramButtons({
      locale: "ru",
      type: "freelance.request_created",
      payload: { orderId, serviceTitle: "Logo design" },
      actionSecret: secret,
    });
    expect(buttons?.map((b) => b.label)).toEqual(["Принять", "Отказать"]);
    expect(buttons?.map((b) => readTelegramAction(secret, b.data))).toEqual([
      { step: 1, action: "accept", orderId },
      { step: 1, action: "decline", orderId },
    ]);
    expect(
      telegramButtons({
        locale: "ru",
        type: "freelance.order_updated",
        payload: { orderId, serviceTitle: "Logo", status: "accepted" },
        actionSecret: secret,
      }),
    ).toBeUndefined();
    expect(
      telegramButtons({
        locale: "ru",
        type: "freelance.request_created",
        payload: { orderId, serviceTitle: "Logo" },
      }),
    ).toBeUndefined();
  });
});

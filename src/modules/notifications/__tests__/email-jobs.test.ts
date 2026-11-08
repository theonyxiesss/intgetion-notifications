import { describe, expect, it } from "vitest";
import { jobSummary, readEmailJobs, toEmailJob } from "../lib/email-jobs";
import { fillTemplate, renderEmail } from "../service/render";

const job = {
  id: "job-1",
  title: "Backend Engineer",
  description:
    "## About\n\nWe build **payments** for remote teams. " +
    "More text. ".repeat(30),
  location: null,
  locationCountry: "DE",
  workFormat: "remote",
  salaryMin: {
    amountMinor: "6000000",
    currency: "EUR",
    period: "year",
    basis: "gross",
  },
  salaryMax: {
    amountMinor: "8000000",
    currency: "EUR",
    period: "year",
    basis: "gross",
  },
  company: { name: "Acme" },
} as const;

describe("job cards in emails (D330)", () => {
  it("freezes the card fields at enqueue time", () => {
    const card = toEmailJob(job, "en");
    expect(card).toMatchObject({
      jobId: "job-1",
      jobTitle: "Backend Engineer — Acme",
      title: "Backend Engineer",
      companyName: "Acme",
      location: "DE",
      workFormat: "remote",
      salary: { min: "€60,000", max: "€80,000", period: "year" },
    });
    expect(card.summary?.startsWith("About We build payments")).toBe(true);
    expect(card.summary!.length).toBeLessThanOrEqual(161);
    expect(card.summary!.endsWith("…")).toBe(true);
  });

  it("keeps short summaries whole and drops empty ones", () => {
    expect(jobSummary("Short.")).toBe("Short.");
    expect(jobSummary("  ")).toBeNull();
    expect(jobSummary(null)).toBeNull();
  });

  it("reads only full cards from stored payloads", () => {
    expect(readEmailJobs({ jobs: [{ jobTitle: "Old row" }] })).toEqual([]);
    expect(readEmailJobs({ jobs: [toEmailJob(job, "en")] })).toHaveLength(1);
    expect(readEmailJobs({})).toEqual([]);
  });

  it("renders the digest as cards linking to each job and to all matches", () => {
    const jobs = [toEmailJob(job, "ru")];
    const rendered = renderEmail({
      locale: "ru",
      type: "matches.digest",
      values: { count: 3 },
      unsubscribeUrl: "https://intgetion.com/ru/unsubscribe?token=t",
      actionPath: "/matches",
      jobs,
    })!;
    expect(rendered.subject).toBe("Новые вакансии под ваш профиль");
    expect(rendered.html).toContain(
      "3 новые вакансии подходят под ваш профиль",
    );
    expect(rendered.html).toContain(
      'href="https://intgetion.com/ru/jobs/job-1"',
    );
    expect(rendered.html).toContain(">Открыть вакансию</a>");
    expect(rendered.html).toContain('href="https://intgetion.com/ru/matches"');
    expect(rendered.html).toContain(">Все вакансии</a>");
    expect(rendered.html).toContain("Удалённо · ");
    expect(rendered.html).toContain(" / год");
    expect(rendered.html).toContain(
      "https://intgetion.com/ru/settings/notifications",
    );
    expect(rendered.html).toContain(
      "https://intgetion.com/ru/unsubscribe?token=t",
    );
    expect(rendered.text).toContain("https://intgetion.com/ru/jobs/job-1");
  });

  it("shows at most five cards", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      toEmailJob({ ...job, id: `job-${i}` }, "en"),
    );
    const rendered = renderEmail({
      locale: "en",
      type: "matches.digest",
      values: { count: 8 },
      unsubscribeUrl: "https://intgetion.com/en/unsubscribe?token=t",
      jobs: many,
    })!;
    expect(rendered.html.match(/>View job<\/a>/g)).toHaveLength(5);
  });

  it("picks Russian plural forms", () => {
    const template =
      "{count, plural, one {# вакансия} few {# вакансии} many {# вакансий} other {# вакансии}}";
    expect(fillTemplate(template, { count: 1 }, "ru")).toBe("1 вакансия");
    expect(fillTemplate(template, { count: 3 }, "ru")).toBe("3 вакансии");
    expect(fillTemplate(template, { count: 5 }, "ru")).toBe("5 вакансий");
    expect(
      fillTemplate("{count, plural, one {# job} other {# jobs}}", { count: 2 }),
    ).toBe("2 jobs");
  });
});

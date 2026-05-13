import { describe, expect, it } from "vitest";
import { sanitizeLoggedHeaders, sanitizeLoggedUrl } from "../src/utils/logger.js";

describe("logger helpers", () => {
  it("redacts sensitive query parameters in relative urls", () => {
    expect(
      sanitizeLoggedUrl("/api/jobs/job-1/events?access_token=secret-token&foo=bar")
    ).toBe("/api/jobs/job-1/events?access_token=%5BREDACTED%5D&foo=bar");
  });

  it("leaves urls without sensitive query parameters unchanged", () => {
    expect(sanitizeLoggedUrl("/api/jobs/job-1?foo=bar")).toBe("/api/jobs/job-1?foo=bar");
  });

  it("redacts sensitive request headers", () => {
    expect(
      sanitizeLoggedHeaders({
        authorization: "Bearer secret-token",
        cookie: "session=secret",
        host: "localhost:8788"
      })
    ).toEqual({
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      host: "localhost:8788"
    });
  });
});

import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("legacy compatibility server", () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  async function createApp() {
    const app = await buildApp({ logger: pino({ level: "silent" }), webOrigins: ["http://localhost:5174"], webDistDir: "Z:/missing" });
    apps.push(app);
    return app;
  }

  it("keeps health available", async () => {
    const response = await (await createApp()).inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", mode: "compatibility" });
  });

  it("retires create and retry job routes with 410", async () => {
    const app = await createApp();
    const create = await app.inject({ method: "POST", url: "/api/jobs" });
    const retry = await app.inject({ method: "POST", url: "/api/jobs/job-1/retry" });
    expect(create.statusCode).toBe(410);
    expect(retry.statusCode).toBe(410);
  });
});

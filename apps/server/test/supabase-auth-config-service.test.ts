import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupabaseAuthConfigService } from "../src/services/supabase-auth-config-service.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SupabaseAuthConfigService", () => {
  it("patches Supabase auth config with Google OAuth settings", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const service = new SupabaseAuthConfigService({
      logger: pino({ level: "silent" }),
      accessToken: "pat-test",
      projectRef: "project-ref",
      appWebUrl: "http://localhost:5174",
      appProdWebUrl: "https://voiceshort.example.com",
      additionalRedirectUrls: ["http://127.0.0.1:5174", "https://preview.voiceshort.example.com"],
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret"
    });

    await service.syncGoogleOAuthConfig();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.supabase.com/v1/projects/project-ref/config/auth");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer pat-test",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      site_url: "https://voiceshort.example.com",
      external_google_enabled: true,
      external_google_client_id: "google-client-id",
      external_google_secret: "google-client-secret"
    });
    expect(JSON.parse(String(init.body)).uri_allow_list).toContain("http://localhost:5174/**");
    expect(JSON.parse(String(init.body)).uri_allow_list).toContain("https://preview.voiceshort.example.com/**");
  });

  it("skips sync when required credentials are missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const service = new SupabaseAuthConfigService({
      logger: pino({ level: "silent" }),
      accessToken: "",
      projectRef: "project-ref",
      appWebUrl: "http://localhost:5174",
      appProdWebUrl: "",
      additionalRedirectUrls: [],
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret"
    });

    await service.syncGoogleOAuthConfig();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to APP_WEB_URL when APP_PROD_WEB_URL is still placeholder", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const service = new SupabaseAuthConfigService({
      logger: pino({ level: "silent" }),
      accessToken: "pat-test",
      projectRef: "project-ref",
      appWebUrl: "http://localhost:5174",
      appProdWebUrl: "https://replace-me.example.com",
      additionalRedirectUrls: ["https://replace-me.example.com"],
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret"
    });

    await service.syncGoogleOAuthConfig();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      site_url: "http://localhost:5174",
      uri_allow_list: "http://localhost:5174/**"
    });
  });
});

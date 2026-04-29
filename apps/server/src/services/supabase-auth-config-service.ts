import type { FastifyBaseLogger } from "fastify";

interface SupabaseAuthConfigServiceOptions {
  logger: FastifyBaseLogger;
  accessToken: string;
  projectRef: string;
  appWebUrl: string;
  appProdWebUrl: string;
  additionalRedirectUrls: string[];
  googleClientId: string;
  googleClientSecret: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes("replace-me.example.com")) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.hash = "";
    return trimTrailingSlash(url.toString());
  } catch {
    return "";
  }
}

function toRedirectPattern(value: string): string {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return "";
  }
  return normalized.endsWith("/**") ? normalized : `${normalized}/**`;
}

function normalizeSiteUrl(appProdWebUrl: string, appWebUrl: string): string {
  return normalizeUrl(appProdWebUrl) || normalizeUrl(appWebUrl);
}

function buildAllowList(appWebUrl: string, appProdWebUrl: string, additionalRedirectUrls: string[]): string {
  const entries = [
    toRedirectPattern(appWebUrl),
    toRedirectPattern(appProdWebUrl),
    ...additionalRedirectUrls.map((url) => toRedirectPattern(url))
  ].filter(Boolean);

  return [...new Set(entries)].join(",");
}

export class SupabaseAuthConfigService {
  private readonly logger: FastifyBaseLogger;
  private readonly accessToken: string;
  private readonly projectRef: string;
  private readonly appWebUrl: string;
  private readonly appProdWebUrl: string;
  private readonly additionalRedirectUrls: string[];
  private readonly googleClientId: string;
  private readonly googleClientSecret: string;

  public constructor(options: SupabaseAuthConfigServiceOptions) {
    this.logger = options.logger;
    this.accessToken = options.accessToken.trim();
    this.projectRef = options.projectRef.trim();
    this.appWebUrl = options.appWebUrl.trim();
    this.appProdWebUrl = options.appProdWebUrl.trim();
    this.additionalRedirectUrls = options.additionalRedirectUrls;
    this.googleClientId = options.googleClientId.trim();
    this.googleClientSecret = options.googleClientSecret.trim();
  }

  public async syncGoogleOAuthConfig(): Promise<void> {
    if (!this.accessToken || !this.projectRef) {
      this.logger.info("Supabase Management API tidak dikonfigurasi. Sinkronisasi Google OAuth dilewati.");
      return;
    }

    if (!this.googleClientId || !this.googleClientSecret) {
      this.logger.info("Google OAuth credential tidak lengkap di .env. Sinkronisasi provider Google dilewati.");
      return;
    }

    const siteUrl = normalizeSiteUrl(this.appProdWebUrl, this.appWebUrl);
    const uriAllowList = buildAllowList(this.appWebUrl, this.appProdWebUrl, this.additionalRedirectUrls);

    if (!siteUrl) {
      this.logger.warn("APP_WEB_URL/APP_PROD_WEB_URL tidak valid. Sinkronisasi Google OAuth dilewati.");
      return;
    }

    const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(this.projectRef)}/config/auth`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        site_url: siteUrl,
        uri_allow_list: uriAllowList,
        external_google_enabled: true,
        external_google_client_id: this.googleClientId,
        external_google_secret: this.googleClientSecret
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Supabase auth config update gagal (${response.status}): ${body || response.statusText}`);
    }

    this.logger.info(
      {
        projectRef: this.projectRef,
        siteUrl,
        redirectCount: uriAllowList ? uriAllowList.split(",").length : 0
      },
      "Konfigurasi Google OAuth Supabase berhasil disinkronkan."
    );
  }
}

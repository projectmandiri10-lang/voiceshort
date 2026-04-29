import type { FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthSessionUser } from "../types.js";
import { createSupabaseClient } from "./supabase-client.js";
import type { ProfileRow } from "./supabase-schema.js";
import {
  profileRowToUserRecord,
  SUPERADMIN_WHITELIST_EMAIL,
  userRecordToSessionUser
} from "./supabase-schema.js";

export interface AuthSessionContext {
  accessToken: string;
  db: SupabaseClient;
  user: AuthSessionUser;
}

interface AuthServiceOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
}

function readBearerToken(headerValue: string | undefined): string | undefined {
  if (!headerValue) {
    return undefined;
  }
  const [scheme, token] = headerValue.trim().split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return undefined;
  }
  return token.trim();
}

export class AuthService {
  public readonly adminClient: SupabaseClient;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  public constructor(options: AuthServiceOptions) {
    this.supabaseUrl = options.supabaseUrl;
    this.supabaseAnonKey = options.supabaseAnonKey;
    const adminClient = createSupabaseClient({
      supabaseUrl: options.supabaseUrl,
      supabaseKey: options.supabaseServiceRoleKey
    });
    if (!adminClient) {
      throw new Error("SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.");
    }
    this.adminClient = adminClient;
  }

  public extractAccessToken(request: FastifyRequest): string | undefined {
    const queryToken =
      typeof (request.query as { access_token?: unknown } | undefined)?.access_token === "string"
        ? String((request.query as { access_token?: string }).access_token).trim()
        : "";
    if (queryToken) {
      return queryToken;
    }
    return readBearerToken(request.headers.authorization);
  }

  public createRequestClient(accessToken: string): SupabaseClient {
    const client = createSupabaseClient({
      supabaseUrl: this.supabaseUrl,
      supabaseKey: this.supabaseAnonKey,
      accessToken
    });
    if (!client) {
      throw new Error("Supabase client tidak dapat dibuat untuk request user.");
    }
    return client;
  }

  public async getSessionContext(request: FastifyRequest): Promise<AuthSessionContext | undefined> {
    const accessToken = this.extractAccessToken(request);
    if (!accessToken) {
      return undefined;
    }

    const { data: authData, error: authError } = await this.adminClient.auth.getUser(accessToken);
    if (authError || !authData.user?.id || !authData.user.email) {
      return undefined;
    }

    const db = this.createRequestClient(accessToken);
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .maybeSingle<ProfileRow>();

    if (profileError || !profile) {
      return undefined;
    }

    let nextProfile = profile;
    if (authData.user.email.trim().toLowerCase() === SUPERADMIN_WHITELIST_EMAIL) {
      const needsRepair =
        profile.role !== "superadmin" ||
        profile.subscription_status !== "active" ||
        !profile.is_unlimited ||
        Boolean(profile.disabled_at);

      if (needsRepair) {
        const { data: repaired, error: repairError } = await this.adminClient
          .from("profiles")
          .update({
            role: "superadmin",
            subscription_status: "active",
            is_unlimited: true,
            disabled_at: null,
            disabled_reason: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", authData.user.id)
          .select("*")
          .single<ProfileRow>();

        if (!repairError && repaired) {
          nextProfile = repaired;
        }
      }
    }

    return {
      accessToken,
      db,
      user: userRecordToSessionUser(profileRowToUserRecord(nextProfile))
    };
  }
}

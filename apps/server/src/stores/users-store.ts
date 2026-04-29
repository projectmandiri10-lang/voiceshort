import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignedPackageCode, UserRecord } from "../types.js";
import { JsonFile } from "../utils/json-file.js";
import { USERS_FILE } from "../utils/paths.js";
import type { ProfileRow } from "../services/supabase-schema.js";
import {
  profileRowToUserRecord,
  SUPERADMIN_WHITELIST_EMAIL,
  userRecordToProfilePatch
} from "../services/supabase-schema.js";

function nowIso(): string {
  return new Date().toISOString();
}

function createHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeQuotaValue(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.trunc(numeric));
}

export function normalizeUserEmail(email: string): string {
  return email.trim().toLowerCase();
}

function fallbackDisplayName(email: string): string {
  return email.split("@")[0] || email;
}

function normalizeLegacyUser(user: Partial<UserRecord> & { passwordHash?: string; googleSub?: string }): UserRecord {
  const email = normalizeUserEmail(String(user.email || ""));
  const isWhitelistedSuperadmin = email === SUPERADMIN_WHITELIST_EMAIL;
  return {
    id: String(user.id || email || crypto.randomUUID()),
    email,
    displayName: String(user.displayName || "").trim() || fallbackDisplayName(email),
    role: isWhitelistedSuperadmin || user.role === "superadmin" ? "superadmin" : "user",
    subscriptionStatus: isWhitelistedSuperadmin || user.subscriptionStatus === "active" ? "active" : "inactive",
    videoQuotaTotal: normalizeQuotaValue(user.videoQuotaTotal),
    videoQuotaUsed: normalizeQuotaValue(user.videoQuotaUsed),
    walletBalanceIdr: normalizeQuotaValue(user.walletBalanceIdr),
    isUnlimited: isWhitelistedSuperadmin || Boolean(user.isUnlimited),
    disabledAt: isWhitelistedSuperadmin ? null : user.disabledAt ?? null,
    disabledReason: isWhitelistedSuperadmin ? null : user.disabledReason ?? null,
    assignedPackageCode: user.assignedPackageCode ?? null,
    googleLinked: Boolean(user.googleLinked ?? user.googleSub),
    hasPassword: Boolean(user.hasPassword ?? user.passwordHash),
    createdAt: String(user.createdAt || nowIso()),
    updatedAt: String(user.updatedAt || nowIso())
  };
}

export class UsersStore {
  private readonly file = new JsonFile<Array<Partial<UserRecord> & { passwordHash?: string; googleSub?: string }>>(
    USERS_FILE,
    []
  );

  public constructor(private readonly adminClient?: SupabaseClient) {}

  public async list(client?: SupabaseClient): Promise<UserRecord[]> {
    const db = client ?? this.adminClient;
    if (db) {
      const { data, error } = await db.from("profiles").select("*").order("email", { ascending: true });
      if (error) {
        throw error;
      }
      return (data || []).map((row) => profileRowToUserRecord(row as ProfileRow));
    }

    const users = await this.file.get();
    return users.map(normalizeLegacyUser).sort((a, b) => a.email.localeCompare(b.email));
  }

  public async getByEmail(email: string, client?: SupabaseClient): Promise<UserRecord | undefined> {
    const normalizedEmail = normalizeUserEmail(email);
    const db = client ?? this.adminClient;
    if (db) {
      const { data, error } = await db
        .from("profiles")
        .select("*")
        .eq("email", normalizedEmail)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data ? profileRowToUserRecord(data as ProfileRow) : undefined;
    }

    const users = await this.file.get();
    const user = users.find((entry) => normalizeUserEmail(String(entry.email || "")) === normalizedEmail);
    return user ? normalizeLegacyUser(user) : undefined;
  }

  public async getById(id: string, client?: SupabaseClient): Promise<UserRecord | undefined> {
    const db = client ?? this.adminClient;
    if (db) {
      const { data, error } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
      if (error) {
        throw error;
      }
      return data ? profileRowToUserRecord(data as ProfileRow) : undefined;
    }

    const users = await this.file.get();
    const user = users.find((entry) => String(entry.id || "") === id);
    return user ? normalizeLegacyUser(user) : undefined;
  }

  public async create(user: UserRecord, client?: SupabaseClient): Promise<UserRecord> {
    const normalized = normalizeLegacyUser(user);
    const db = client ?? this.adminClient;
    if (db) {
      const payload = {
        id: normalized.id,
        ...userRecordToProfilePatch(normalized)
      };
      const { data, error } = await db.from("profiles").insert(payload).select("*").single();
      if (error) {
        throw error;
      }
      return profileRowToUserRecord(data as ProfileRow);
    }

    await this.file.update((users) => {
      if (users.some((entry) => normalizeUserEmail(String(entry.email || "")) === normalized.email)) {
        throw createHttpError(409, "Email sudah terdaftar.");
      }
      return [normalized, ...users.map(normalizeLegacyUser)];
    });
    return normalized;
  }

  public async update(
    email: string,
    updater: (user: UserRecord) => UserRecord,
    client?: SupabaseClient
  ): Promise<UserRecord | undefined> {
    const current = await this.getByEmail(email, client);
    if (!current) {
      return undefined;
    }
    const next = normalizeLegacyUser(updater(current));
    const db = client ?? this.adminClient;
    if (db) {
      const { data, error } = await db
        .from("profiles")
        .update({
          ...userRecordToProfilePatch(next),
          updated_at: next.updatedAt || nowIso()
        })
        .eq("email", normalizeUserEmail(email))
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return profileRowToUserRecord(data as ProfileRow);
    }

    const normalizedEmail = normalizeUserEmail(email);
    let updated: UserRecord | undefined;
    await this.file.update((users) => {
      const nextUsers = [...users.map(normalizeLegacyUser)];
      const index = nextUsers.findIndex((entry) => entry.email === normalizedEmail);
      if (index < 0) {
        return users;
      }
      updated = normalizeLegacyUser({
        ...nextUsers[index],
        ...next,
        createdAt: nextUsers[index]?.createdAt || next.createdAt
      });
      nextUsers[index] = updated;
      return nextUsers;
    });
    return updated;
  }

  public async upsert(user: UserRecord, client?: SupabaseClient): Promise<UserRecord> {
    const normalized = normalizeLegacyUser(user);
    const db = client ?? this.adminClient;
    if (db) {
      const { data, error } = await db
        .from("profiles")
        .upsert(
          {
            id: normalized.id,
            ...userRecordToProfilePatch(normalized)
          },
          { onConflict: "id" }
        )
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return profileRowToUserRecord(data as ProfileRow);
    }

    let stored = normalized;
    await this.file.update((users) => {
      const next = [...users.map(normalizeLegacyUser)];
      const index = next.findIndex((entry) => entry.email === normalized.email);
      if (index < 0) {
        next.unshift(normalized);
        stored = normalized;
        return next;
      }
      const current = next[index];
      if (!current) {
        next.unshift(normalized);
        stored = normalized;
        return next;
      }
      stored = normalizeLegacyUser({
        ...current,
        ...normalized,
        createdAt: current.createdAt,
        updatedAt: normalized.updatedAt || nowIso()
      });
      next[index] = stored;
      return next;
    });
    return stored;
  }

  public async reserveQuota(email: string, client?: SupabaseClient): Promise<UserRecord> {
    return await this.reserveGenerateCredit(crypto.randomUUID(), email, client);
  }

  public async reserveGenerateCredit(jobId: string, email: string, client?: SupabaseClient): Promise<UserRecord> {
    const db = this.adminClient ?? client;
    if (db) {
      const normalizedEmail = normalizeUserEmail(email);
      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle<{ id: string }>();
      if (profileError) {
        throw profileError;
      }
      if (!profile) {
        throw createHttpError(404, "User tidak ditemukan.");
      }

      const { data, error } = await db.rpc("reserve_generate_credit", {
        job_id: jobId,
        target_user_id: profile.id
      });
      if (error) {
        throw createHttpError(402, error.message);
      }
      return profileRowToUserRecord(data as ProfileRow);
    }

    const normalizedEmail = normalizeUserEmail(email);
    let updated: UserRecord | undefined;

    await this.file.update((users) => {
      const next = [...users.map(normalizeLegacyUser)];
      const index = next.findIndex((entry) => entry.email === normalizedEmail);
      if (index < 0) {
        throw createHttpError(404, "User tidak ditemukan.");
      }
      const current = next[index];
      if (!current) {
        throw createHttpError(404, "User tidak ditemukan.");
      }
      if (current.disabledAt) {
        throw createHttpError(403, "Akun sedang nonaktif. Hubungi admin untuk mengaktifkan kembali.");
      }
      if (current.isUnlimited) {
        updated = {
          ...current,
          videoQuotaUsed: current.videoQuotaUsed + 1,
          updatedAt: nowIso()
        };
        next[index] = updated;
        return next;
      }
      if (current.walletBalanceIdr < 2000) {
        throw createHttpError(402, "Saldo deposit tidak cukup. Top up minimal Rp2.000 untuk membuat 1 voice over.");
      }
      updated = {
        ...current,
        walletBalanceIdr: current.walletBalanceIdr - 2000,
        videoQuotaUsed: current.videoQuotaUsed + 1,
        updatedAt: nowIso()
      };
      next[index] = updated;
      return next;
    });

    return updated as UserRecord;
  }

  public async releaseQuota(email: string, client?: SupabaseClient): Promise<UserRecord | undefined> {
    return await this.refundGenerateCredit(crypto.randomUUID(), email, "Refund generate voice over", client);
  }

  public async refundGenerateCredit(
    jobId: string,
    email: string,
    reason: string,
    client?: SupabaseClient
  ): Promise<UserRecord | undefined> {
    const db = this.adminClient ?? client;
    if (db) {
      const normalizedEmail = normalizeUserEmail(email);
      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle<{ id: string }>();
      if (profileError) {
        throw profileError;
      }
      if (!profile) {
        throw createHttpError(404, "User tidak ditemukan.");
      }

      const { data, error } = await db.rpc("refund_generate_credit", {
        job_id: jobId,
        target_user_id: profile.id,
        reason
      });
      if (error) {
        throw createHttpError(400, error.message);
      }
      return data ? profileRowToUserRecord(data as ProfileRow) : undefined;
    }

    return await this.update(
      email,
      (current) => ({
        ...current,
        walletBalanceIdr: current.isUnlimited ? current.walletBalanceIdr : current.walletBalanceIdr + 2000,
        videoQuotaUsed: Math.max(0, current.videoQuotaUsed - 1),
        updatedAt: nowIso()
      }),
      client
    );
  }

  public async grantWalletCredit(
    email: string,
    input: {
      amountIdr: number;
      packageCode: AssignedPackageCode;
      description: string;
      actorEmail: string;
    },
    client?: SupabaseClient
  ): Promise<UserRecord | undefined> {
    const target = await this.getByEmail(email, client);
    if (!target) {
      return undefined;
    }

    const db = this.adminClient ?? client;
    if (db) {
      const { data, error } = await db.rpc("admin_grant_wallet_credit", {
        target_user_id: target.id,
        grant_amount_idr: input.amountIdr,
        package_code: input.packageCode,
        actor_email: input.actorEmail,
        description: input.description
      });
      if (error) {
        throw createHttpError(400, error.message);
      }
      return profileRowToUserRecord(data as ProfileRow);
    }

    return await this.update(
      email,
      (current) => ({
        ...current,
        subscriptionStatus: "active",
        disabledAt: null,
        disabledReason: null,
        assignedPackageCode: input.packageCode,
        walletBalanceIdr: current.walletBalanceIdr + input.amountIdr,
        updatedAt: nowIso()
      }),
      client
    );
  }
}

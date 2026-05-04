import type { AppSettings, AssignedPackageCode, AuthSessionUser, JobRecord, UserRecord } from "../types.js";
import { buildProgressFromStatus } from "../utils/job-progress.js";

export const SUPERADMIN_WHITELIST_EMAIL = "jho.j80@gmail.com";

export interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  role: "user" | "superadmin";
  subscription_status: "active" | "inactive";
  video_quota_total: number;
  video_quota_used: number;
  wallet_balance_idr: number;
  is_unlimited: boolean;
  disabled_at: string | null;
  disabled_reason: string | null;
  assigned_package_code: AssignedPackageCode | null;
  google_linked: boolean;
  has_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppSettingsRow {
  settings_key: "default";
  script_model: string;
  tts_model: string;
  language: "id-ID";
  max_video_seconds: number;
  safety_mode: "safe_marketing";
  concurrency: 1;
  gender_voices: AppSettings["genderVoices"];
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  job_id: string;
  owner_user_id: string | null;
  owner_email: string | null;
  title: string;
  description: string;
  content_type: JobRecord["contentType"];
  voice_gender: JobRecord["voiceGender"];
  tone: string;
  cta_text: string | null;
  reference_link: string | null;
  video_path: string;
  video_mime_type: string;
  video_duration_sec: number;
  status: JobRecord["status"];
  progress: JobRecord["progress"] | null;
  error_message: string | null;
  output: JobRecord["output"];
  created_at: string;
  updated_at: string;
}

export function profileRowToUserRecord(row: ProfileRow): UserRecord {
  const email = row.email.trim().toLowerCase();
  const isWhitelistedSuperadmin = email === SUPERADMIN_WHITELIST_EMAIL;
  return {
    id: row.id,
    email,
    displayName: row.display_name.trim() || row.email.split("@")[0] || row.email,
    role: isWhitelistedSuperadmin || row.role === "superadmin" ? "superadmin" : "user",
    subscriptionStatus: isWhitelistedSuperadmin || row.subscription_status === "active" ? "active" : "inactive",
    videoQuotaTotal: Math.max(0, Math.trunc(row.video_quota_total)),
    videoQuotaUsed: Math.max(0, Math.trunc(row.video_quota_used)),
    walletBalanceIdr: Math.max(0, Math.trunc(row.wallet_balance_idr ?? 0)),
    isUnlimited: isWhitelistedSuperadmin || Boolean(row.is_unlimited),
    disabledAt: isWhitelistedSuperadmin ? null : row.disabled_at,
    disabledReason: isWhitelistedSuperadmin ? null : row.disabled_reason,
    assignedPackageCode: row.assigned_package_code ?? null,
    googleLinked: Boolean(row.google_linked),
    hasPassword: Boolean(row.has_password),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function userRecordToProfilePatch(record: UserRecord): Partial<ProfileRow> {
  const email = record.email.trim().toLowerCase();
  const isWhitelistedSuperadmin = email === SUPERADMIN_WHITELIST_EMAIL;
  return {
    email,
    display_name: record.displayName.trim() || record.email.split("@")[0] || record.email,
    role: isWhitelistedSuperadmin || record.role === "superadmin" ? "superadmin" : "user",
    subscription_status: isWhitelistedSuperadmin || record.subscriptionStatus === "active" ? "active" : "inactive",
    video_quota_total: Math.max(0, Math.trunc(record.videoQuotaTotal)),
    video_quota_used: Math.max(0, Math.trunc(record.videoQuotaUsed)),
    wallet_balance_idr: Math.max(0, Math.trunc(record.walletBalanceIdr)),
    is_unlimited: isWhitelistedSuperadmin || Boolean(record.isUnlimited),
    disabled_at: isWhitelistedSuperadmin ? null : record.disabledAt ?? null,
    disabled_reason: isWhitelistedSuperadmin ? null : record.disabledReason ?? null,
    assigned_package_code: record.assignedPackageCode ?? null,
    google_linked: Boolean(record.googleLinked),
    has_password: Boolean(record.hasPassword),
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

export function userRecordToSessionUser(record: UserRecord): AuthSessionUser {
  const generatePriceIdr = 2000;
  const isUnlimited = record.isUnlimited || record.email === SUPERADMIN_WHITELIST_EMAIL;
  const generateCreditsRemaining = isUnlimited
    ? null
    : Math.floor(Math.max(0, record.walletBalanceIdr) / generatePriceIdr);
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    subscriptionStatus: record.subscriptionStatus,
    videoQuotaTotal: record.videoQuotaTotal,
    videoQuotaUsed: record.videoQuotaUsed,
    videoQuotaRemaining: generateCreditsRemaining,
    walletBalanceIdr: record.walletBalanceIdr,
    generatePriceIdr,
    generateCreditsRemaining,
    isUnlimited,
    disabledAt: isUnlimited && record.email === SUPERADMIN_WHITELIST_EMAIL ? null : record.disabledAt ?? null,
    disabledReason: isUnlimited && record.email === SUPERADMIN_WHITELIST_EMAIL ? null : record.disabledReason ?? null,
    assignedPackageCode: record.assignedPackageCode ?? null
  };
}

export function appSettingsRowToSettings(row: AppSettingsRow): AppSettings {
  return {
    scriptModel: row.script_model,
    ttsModel: row.tts_model,
    language: row.language,
    maxVideoSeconds: row.max_video_seconds,
    safetyMode: row.safety_mode,
    concurrency: row.concurrency,
    genderVoices: [...(row.gender_voices || [])]
  };
}

export function appSettingsToRow(settings: AppSettings): AppSettingsRow {
  const now = new Date().toISOString();
  return {
    settings_key: "default",
    script_model: settings.scriptModel,
    tts_model: settings.ttsModel,
    language: settings.language,
    max_video_seconds: settings.maxVideoSeconds,
    safety_mode: settings.safetyMode,
    concurrency: settings.concurrency,
    gender_voices: [...settings.genderVoices],
    created_at: now,
    updated_at: now
  };
}

export function jobRowToRecord(row: JobRow): JobRecord {
  return {
    jobId: row.job_id,
    ownerUserId: row.owner_user_id || undefined,
    ownerEmail: row.owner_email?.trim().toLowerCase() || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    description: row.description,
    contentType: row.content_type,
    voiceGender: row.voice_gender,
    tone: row.tone,
    ctaText: row.cta_text || undefined,
    referenceLink: row.reference_link || undefined,
    videoPath: row.video_path,
    videoMimeType: row.video_mime_type,
    videoDurationSec: row.video_duration_sec,
    status: row.status,
    progress: row.progress ?? buildProgressFromStatus(row.status),
    errorMessage: row.error_message || undefined,
    output: {
      ...row.output,
      captionPath: row.output.captionPath ?? row.output.scriptPath,
      artifactPaths: [...(row.output.artifactPaths || [])]
    }
  };
}

export function jobRecordToRow(job: JobRecord): JobRow {
  return {
    job_id: job.jobId,
    owner_user_id: job.ownerUserId ?? null,
    owner_email: job.ownerEmail ?? null,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    title: job.title,
    description: job.description,
    content_type: job.contentType,
    voice_gender: job.voiceGender,
    tone: job.tone,
    cta_text: job.ctaText ?? null,
    reference_link: job.referenceLink ?? null,
    video_path: job.videoPath,
    video_mime_type: job.videoMimeType,
    video_duration_sec: job.videoDurationSec,
    status: job.status,
    progress: job.progress,
    error_message: job.errorMessage ?? null,
    output: {
      ...job.output,
      artifactPaths: [...(job.output.artifactPaths || [])]
    }
  };
}

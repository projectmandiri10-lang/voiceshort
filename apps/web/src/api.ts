import type {
  AdminUserRecord,
  AppSettings,
  AuthUser,
  ContentType,
  ExcitedVoicePreset,
  GenerationCapacity,
  JobProgress,
  JobRecord,
  JobVoiceGender,
  TtsVoiceOption
} from "./types";
import { isSupabaseAuthReady, supabase } from "./supabase";

const DEV_BACKEND_PORT = "8788";
const GOOGLE_CALLBACK_PATH = "/auth/callback";
const DEFAULT_AUTH_NEXT_PATH = "/?view=generate";
const USER_AUTH_NOT_READY_MESSAGE =
  "Masuk Google belum tersedia saat ini. Silakan coba masuk dengan email atau hubungi admin.";
const SESSION_RETRY_DELAYS_MS = [150, 350, 700];

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function resolveApiBase(): string {
  const envBase = import.meta.env.VITE_API_BASE?.trim();
  if (envBase) {
    return trimTrailingSlash(envBase);
  }
  if (typeof window === "undefined") {
    return `http://localhost:${DEV_BACKEND_PORT}`;
  }
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:${DEV_BACKEND_PORT}`;
  }
  return window.location.origin;
}

const API_BASE = resolveApiBase();
const OAUTH_ERROR_LOGIN_FAILED = "google-login-failed";
const OAUTH_ERROR_CALLBACK_INVALID = "google-callback-invalid";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface OAuthRedirectResult {
  authError?: string;
  redirectPath?: string;
  sessionReady: boolean;
}

export interface AuthResult {
  user: AuthUser | null;
  message: string;
  needsEmailConfirmation?: boolean;
}

export function isAuthReady(): boolean {
  return isSupabaseAuthReady();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function resolveSafeLocalPath(input: string | null | undefined, fallback: string): string {
  if (!input) {
    return fallback;
  }

  try {
    const url = new URL(input, window.location.origin);
    if (url.origin !== window.location.origin) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function buildCallbackUrl(returnTo: string): string {
  const callbackUrl = new URL(GOOGLE_CALLBACK_PATH, window.location.origin);
  callbackUrl.searchParams.set("next", resolveSafeLocalPath(returnTo, DEFAULT_AUTH_NEXT_PATH));
  return callbackUrl.toString();
}

function getOAuthError(url: URL): string {
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "");
  return (
    url.searchParams.get("error") ||
    url.searchParams.get("error_code") ||
    url.searchParams.get("error_description") ||
    hashParams.get("error") ||
    hashParams.get("error_code") ||
    hashParams.get("error_description") ||
    ""
  );
}

function replaceBrowserUrl(path: string): void {
  window.history.replaceState({}, "", path);
}

function friendlyAuthError(error: unknown, fallback: string): Error {
  const rawMessage = error instanceof Error ? error.message : String(error || fallback);
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("email not confirmed")) {
    return new Error("Email Anda belum dikonfirmasi. Cek inbox email, lalu masuk kembali.");
  }

  if (normalized.includes("invalid login") || normalized.includes("invalid credentials")) {
    return new Error("Email atau password belum cocok. Periksa lagi lalu coba masuk.");
  }

  if (normalized.includes("password")) {
    return new Error("Password belum memenuhi syarat. Gunakan minimal 8 karakter.");
  }

  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return new Error("Email ini sudah terdaftar. Silakan masuk dengan email tersebut.");
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return new Error("Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.");
  }

  if (normalized.includes("network") || normalized.includes("failed to fetch")) {
    return new Error("Koneksi belum stabil. Periksa internet Anda lalu coba lagi.");
  }

  if (normalized.includes("supabase auth belum dikonfigurasi")) {
    return new Error(USER_AUTH_NOT_READY_MESSAGE);
  }

  return new Error(fallback);
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      message = body.error ? `${body.message || "Error"}: ${body.error}` : body.message || message;
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

async function getAccessToken(): Promise<string | undefined> {
  if (!supabase) {
    return undefined;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new ApiError(401, error.message);
  }
  return data.session?.access_token;
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: { requireAuth?: boolean }
): Promise<T> {
  const requireAuth = options?.requireAuth ?? true;
  const accessToken = await getAccessToken();
  if (requireAuth && !accessToken) {
    throw new ApiError(401, "Silakan login terlebih dahulu.");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(accessToken
        ? {
            Authorization: `Bearer ${accessToken}`
          }
        : {}),
      ...(init?.headers || {})
    }
  });
  return parseResponse<T>(res);
}

export function resolveOutputUrl(outputPath: string): string {
  if (/^https?:\/\//i.test(outputPath)) {
    return outputPath;
  }
  if (typeof window === "undefined") {
    return outputPath;
  }
  return new URL(outputPath, `${API_BASE}/`).toString();
}

export async function startGoogleLogin(returnTo = "/"): Promise<void> {
  if (!supabase) {
    throw new Error(USER_AUTH_NOT_READY_MESSAGE);
  }
  const redirectTo = buildCallbackUrl(returnTo);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account"
      }
    }
  });
  if (error) {
    throw friendlyAuthError(error, "Masuk dengan Google belum berhasil. Silakan coba lagi.");
  }
}

export async function completeGoogleOAuthRedirect(): Promise<OAuthRedirectResult> {
  if (!supabase || typeof window === "undefined") {
    return { sessionReady: false };
  }

  const currentUrl = new URL(window.location.href);
  const nextPath = resolveSafeLocalPath(currentUrl.searchParams.get("next"), DEFAULT_AUTH_NEXT_PATH);
  const oauthError = getOAuthError(currentUrl);

  if (oauthError) {
    console.warn("Google OAuth returned an error:", oauthError);
    replaceBrowserUrl("/");
    return {
      authError: OAUTH_ERROR_LOGIN_FAILED,
      redirectPath: "/",
      sessionReady: false
    };
  }

  const code = currentUrl.searchParams.get("code");
  if (!code) {
    return { sessionReady: false };
  }

  const existingSession = await supabase.auth.getSession();
  if (existingSession.data.session) {
    replaceBrowserUrl(nextPath);
    return { redirectPath: nextPath, sessionReady: true };
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.warn("Google OAuth callback exchange failed:", error.message);
    replaceBrowserUrl("/");
    return {
      authError: OAUTH_ERROR_CALLBACK_INVALID,
      redirectPath: "/",
      sessionReady: false
    };
  }

  replaceBrowserUrl(nextPath);
  return { redirectPath: nextPath, sessionReady: true };
}

export function subscribeToAuthState(
  onChange: (event: string) => void | Promise<void>
): () => void {
  if (!supabase) {
    return () => undefined;
  }

  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((event) => {
    void onChange(event);
  });

  return () => {
    subscription.unsubscribe();
  };
}

export function subscribeToJobEvents(
  jobId: string,
  callbacks: {
    onJob: (job: JobRecord) => void;
    onError?: () => void;
  }
): () => void {
  let closed = false;
  let source: EventSource | null = null;

  void (async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken || closed) {
        callbacks.onError?.();
        return;
      }

      const eventsUrl = new URL(`${API_BASE}/api/jobs/${jobId}/events`);
      eventsUrl.searchParams.set("access_token", accessToken);
      source = new EventSource(eventsUrl.toString());

      source.addEventListener("job", (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as { job: JobRecord };
        callbacks.onJob(payload.job);
      });

      source.onerror = () => {
        callbacks.onError?.();
      };
    } catch {
      callbacks.onError?.();
    }
  })();

  return () => {
    closed = true;
    source?.close();
  };
}

export async function fetchSession(): Promise<AuthUser | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return null;
  }
  const data = await apiFetch<{ user: AuthUser | null }>("/api/auth/session");
  return data.user;
}

async function fetchSessionWithRetry(): Promise<AuthUser | null> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= SESSION_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const user = await fetchSession();
      if (user) {
        return user;
      }
    } catch (error) {
      lastError = error;
    }

    const delay = SESSION_RETRY_DELAYS_MS[attempt];
    if (delay) {
      await sleep(delay);
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

export async function register(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthResult> {
  if (!supabase) {
    throw new Error(USER_AUTH_NOT_READY_MESSAGE);
  }
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        display_name: input.displayName?.trim() || undefined
      }
    }
  });
  if (error) {
    throw friendlyAuthError(error, "Akun belum bisa dibuat. Periksa data Anda lalu coba lagi.");
  }

  if (!data.session) {
    return {
      user: null,
      message: "Pendaftaran berhasil. Silakan cek email Anda untuk konfirmasi, lalu masuk kembali.",
      needsEmailConfirmation: true
    };
  }

  const user = await fetchSessionWithRetry();
  if (!user) {
    return {
      user: null,
      message: "Akun berhasil dibuat. Data akun sedang disiapkan, silakan masuk beberapa saat lagi.",
      needsEmailConfirmation: true
    };
  }

  return {
    user,
    message: "Akun berhasil dibuat. Selamat datang di Voiceshort."
  };
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  if (!supabase) {
    throw new Error(USER_AUTH_NOT_READY_MESSAGE);
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password
  });
  if (error) {
    throw friendlyAuthError(error, "Belum bisa masuk. Periksa email dan password Anda lalu coba lagi.");
  }
  const user = await fetchSessionWithRetry();
  if (!user) {
    throw new Error("Login berhasil, tetapi data akun masih disiapkan. Coba muat ulang halaman sebentar lagi.");
  }
  return {
    user,
    message: "Berhasil masuk. Selamat datang kembali."
  };
}

export async function logout(): Promise<void> {
  if (!supabase) {
    return;
  }
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchAdminUsers(): Promise<AdminUserRecord[]> {
  return await apiFetch<AdminUserRecord[]>("/api/admin/users");
}

export async function updateAdminUser(
  email: string,
  input: {
    displayName?: string;
    role?: "user" | "superadmin";
    subscriptionStatus?: "active" | "inactive";
    isUnlimited?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    assignedPackageCode?: "10_video" | "50_video" | "100_video" | "custom" | null;
    videoQuotaTotal?: number;
    videoQuotaUsed?: number;
  }
): Promise<AdminUserRecord> {
  return await apiFetch<AdminUserRecord>(`/api/admin/users/${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export async function createAdminUser(input: {
  email: string;
  password: string;
  displayName?: string;
  role?: "user" | "superadmin";
  subscriptionStatus?: "active" | "inactive";
  isUnlimited?: boolean;
}): Promise<AdminUserRecord> {
  return await apiFetch<AdminUserRecord>("/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export async function disableAdminUser(email: string): Promise<AdminUserRecord> {
  return await apiFetch<AdminUserRecord>(`/api/admin/users/${encodeURIComponent(email)}`, {
    method: "DELETE"
  });
}

export async function grantAdminUserPackage(
  email: string,
  input: {
    packageCode: "10_video" | "50_video" | "100_video" | "custom";
    customAmountIdr?: number;
    description?: string;
  }
): Promise<AdminUserRecord> {
  return await apiFetch<AdminUserRecord>(
    `/api/admin/users/${encodeURIComponent(email)}/package-grants`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
}

export async function fetchSettings(): Promise<AppSettings> {
  return await apiFetch<AppSettings>("/api/settings");
}

export async function updateSettings(settings: AppSettings): Promise<AppSettings> {
  return await apiFetch<AppSettings>("/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(settings)
  });
}

export interface DepositPackage {
  code: "10_video" | "50_video" | "100_video";
  label: string;
  payAmountIdr: number;
  creditAmountIdr: number;
  bonusAmountIdr: number;
  generateCredits: number;
}

export interface PaymentOrder {
  id: string;
  packageCode: DepositPackage["code"];
  payAmountIdr: number;
  creditAmountIdr: number;
  merchantOrderId: string;
  webqrisInvoiceId?: string | null;
  qrisPayload?: string | null;
  uniqueCode?: number | null;
  totalAmountIdr?: number | null;
  status: "pending" | "paid" | "expired" | "failed" | "canceled";
  expiredAt?: string | null;
  paidAt?: string | null;
  paymentMethod?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletLedgerEntry {
  id: string;
  amountIdr: number;
  balanceAfterIdr: number;
  entryType: string;
  sourceType: string;
  sourceId?: string | null;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WalletSummary {
  walletBalanceIdr: number;
  generatePriceIdr: number;
  generateCreditsRemaining: number | null;
  isUnlimited: boolean;
  packages: DepositPackage[];
  recentLedger: WalletLedgerEntry[];
  recentTopups: PaymentOrder[];
}

export async function fetchWallet(): Promise<WalletSummary> {
  return await apiFetch<WalletSummary>("/api/billing/wallet");
}

export async function createTopup(packageCode: DepositPackage["code"]): Promise<PaymentOrder> {
  return await apiFetch<PaymentOrder>("/api/billing/topups", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ packageCode })
  });
}

export async function fetchTopupStatus(orderId: string): Promise<PaymentOrder> {
  return await apiFetch<PaymentOrder>(`/api/billing/topups/${encodeURIComponent(orderId)}/status`);
}

export async function createJob(input: {
  video: File;
  title: string;
  description: string;
  contentType: ContentType;
  voiceGender: JobVoiceGender;
  tone: string;
  ctaText?: string;
  referenceLink?: string;
}): Promise<{ jobId: string; status: string; progress: JobProgress }> {
  const form = new FormData();
  form.append("video", input.video);
  form.append("title", input.title);
  form.append("description", input.description);
  form.append("contentType", input.contentType);
  form.append("voiceGender", input.voiceGender);
  form.append("tone", input.tone);
  if (input.ctaText?.trim()) {
    form.append("ctaText", input.ctaText.trim());
  }
  if (input.referenceLink?.trim()) {
    form.append("referenceLink", input.referenceLink.trim());
  }
  return await apiFetch<{ jobId: string; status: string; progress: JobProgress }>("/api/jobs", {
    method: "POST",
    body: form
  });
}

export async function fetchJobs(): Promise<JobRecord[]> {
  return await apiFetch<JobRecord[]>("/api/jobs");
}

export async function fetchGenerationCapacity(): Promise<GenerationCapacity> {
  return await apiFetch<GenerationCapacity>("/api/generation-capacity");
}

export async function fetchJobDetail(jobId: string): Promise<JobRecord> {
  return await apiFetch<JobRecord>(`/api/jobs/${jobId}`);
}

export async function updateJob(
  jobId: string,
  input: {
    title: string;
    description: string;
    contentType: ContentType;
    voiceGender: JobVoiceGender;
    tone: string;
    ctaText?: string;
    referenceLink?: string;
  }
): Promise<JobRecord> {
  return await apiFetch<JobRecord>(`/api/jobs/${jobId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export async function deleteJob(jobId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/jobs/${jobId}`, {
    method: "DELETE"
  });
}

export async function retryJob(jobId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/jobs/${jobId}/retry`, {
    method: "POST"
  });
}

export async function openJobOutputLocation(jobId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/jobs/${jobId}/open-location`, {
    method: "POST"
  });
}

export async function fetchTtsVoices(): Promise<{
  voices: TtsVoiceOption[];
  excitedPresets: ExcitedVoicePreset[];
}> {
  return await apiFetch<{
    voices: TtsVoiceOption[];
    excitedPresets: ExcitedVoicePreset[];
  }>("/api/tts/voices");
}

export async function previewTtsVoice(input: {
  voiceName: string;
  speechRate: number;
  text?: string;
}): Promise<{ voiceName: string; previewPath: string }> {
  return await apiFetch<{ voiceName: string; previewPath: string }>("/api/tts/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

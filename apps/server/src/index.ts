import { buildApp } from "./app.js";
import { loadEnv } from "./config.js";
import { AuthService } from "./services/auth-service.js";
import { JobEvents } from "./services/job-events.js";
import { JobProcessor } from "./services/job-processor.js";
import type { AiService, SpeechService } from "./services/ai-service.js";
import { BillingService } from "./services/billing-service.js";
import { LiteLlmService } from "./services/litellm-service.js";
import { SupabaseAuthConfigService } from "./services/supabase-auth-config-service.js";
import { createSupabaseClient } from "./services/supabase-client.js";
import { JobsStore } from "./stores/jobs-store.js";
import { SettingsStore } from "./stores/settings-store.js";
import { UsersStore } from "./stores/users-store.js";
import { SuccessOutputRetentionSweeper } from "./services/success-output-retention.js";
import { logger } from "./utils/logger.js";
import { ensureAppDirs } from "./utils/paths.js";

async function bootstrap(): Promise<void> {
  await ensureAppDirs();
  const env = loadEnv();
  const runtimeModelOverrides = {
    scriptModel: env.litellmScriptModel,
    ttsModel: env.litellmTtsModel
  };
  const adminDb = createSupabaseClient({
    supabaseUrl: env.supabaseUrl,
    supabaseKey: env.supabaseServiceRoleKey
  });
  if (!adminDb) {
    throw new Error("Supabase admin client gagal dibuat.");
  }

  const settingsStore = new SettingsStore(adminDb, runtimeModelOverrides);
  const jobsStore = new JobsStore(adminDb);
  const usersStore = new UsersStore(adminDb);
  const jobEvents = new JobEvents();
  await jobsStore.markRunningAsInterrupted();
  const authService = new AuthService({
    supabaseUrl: env.supabaseUrl,
    supabaseAnonKey: env.supabaseAnonKey,
    supabaseServiceRoleKey: env.supabaseServiceRoleKey,
    generatePriceIdr: env.generatePriceIdr
  });
  const supabaseAuthConfigService = new SupabaseAuthConfigService({
    logger,
    accessToken: env.supabaseAccessToken,
    projectRef: env.supabaseProjectRef,
    appWebUrl: env.appWebUrl,
    appProdWebUrl: env.appProdWebUrl,
    additionalRedirectUrls: env.additionalRedirectUrls,
    googleClientId: env.supabaseGoogleClientId,
    googleClientSecret: env.supabaseGoogleClientSecret
  });
  await supabaseAuthConfigService.syncGoogleOAuthConfig().catch((error) => {
    logger.error({ err: error }, "Gagal sinkronisasi Google OAuth ke Supabase.");
  });

  const litellm = new LiteLlmService({
    baseUrl: env.litellmBaseUrl,
    apiKey: env.litellmApiKey,
    scriptModel: env.litellmScriptModel,
    ttsModel: env.litellmTtsModel,
    fileTargetModel: env.litellmFileTargetModel,
    logger
  });
  const aiService: AiService = litellm;
  const speechGenerator: SpeechService = litellm;
  const billingService = new BillingService({
    db: adminDb,
    logger,
    webqrisBaseUrl: env.webqrisBaseUrl,
    webqrisApiToken: env.webqrisApiToken,
    webqrisWebhookSecret: env.webqrisWebhookSecret,
    generatePriceIdr: env.generatePriceIdr
  });
  const processor = new JobProcessor(
    jobsStore,
    settingsStore,
    aiService,
    logger,
    jobEvents,
    speechGenerator
  );
  const successOutputRetentionSweeper = new SuccessOutputRetentionSweeper(
    jobsStore,
    logger,
    env.successOutputRetentionHours
  );
  await successOutputRetentionSweeper.sweepOnce();
  successOutputRetentionSweeper.start();
  await processor.hydrateQueuedJobs();
  const app = await buildApp({
    logger,
    webOrigins: env.webOrigins,
    settingsStore,
    jobsStore,
    usersStore,
    processor,
    billingService,
    speechGenerator,
    authService,
    jobEvents
  });

  await app.listen({
    port: env.port,
    host: "0.0.0.0"
  });

  logger.info(
    {
      aiProvider: env.aiProvider,
      litellmBaseUrl: env.litellmBaseUrl,
      scriptModel: env.litellmScriptModel,
      ttsModel: env.litellmTtsModel,
      nonTtsProvider: "litellm",
      ttsProvider: "litellm"
    },
    "Routing AI aktif: upload, naskah, caption, dan suara via litellm."
  );
  logger.info(`Server berjalan di http://localhost:${env.port}`);
}

bootstrap().catch((error) => {
  console.error("Gagal menjalankan server.");
  console.error(error);
  logger.error({ err: error }, "Gagal menjalankan server.");
  process.exit(1);
});

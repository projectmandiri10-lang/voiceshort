import { buildApp } from "./app.js";
import { loadEnv } from "./config.js";
import { AuthService } from "./services/auth-service.js";
import { JobEvents } from "./services/job-events.js";
import { JobProcessor } from "./services/job-processor.js";
import { GeminiService } from "./services/gemini-service.js";
import type { AiService, SpeechService } from "./services/ai-service.js";
import { BillingService } from "./services/billing-service.js";
import { HybridAiService } from "./services/hybrid-ai-service.js";
import { LiteLlmService } from "./services/litellm-service.js";
import { SnifoxService } from "./services/snifox-service.js";
import { SupabaseAuthConfigService } from "./services/supabase-auth-config-service.js";
import { createSupabaseClient } from "./services/supabase-client.js";
import { JobsStore } from "./stores/jobs-store.js";
import { SettingsStore } from "./stores/settings-store.js";
import { UsersStore } from "./stores/users-store.js";
import { logger } from "./utils/logger.js";
import { ensureAppDirs } from "./utils/paths.js";

async function bootstrap(): Promise<void> {
  await ensureAppDirs();
  const env = loadEnv();
  const runtimeModelOverrides =
    env.aiProvider === "litellm"
      ? {
          scriptModel: env.litellmScriptModel,
          ttsModel: env.litellmTtsModel
        }
      : env.aiProvider === "hybrid"
        ? {
            scriptModel: env.snifoxScriptModel,
            ttsModel: env.litellmTtsModel
          }
      : undefined;
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

  let aiService: AiService;
  let speechGenerator: SpeechService;
  let aiRouting: {
    provider: string;
    nonTts: string;
    tts: string;
  };

  if (env.aiProvider === "litellm") {
    const litellm = new LiteLlmService({
      baseUrl: env.litellmBaseUrl,
      apiKey: env.litellmApiKey,
      scriptModel: env.litellmScriptModel,
      ttsModel: env.litellmTtsModel,
      fileTargetModel: env.litellmFileTargetModel,
      logger
    });
    aiService = litellm;
    speechGenerator = litellm;
    aiRouting = {
      provider: "litellm",
      nonTts: "litellm",
      tts: "litellm"
    };
  } else if (env.aiProvider === "hybrid") {
    const snifox = new SnifoxService({
      baseUrl: env.snifoxApiBase,
      apiKey: env.snifoxApiKey,
      scriptModel: env.snifoxScriptModel,
      logger
    });
    const litellmSpeech = new LiteLlmService({
      baseUrl: env.litellmBaseUrl,
      apiKey: env.litellmApiKey,
      ttsModel: env.litellmTtsModel,
      logger
    });
    aiService = new HybridAiService(snifox, litellmSpeech);
    speechGenerator = litellmSpeech;
    aiRouting = {
      provider: "hybrid",
      nonTts: "snifox",
      tts: "litellm"
    };
  } else {
    const gemini = new GeminiService(env.geminiApiKey, logger);
    aiService = gemini;
    speechGenerator = gemini;
    aiRouting = {
      provider: "gemini",
      nonTts: "gemini",
      tts: "gemini"
    };
  }
  const billingService = new BillingService({
    db: adminDb,
    logger,
    webqrisBaseUrl: env.webqrisBaseUrl,
    webqrisApiToken: env.webqrisApiToken,
    webqrisWebhookSecret: env.webqrisWebhookSecret,
    generatePriceIdr: env.generatePriceIdr
  });
  const processor = new JobProcessor(jobsStore, settingsStore, aiService, logger, jobEvents);
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
      aiProvider: aiRouting.provider,
      nonTtsProvider: aiRouting.nonTts,
      ttsProvider: aiRouting.tts
    },
    "AI routing aktif."
  );
  logger.info(`Server berjalan di http://localhost:${env.port}`);
}

bootstrap().catch((error) => {
  console.error("Gagal menjalankan server.");
  console.error(error);
  logger.error({ err: error }, "Gagal menjalankan server.");
  process.exit(1);
});

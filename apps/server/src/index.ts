import { buildApp } from "./app.js";
import { loadEnv } from "./config.js";
import { logger } from "./utils/logger.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp({ logger, webOrigins: env.webOrigins });
  await app.listen({ port: env.port, host: "0.0.0.0" });
  logger.info({ port: env.port }, "Server kompatibilitas aktif.");
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "Gagal menjalankan server kompatibilitas.");
  process.exit(1);
});

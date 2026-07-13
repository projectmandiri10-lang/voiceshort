import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { access } from "node:fs/promises";
import path from "node:path";

export interface BuildAppOptions {
  logger: FastifyBaseLogger;
  webOrigins: string[];
  webDistDir?: string;
}

const RETIRED_MESSAGE = "Workflow generate server lama telah dihentikan. Gunakan generation session di Cloudflare Worker.";

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: options.logger });
  await app.register(cors, {
    origin: options.webOrigins,
    credentials: true
  });

  app.get("/health", async () => ({ status: "ok", mode: "compatibility" }));
  app.get("/api/health", async () => ({ status: "ok", mode: "compatibility" }));

  app.post("/api/jobs", async (_request, reply) => {
    return reply.code(410).send({ message: RETIRED_MESSAGE });
  });
  app.post("/api/jobs/:jobId/retry", async (_request, reply) => {
    return reply.code(410).send({ message: RETIRED_MESSAGE });
  });

  const webDistDir = options.webDistDir || path.resolve(process.cwd(), "../web/dist");
  await access(webDistDir).then(async () => {
    await app.register(fastifyStatic, { root: webDistDir, wildcard: false });
    app.get("/*", async (_request, reply) => reply.sendFile("index.html"));
  }).catch(() => undefined);

  return app;
}

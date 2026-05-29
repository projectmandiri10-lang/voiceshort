import { handleApiRequest, type WorkerEnv } from "./worker-api";

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return await handleApiRequest(request, env);
    }

    if (env.ASSETS) {
      return await env.ASSETS.fetch(request);
    }

    return new Response("Asset binding not configured.", { status: 500 });
  }
};

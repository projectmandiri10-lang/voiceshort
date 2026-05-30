import { handleApiRequest, type WorkerEnv } from "./worker-api";

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function buildRuntimeConfigScript(env: WorkerEnv, apiBase: string): string {
  const supabaseUrl = JSON.stringify(env.SUPABASE_URL?.trim() ?? "");
  const supabaseAnonKey = JSON.stringify(env.SUPABASE_ANON_KEY?.trim() ?? "");
  const encodedApiBase = JSON.stringify(apiBase);

  return `<script>window.__VOICESHORT_RUNTIME_CONFIG__={supabaseUrl:${supabaseUrl},supabaseAnonKey:${supabaseAnonKey},apiBase:${encodedApiBase}};</script>`;
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return await handleApiRequest(request, env);
    }

    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      const contentType = response.headers.get("content-type") || "";

      if (request.method === "GET" && contentType.includes("text/html")) {
        const HTMLRewriterCtor = (globalThis as { HTMLRewriter?: new () => any }).HTMLRewriter;

        if (HTMLRewriterCtor) {
          return new HTMLRewriterCtor()
            .on("head", {
              element(element: { append(content: string, options: { html: boolean }): void }) {
                element.append(buildRuntimeConfigScript(env, url.origin), { html: true });
              }
            })
            .transform(response);
        }
      }

      return response;
    }

    return new Response("Asset binding not configured.", { status: 500 });
  }
};

import pino from "pino";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOGS_DIR } from "./paths.js";

const REDACTED_QUERY_VALUE = "[REDACTED]";
const SENSITIVE_QUERY_KEYS = ["access_token", "token"] as const;
const SENSITIVE_HEADER_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-signature",
  "x-webhook-signature"
] as const;

export function sanitizeLoggedUrl(url: string): string {
  if (!url.includes("?")) {
    return url;
  }

  try {
    const parsed = new URL(url, "http://localhost");
    let changed = false;
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (!parsed.searchParams.has(key)) {
        continue;
      }
      parsed.searchParams.set(key, REDACTED_QUERY_VALUE);
      changed = true;
    }

    if (!changed) {
      return url;
    }

    const sanitizedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!/^https?:\/\//i.test(url)) {
      return sanitizedPath;
    }
    return `${parsed.origin}${sanitizedPath}`;
  } catch {
    return url.replace(
      /([?&](?:access_token|token)=)[^&]*/gi,
      `$1${REDACTED_QUERY_VALUE}`
    );
  }
}

export function sanitizeLoggedHeaders(
  headers: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!headers) {
    return headers;
  }

  const sanitized = { ...headers };
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_HEADER_KEYS.includes(key.toLowerCase() as (typeof SENSITIVE_HEADER_KEYS)[number])) {
      sanitized[key] = REDACTED_QUERY_VALUE;
    }
  }
  return sanitized;
}

mkdirSync(LOGS_DIR, { recursive: true });

const fileDestination = pino.destination({
  dest: path.join(LOGS_DIR, "app.log"),
  mkdir: true,
  sync: true
});

const prettyTransport = pino.transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "yyyy-mm-dd HH:MM:ss.l"
  }
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    serializers: {
      ...pino.stdSerializers,
      req(request) {
        const serialized = pino.stdSerializers.req(request) as ReturnType<
          typeof pino.stdSerializers.req
        > & {
          url?: string;
          headers?: Record<string, unknown>;
        };
        if (typeof serialized.url === "string") {
          serialized.url = sanitizeLoggedUrl(serialized.url);
        }
        const sanitizedHeaders = sanitizeLoggedHeaders(serialized.headers);
        if (sanitizedHeaders) {
          serialized.headers = sanitizedHeaders as typeof serialized.headers;
        }
        return serialized;
      }
    }
  },
  pino.multistream([
    { stream: prettyTransport },
    { stream: fileDestination }
  ])
);

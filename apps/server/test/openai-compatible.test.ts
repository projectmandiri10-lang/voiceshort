import * as dns from "node:dns";
import * as net from "node:net";
import { describe, expect, it } from "vitest";
import {
  OpenAiCompatibleHttpError,
  applyOpenAiCompatibleNetworkWorkaround,
  fetchOpenAiCompatible,
  isOpenAiCompatibleTransientError,
  parseOpenAiCompatibleJsonResponse,
  normalizeOpenAiCompatibleBaseUrl
} from "../src/services/openai-compatible.js";

describe("openai-compatible helpers", () => {
  it("normalizes base urls with trailing slash and v1 suffix", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("https://example.com/v1/")).toBe(
      "https://example.com"
    );
    expect(normalizeOpenAiCompatibleBaseUrl("https://example.com/")).toBe(
      "https://example.com"
    );
  });

  it("treats timeout-style failures as transient", () => {
    expect(
      isOpenAiCompatibleTransientError(new Error("LiteLLM request timeout setelah 120 detik."))
    ).toBe(true);
    expect(
      isOpenAiCompatibleTransientError({
        name: "AbortError",
        message: "This operation was aborted"
      })
    ).toBe(true);
    expect(
      isOpenAiCompatibleTransientError(
        new Error(
          "LiteLLM tidak bisa dijangkau di example.com: Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)."
        )
      )
    ).toBe(true);
  });

  it("compresses cloudflare 524 html into a concise gateway timeout message", async () => {
    const response = new Response("<title>A timeout occurred</title>", {
      status: 524,
      headers: {
        "Content-Type": "text/html"
      }
    });

    await expect(parseOpenAiCompatibleJsonResponse(response, "LiteLLM")).rejects.toMatchObject<
      Partial<OpenAiCompatibleHttpError>
    >({
      message: "LiteLLM gateway timeout (524). Host proxy tidak merespons tepat waktu.",
      statusCode: 524
    });
  });

  it("compresses cloudflare 502 html into a concise bad gateway message", async () => {
    const response = new Response(
      "<html><head><title>koboi2026.biz.id | 502: Bad gateway</title></head></html>",
      {
        status: 502,
        headers: {
          "Content-Type": "text/html"
        }
      }
    );

    await expect(parseOpenAiCompatibleJsonResponse(response, "LiteLLM")).rejects.toMatchObject<
      Partial<OpenAiCompatibleHttpError>
    >({
      message:
        "LiteLLM bad gateway (502). Host proxy sedang bermasalah, coba lagi beberapa menit.",
      statusCode: 502
    });
  });

  it("applies a Windows network workaround for openai-compatible requests", () => {
    const originalDnsOrder = dns.getDefaultResultOrder();
    const originalAutoSelectFamily = net.getDefaultAutoSelectFamily();

    try {
      applyOpenAiCompatibleNetworkWorkaround("win32");
      expect(dns.getDefaultResultOrder()).toBe("ipv4first");
      expect(net.getDefaultAutoSelectFamily()).toBe(false);
    } finally {
      dns.setDefaultResultOrder(originalDnsOrder);
      net.setDefaultAutoSelectFamily(originalAutoSelectFamily);
    }
  });

  it("wraps low-level fetch failures with provider and host details", async () => {
    const originalFetch = globalThis.fetch;
    const cause = new Error("Connect Timeout Error");
    Object.assign(cause, {
      code: "UND_ERR_CONNECT_TIMEOUT"
    });
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed", {
        cause
      });
    };

    try {
      await expect(
        fetchOpenAiCompatible(
          "https://litellm.example.test/v1/models",
          {},
          {
            providerName: "LiteLLM"
          }
        )
      ).rejects.toThrow(
        "LiteLLM tidak bisa dijangkau di litellm.example.test: Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)."
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

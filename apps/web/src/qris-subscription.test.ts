import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args)
}));

const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  INTERACTIVE_QRIS_WEBHOOK_SECRET: "voice-secret",
  INTERACTIVE_QRIS_SOURCE_PACKAGE: "com.interactive.qrisid"
};

function webhookDb() {
  const eventInsert = vi.fn(async () => ({ error: null }));
  const settle = vi.fn(async () => ({
    data: {
      id: "order-1",
      owner_user_id: "user-1",
      owner_email: "user@test.dev",
      package_code: "10_video",
      pay_amount_idr: 20000,
      credit_amount_idr: 20000,
      provider: "interactive_qris",
      merchant_order_id: "VSQRIS-1",
      webqris_invoice_id: null,
      qris_payload: null,
      unique_code: 71,
      total_amount_idr: 20071,
      tax_rate_percent: 0,
      tax_amount_idr: 0,
      status: "paid",
      expired_at: "2026-07-15T11:00:00Z",
      paid_at: "2026-07-15T10:40:00Z",
      payment_method: "interactive_qris",
      created_at: "2026-07-15T10:30:00Z",
      updated_at: "2026-07-15T10:40:00Z"
    },
    error: null
  }));
  return {
    eventInsert,
    settle,
    db: {
      rpc: settle,
      from: vi.fn((table: string) => {
        if (table === "qris_webhook_events") {
          return {
            select() { return this; },
            eq() { return this; },
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            insert: eventInsert
          };
        }
        if (table === "payment_orders") {
          return {
            update() { return this; },
            eq() { return this; },
            lte: vi.fn(async () => ({ data: [], error: null })),
            select() { return this; },
            gt() { return this; },
            in: vi.fn(async () => ({
              data: [{
                id: "order-1",
                owner_user_id: "user-1",
                owner_email: "user@test.dev",
                package_code: "10_video",
                pay_amount_idr: 20000,
                credit_amount_idr: 20000,
                provider: "interactive_qris",
                merchant_order_id: "VSQRIS-1",
                webqris_invoice_id: null,
                qris_payload: null,
                unique_code: 71,
                total_amount_idr: 20071,
                tax_rate_percent: 0,
                tax_amount_idr: 0,
                status: "pending",
                expired_at: "2099-07-15T11:00:00Z",
                paid_at: null,
                payment_method: null,
                created_at: "2026-07-15T10:30:00Z",
                updated_at: "2026-07-15T10:30:00Z"
              }],
              error: null
            }))
          };
        }
        throw new Error(`Unexpected table ${table}`);
      })
    }
  };
}

describe("InterActive QRIS topup webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockReset();
  });

  it("rejects a wrong webhook secret", async () => {
    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(new Request("https://app.test/api/webhooks/interactive-qris", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-interactive-qris-secret": "wrong" },
      body: JSON.stringify({ packageName: "com.interactive.qrisid", text: "Rp 20.071" })
    }), env);
    expect(response.status).toBe(401);
  });

  it("credits exactly one pending topup invoice from malformed multiline MacroDroid JSON", async () => {
    const mocks = webhookDb();
    createClientMock.mockReturnValue(mocks.db);
    const { handleApiRequest } = await import("./worker-api");
    const malformed = `{
  "packageName": "com.interactive.qrisid",
  "title": "Transaksi InterActive QRIS",
  "text": "Pembayaran QRIS sebesar Rp 20.071
ShopeePay telah diterima",
  "postedAt": "2026-07-15T10:40:00.000Z",
  "raw": "Pembayaran QRIS sebesar Rp 20.071
ShopeePay telah diterima"
}`;
    const response = await handleApiRequest(new Request("https://app.test/api/webhooks/interactive-qris", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-interactive-qris-secret": "voice-secret" },
      body: malformed
    }), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      credited: true,
      orderId: "order-1",
      paidAmountIdr: 20071,
      creditAmountIdr: 20000
    });
    expect(mocks.settle).toHaveBeenCalledWith("credit_wallet_from_payment", expect.objectContaining({ order_id: "order-1" }));
    expect(mocks.eventInsert).toHaveBeenCalled();
  });

  it("accepts payloads that mention InterActive QRIS even when MacroDroid package placeholders are unreliable and ignores long phone numbers", async () => {
    const mocks = webhookDb();
    createClientMock.mockReturnValue(mocks.db);
    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(new Request("https://app.test/api/webhooks/interactive-qris", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-interactive-qris-secret": "voice-secret" },
      body: JSON.stringify({
        packageName: "",
        title: "Transaksi InterActive QRIS",
        text: "Pembayaran QRIS sebesar Rp 20.071 berhasil diterima",
        raw: "Pembayaran QRIS sebesar Rp 20.071 berhasil diterima. Kontak merchant 6285156861485."
      })
    }), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      credited: true,
      orderId: "order-1",
      paidAmountIdr: 20071
    });
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.eventInsert).toHaveBeenCalledWith(expect.objectContaining({
      amount_candidates: expect.arrayContaining([20071]),
      payment_order_id: "order-1"
    }));
  });
});

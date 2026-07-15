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
      id: "order-1", owner_user_id: "user-1", owner_email: "user@test.dev",
      base_amount_idr: 20000, unique_code: 71, total_amount_idr: 20071,
      subscription_days: 30, status: "paid", expires_at: "2026-07-15T11:00:00Z",
      paid_at: "2026-07-15T10:40:00Z", subscription_expires_at: "2026-08-14T10:40:00Z",
      created_at: "2026-07-15T10:30:00Z", updated_at: "2026-07-15T10:40:00Z"
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
        if (table === "subscription_orders") {
          return {
            update() { return this; },
            eq() { return this; },
            lte: vi.fn(async () => ({ data: [], error: null })),
            select() { return this; },
            gt() { return this; },
            in: vi.fn(async () => ({
              data: [{
                id: "order-1", owner_user_id: "user-1", owner_email: "user@test.dev",
                base_amount_idr: 20000, unique_code: 71, total_amount_idr: 20071,
                subscription_days: 30, status: "pending", expires_at: "2099-07-15T11:00:00Z",
                paid_at: null, subscription_expires_at: null,
                created_at: "2026-07-15T10:30:00Z", updated_at: "2026-07-15T10:30:00Z"
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

describe("InterActive QRIS subscription webhook", () => {
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

  it("settles exactly one pending invoice from malformed multiline MacroDroid JSON", async () => {
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
      received: true, credited: true, orderId: "order-1", paidAmountIdr: 20071
    });
    expect(mocks.settle).toHaveBeenCalledWith("settle_subscription_order", expect.objectContaining({ target_order_id: "order-1" }));
    expect(mocks.eventInsert).toHaveBeenCalled();
  });
});

import crypto from "node:crypto";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingService } from "../src/services/billing-service.js";
import type { AuthSessionUser } from "../src/types.js";

type TableName = "profiles" | "payment_orders" | "wallet_ledger" | "webhook_events";
type Row = Record<string, any>;

interface FakeDbState {
  profiles: Row[];
  payment_orders: Row[];
  wallet_ledger: Row[];
  webhook_events: Row[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

function nowIso() {
  return new Date().toISOString();
}

function matchesFilters(row: Row, filters: Array<{ key: string; value: unknown }>) {
  return filters.every((filter) => row[filter.key] === filter.value);
}

class FakeQueryBuilder {
  private operation: "select" | "insert" | "update" = "select";
  private payload: Row | Row[] | undefined;
  private filters: Array<{ key: string; value: unknown }> = [];
  private limitCount: number | undefined;

  public constructor(
    private readonly state: FakeDbState,
    private readonly table: TableName
  ) {}

  public insert(payload: Row | Row[]) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  public update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  public select() {
    return this;
  }

  public eq(key: string, value: unknown) {
    this.filters.push({ key, value });
    return this;
  }

  public order() {
    return this;
  }

  public limit(count: number) {
    this.limitCount = count;
    return this;
  }

  public async single() {
    const result = this.execute();
    const data = Array.isArray(result.data) ? result.data[0] : result.data;
    return { data, error: data ? null : new Error("No rows") };
  }

  public async maybeSingle() {
    const result = this.execute();
    const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
    return { data, error: null };
  }

  public then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    const rows = this.state[this.table];
    if (this.operation === "insert") {
      const inputRows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const inserted = inputRows.map((payload) => {
        const row = {
          id: payload.id ?? `${this.table}-${rows.length + 1}`,
          created_at: payload.created_at ?? nowIso(),
          updated_at: payload.updated_at ?? nowIso(),
          ...payload
        };
        if (this.table === "payment_orders") {
          row.status = row.status ?? "pending";
          row.provider = row.provider ?? "webqris";
        }
        rows.push(row);
        return row;
      });
      return { data: inserted, error: null };
    }

    if (this.operation === "update") {
      const updated = rows.filter((row) => matchesFilters(row, this.filters));
      updated.forEach((row) => Object.assign(row, this.payload));
      return { data: updated, error: null };
    }

    let selected = rows.filter((row) => matchesFilters(row, this.filters));
    if (this.limitCount !== undefined) {
      selected = selected.slice(0, this.limitCount);
    }
    return { data: selected, error: null };
  }
}

function createFakeDb(initial?: Partial<FakeDbState>) {
  const state: FakeDbState = {
    profiles: [],
    payment_orders: [],
    wallet_ledger: [],
    webhook_events: [],
    rpcCalls: [],
    ...initial
  };

  const db = {
    from(table: TableName) {
      return new FakeQueryBuilder(state, table);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ name, args });
      if (name !== "credit_wallet_from_payment") {
        return { data: null, error: new Error(`Unexpected RPC ${name}`) };
      }

      const order = state.payment_orders.find((row) => row.id === args.order_id);
      if (!order) {
        return { data: null, error: new Error("Payment order tidak ditemukan.") };
      }
      if (order.status === "paid") {
        return { data: order, error: null };
      }

      const profile = state.profiles.find((row) => row.id === order.owner_user_id);
      if (!profile) {
        return { data: null, error: new Error("Profil pemilik payment tidak ditemukan.") };
      }

      profile.wallet_balance_idr += order.credit_amount_idr;
      order.status = "paid";
      order.paid_at = "2026-04-28T11:00:00.000Z";
      order.raw_paid_webhook = args.webhook_payload;
      state.wallet_ledger.push({
        id: `ledger-${state.wallet_ledger.length + 1}`,
        owner_user_id: order.owner_user_id,
        owner_email: order.owner_email,
        amount_idr: order.credit_amount_idr,
        balance_after_idr: profile.wallet_balance_idr,
        entry_type: "deposit_credit",
        source_type: "payment_order",
        source_id: order.id,
        description: "Deposit WebQRIS berhasil",
        metadata: {},
        created_at: nowIso()
      });
      return { data: order, error: null };
    }
  };

  return { db: db as any, state };
}

function buildService(state?: Partial<FakeDbState>) {
  const fake = createFakeDb(state);
  const service = new BillingService({
    db: fake.db,
    logger: pino({ level: "silent" }),
    webqrisBaseUrl: "https://webqris.test",
    webqrisApiToken: "token-test",
    webqrisWebhookSecret: "secret-test",
    generatePriceIdr: 2000
  });
  return { service, ...fake };
}

function buildUser(overrides: Partial<AuthSessionUser> = {}): AuthSessionUser {
  return {
    id: "user-creator",
    email: "creator@test.dev",
    displayName: "Creator",
    role: "user",
    subscriptionStatus: "active",
    videoQuotaTotal: 10,
    videoQuotaUsed: 0,
    videoQuotaRemaining: 10,
    walletBalanceIdr: 0,
    generatePriceIdr: 2000,
    generateCreditsRemaining: 0,
    isUnlimited: false,
    disabledAt: null,
    disabledReason: null,
    assignedPackageCode: null,
    ...overrides
  };
}

function sign(rawBody: string) {
  return crypto.createHmac("sha256", "secret-test").update(rawBody).digest("hex");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BillingService", () => {
  it("creates a WebQRIS topup invoice with package amount", async () => {
    const { service, state } = buildService();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          invoice_id: "INV-TEST-1",
          qris_payload: "00020101021226680016ID.CO.QRIS.WWW",
          amount: 20_000,
          unique_code: 42,
          total_amount: 20_042,
          expired_at: "2026-04-28T12:00:00.000Z"
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const topup = await service.createTopup(buildUser(), "10_video");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://webqris.test/api/payments/qris/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-test" })
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      amount: 20_000,
      customer_name: "Creator"
    });
    expect(topup).toMatchObject({
      packageCode: "10_video",
      webqrisInvoiceId: "INV-TEST-1",
      qrisPayload: "00020101021226680016ID.CO.QRIS.WWW",
      totalAmountIdr: 20_042,
      status: "pending"
    });
    expect(state.payment_orders[0]).toMatchObject({
      pay_amount_idr: 20_000,
      credit_amount_idr: 20_000
    });
  });

  it("rejects WebQRIS webhook with invalid signature", async () => {
    const { service, state } = buildService();
    const rawBody = JSON.stringify({ event: "payment.paid", data: { status: "paid" } });

    await expect(service.handleWebhook(rawBody, "bad-signature")).rejects.toMatchObject({
      statusCode: 401
    });
    expect(state.webhook_events[0]).toMatchObject({
      processing_status: "failed",
      error_message: "Invalid signature"
    });
  });

  it("credits wallet once for duplicate paid webhook", async () => {
    const order = {
      id: "order-1",
      owner_user_id: "user-creator",
      owner_email: "creator@test.dev",
      package_code: "50_video",
      pay_amount_idr: 90_000,
      credit_amount_idr: 100_000,
      provider: "webqris",
      merchant_order_id: "VS-ORDER-1",
      webqris_invoice_id: "INV-TEST-2",
      qris_payload: "000201",
      unique_code: 42,
      total_amount_idr: 90_042,
      status: "pending",
      expired_at: null,
      paid_at: null,
      payment_method: null,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    const { service, state } = buildService({
      profiles: [{ id: "user-creator", email: "creator@test.dev", wallet_balance_idr: 0 }],
      payment_orders: [order]
    });
    const rawBody = JSON.stringify({
      event: "payment.paid",
      data: {
        invoice_id: "INV-TEST-2",
        merchant_order_id: "VS-ORDER-1",
        status: "paid",
        total_amount: 90_042,
        payment_method: "com.dana.id",
        paid_at: "2026-04-28T11:00:00.000Z"
      }
    });
    const signature = sign(rawBody);

    await service.handleWebhook(rawBody, signature);
    await service.handleWebhook(rawBody, signature);

    expect(state.profiles[0]?.wallet_balance_idr).toBe(100_000);
    expect(state.wallet_ledger).toHaveLength(1);
    expect(state.rpcCalls).toHaveLength(2);
    expect(state.payment_orders[0]).toMatchObject({ status: "paid" });
  });

  it("returns wallet summary with package credits and recent ledger", async () => {
    const { service } = buildService({
      profiles: [{ id: "user-creator", wallet_balance_idr: 18_000 }],
      wallet_ledger: [
        {
          id: "ledger-1",
          owner_user_id: "user-creator",
          owner_email: "creator@test.dev",
          amount_idr: -2_000,
          balance_after_idr: 18_000,
          entry_type: "generate_debit",
          source_type: "job",
          source_id: "job-1",
          description: "Biaya generate voice over",
          metadata: {},
          created_at: nowIso()
        }
      ]
    });

    const wallet = await service.getWallet(buildUser());

    expect(wallet).toMatchObject({
      walletBalanceIdr: 18_000,
      generatePriceIdr: 2000,
      generateCreditsRemaining: 9,
      isUnlimited: false
    });
    expect(wallet.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "100_video", creditAmountIdr: 200_000, generateCredits: 100 })
      ])
    );
    expect(wallet.recentLedger).toHaveLength(1);
  });

  it("returns unlimited wallet summary without finite generate credits", async () => {
    const { service } = buildService({
      profiles: [{ id: "user-admin", wallet_balance_idr: 0 }]
    });

    const wallet = await service.getWallet(
      buildUser({
        id: "user-admin",
        email: "jho.j80@gmail.com",
        isUnlimited: true,
        generateCreditsRemaining: null,
        videoQuotaRemaining: null
      })
    );

    expect(wallet).toMatchObject({
      walletBalanceIdr: 0,
      generateCreditsRemaining: null,
      isUnlimited: true
    });
  });
});

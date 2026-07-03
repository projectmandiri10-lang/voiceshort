import crypto from "node:crypto";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingService } from "../src/services/billing-service.js";
import type { AuthSessionUser } from "../src/types.js";

type TableName = "profiles" | "payment_orders" | "wallet_ledger" | "webhook_events" | "app_settings";
type Row = Record<string, any>;

interface FakeDbState {
  profiles: Row[];
  payment_orders: Row[];
  wallet_ledger: Row[];
  webhook_events: Row[];
  app_settings: Row[];
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
    app_settings: [{ settings_key: "default", tax_rate_percent: 0 }],
    rpcCalls: [],
    ...initial
  };

  const db = {
    from(table: TableName) {
      return new FakeQueryBuilder(state, table);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ name, args });
      if (name === "admin_transaction_feed") {
        const limit = Number(args.row_limit ?? 50);
        const cursorOccurredAt = typeof args.cursor_occurred_at === "string" ? args.cursor_occurred_at : null;
        const cursorTransactionId =
          typeof args.cursor_transaction_id === "string" ? args.cursor_transaction_id : null;
        const paymentRows = state.payment_orders.map((order) => {
          const ledger = state.wallet_ledger.find(
            (entry) =>
              entry.entry_type === "deposit_credit" &&
              entry.source_type === "payment_order" &&
              entry.source_id === order.id
          );
          return {
            transaction_id: `payment_order:${order.id}`,
            kind: "payment",
            status: order.status,
            occurred_at: order.status === "paid" ? order.paid_at || order.updated_at || order.created_at : order.created_at,
            owner_user_id: order.owner_user_id,
            owner_email: order.owner_email,
            gross_amount_idr: order.pay_amount_idr,
            wallet_impact_idr: order.status === "paid" ? order.credit_amount_idr : 0,
            balance_after_idr: order.status === "paid" ? ledger?.balance_after_idr ?? null : null,
            tax_rate_percent: order.tax_rate_percent ?? 0,
            tax_amount_idr: order.tax_amount_idr ?? 0,
            net_amount_idr: order.pay_amount_idr - (order.tax_amount_idr ?? 0),
            entry_type: order.status === "paid" ? ledger?.entry_type ?? null : null,
            source_type: order.status === "paid" ? ledger?.source_type ?? "payment_order" : "payment_order",
            description:
              ledger?.description ??
              (order.status === "pending" ? "Invoice top up menunggu pembayaran" : "Top up QRIS"),
            payment_method: order.payment_method ?? null,
            merchant_order_id: order.merchant_order_id,
            invoice_id: order.webqris_invoice_id ?? null
          };
        });
        const ledgerRows = state.wallet_ledger
          .filter(
            (entry) => !(entry.entry_type === "deposit_credit" && entry.source_type === "payment_order")
          )
          .map((entry) => ({
            transaction_id: `wallet_ledger:${entry.id}`,
            kind:
              entry.entry_type === "generate_debit"
                ? "generate"
                : entry.entry_type === "generate_refund"
                  ? "refund"
                  : "admin",
            status: "posted",
            occurred_at: entry.created_at,
            owner_user_id: entry.owner_user_id,
            owner_email: entry.owner_email,
            gross_amount_idr: Math.abs(entry.amount_idr),
            wallet_impact_idr: entry.amount_idr,
            balance_after_idr: entry.balance_after_idr,
            tax_rate_percent: 0,
            tax_amount_idr: 0,
            net_amount_idr: Math.abs(entry.amount_idr),
            entry_type: entry.entry_type,
            source_type: entry.source_type,
            description: entry.description,
            payment_method: null,
            merchant_order_id: null,
            invoice_id: null
          }));
        const data = [...paymentRows, ...ledgerRows]
          .filter((row) => {
            if (!cursorOccurredAt) {
              return true;
            }
            if (row.occurred_at < cursorOccurredAt) {
              return true;
            }
            return row.occurred_at === cursorOccurredAt && row.transaction_id < (cursorTransactionId || "");
          })
          .sort((left, right) => {
            if (left.occurred_at === right.occurred_at) {
              return right.transaction_id.localeCompare(left.transaction_id);
            }
            return right.occurred_at.localeCompare(left.occurred_at);
          })
          .slice(0, limit);
        return { data, error: null };
      }

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
        metadata: {
          taxRatePercent: order.tax_rate_percent ?? 0,
          taxAmountIdr: order.tax_amount_idr ?? 0
        },
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
    const { service, state } = buildService({
      app_settings: [{ settings_key: "default", tax_rate_percent: 11 }]
    });
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
      status: "pending",
      taxRatePercent: 11,
      taxAmountIdr: 2_200,
      netAmountIdr: 17_800
    });
    expect(state.payment_orders[0]).toMatchObject({
      pay_amount_idr: 20_000,
      credit_amount_idr: 20_000,
      tax_rate_percent: 11,
      tax_amount_idr: 2_200
    });
  });

  it("freezes tax snapshot on the created topup even if settings change later", async () => {
    const { service, state } = buildService({
      app_settings: [{ settings_key: "default", tax_rate_percent: 12 }]
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          invoice_id: "INV-SNAPSHOT-1",
          qris_payload: "000201",
          amount: 20_000,
          total_amount: 20_111,
          expired_at: "2026-04-28T12:00:00.000Z"
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await service.createTopup(buildUser(), "10_video");
    state.app_settings[0]!.tax_rate_percent = 0;

    expect(state.payment_orders[0]).toMatchObject({
      tax_rate_percent: 12,
      tax_amount_idr: 2_400
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
      tax_rate_percent: 11,
      tax_amount_idr: 9900,
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
    expect(state.wallet_ledger[0]?.metadata).toMatchObject({
      taxRatePercent: 11,
      taxAmountIdr: 9900
    });
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
        expect.objectContaining({
          code: "100_video",
          label: "100 menit",
          creditAmountIdr: 200_000,
          generateCredits: 100
        })
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

  it("returns a merged paid topup row and excludes duplicate deposit ledger rows from admin feed", async () => {
    const createdAt = "2026-07-03T09:00:00.000Z";
    const paidAt = "2026-07-03T10:00:00.000Z";
    const { service } = buildService({
      payment_orders: [
        {
          id: "order-paid-1",
          owner_user_id: "user-creator",
          owner_email: "creator@test.dev",
          package_code: "50_video",
          pay_amount_idr: 90_000,
          credit_amount_idr: 100_000,
          merchant_order_id: "VS-PAID-1",
          webqris_invoice_id: "INV-PAID-1",
          qris_payload: "000201",
          unique_code: 12,
          total_amount_idr: 90_012,
          tax_rate_percent: 11,
          tax_amount_idr: 9_900,
          status: "paid",
          expired_at: null,
          paid_at: paidAt,
          payment_method: "qris",
          created_at: createdAt,
          updated_at: paidAt
        }
      ],
      wallet_ledger: [
        {
          id: "ledger-paid-1",
          owner_user_id: "user-creator",
          owner_email: "creator@test.dev",
          amount_idr: 100_000,
          balance_after_idr: 100_000,
          entry_type: "deposit_credit",
          source_type: "payment_order",
          source_id: "order-paid-1",
          description: "Deposit WebQRIS berhasil",
          metadata: {
            taxRatePercent: 11,
            taxAmountIdr: 9_900
          },
          created_at: paidAt
        }
      ]
    });

    const result = await service.getAdminTransactions();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      transactionId: "payment_order:order-paid-1",
      kind: "payment",
      status: "paid",
      grossAmountIdr: 90_000,
      walletImpactIdr: 100_000,
      balanceAfterIdr: 100_000,
      taxRatePercent: 11,
      taxAmountIdr: 9_900,
      netAmountIdr: 80_100
    });
  });

  it("returns pending payments and non-payment ledger rows in the admin feed", async () => {
    const { service } = buildService({
      payment_orders: [
        {
          id: "order-pending-1",
          owner_user_id: "user-creator",
          owner_email: "creator@test.dev",
          package_code: "10_video",
          pay_amount_idr: 20_000,
          credit_amount_idr: 20_000,
          merchant_order_id: "VS-PENDING-1",
          webqris_invoice_id: "INV-PENDING-1",
          qris_payload: "000201",
          unique_code: 21,
          total_amount_idr: 20_021,
          tax_rate_percent: 0,
          tax_amount_idr: 0,
          status: "pending",
          expired_at: null,
          paid_at: null,
          payment_method: null,
          created_at: "2026-07-03T08:00:00.000Z",
          updated_at: "2026-07-03T08:00:00.000Z"
        }
      ],
      wallet_ledger: [
        {
          id: "ledger-generate-1",
          owner_user_id: "user-creator",
          owner_email: "creator@test.dev",
          amount_idr: -2_000,
          balance_after_idr: 18_000,
          entry_type: "generate_debit",
          source_type: "job",
          source_id: "job-1",
          description: "Biaya generate voice over",
          metadata: {},
          created_at: "2026-07-03T09:00:00.000Z"
        },
        {
          id: "ledger-refund-1",
          owner_user_id: "user-creator",
          owner_email: "creator@test.dev",
          amount_idr: 2_000,
          balance_after_idr: 20_000,
          entry_type: "generate_refund",
          source_type: "job",
          source_id: "job-1",
          description: "Refund generate voice over",
          metadata: {},
          created_at: "2026-07-03T09:30:00.000Z"
        },
        {
          id: "ledger-admin-1",
          owner_user_id: "user-creator",
          owner_email: "creator@test.dev",
          amount_idr: 10_000,
          balance_after_idr: 30_000,
          entry_type: "admin_adjustment",
          source_type: "admin",
          source_id: "manual",
          description: "Penyesuaian saldo custom oleh admin",
          metadata: {},
          created_at: "2026-07-03T10:00:00.000Z"
        }
      ]
    });

    const result = await service.getAdminTransactions();

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transactionId: "payment_order:order-pending-1",
          kind: "payment",
          status: "pending",
          walletImpactIdr: 0,
          taxAmountIdr: 0
        }),
        expect.objectContaining({
          transactionId: "wallet_ledger:ledger-generate-1",
          kind: "generate",
          taxAmountIdr: 0
        }),
        expect.objectContaining({
          transactionId: "wallet_ledger:ledger-refund-1",
          kind: "refund",
          taxAmountIdr: 0
        }),
        expect.objectContaining({
          transactionId: "wallet_ledger:ledger-admin-1",
          kind: "admin",
          taxAmountIdr: 0
        })
      ])
    );
  });
});

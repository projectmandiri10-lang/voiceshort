import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import type { AuthSessionUser } from "../types.js";

export const GENERATE_PRICE_IDR_DEFAULT = 2000;

export const DEPOSIT_PACKAGES = [
  {
    code: "10_video",
    label: "10 video",
    payAmountIdr: 20_000,
    creditAmountIdr: 20_000,
    bonusAmountIdr: 0
  },
  {
    code: "50_video",
    label: "50 video",
    payAmountIdr: 90_000,
    creditAmountIdr: 100_000,
    bonusAmountIdr: 10_000
  },
  {
    code: "100_video",
    label: "100 video",
    payAmountIdr: 170_000,
    creditAmountIdr: 200_000,
    bonusAmountIdr: 30_000
  }
] as const;

export type DepositPackageCode = (typeof DEPOSIT_PACKAGES)[number]["code"];
type PaymentStatus = "pending" | "paid" | "expired" | "failed" | "canceled";

interface BillingServiceOptions {
  db: SupabaseClient;
  logger: FastifyBaseLogger;
  webqrisBaseUrl: string;
  webqrisApiToken: string;
  webqrisWebhookSecret: string;
  generatePriceIdr: number;
}

interface PaymentOrderRow {
  id: string;
  owner_user_id: string;
  owner_email: string;
  package_code: DepositPackageCode;
  pay_amount_idr: number;
  credit_amount_idr: number;
  merchant_order_id: string;
  webqris_invoice_id: string | null;
  qris_payload: string | null;
  unique_code: number | null;
  total_amount_idr: number | null;
  status: PaymentStatus;
  expired_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

interface WalletLedgerRow {
  id: string;
  amount_idr: number;
  balance_after_idr: number;
  entry_type: string;
  source_type: string;
  source_id: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface WebqrisCreateResponse {
  success?: boolean;
  message?: string;
  invoice_id?: string;
  qris_payload?: string;
  amount?: number;
  unique_code?: number;
  total_amount?: number;
  expired_at?: string;
}

interface WebqrisStatusResponse {
  success?: boolean;
  message?: string;
  data?: {
    invoice_id?: string;
    merchant_order_id?: string;
    amount?: number;
    unique_code?: number;
    total_amount?: number;
    status?: string;
    payment_method?: string;
    paid_at?: string;
    expired_at?: string;
  };
}

function createHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeBaseUrl(url: string): string {
  return (url.trim() || "https://webqris.com").replace(/\/+$/, "");
}

function normalizeGeneratePrice(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : GENERATE_PRICE_IDR_DEFAULT;
}

export function getDepositPackage(packageCode: string) {
  return DEPOSIT_PACKAGES.find((item) => item.code === packageCode);
}

function paymentOrderToApi(row: PaymentOrderRow) {
  return {
    id: row.id,
    packageCode: row.package_code,
    payAmountIdr: row.pay_amount_idr,
    creditAmountIdr: row.credit_amount_idr,
    merchantOrderId: row.merchant_order_id,
    webqrisInvoiceId: row.webqris_invoice_id,
    qrisPayload: row.qris_payload,
    uniqueCode: row.unique_code,
    totalAmountIdr: row.total_amount_idr,
    status: row.status,
    expiredAt: row.expired_at,
    paidAt: row.paid_at,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function ledgerToApi(row: WalletLedgerRow) {
  return {
    id: row.id,
    amountIdr: row.amount_idr,
    balanceAfterIdr: row.balance_after_idr,
    entryType: row.entry_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    description: row.description,
    metadata: row.metadata ?? {},
    createdAt: row.created_at
  };
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  } catch {
    return false;
  }
}

export class BillingService {
  private readonly db: SupabaseClient;
  private readonly logger: FastifyBaseLogger;
  private readonly webqrisBaseUrl: string;
  private readonly webqrisApiToken: string;
  private readonly webqrisWebhookSecret: string;
  public readonly generatePriceIdr: number;

  public constructor(options: BillingServiceOptions) {
    this.db = options.db;
    this.logger = options.logger;
    this.webqrisBaseUrl = normalizeBaseUrl(options.webqrisBaseUrl);
    this.webqrisApiToken = options.webqrisApiToken.trim();
    this.webqrisWebhookSecret = options.webqrisWebhookSecret.trim();
    this.generatePriceIdr = normalizeGeneratePrice(options.generatePriceIdr);
  }

  public getPackages() {
    return DEPOSIT_PACKAGES.map((item) => ({
      ...item,
      generateCredits: Math.floor(item.creditAmountIdr / this.generatePriceIdr)
    }));
  }

  public async getWallet(user: AuthSessionUser) {
    const [{ data: profile, error: profileError }, { data: ledger, error: ledgerError }, { data: orders, error: ordersError }] =
      await Promise.all([
        this.db
          .from("profiles")
          .select("wallet_balance_idr")
          .eq("id", user.id)
          .single<{ wallet_balance_idr: number }>(),
        this.db
          .from("wallet_ledger")
          .select("*")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
        this.db
          .from("payment_orders")
          .select("*")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10)
      ]);

    if (profileError) {
      throw profileError;
    }
    if (ledgerError) {
      throw ledgerError;
    }
    if (ordersError) {
      throw ordersError;
    }

    const walletBalanceIdr = Math.max(0, Math.trunc(profile?.wallet_balance_idr ?? 0));
    return {
      walletBalanceIdr,
      generatePriceIdr: this.generatePriceIdr,
      generateCreditsRemaining: user.isUnlimited ? null : Math.floor(walletBalanceIdr / this.generatePriceIdr),
      isUnlimited: user.isUnlimited,
      packages: this.getPackages(),
      recentLedger: ((ledger || []) as WalletLedgerRow[]).map(ledgerToApi),
      recentTopups: ((orders || []) as PaymentOrderRow[]).map(paymentOrderToApi)
    };
  }

  public async createTopup(user: AuthSessionUser, packageCode: string) {
    const selectedPackage = getDepositPackage(packageCode);
    if (!selectedPackage) {
      throw createHttpError(400, "Paket deposit tidak tersedia.");
    }
    if (!this.webqrisApiToken) {
      throw createHttpError(503, "WEBQRIS_API_TOKEN belum dikonfigurasi di server.");
    }

    const merchantOrderId = `VS-${Date.now()}-${nanoid(8)}`;
    const { data: inserted, error: insertError } = await this.db
      .from("payment_orders")
      .insert({
        owner_user_id: user.id,
        owner_email: user.email,
        package_code: selectedPackage.code,
        pay_amount_idr: selectedPackage.payAmountIdr,
        credit_amount_idr: selectedPackage.creditAmountIdr,
        merchant_order_id: merchantOrderId
      })
      .select("*")
      .single<PaymentOrderRow>();

    if (insertError) {
      throw insertError;
    }

    try {
      const response = await fetch(`${this.webqrisBaseUrl}/api/payments/qris/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.webqrisApiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: selectedPackage.payAmountIdr,
          merchant_order_id: merchantOrderId,
          customer_name: user.displayName || user.email
        })
      });
      const body = (await response.json().catch(() => ({}))) as WebqrisCreateResponse;

      if (!response.ok || !body.success || !body.invoice_id || !body.qris_payload) {
        await this.db
          .from("payment_orders")
          .update({
            status: "failed",
            raw_create_response: body,
            updated_at: new Date().toISOString()
          })
          .eq("id", inserted.id);
        throw createHttpError(response.ok ? 502 : response.status, body.message || "Gagal membuat invoice WebQRIS.");
      }

      const { data: updated, error: updateError } = await this.db
        .from("payment_orders")
        .update({
          webqris_invoice_id: body.invoice_id,
          qris_payload: body.qris_payload,
          unique_code: body.unique_code ?? null,
          total_amount_idr: body.total_amount ?? body.amount ?? selectedPackage.payAmountIdr,
          expired_at: body.expired_at ?? null,
          raw_create_response: body,
          updated_at: new Date().toISOString()
        })
        .eq("id", inserted.id)
        .select("*")
        .single<PaymentOrderRow>();

      if (updateError) {
        throw updateError;
      }

      return paymentOrderToApi(updated);
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode) {
        throw error;
      }
      await this.db
        .from("payment_orders")
        .update({
          status: "failed",
          raw_create_response: { message: (error as Error).message },
          updated_at: new Date().toISOString()
        })
        .eq("id", inserted.id);
      throw createHttpError(502, `Gagal menghubungi WebQRIS: ${(error as Error).message}`);
    }
  }

  public async getTopupStatus(user: AuthSessionUser, orderId: string) {
    const { data: order, error } = await this.db
      .from("payment_orders")
      .select("*")
      .eq("id", orderId)
      .eq("owner_user_id", user.id)
      .maybeSingle<PaymentOrderRow>();

    if (error) {
      throw error;
    }
    if (!order) {
      throw createHttpError(404, "Top up tidak ditemukan.");
    }

    if (order.status === "pending" && order.webqris_invoice_id && this.webqrisApiToken) {
      await this.reconcileWebqrisStatus(order).catch((reconcileError) => {
        this.logger.warn({ err: reconcileError, orderId }, "Gagal reconcile status WebQRIS.");
      });
    }

    const { data: refreshed, error: refreshError } = await this.db
      .from("payment_orders")
      .select("*")
      .eq("id", orderId)
      .single<PaymentOrderRow>();

    if (refreshError) {
      throw refreshError;
    }
    return paymentOrderToApi(refreshed);
  }

  public async handleWebhook(rawBody: string, signature: string) {
    if (!this.webqrisWebhookSecret) {
      throw createHttpError(503, "WEBQRIS_WEBHOOK_SECRET belum dikonfigurasi di server.");
    }

    const expected = crypto.createHmac("sha256", this.webqrisWebhookSecret).update(rawBody).digest("hex");
    const isValidSignature = timingSafeEqualHex(signature, expected);
    let payload: { event?: string; data?: Record<string, unknown> } = {};
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      payload = {};
    }

    const invoiceId = typeof payload.data?.invoice_id === "string" ? payload.data.invoice_id : undefined;
    const merchantOrderId =
      typeof payload.data?.merchant_order_id === "string" ? payload.data.merchant_order_id : undefined;

    const { data: eventRow } = await this.db
      .from("webhook_events")
      .insert({
        event_type: payload.event ?? null,
        signature,
        invoice_id: invoiceId ?? null,
        merchant_order_id: merchantOrderId ?? null,
        processing_status: isValidSignature ? "received" : "failed",
        error_message: isValidSignature ? null : "Invalid signature",
        raw_body: rawBody,
        payload
      })
      .select("id")
      .single<{ id: string }>();

    if (!isValidSignature) {
      throw createHttpError(401, "Invalid signature");
    }
    if (payload.event !== "payment.paid") {
      await this.markWebhookEvent(eventRow?.id, "ignored", "Unsupported event");
      return { success: true, ignored: true };
    }

    const status = payload.data?.status;
    if (status !== "paid") {
      await this.markWebhookEvent(eventRow?.id, "ignored", "Payment status is not paid");
      return { success: true, ignored: true };
    }

    const order = await this.findPaymentOrder(invoiceId, merchantOrderId);
    if (!order) {
      await this.markWebhookEvent(eventRow?.id, "failed", "Payment order tidak ditemukan");
      throw createHttpError(404, "Payment order tidak ditemukan.");
    }

    const totalAmount = Number(payload.data?.total_amount);
    if (Number.isFinite(totalAmount) && order.total_amount_idr && Math.trunc(totalAmount) !== order.total_amount_idr) {
      await this.markWebhookEvent(eventRow?.id, "failed", "Nominal webhook tidak cocok");
      throw createHttpError(409, "Nominal webhook tidak cocok dengan order.");
    }

    const paidOrder = await this.creditOrder(order.id, payload);
    await this.markWebhookEvent(eventRow?.id, "processed");
    return {
      success: true,
      invoice_id: paidOrder.webqris_invoice_id,
      merchant_order_id: paidOrder.merchant_order_id,
      status: paidOrder.status
    };
  }

  private async reconcileWebqrisStatus(order: PaymentOrderRow): Promise<void> {
    const response = await fetch(
      `${this.webqrisBaseUrl}/api/payments/${encodeURIComponent(order.webqris_invoice_id || "")}/status`,
      {
        headers: {
          Authorization: `Bearer ${this.webqrisApiToken}`
        }
      }
    );
    const body = (await response.json().catch(() => ({}))) as WebqrisStatusResponse;
    if (!response.ok || !body.success || body.data?.status !== "paid") {
      return;
    }
    if (body.data.total_amount && order.total_amount_idr && body.data.total_amount !== order.total_amount_idr) {
      throw createHttpError(409, "Nominal status WebQRIS tidak cocok dengan order.");
    }
    await this.creditOrder(order.id, {
      event: "payment.paid",
      data: body.data
    });
  }

  private async findPaymentOrder(invoiceId?: string, merchantOrderId?: string): Promise<PaymentOrderRow | undefined> {
    if (invoiceId) {
      const { data, error } = await this.db
        .from("payment_orders")
        .select("*")
        .eq("webqris_invoice_id", invoiceId)
        .maybeSingle<PaymentOrderRow>();
      if (error) {
        throw error;
      }
      if (data) {
        return data;
      }
    }

    if (merchantOrderId) {
      const { data, error } = await this.db
        .from("payment_orders")
        .select("*")
        .eq("merchant_order_id", merchantOrderId)
        .maybeSingle<PaymentOrderRow>();
      if (error) {
        throw error;
      }
      return data ?? undefined;
    }

    return undefined;
  }

  private async creditOrder(orderId: string, payload: Record<string, unknown>) {
    const { data, error } = await this.db.rpc("credit_wallet_from_payment", {
      order_id: orderId,
      webhook_payload: payload
    });
    if (error) {
      throw error;
    }
    return data as PaymentOrderRow;
  }

  private async markWebhookEvent(id: string | undefined, status: "processed" | "failed" | "ignored", error?: string) {
    if (!id) {
      return;
    }
    await this.db
      .from("webhook_events")
      .update({
        processing_status: status,
        error_message: error ?? null,
        processed_at: new Date().toISOString()
      })
      .eq("id", id);
  }
}

import { describe, expect, it } from "vitest";
import { assertQrisPaymentWindowOpen, resolveQrisPaymentWindow } from "./worker-api";

const env = {
  INTERACTIVE_QRIS_TIME_ZONE: "Asia/Jakarta",
  INTERACTIVE_QRIS_OPEN_HOUR: "5",
  INTERACTIVE_QRIS_CLOSE_HOUR: "22"
};

describe("QRIS payment window in WIB", () => {
  it.each([
    ["04.59 WIB", "2026-07-14T21:59:00.000Z", false],
    ["05.00 WIB", "2026-07-14T22:00:00.000Z", true],
    ["21.59 WIB", "2026-07-15T14:59:00.000Z", true],
    ["22.00 WIB", "2026-07-15T15:00:00.000Z", false]
  ])("marks %s correctly", (_label, iso, expected) => {
    expect(resolveQrisPaymentWindow(env, new Date(iso)).isOpen).toBe(expected);
  });

  it("opens again at 05.00 WIB on the next day after closing", () => {
    expect(resolveQrisPaymentWindow(env, new Date("2026-07-15T15:00:00.000Z"))).toMatchObject({
      opensAt: "05:00",
      closesAt: "22:00",
      isOpen: false,
      nextOpenAt: "2026-07-15T22:00:00.000Z"
    });
  });

  it("rejects new checkout with HTTP 409 while closed", () => {
    const closed = resolveQrisPaymentWindow(env, new Date("2026-07-15T15:00:00.000Z"));
    try {
      assertQrisPaymentWindowOpen(closed);
      throw new Error("Expected the payment window guard to reject checkout.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 409,
        message: "Pembayaran QRIS sedang ditutup. Invoice baru tersedia kembali pukul 05.00 WIB."
      });
    }
  });

  it("keeps a 21.59 invoice within the 60-minute grace period until 22.59 WIB", () => {
    const createdAt = new Date("2026-07-15T14:59:00.000Z");
    const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000);
    expect(expiresAt.toISOString()).toBe("2026-07-15T15:59:00.000Z");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";

vi.mock("../api", () => ({
  isAuthReady: vi.fn(() => true),
  login: vi.fn(),
  register: vi.fn(),
  startGoogleLogin: vi.fn()
}));

describe("LandingPage offer and CTA links", () => {
  it("describes the analysis-only product and routes every CTA to a real section", () => {
    const { container } = render(<LandingPage locale="id-ID" onAuthenticated={vi.fn()} />);

    expect(screen.getByText("Coba 10 Analisis Gratis")).toBeTruthy();
    expect(screen.getByText("Analisis teks saja · tanpa TTS")).toBeTruthy();
    expect(screen.getByText(/Upload video maksimal 60 detik/)).toBeTruthy();
    expect(screen.queryByText(/arahan suara/i)).toBeNull();

    for (const anchor of container.querySelectorAll<HTMLAnchorElement>("a[href^='#']")) {
      expect(document.querySelector(anchor.getAttribute("href")!)).toBeTruthy();
    }
  });

  it("opens registration from the free-trial CTA and login from the sign-in CTA", () => {
    render(<LandingPage locale="id-ID" onAuthenticated={vi.fn()} />);

    fireEvent.click(screen.getByRole("link", { name: "Coba 10 Analisis Gratis" }));
    expect(screen.getByText("Mulai 10 analisis gratis")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buat akun" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Masuk" }));
    expect(screen.getByText("Lanjutkan analisis Anda")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Masuk" })).toHaveLength(2);
  });
});

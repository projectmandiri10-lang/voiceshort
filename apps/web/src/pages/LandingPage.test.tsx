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
  it("describes the script-writing product and routes every CTA to a real section", () => {
    const { container } = render(<LandingPage locale="id-ID" onAuthenticated={vi.fn()} />);

    expect(screen.getByText("Coba 10 Naskah Gratis")).toBeTruthy();
    expect(screen.getByText("Naskah teks saja - tanpa TTS")).toBeTruthy();
    expect(screen.getByText(/Upload video maksimal 60 detik/)).toBeTruthy();
    expect(screen.getAllByText(/The Ad Voiceover/i).length).toBeGreaterThan(0);

    for (const anchor of container.querySelectorAll<HTMLAnchorElement>("a[href^='#']")) {
      expect(document.querySelector(anchor.getAttribute("href")!)).toBeTruthy();
    }
  });

  it("opens registration from the free-trial CTA and login from the sign-in CTA", () => {
    render(<LandingPage locale="id-ID" onAuthenticated={vi.fn()} />);

    fireEvent.click(screen.getByRole("link", { name: "Coba 10 Naskah Gratis" }));
    expect(screen.getByText("Mulai 10 naskah gratis")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buat akun" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Masuk" }));
    expect(screen.getByText("Lanjutkan buat naskah")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Masuk" })).toHaveLength(2);
  });
});

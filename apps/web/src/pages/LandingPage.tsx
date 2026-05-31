import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Download,
  EyeOff,
  FileVideo,
  Lock,
  PenLine,
  ShieldCheck,
  Upload,
  WandSparkles
} from "lucide-react";
import { isAuthReady, login, register, startGoogleLogin } from "../api";
import type { AuthUser } from "../types";

interface LandingPageProps {
  authError?: string;
  onAuthenticated: (user: AuthUser) => void;
}

type AuthMode = "login" | "register";

const FEATURE_STEPS = [
  {
    title: "1. Unggah Video",
    description:
      "Upload file MP4/MOV, sistem membaca durasi dan menghitung estimasi biaya otomatis.",
    icon: Upload
  },
  {
    title: "2. Tulis Arahan",
    description:
      "Isi brief singkat. Tone, gaya narasi, dan CTA disusun ke script serta audio TTS.",
    icon: PenLine
  },
  {
    title: "3. Unduh Hasil",
    description:
      "Final MP4 disiapkan otomatis, lengkap dengan caption dan voice over siap posting.",
    icon: Download
  }
] as const;

const TAGS = ["TikTok", "Instagram Reels", "YouTube Shorts", "Facebook Reels"] as const;

const PACKAGES: Array<{
  name: string;
  price: string;
  quota: string;
  note: string;
  badge: string;
}> = [
  {
    name: "QRIS",
    price: "Rp2.000",
    quota: "Pengisi suara AI realistis",
    note: "Bayar sekali untuk satu generate dengan pembayaran QRIS yang cepat dan otomatis.",
    badge: "Single Card"
  }
] as const;

function authErrorMessage(authError?: string): string {
  if (authError === "google-login-failed") {
    return "Masuk dengan Google belum berhasil. Coba lagi sebentar.";
  }
  if (authError === "google-callback-invalid") {
    return "Proses masuk Google tidak lengkap. Silakan ulangi dari tombol Google.";
  }
  return "";
}

function BrandGlyph() {
  return (
    <div className="landing-brand-lockup" aria-hidden="true">
      <div className="landing-brand-mark">V</div>
      <span className="landing-brand-name">Voiceshort</span>
    </div>
  );
}

export function LandingPage({ authError, onAuthenticated }: LandingPageProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const oauthError = useMemo(() => authErrorMessage(authError), [authError]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailLoading(true);
    setMessage("");
    setError("");

    try {
      const result =
        mode === "login"
          ? await login({ email: email.trim(), password })
          : await register({
              displayName: displayName.trim(),
              email: email.trim(),
              password
            });

      setMessage(result.message);
      if (result.user) {
        onAuthenticated(result.user);
      }
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setEmailLoading(false);
    }
  };

  const onGoogleLogin = async () => {
    setOauthLoading(true);
    setMessage("");
    setError("");

    try {
      if (!isAuthReady()) {
        throw new Error(
          "Masuk Google belum tersedia saat ini. Silakan coba masuk dengan email atau hubungi admin."
        );
      }

      setMessage("Mengarahkan Anda ke Google...");
      await startGoogleLogin("/?view=generate");
    } catch (oauthErrorValue) {
      setMessage("");
      setError((oauthErrorValue as Error).message);
      setOauthLoading(false);
    }
  };

  const showRegisterFields = mode === "register";

  return (
    <main className="landing-shell" id="top">
      <div className="landing-orb landing-orb-cyan" aria-hidden="true" />
      <div className="landing-orb landing-orb-magenta" aria-hidden="true" />

      <nav className="landing-nav">
        <a className="landing-nav-brand" href="#top" aria-label="Voiceshort">
          <BrandGlyph />
        </a>

        <div className="landing-nav-actions">
          <a className="landing-nav-link" href="#fitur">
            Cara Kerja
          </a>
          <a className="landing-nav-link" href="#pricing">
            Paket Saldo
          </a>
          <a className="landing-nav-cta" href="#masuk">
            Masuk <span aria-hidden="true">→</span>
          </a>
        </div>
      </nav>

      <section className="hero-grid">
        <div className="landing-copy">
          <div className="badge">
            <span className="badge-dot" />
            AI Voice Over Generator
          </div>

          <h1>
            Bikin pengisi suara video short
            <br />
            <span>dengan cepat</span> dan rapi.
          </h1>

          <p className="landing-copy-lead">
            Unggah video, tulis arahan singkat. Voiceshort menyiapkan narasi berbahasa Indonesia
            yang siap diposting ke TikTok, Reels, dan Shorts.
          </p>

          <div className="hero-stat-grid">
            <article className="stat-item">
              <div className="stat-icon stat-icon-cyan">
                <WandSparkles size={16} />
              </div>
              <div>
                <div className="stat-title">&lt; 2 Menit</div>
                <div className="stat-subtitle">Proses rata-rata</div>
              </div>
            </article>

            <article className="stat-item">
              <div className="stat-icon stat-icon-magenta">
                <FileVideo size={16} />
              </div>
              <div>
                <div className="stat-title">Rp2.000</div>
                <div className="stat-subtitle">Pembayaran via QRIS</div>
              </div>
            </article>

            <article className="stat-item">
              <div className="stat-icon stat-icon-green">
                <ShieldCheck size={16} />
              </div>
              <div>
                <div className="stat-title">Client-first</div>
                <div className="stat-subtitle">Diproses lokal</div>
              </div>
            </article>
          </div>

          <div className="tag-row" aria-label="Supported platforms">
            {TAGS.map((tag) => (
              <span className="tag-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>

          <div className="hero-actions">
            <a className="primary-button" href="#pricing">
              <span>Lihat Paket Saldo</span>
              <ArrowRight size={16} />
            </a>
            <a className="ghost-button" href="#fitur">
              Cara kerja
            </a>
          </div>
        </div>

        <aside className="auth-card landing-auth-card" id="masuk">
          <div className="auth-head">
            <h2>Masuk Sekarang</h2>
            <p>Akses workspace Anda untuk mulai generate voice over.</p>
          </div>

          <button
            className="google-btn"
            type="button"
            disabled={emailLoading || oauthLoading}
            onClick={() => void onGoogleLogin()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              width="20"
              height="20"
              aria-hidden="true"
            >
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              <path fill="none" d="M0 0h48v48H0z" />
            </svg>
            <span>{oauthLoading ? "Mengarahkan ke Google..." : "Masuk dengan Google"}</span>
          </button>

          <p className="auth-helper">Cara tercepat - tanpa perlu ingat password.</p>

          <div className="auth-divider">
            <span>atau email</span>
          </div>

          <div className="tab-pill" role="tablist" aria-label="Authentication mode">
            <button
              className={mode === "login" ? "active" : ""}
              type="button"
              onClick={() => setMode("login")}
            >
              Masuk
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              type="button"
              onClick={() => setMode("register")}
            >
              Daftar Akun
            </button>
          </div>

          <form className="grid-form auth-form" onSubmit={onSubmit}>
            {showRegisterFields ? (
              <label>
                <span>Nama</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={emailLoading || oauthLoading}
                  placeholder="Nama Anda"
                />
              </label>
            ) : null}

            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={emailLoading || oauthLoading}
                placeholder="nama@email.com"
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={emailLoading || oauthLoading}
                placeholder="Minimal 8 karakter"
              />
            </label>

            <button type="submit" className="primary-btn" disabled={emailLoading || oauthLoading}>
              {emailLoading ? "Memproses..." : mode === "login" ? "Masuk" : "Buat Akun"}
            </button>
          </form>

          {oauthError ? <p className="auth-feedback auth-feedback-error">{oauthError}</p> : null}
          {message ? <p className="auth-feedback auth-feedback-success">{message}</p> : null}
          {error ? <p className="auth-feedback auth-feedback-error">{error}</p> : null}

          <div className="auth-security">
            <span>
              <Lock size={13} />
              SSL
            </span>
            <span>
              <ShieldCheck size={13} />
              Data aman
            </span>
            <span>
              <EyeOff size={13} />
              No spam
            </span>
          </div>
        </aside>
      </section>

      <section id="fitur" className="landing-section">
        <div className="section-heading landing-section-heading">
          <div className="badge">
            <span className="badge-dot" />
            Cara Kerja
          </div>
          <h2>Tiga langkah, sudah jadi.</h2>
          <p className="section-note">
            Tidak perlu software tambahan. Semua berjalan otomatis di perangkat Anda.
          </p>
        </div>

        <div className="feature-grid">
          {FEATURE_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <article className="feature-step" key={step.title}>
                <div className="feature-step-icon">
                  <Icon size={20} />
                </div>
                <div>
                  <h3>{step.title}</h3>
                  <p className="section-note">{step.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="pricing" className="landing-section">
        <div className="section-heading landing-section-heading centered">
          <div className="badge">
            <span className="badge-dot" />
            Pembayaran QRIS
          </div>
          <h2>Bayar Rp2.000 untuk pengisi suara AI realistis</h2>
          <p className="section-note">
            Transaksi cepat, aman, dan saldo masuk otomatis setelah pembayaran berhasil.
          </p>
        </div>

        <div className="pricing-grid">
          {PACKAGES.map((item) => (
            <article className="pricing-card featured pricing-card-single" key={item.name}>
              <div className="pricing-card-head">
                <span className="pricing-badge">{item.badge}</span>
                <span className="pricing-popular">QRIS</span>
              </div>
              <h3>{item.name}</h3>
              <div className="pricing-price">{item.price}</div>
              <strong>{item.quota}</strong>
              <div className="pricing-divider" />
              <p className="section-note">{item.note}</p>
              <button className="primary-btn pricing-action" type="button">
                Bayar via QRIS
              </button>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-grid">
          <article className="footer-card">
            <div className="footer-card-head">
              <ShieldCheck size={17} />
              <span>Privasi</span>
            </div>
            <p className="section-note">
              Kami menyimpan data akun dan metadata session. Video asli tetap di perangkat Anda.
              Data tidak dijual ke pihak lain.
            </p>
          </article>

          <article className="footer-card">
            <div className="footer-card-head">
              <ShieldCheck size={17} />
              <span>Aturan Penggunaan</span>
            </div>
            <p className="section-note">
              Pastikan video yang Anda unggah memang boleh digunakan. Hindari spam,
              penyalahgunaan, dan konten yang melanggar aturan platform.
            </p>
          </article>
        </div>

        <div className="landing-footer-bottom">
          <div className="landing-brand-lockup">
            <div className="landing-brand-mark landing-brand-mark-small">V</div>
            <span className="landing-brand-name">Voiceshort AI</span>
          </div>
          <p>© 2024 Voiceshort AI. All rights reserved.</p>
          <div className="footer-links">
            <a href="#">Bantuan</a>
            <a href="#">Kontak</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

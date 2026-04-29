import { useMemo, useState, type FormEvent } from "react";
import { isAuthReady, login, register, startGoogleLogin } from "../api";
import type { AuthUser } from "../types";

interface LandingPageProps {
  authError?: string;
  onAuthenticated: (user: AuthUser) => void;
}

type AuthMode = "login" | "register";

const FEATURES = [
  {
    title: "Narasi Siap Pakai",
    description: "Ubah video mentah menjadi voice over berbahasa Indonesia yang lebih rapi dan siap diposting."
  },
  {
    title: "Cepat dan Praktis",
    description: "Cukup unggah video, isi arahan singkat, lalu sistem memprosesnya tanpa langkah yang ribet."
  },
  {
    title: "Pantau Hasilnya",
    description: "Lihat perkembangan proses dan unduh hasil begitu voice over selesai dibuat."
  }
];

const PACKAGES = [
  {
    name: "Mulai",
    price: "Rp20.000",
    quota: "10 video",
    note: "Pas untuk mencoba alur kerja dan mulai produksi konten secara ringan.",
    badge: "Paling hemat untuk mulai"
  },
  {
    name: "Harian",
    price: "Rp90.000",
    quota: "50 video",
    note: "Cocok untuk produksi rutin dengan bonus saldo dibanding beli satuan.",
    badge: "Lebih irit"
  },
  {
    name: "Produksi",
    price: "Rp170.000",
    quota: "100 video",
    note: "Pilihan terbaik untuk volume tinggi dan kebutuhan tim kecil.",
    badge: "Bonus paling besar"
  }
];

const SOCIALS = ["TikTok", "Instagram Reels", "YouTube Shorts", "Facebook Reels"];

function authErrorMessage(authError?: string): string {
  if (authError === "google-login-failed") {
    return "Masuk dengan Google belum berhasil. Coba lagi sebentar.";
  }
  if (authError === "google-callback-invalid") {
    return "Proses masuk Google tidak lengkap. Silakan ulangi dari tombol Google.";
  }
  return "";
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

  const onSubmit = async (event: FormEvent) => {
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
    } catch (oauthError) {
      setMessage("");
      setError((oauthError as Error).message);
      setOauthLoading(false);
    }
  };

  return (
    <main className="landing-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Voiceshort</span>
          <h1>Bikin voice over video pendek lebih cepat dan lebih rapi.</h1>
          <p>
            Unggah video, tulis arahan singkat, lalu Voiceshort membantu menyiapkan narasi untuk
            konten Anda. Cocok untuk creator, jualan online, dan video promosi harian.
          </p>
          <div className="hero-actions">
            <a className="primary-cta" href="#pricing">
              Lihat Paket Saldo
            </a>
            <a className="secondary-cta" href="#legal">
              Lihat Kebijakan
            </a>
          </div>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="auth-panel">
          <div className="auth-head">
            <span className="eyebrow">Masuk Sekarang</span>
            <h2>Mulai dengan cara yang paling mudah</h2>
            <p>Gunakan Google untuk masuk cepat, atau pakai email kalau Anda lebih nyaman.</p>
          </div>

          <div className="auth-google-stack">
            <button
              type="button"
              className="google-button"
              disabled={emailLoading || oauthLoading}
              onClick={() => void onGoogleLogin()}
            >
              <span className="google-mark" aria-hidden="true">
                G
              </span>
              <span>{oauthLoading ? "Mengarahkan ke Google..." : "Masuk dengan Google"}</span>
            </button>
            <p className="small">Cocok kalau Anda ingin langsung masuk tanpa isi password.</p>
          </div>

          <div className="auth-divider" aria-hidden="true">
            <span>atau lanjut dengan email</span>
          </div>

          <div className="auth-switcher">
            <button
              type="button"
              className={mode === "login" ? "tab active" : "tab"}
              onClick={() => setMode("login")}
            >
              Masuk
            </button>
            <button
              type="button"
              className={mode === "register" ? "tab active" : "tab"}
              onClick={() => setMode("register")}
            >
              Daftar
            </button>
          </div>

          <form className="grid-form" onSubmit={onSubmit}>
            {mode === "register" ? (
              <label>
                Nama
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={emailLoading || oauthLoading}
                  placeholder="Nama Anda"
                />
              </label>
            ) : null}
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={emailLoading || oauthLoading}
                placeholder="nama@email.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={emailLoading || oauthLoading}
                placeholder="Minimal 8 karakter"
              />
            </label>
            <button type="submit" className="primary-button" disabled={emailLoading || oauthLoading}>
              {emailLoading ? "Memproses..." : mode === "login" ? "Masuk" : "Buat Akun"}
            </button>
          </form>

          {oauthError ? <p className="err-text">{oauthError}</p> : null}
          {message ? <p className="ok-text">{message}</p> : null}
          {error ? <p className="err-text">{error}</p> : null}
        </aside>
      </section>

      <section className="social-strip">
        {SOCIALS.map((social) => (
          <div className="social-chip" key={social}>
            <span className="social-icon">{social.slice(0, 1)}</span>
            <span>{social}</span>
          </div>
        ))}
      </section>

      <section className="pricing-section" id="pricing">
        <div className="section-heading">
          <span className="eyebrow">Paket Saldo</span>
          <h2>Pilih saldo sesuai jumlah video yang ingin Anda proses.</h2>
          <p>Setiap 1 voice over memotong saldo Rp2.000. Semakin besar paketnya, semakin hemat.</p>
        </div>
        <div className="pricing-grid">
          {PACKAGES.map((item) => (
            <article className="pricing-card" key={item.name}>
              <span className="pricing-badge">{item.badge}</span>
              <h3>{item.name}</h3>
              <div className="pricing-price">{item.price}</div>
              <strong>{item.quota}</strong>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="legal-section" id="legal">
        <div className="section-heading">
          <span className="eyebrow">Privasi dan Aturan</span>
          <h2>Penjelasan singkat soal data dan penggunaan layanan.</h2>
        </div>
        <div className="legal-grid">
          <article className="legal-card">
            <h3>Privasi</h3>
            <p>
              Kami menyimpan data akun, riwayat proses, dan file hasil untuk membantu layanan
              berjalan dengan baik. Data Anda tidak dijual ke pihak lain.
            </p>
          </article>
          <article className="legal-card">
            <h3>Aturan Penggunaan</h3>
            <p>
              Pastikan video yang Anda unggah memang boleh digunakan. Hindari spam, penyalahgunaan,
              dan konten yang melanggar aturan platform.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

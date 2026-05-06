import { useMemo, useState, type FormEvent } from "react";
import { Activity, ArrowRight, Bolt, CircleHelp, PlaySquare, ShieldCheck, Video } from "lucide-react";
import { isAuthReady, login, register, startGoogleLogin } from "../api";
import { BrandMark } from "../components/BrandMark";
import type { AuthUser } from "../types";

interface LandingPageProps {
  authError?: string;
  onAuthenticated: (user: AuthUser) => void;
}

type AuthMode = "login" | "register";

const FEATURES = [
  {
    title: "Narasi Siap Pakai",
    description: "Ubah video mentah menjadi voice over berbahasa Indonesia yang lebih rapi dan siap diposting.",
    icon: Bolt,
  },
  {
    title: "Cepat dan Praktis",
    description: "Cukup unggah video, isi arahan singkat, lalu sistem memprosesnya tanpa langkah yang ribet.",
    icon: Activity,
  },
  {
    title: "Pantau Hasilnya",
    description: "Lihat perkembangan proses dan unduh hasil begitu voice over selesai dibuat.",
    icon: Video,
  },
];

const PACKAGES = [
  {
    name: "Mulai",
    price: "Rp20.000",
    quota: "10 video",
    note: "Pas untuk mencoba alur kerja dan mulai produksi konten secara ringan.",
    badge: "Starter",
  },
  {
    name: "Harian",
    price: "Rp90.000",
    quota: "50 video",
    note: "Cocok untuk produksi rutin dengan bonus saldo dibanding beli satuan.",
    badge: "Lebih irit",
    popular: true,
  },
  {
    name: "Produksi",
    price: "Rp170.000",
    quota: "100 video",
    note: "Pilihan terbaik untuk volume tinggi dan kebutuhan tim kecil.",
    badge: "Tim kecil",
  },
];

const SOCIALS = [
  "TikTok",
  "Instagram Reels",
  "YouTube Shorts",
  "Facebook Reels",
  "Shopee Video",
  "Marketplace Ads",
];

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
  const primaryFeature = FEATURES[0];

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
              password,
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

  return (
    <main className="landing-shell">
      <div className="landing-orb landing-orb-cyan" aria-hidden="true" />
      <div className="landing-orb landing-orb-magenta" aria-hidden="true" />

      <nav className="landing-nav">
        <BrandMark />
        <div className="landing-nav-actions">
          <a className="ghost-button" href="#pricing">
            Lihat Paket Saldo
          </a>
          <a className="secondary-button" href="#legal">
            Lihat Kebijakan
          </a>
        </div>
      </nav>

      <section className="hero-grid">
        <div className="landing-copy">
          <span className="eyebrow">AI-Powered Production</span>
          <h1>Bikin voice over video pendek lebih cepat dan lebih rapi.</h1>
          <p className="landing-copy-lead">
            Unggah video, tulis arahan singkat, lalu Voiceshort membantu menyiapkan narasi untuk
            konten Anda. Cocok untuk creator, jualan online, dan video promosi harian.
          </p>

          <div className="hero-actions">
            <a className="primary-button" href="#pricing">
              <span>Lihat Paket Saldo</span>
              <ArrowRight size={16} />
            </a>
            <a className="ghost-button" href="#legal">
              <ShieldCheck size={16} />
              <span>Privasi dan Aturan</span>
            </a>
          </div>

          <div className="hero-stat-grid">
            <article className="hero-stat-card surface-card">
              <strong>Rp2.000</strong>
              <span className="small">Biaya per voice over video</span>
            </article>
            <article className="hero-stat-card surface-card">
              <strong>1 sampai 10</strong>
              <span className="small">Slot batch dalam satu sesi</span>
            </article>
            <article className="hero-stat-card surface-card">
              <strong>Login cepat</strong>
              <span className="small">Google atau email sesuai kebutuhan</span>
            </article>
          </div>
        </div>

        <aside className="landing-auth-card">
          <div className="auth-head">
            <span className="eyebrow">Masuk Sekarang</span>
            <h2>Mulai dari workspace yang paling mudah dipakai.</h2>
            <p className="section-note">
              Gunakan Google untuk masuk cepat, atau pakai email kalau Anda lebih nyaman.
            </p>
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

      <section className="marquee-band" aria-label="Platform supported">
        <div className="marquee-track">
          {[...SOCIALS, ...SOCIALS].map((social, index) => (
            <div className="social-chip" key={`${social}-${index}`}>
              <span className="social-chip-mark">{social.slice(0, 1)}</span>
              <span>{social}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <span className="eyebrow">Capabilities</span>
          <h2>Teknologi yang terasa rapi, bukan ribet.</h2>
          <p className="section-note">
            Visual baru mengikuti canvas, sementara perilaku produk tetap berakar pada workflow
            Voiceshort yang sudah berjalan sekarang.
          </p>
        </div>

        <div className="feature-grid">
          <article className="feature-card feature-card-primary">
            <div className="feature-icon">
              <PlaySquare size={22} />
            </div>
            <h3>{primaryFeature?.title}</h3>
            <p className="section-note">{primaryFeature?.description}</p>
            <div className="feature-media" aria-hidden="true">
              <div className="feature-media-status">
                <CircleHelp size={15} />
                <div className="feature-progress">
                  <span />
                </div>
                <span className="small">Processing...</span>
              </div>
            </div>
          </article>

          {FEATURES.slice(1).map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="feature-card" key={feature.title}>
                <div className="feature-icon">
                  <Icon size={22} />
                </div>
                <h3>{feature.title}</h3>
                <p className="section-note">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-section" id="pricing">
        <div className="section-heading">
          <span className="eyebrow">Paket Saldo</span>
          <h2>Pilih saldo sesuai jumlah video yang ingin Anda proses.</h2>
          <p className="section-note">
            Setiap 1 voice over memotong saldo Rp2.000. Semakin besar paketnya, semakin hemat.
          </p>
        </div>

        <div className="pricing-grid">
          {PACKAGES.map((item) => (
            <article className={item.popular ? "pricing-card popular" : "pricing-card"} key={item.name}>
              <span className="pricing-badge">{item.badge}</span>
              <h3>{item.name}</h3>
              <div className="pricing-card-price">{item.price}</div>
              <strong>{item.quota}</strong>
              <p className="section-note">{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="legal">
        <div className="section-heading">
          <span className="eyebrow">Privasi dan Aturan</span>
          <h2>Penjelasan singkat soal data dan penggunaan layanan.</h2>
        </div>

        <div className="legal-grid">
          <article className="legal-card">
            <h3>Privasi</h3>
            <p className="section-note">
              Kami menyimpan data akun, riwayat proses, dan file hasil untuk membantu layanan
              berjalan dengan baik. Data Anda tidak dijual ke pihak lain.
            </p>
          </article>
          <article className="legal-card">
            <h3>Aturan Penggunaan</h3>
            <p className="section-note">
              Pastikan video yang Anda unggah memang boleh digunakan. Hindari spam, penyalahgunaan,
              dan konten yang melanggar aturan platform.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

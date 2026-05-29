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
    description: "Video tetap di browser Anda, Worker menyusun script dan audio, lalu final MP4 dirender lokal.",
    icon: Activity,
  },
  {
    title: "Pantau Hasilnya",
    description: "Lihat riwayat session AI dan lanjutkan render dari browser yang sama kapan saja.",
    icon: Video,
  },
];

const PACKAGES = [
  {
    name: "Mulai",
    price: "Rp20.000",
    quota: "10 generate",
    note: "Pas untuk mencoba alur kerja dan mulai produksi konten secara ringan.",
    badge: "Starter",
  },
  {
    name: "Harian",
    price: "Rp90.000",
    quota: "50 generate",
    note: "Cocok untuk produksi rutin dengan bonus saldo dibanding beli satuan.",
    badge: "Lebih irit",
    popular: true,
  },
  {
    name: "Produksi",
    price: "Rp170.000",
    quota: "100 generate",
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
          <h1>Bikin voice over video sampai 60 detik lebih cepat dan lebih rapi.</h1>
          <p className="landing-copy-lead">
            Unggah video, tulis arahan singkat, lalu VoiceOver Shorts 60 membantu menyiapkan
            narasi untuk konten Anda. Cocok untuk creator, jualan online, dan video promosi harian
            dengan billing transparan per generate.
          </p>

          <div className="hero-price-banner surface-card">
            <span className="eyebrow">Harga Transparan</span>
            <strong>Rp.2000/generate</strong>
            <p className="small">
              Satu generate mencakup analisis frame, script, caption, audio TTS, dan render lokal
              final.mp4 untuk satu video pendek sampai 60 detik.
            </p>
          </div>

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
              <strong>60 detik</strong>
              <span className="small">Batas durasi default tiap upload</span>
            </article>
            <article className="hero-stat-card surface-card">
              <strong>Client-only</strong>
              <span className="small">Final MP4 dirender langsung di browser</span>
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
            Frame diekstrak via canvas, Worker Cloudflare mengolah AI, dan artifact final tetap
            bersifat client-first.
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
          <h2>Pilih saldo sesuai total generate yang ingin Anda proses.</h2>
          <p className="section-note">
            Setiap generate voice over memotong saldo Rp2.000. Satu generate mencakup satu video
            pendek sampai 60 detik. Semakin besar paketnya, semakin hemat.
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
              Kami menyimpan data akun dan metadata session. Video asli dan final MP4 tetap
              client-first di browser Anda kecuali Anda sendiri yang mengekspornya.
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

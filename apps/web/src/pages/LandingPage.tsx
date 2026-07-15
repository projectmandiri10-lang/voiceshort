import { useState, type FormEvent } from "react";
import { ArrowRight, FileText, Hash, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { isAuthReady, login, register, startGoogleLogin } from "../api";
import type { AuthUser, ContentLanguage } from "../types";

interface LandingPageProps {
  locale: ContentLanguage;
  authError?: string;
  onAuthenticated: (user: AuthUser) => void;
}

type AuthMode = "login" | "register";

export function LandingPage({ locale, authError, onAuthenticated }: LandingPageProps) {
  const id = locale !== "en-US";
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(
    authError ? (id ? "Login Google tidak berhasil. Silakan coba lagi." : "Google sign-in failed. Please try again.") : ""
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true); setError(""); setMessage("");
    try {
      const result = mode === "login"
        ? await login({ email: email.trim(), password })
        : await register({ displayName: displayName.trim(), email: email.trim(), password });
      setMessage(result.message);
      if (result.user) onAuthenticated(result.user);
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally { setLoading(false); }
  };

  const onGoogleLogin = async () => {
    setLoading(true); setError("");
    try {
      if (!isAuthReady()) throw new Error(id ? "Autentikasi belum dikonfigurasi." : "Authentication is not configured.");
      await startGoogleLogin("/?view=generate");
    } catch (loginError) {
      setError((loginError as Error).message); setLoading(false);
    }
  };

  return (
    <main className="landing-shell personal-landing">
      <div className="landing-orb landing-orb-cyan" aria-hidden="true" />
      <div className="landing-orb landing-orb-magenta" aria-hidden="true" />
      <nav className="landing-nav">
        <div className="landing-brand-lockup"><div className="landing-brand-mark">V</div><span className="landing-brand-name">VoiceShort</span></div>
        <div className="landing-nav-actions">
          <a className="landing-nav-link" href="#masuk" onClick={() => setMode("login")}>{id ? "Masuk" : "Sign in"}</a>
          <a className="landing-nav-cta" href="#masuk" onClick={() => setMode("register")}>{id ? "Coba Gratis" : "Try free"}</a>
        </div>
      </nav>

      <section className="hero-grid personal-landing-grid">
        <div className="landing-copy">
          <div className="badge"><span className="badge-dot" />{id ? "ANALISIS VIDEO PENDEK · 10 GRATIS" : "SHORT VIDEO ANALYSIS · 10 FREE"}</div>
          <h1>{id ? "Ubah video pendek." : "Turn short videos."}<br /><span>{id ? "Jadi paket konten siap pakai." : "Into ready-to-use content."}</span></h1>
          <p className="landing-copy-lead">
            {id
              ? "Upload video maksimal 60 detik dan dapatkan analisis visual, hook, Scene, Sample Context, naskah, caption, hashtag, serta CTA. Setiap akun mendapat 10 analisis gratis, lalu dapat melanjutkan dengan langganan."
              : "Upload a video up to 60 seconds and get visual analysis, hooks, Scene, Sample Context, scripts, captions, hashtags, and CTAs. Every account gets 10 free analyses, with subscription access afterward."}
          </p>
          <div className="hero-actions landing-hero-actions">
            <a className="primary-btn" href="#masuk" onClick={() => setMode("register")}><Sparkles size={17} />{id ? "Coba 10 Analisis Gratis" : "Try 10 Free Analyses"}</a>
            <a className="ghost-button" href="#cara-kerja">{id ? "Lihat Alur Analisis" : "See How It Works"}<ArrowRight size={17} /></a>
          </div>
          <div className="feature-grid personal-feature-grid" id="cara-kerja">
            <article className="feature-step"><Sparkles size={20} /><div><h3>1. {id ? "Upload & Analisis" : "Upload & Analyze"}</h3><p>{id ? "Pilih video MP4 atau MOV maksimal 60 detik." : "Choose an MP4 or MOV video up to 60 seconds."}</p></div></article>
            <article className="feature-step"><FileText size={20} /><div><h3>2. {id ? "Paket Konten" : "Content Package"}</h3><p>{id ? "Dapatkan naskah, Scene, Sample Context, dan analisis visual." : "Get scripts, Scene, Sample Context, and visual analysis."}</p></div></article>
            <article className="feature-step"><Hash size={20} /><div><h3>3. {id ? "Salin & Publikasikan" : "Copy & Publish"}</h3><p>{id ? "Salin caption, hashtag, CTA, atau buka Google AI Studio." : "Copy captions, hashtags, CTAs, or open Google AI Studio."}</p></div></article>
          </div>
          <p className="auth-security">
            <span><ShieldCheck size={14} />{id ? "Video sumber tidak disimpan" : "Source videos are not stored"}</span>
            <span>{id ? "Analisis teks saja · tanpa TTS" : "Text analysis only · no TTS"}</span>
          </p>
        </div>

        <aside className="auth-card landing-auth-card" id="masuk">
          <div className="auth-head">
            <h2>{mode === "register" ? (id ? "Mulai 10 analisis gratis" : "Start 10 free analyses") : (id ? "Lanjutkan analisis Anda" : "Continue your analyses")}</h2>
            <p>{mode === "register" ? (id ? "Buat akun dan langsung analisis video pertama." : "Create an account and analyze your first video.") : (id ? "Masuk untuk membuka Generate dan Riwayat." : "Sign in to access Generate and History.")}</p>
          </div>
          <button className="google-btn" type="button" disabled={loading} onClick={() => void onGoogleLogin()}><LogIn size={19} />Google</button>
          <div className="auth-divider"><span>{id ? "atau email" : "or email"}</span></div>
          <div className="tab-pill" role="tablist">
            <button className={mode === "login" ? "active" : ""} type="button" onClick={() => setMode("login")}>{id ? "Masuk" : "Login"}</button>
            <button className={mode === "register" ? "active" : ""} type="button" onClick={() => setMode("register")}>{id ? "Daftar" : "Register"}</button>
          </div>
          <form className="grid-form auth-form" onSubmit={onSubmit}>
            {mode === "register" ? <label><span>{id ? "Nama" : "Name"}</span><input value={displayName} required onChange={(e) => setDisplayName(e.target.value)} /></label> : null}
            <label><span>Email</span><input type="email" value={email} required onChange={(e) => setEmail(e.target.value)} /></label>
            <label><span>Password</span><input type="password" value={password} required minLength={6} onChange={(e) => setPassword(e.target.value)} /></label>
            <button className="primary-btn" type="submit" disabled={loading}>{loading ? (id ? "Memproses..." : "Processing...") : mode === "login" ? (id ? "Masuk" : "Login") : (id ? "Buat akun" : "Create account")}</button>
          </form>
          {message ? <p className="auth-feedback auth-feedback-success">{message}</p> : null}
          {error ? <p className="auth-feedback auth-feedback-error">{error}</p> : null}
        </aside>
      </section>
    </main>
  );
}

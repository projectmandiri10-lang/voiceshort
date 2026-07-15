import { useState, type FormEvent } from "react";
import { FileText, Hash, LogIn, ShieldCheck, Sparkles } from "lucide-react";
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
        <div className="landing-brand-lockup"><div className="landing-brand-mark">V</div><span className="landing-brand-name">VoiceShort Personal</span></div>
        <a className="landing-nav-cta" href="#masuk">{id ? "Masuk" : "Sign in"}</a>
      </nav>

      <section className="hero-grid personal-landing-grid">
        <div className="landing-copy">
          <div className="badge"><span className="badge-dot" />{id ? "WORKFLOW VIDEO PRIBADI" : "PERSONAL VIDEO WORKFLOW"}</div>
          <h1>{id ? "Analisa video." : "Analyze video."}<br /><span>{id ? "Siapkan konten lebih cepat." : "Prepare content faster."}</span></h1>
          <p className="landing-copy-lead">
            {id
              ? "Dapatkan analisis visual, Scene, Sample Context, naskah, caption, dan hashtag dalam satu alur. Pengguna baru dapat mencoba analisis secara gratis."
              : "Get visual analysis, Scene, Sample Context, script, caption, and hashtags in one flow. New users can try the analysis for free."}
          </p>
          <div className="feature-grid personal-feature-grid">
            <article className="feature-step"><Sparkles size={20} /><div><h3>1. {id ? "Analisa" : "Analyze"}</h3><p>{id ? "Dua tahap AI menghasilkan paket naskah." : "Two AI stages create the script package."}</p></div></article>
            <article className="feature-step"><FileText size={20} /><div><h3>2. {id ? "Naskah" : "Script"}</h3><p>{id ? "Salin naskah dan arahan suara yang siap digunakan." : "Copy the ready-to-use script and voice direction."}</p></div></article>
            <article className="feature-step"><Hash size={20} /><div><h3>3. {id ? "Publikasi" : "Publish"}</h3><p>{id ? "Gunakan caption, hashtag, dan CTA yang sudah disiapkan." : "Use the prepared caption, hashtags, and CTA."}</p></div></article>
          </div>
          <p className="auth-security"><span><ShieldCheck size={14} />{id ? "Video sumber tidak disimpan oleh aplikasi" : "Source videos are not stored by the app"}</span></p>
        </div>

        <aside className="auth-card landing-auth-card" id="masuk">
          <div className="auth-head"><h2>{id ? "Masuk ke workspace" : "Sign in to workspace"}</h2><p>{id ? "Akses Generate dan Riwayat." : "Access Generate and History."}</p></div>
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

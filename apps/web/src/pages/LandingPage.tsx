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
import type { AuthUser, ContentLanguage } from "../types";
import { getUserCopy } from "../user-copy";

interface LandingPageProps {
  locale: ContentLanguage;
  authError?: string;
  onAuthenticated: (user: AuthUser) => void;
}

type AuthMode = "login" | "register";

const TAGS = ["TikTok", "Instagram Reels", "YouTube Shorts", "Facebook Reels"] as const;

function authErrorMessage(copy: ReturnType<typeof getUserCopy>, authError?: string): string {
  if (authError === "google-login-failed") {
    return copy.landing.authErrorGoogleFailed;
  }
  if (authError === "google-callback-invalid") {
    return copy.landing.authErrorGoogleInvalid;
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

export function LandingPage({ locale, authError, onAuthenticated }: LandingPageProps) {
  const copy = getUserCopy(locale);
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const oauthError = useMemo(() => authErrorMessage(copy, authError), [authError, copy]);

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
        throw new Error(copy.landing.googleUnavailable);
      }

      setMessage(copy.landing.redirectingGoogle);
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
            {copy.landing.navHowItWorks}
          </a>
          <a className="landing-nav-link" href="#pricing">
            {copy.landing.navPricing}
          </a>
          <a className="landing-nav-cta" href="#masuk">
            {copy.landing.navLogin} <span aria-hidden="true">→</span>
          </a>
        </div>
      </nav>

      <section className="hero-grid">
        <div className="landing-copy">
          <div className="badge">
            <span className="badge-dot" />
            {copy.landing.badge}
          </div>

          <h1>
            {copy.landing.heroTitle}
            <br />
            <span>{copy.landing.heroTitleAccent}</span> {copy.landing.heroTitleTail}
          </h1>

          <p className="landing-copy-lead">{copy.landing.heroLead}</p>

          <div className="hero-stat-grid">
            <article className="stat-item">
              <div className="stat-icon stat-icon-cyan">
                <WandSparkles size={16} />
              </div>
              <div>
                <div className="stat-title">{copy.landing.statSpeed}</div>
                <div className="stat-subtitle">{copy.landing.statSpeedNote}</div>
              </div>
            </article>

            <article className="stat-item">
              <div className="stat-icon stat-icon-magenta">
                <FileVideo size={16} />
              </div>
              <div>
                <div className="stat-title">{copy.landing.statPayment}</div>
                <div className="stat-subtitle">{copy.landing.statPaymentNote}</div>
              </div>
            </article>

            <article className="stat-item">
              <div className="stat-icon stat-icon-green">
                <ShieldCheck size={16} />
              </div>
              <div>
                <div className="stat-title">{copy.landing.statLocal}</div>
                <div className="stat-subtitle">{copy.landing.statLocalNote}</div>
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
              <span>{copy.landing.ctaPricing}</span>
              <ArrowRight size={16} />
            </a>
            <a className="ghost-button" href="#fitur">
              {copy.landing.ctaHowItWorks}
            </a>
          </div>
        </div>

        <aside className="auth-card landing-auth-card" id="masuk">
          <div className="auth-head">
            <h2>{copy.landing.authTitle}</h2>
            <p>{copy.landing.authLead}</p>
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
            <span>{oauthLoading ? copy.landing.googleRedirecting : copy.landing.googleLogin}</span>
          </button>

          <p className="auth-helper">{copy.landing.authHelper}</p>

          <div className="auth-divider">
            <span>{copy.landing.authDivider}</span>
          </div>

          <div className="tab-pill" role="tablist" aria-label={copy.landing.authMode}>
            <button
              className={mode === "login" ? "active" : ""}
              type="button"
              onClick={() => setMode("login")}
            >
              {copy.landing.login}
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              type="button"
              onClick={() => setMode("register")}
            >
              {copy.landing.register}
            </button>
          </div>

          <form className="grid-form auth-form" onSubmit={onSubmit}>
            {showRegisterFields ? (
              <label>
                <span>{copy.landing.name}</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={emailLoading || oauthLoading}
                  placeholder={copy.landing.namePlaceholder}
                />
              </label>
            ) : null}

            <label>
              <span>{copy.landing.email}</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={emailLoading || oauthLoading}
                placeholder={copy.landing.emailPlaceholder}
              />
            </label>

            <label>
              <span>{copy.landing.password}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={emailLoading || oauthLoading}
                placeholder={copy.landing.passwordPlaceholder}
              />
            </label>

            <button type="submit" className="primary-btn" disabled={emailLoading || oauthLoading}>
              {emailLoading
                ? copy.landing.submitting
                : mode === "login"
                  ? copy.landing.login
                  : copy.landing.createAccount}
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
              {copy.landing.securityData}
            </span>
            <span>
              <EyeOff size={13} />
              {copy.landing.securitySpam}
            </span>
          </div>
        </aside>
      </section>

      <section id="fitur" className="landing-section">
        <div className="section-heading landing-section-heading">
          <div className="badge">
            <span className="badge-dot" />
            {copy.landing.howItWorksBadge}
          </div>
          <h2>{copy.landing.howItWorksTitle}</h2>
          <p className="section-note">{copy.landing.howItWorksLead}</p>
        </div>

        <div className="feature-grid">
          {copy.landing.featureSteps.map((step, index) => {
            const Icon = index === 0 ? Upload : index === 1 ? PenLine : Download;
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
            {copy.landing.pricingBadge}
          </div>
          <h2>{copy.landing.pricingTitle}</h2>
          <p className="section-note">{copy.landing.pricingLead}</p>
        </div>

        <div className="pricing-grid">
          <article className="pricing-card featured pricing-card-single">
            <div className="pricing-card-head">
              <span className="pricing-badge">{copy.landing.package.badge}</span>
              <span className="pricing-popular">QRIS</span>
            </div>
            <h3>QRIS</h3>
            <div className="pricing-price">{copy.landing.package.price}</div>
            <strong>{copy.landing.package.quota}</strong>
            <div className="pricing-divider" />
            <p className="section-note">{copy.landing.package.note}</p>
            <button className="primary-btn pricing-action" type="button">
              {copy.landing.pricingButton}
            </button>
          </article>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-grid">
          <article className="footer-card">
            <div className="footer-card-head">
              <ShieldCheck size={17} />
              <span>{copy.landing.privacy}</span>
            </div>
            <p className="section-note">{copy.landing.privacyNote}</p>
          </article>

          <article className="footer-card">
            <div className="footer-card-head">
              <ShieldCheck size={17} />
              <span>{copy.landing.usage}</span>
            </div>
            <p className="section-note">{copy.landing.usageNote}</p>
          </article>
        </div>

        <div className="landing-footer-bottom">
          <div className="landing-brand-lockup">
            <div className="landing-brand-mark landing-brand-mark-small">V</div>
            <span className="landing-brand-name">Voiceshort AI</span>
          </div>
          <p>{copy.landing.footerRights}</p>
          <div className="footer-links">
            <a href="#">{copy.landing.footerHelp}</a>
            <a href="#">{copy.landing.footerContact}</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

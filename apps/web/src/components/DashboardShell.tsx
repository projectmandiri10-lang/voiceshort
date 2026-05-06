import type { ReactNode } from "react";
import { CircleDollarSign, type LucideIcon, LogOut, Menu, Shield, Sparkles, Wallet } from "lucide-react";
import type { AuthUser } from "../types";
import { BrandMark } from "./BrandMark";

export interface DashboardTabDefinition<TView extends string> {
  id: TView;
  label: string;
  icon: LucideIcon;
}

interface DashboardShellProps<TView extends string> {
  user: AuthUser;
  activeView: TView;
  tabs: DashboardTabDefinition<TView>[];
  sessionError?: string;
  onNavigate: (view: TView) => void;
  onLogout: () => void | Promise<void>;
  children: ReactNode;
}

function formatRupiah(value: number): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export function DashboardShell<TView extends string>({
  user,
  activeView,
  tabs,
  sessionError,
  onNavigate,
  onLogout,
  children,
}: DashboardShellProps<TView>) {
  return (
    <main className="dashboard-shell">
      <div className="dashboard-orb dashboard-orb-cyan" aria-hidden="true" />
      <div className="dashboard-orb dashboard-orb-magenta" aria-hidden="true" />

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="sidebar-card">
            <BrandMark compact />
            <div className="sidebar-user-block">
              <span className="eyebrow">Workspace Aktif</span>
              <strong>{user.displayName}</strong>
              <p className="small break-anywhere">{user.email}</p>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Dashboard navigation">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={activeView === tab.id ? "sidebar-nav-item active" : "sidebar-nav-item"}
                  onClick={() => onNavigate(tab.id)}
                >
                  <Icon size={18} strokeWidth={2} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="sidebar-card sidebar-note">
            <span className="eyebrow">Akses</span>
            <div className="sidebar-note-row">
              <Shield size={16} />
              <span>{user.role === "superadmin" ? "Superadmin" : "Creator access"}</span>
            </div>
            <div className="sidebar-note-row">
              <Sparkles size={16} />
              <span>{user.isUnlimited ? "Unlimited generation" : "Billing per video aktif"}</span>
            </div>
            <button type="button" className="danger-button sidebar-logout" onClick={() => void onLogout()}>
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        <div className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <div className="dashboard-mobile-brand">
                <Menu size={18} />
                <span>Voiceshort Dashboard</span>
              </div>
              <span className="eyebrow">Operational Interface</span>
              <h1>Kelola voice over video pendek dengan alur yang lebih cepat dan rapi.</h1>
              <p className="section-note">
                Semua fitur lama tetap ada, sekarang dibungkus dalam workspace yang lebih fokus untuk
                upload, antrean, saldo, dan admin.
              </p>
            </div>

            <div className="dashboard-metrics">
              <article className="metric-card">
                <span className="metric-label">Saldo</span>
                <strong>{user.isUnlimited ? "Unlimited" : formatRupiah(user.walletBalanceIdr)}</strong>
                <p className="small">
                  {user.isUnlimited ? "Tanpa batas saldo" : `${user.generateCreditsRemaining ?? 0} video tersisa`}
                </p>
              </article>
              <article className="metric-card">
                <span className="metric-label">Biaya</span>
                <strong>{formatRupiah(user.generatePriceIdr)}</strong>
                <p className="small">Per video voice over</p>
              </article>
              <article className="metric-card">
                <span className="metric-label">Status akun</span>
                <strong>{user.subscriptionStatus === "active" ? "Aktif" : "Nonaktif"}</strong>
                <p className="small">{user.role === "superadmin" ? "Akses penuh" : "Akses creator"}</p>
              </article>
            </div>
          </header>

          <section className="telemetry-banner">
            <div className="telemetry-group">
              <div className="telemetry-chip">
                <Wallet size={16} />
                <span>{user.isUnlimited ? "Unlimited balance" : "Deposit billing aktif"}</span>
              </div>
              <div className="telemetry-chip">
                <CircleDollarSign size={16} />
                <span>{user.isUnlimited ? "Tanpa potong saldo" : `${user.generateCreditsRemaining ?? 0} sesi siap`}</span>
              </div>
            </div>
            <div className="telemetry-chip telemetry-chip-highlight">
              <Sparkles size={16} />
              <span>Workspace selaras dengan desain `.kombai/canvas/landing.canvas`</span>
            </div>
          </section>

          {sessionError ? <p className="err-text shell-message">{sessionError}</p> : null}

          <div className="dashboard-content">{children}</div>
        </div>
      </div>
    </main>
  );
}

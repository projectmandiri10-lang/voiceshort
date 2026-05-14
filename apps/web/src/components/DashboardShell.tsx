import type { ReactNode } from "react";
import { type LucideIcon, LogOut, Shield, Sparkles, Wallet } from "lucide-react";
import type { AuthUser } from "../types";

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

function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "RV";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
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
  const activeTab = tabs.find((tab) => tab.id === activeView);
  const balanceLabel = user.isUnlimited ? "Unlimited" : formatRupiah(user.walletBalanceIdr);
  const balanceNote = user.isUnlimited
    ? "Akun tanpa batas"
    : `${user.generateCreditsRemaining ?? 0} menit tersisa`;
  const accessLabel = user.role === "superadmin" ? "Admin" : "Pengguna";

  return (
    <main className="dashboard-shell">
      <div className="dashboard-orb dashboard-orb-cyan" aria-hidden="true" />
      <div className="dashboard-orb dashboard-orb-magenta" aria-hidden="true" />

      <div className="dashboard-concise-layout">
        <aside className="dashboard-rail">
          <button
            type="button"
            className="dashboard-rail-brand"
            aria-label="Workspace utama"
            onClick={() => onNavigate(tabs[0]?.id ?? activeView)}
          >
            <div className="brand-mark brand-mark-compact">
              <div className="brand-mark-inner">
                <Sparkles size={18} strokeWidth={2.2} />
              </div>
            </div>
            <span className="sr-only">VoiceOver Shorts 60</span>
          </button>

          <nav className="dashboard-rail-nav" aria-label="Dashboard navigation">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={
                    activeView === tab.id
                      ? "dashboard-rail-button active"
                      : "dashboard-rail-button"
                  }
                  onClick={() => onNavigate(tab.id)}
                  aria-label={tab.label}
                  title={tab.label}
                >
                  <Icon size={18} strokeWidth={2} />
                  <span className="sr-only">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="dashboard-rail-footer">
            <div className="dashboard-rail-status" title={accessLabel}>
              <Shield size={18} strokeWidth={2} />
            </div>
            <button
              type="button"
              className="dashboard-rail-button dashboard-rail-button-danger"
              onClick={() => void onLogout()}
              aria-label="Logout"
              title="Logout"
            >
              <LogOut size={18} strokeWidth={2} />
              <span className="sr-only">Logout</span>
            </button>
          </div>
        </aside>

        <div className="dashboard-concise-main">
          <header className="dashboard-topbar">
            <div className="dashboard-topbar-copy">
              <div className="dashboard-breadcrumb" aria-label="Lokasi halaman">
                <span>Beranda</span>
                <span className="dashboard-breadcrumb-dot" aria-hidden="true" />
                <span className="dashboard-breadcrumb-active">{activeTab?.label ?? "Halaman"}</span>
              </div>
              <h1>{activeTab?.label ?? "Halaman"}</h1>
            </div>

            <div className="dashboard-topbar-meta">
              <div className="dashboard-balance-pill">
                <div className="dashboard-balance-copy">
                  <span>Saldo</span>
                  <strong>{balanceLabel}</strong>
                  <p>{balanceNote}</p>
                </div>
                <div className="dashboard-balance-icon" aria-hidden="true">
                  <Wallet size={16} strokeWidth={2} />
                </div>
              </div>

              <div className="dashboard-topbar-separator" aria-hidden="true" />

              <div className="dashboard-user-chip">
                <div className="dashboard-user-copy">
                  <strong>{user.displayName}</strong>
                  <span>{accessLabel}</span>
                </div>
                <div className="dashboard-avatar" aria-hidden="true">
                  <div className="dashboard-avatar-inner">{getInitials(user.displayName)}</div>
                </div>
              </div>
            </div>
          </header>

          {sessionError ? <p className="err-text dashboard-inline-alert">{sessionError}</p> : null}

          <div className="dashboard-content-frame">
            <div className="dashboard-content">{children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

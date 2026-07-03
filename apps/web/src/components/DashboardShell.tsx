import type { ReactNode } from "react";
import { type LucideIcon, LogOut, Shield, Sparkles, Wallet } from "lucide-react";
import type { AuthUser, ContentLanguage } from "../types";
import { formatCompactIdr } from "../user-locale";
import { getUserCopy } from "../user-copy";

export interface DashboardTabDefinition<TView extends string> {
  id: TView;
  label: string;
  icon: LucideIcon;
}

interface DashboardShellProps<TView extends string> {
  user: AuthUser;
  locale: ContentLanguage;
  activeView: TView;
  tabs: DashboardTabDefinition<TView>[];
  sessionError?: string;
  onNavigate: (view: TView) => void;
  onLogout: () => void | Promise<void>;
  children: ReactNode;
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
  locale,
  activeView,
  tabs,
  sessionError,
  onNavigate,
  onLogout,
  children,
}: DashboardShellProps<TView>) {
  const copy = getUserCopy(locale);
  const activeTab = tabs.find((tab) => tab.id === activeView);
  const balanceLabel = user.isUnlimited
    ? copy.dashboard.unlimited
    : formatCompactIdr(user.walletBalanceIdr, locale);
  const balanceNote = user.isUnlimited
    ? copy.dashboard.unlimitedNote
    : copy.dashboard.remainingGenerates(user.generateCreditsRemaining ?? 0);
  const accessLabel = user.role === "superadmin" ? copy.dashboard.admin : copy.dashboard.user;

  return (
    <main className="dashboard-shell">
      <div className="dashboard-orb dashboard-orb-cyan" aria-hidden="true" />
      <div className="dashboard-orb dashboard-orb-magenta" aria-hidden="true" />

      <div className="dashboard-concise-layout">
        <aside className="dashboard-rail">
          <button
            type="button"
            className="dashboard-rail-brand"
            aria-label={copy.dashboard.mainWorkspace}
            onClick={() => onNavigate(tabs[0]?.id ?? activeView)}
          >
            <div className="brand-mark brand-mark-compact">
              <div className="brand-mark-inner">
                <Sparkles size={18} strokeWidth={2.2} />
              </div>
            </div>
            <span className="sr-only">VoiceOver Shorts 60</span>
          </button>

          <nav className="dashboard-rail-nav" aria-label={copy.dashboard.navigation}>
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
              aria-label={copy.app.logout}
              title={copy.app.logout}
            >
              <LogOut size={18} strokeWidth={2} />
              <span className="sr-only">{copy.app.logout}</span>
            </button>
          </div>
        </aside>

        <div className="dashboard-concise-main">
          <header className="dashboard-topbar">
            <div className="dashboard-topbar-copy">
              <h1>{activeTab?.label ?? copy.dashboard.defaultPage}</h1>
            </div>

            <div className="dashboard-topbar-meta">
              <div className="dashboard-balance-pill">
                <div className="dashboard-balance-icon" aria-hidden="true">
                  <Wallet size={16} strokeWidth={2} />
                </div>
                <div className="dashboard-balance-copy">
                  <span>{copy.dashboard.balance}</span>
                  <strong>{balanceLabel}</strong>
                  <p>{balanceNote}</p>
                </div>
              </div>

              <div className="dashboard-user-chip">
                <div className="dashboard-avatar" aria-hidden="true">
                  <div className="dashboard-avatar-inner">{getInitials(user.displayName)}</div>
                </div>
                <div className="dashboard-user-copy">
                  <strong>{user.displayName}</strong>
                  <span>{accessLabel}</span>
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

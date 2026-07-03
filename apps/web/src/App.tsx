import { useEffect, useMemo, useState } from "react";
import { FolderClock, Settings2, ShieldUser, Sparkles, WalletCards } from "lucide-react";
import { completeGoogleOAuthRedirect, fetchSession, logout, subscribeToAuthState } from "./api";
import { DashboardShell, type DashboardTabDefinition } from "./components/DashboardShell";
import { navigateToRoute, parseCurrentRoute, type AppRoute, type AppView } from "./navigation";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { DepositPage } from "./pages/DepositPage";
import { GeneratePage } from "./pages/GeneratePage";
import { JobsPage } from "./pages/JobsPage";
import { LandingPage } from "./pages/LandingPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { AuthUser } from "./types";
import { resolveBrowserLocale } from "./user-locale";
import { getUserCopy } from "./user-copy";

type DashboardView = Exclude<AppView, "landing">;

const TAB_META: Record<
  DashboardView,
  {
    label: string;
    icon: DashboardTabDefinition<DashboardView>["icon"];
  }
> = {
  generate: { label: "Generate", icon: Sparkles },
  deposit: { label: "Balance", icon: WalletCards },
  jobs: { label: "History", icon: FolderClock },
  settings: { label: "Pengaturan", icon: Settings2 },
  admin: { label: "Admin", icon: ShieldUser }
};

function getAllowedView(user: AuthUser | null, route: AppRoute): AppView {
  if (!user) {
    return "landing";
  }
  if (route.view === "landing") {
    return "generate";
  }
  if ((route.view === "settings" || route.view === "admin") && user.role !== "superadmin") {
    return "generate";
  }
  return route.view;
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseCurrentRoute());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const locale = useMemo(() => resolveBrowserLocale(), []);
  const copy = useMemo(() => getUserCopy(locale), [locale]);

  const activeView = useMemo(() => getAllowedView(user, route), [route, user]);
  const dashboardTabs = useMemo<DashboardView[]>(() => {
    if (!user) {
      return [];
    }
    return user.role === "superadmin"
      ? ["generate", "deposit", "jobs", "settings", "admin"]
      : ["generate", "deposit", "jobs"];
  }, [user]);
  const dashboardTabDefinitions = useMemo<DashboardTabDefinition<DashboardView>[]>(() => {
    return dashboardTabs.map((tabId) => ({
      id: tabId,
      label:
        tabId === "settings"
          ? copy.app.tabs.settings
          : tabId === "generate"
            ? copy.app.tabs.generate
            : tabId === "deposit"
              ? copy.app.tabs.deposit
              : tabId === "jobs"
                ? copy.app.tabs.jobs
                : copy.app.tabs.admin,
      icon: TAB_META[tabId].icon,
    }));
  }, [copy.app.tabs, dashboardTabs]);

  const refreshSession = async () => {
    const nextUser = await fetchSession();
    setUser(nextUser);
  };

  useEffect(() => {
    const onPopState = () => setRoute(parseCurrentRoute());
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        const oauthResult = await completeGoogleOAuthRedirect();
        if (!mounted) {
          return;
        }

        const nextUser = await fetchSession();
        if (!mounted) {
          return;
        }

        setUser(nextUser);
        setSessionError("");
        const currentRoute = parseCurrentRoute();

        if (oauthResult.authError && !nextUser) {
          setRoute(navigateToRoute({ view: "landing", authError: oauthResult.authError }, true));
          return;
        }

        if (nextUser) {
          if (currentRoute.view === "landing") {
            setRoute(navigateToRoute({ view: "generate", authError: undefined }, true));
            return;
          }
          setRoute({ ...currentRoute, authError: undefined });
          return;
        }

        setRoute(currentRoute);
      } catch (loadError) {
        if (mounted) {
          console.warn("Unable to load user session:", loadError);
          setSessionError(
            locale === "id-ID"
              ? "Kami belum bisa memuat akun Anda. Coba muat ulang halaman sebentar lagi."
              : "We could not load your account yet. Please refresh the page and try again."
          );
        }
      } finally {
        if (mounted) {
          setLoadingSession(false);
        }
      }
    };

    void loadSession();
    return () => {
      mounted = false;
    };
  }, [locale, route.view]);

  useEffect(() => {
    return subscribeToAuthState(async (event) => {
      if (event === "INITIAL_SESSION") {
        return;
      }

      const nextUser = await fetchSession().catch(() => null);
      setUser(nextUser);
      setSessionError("");

      if (nextUser) {
        const currentRoute = parseCurrentRoute();
        if (currentRoute.view === "landing") {
          setRoute(navigateToRoute({ view: "generate", authError: undefined }, true));
        }
        return;
      }

      setRoute(navigateToRoute({ view: "landing", jobId: undefined, authError: undefined }, true));
    });
  }, []);

  const onNavigate = (view: DashboardView, extra?: Partial<AppRoute>) => {
    setRoute(navigateToRoute({ view, ...extra }));
  };

  const onAuthenticated = (nextUser: AuthUser) => {
    setUser(nextUser);
    setRoute(navigateToRoute({ view: "generate", authError: undefined }, true));
  };

  const onLogout = async () => {
    try {
      await logout();
    } finally {
      setUser(null);
      setRoute(navigateToRoute({ view: "landing", jobId: undefined, authError: undefined }, true));
    }
  };

  const onRefreshSession = async () => {
    await refreshSession();
  };

  if (loadingSession) {
    return (
      <main className="app-shell-loading">
        <section className="card">
          <span className="eyebrow">{copy.app.loadingEyebrow}</span>
          <h1>VoiceOver Shorts 60</h1>
          <p className="section-note">{copy.app.loadingNote}</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <LandingPage
        locale={locale}
        authError={route.authError}
        onAuthenticated={onAuthenticated}
      />
    );
  }

  if (user.disabledAt) {
    return (
      <main className="app-shell-loading">
        <section className="card app-page-card">
          <span className="eyebrow">{copy.app.disabledEyebrow}</span>
          <h1>{copy.app.disabledTitle}</h1>
          <p>
            {user.disabledReason ||
              copy.app.disabledFallback}
          </p>
          <button type="button" className="danger-button" onClick={() => void onLogout()}>
            {copy.app.logout}
          </button>
        </section>
      </main>
    );
  }

  return (
    <DashboardShell
      user={user}
      locale={locale}
      activeView={activeView as DashboardView}
      tabs={dashboardTabDefinitions}
      sessionError={sessionError}
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      {activeView === "generate" ? (
        <GeneratePage
          locale={locale}
          currentUser={user}
          onRefreshSession={onRefreshSession}
          onViewJobs={(jobId) => onNavigate("jobs", { jobId })}
          resumeSessionId={route.jobId}
        />
      ) : null}
      {activeView === "deposit" ? (
        <DepositPage locale={locale} onRefreshSession={onRefreshSession} />
      ) : null}
      {activeView === "jobs" ? (
        <JobsPage
          locale={locale}
          currentUser={user}
          selectedJobId={route.jobId}
          onSelectJob={(jobId) => onNavigate("jobs", { jobId })}
          onResumeSession={(jobId) => onNavigate("generate", { jobId })}
        />
      ) : null}
      {activeView === "settings" && user.role === "superadmin" ? <SettingsPage /> : null}
      {activeView === "admin" && user.role === "superadmin" ? (
        <AdminUsersPage onRefreshSession={onRefreshSession} />
      ) : null}
    </DashboardShell>
  );
}

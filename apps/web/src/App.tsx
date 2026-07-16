import { useEffect, useMemo, useState } from "react";
import { CreditCard, FolderClock, Settings, Sparkles } from "lucide-react";
import { completeGoogleOAuthRedirect, fetchSession, logout, subscribeToAuthState } from "./api";
import { DashboardShell, type DashboardTabDefinition } from "./components/DashboardShell";
import { navigateToRoute, parseCurrentRoute, type AppRoute } from "./navigation";
import { GeneratePage } from "./pages/GeneratePage";
import { JobsPage } from "./pages/JobsPage";
import { LandingPage } from "./pages/LandingPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";
import { SubscriptionPage } from "./pages/SubscriptionPage";
import type { AuthUser } from "./types";
import { resolveBrowserLocale } from "./user-locale";

type PersonalView = "generate" | "jobs" | "subscription" | "admin";

const personalTabs: DashboardTabDefinition<PersonalView>[] = [
  { id: "generate", label: "Naskah", icon: Sparkles },
  { id: "jobs", label: "Riwayat", icon: FolderClock },
  { id: "subscription", label: "Top Up", icon: CreditCard }
];

function personalView(route: AppRoute, isSuperadmin: boolean): PersonalView {
  if (route.view === "admin" && isSuperadmin) return "admin";
  if (route.view === "subscription") return "subscription";
  return route.view === "jobs" ? "jobs" : "generate";
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseCurrentRoute());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const locale = useMemo(() => resolveBrowserLocale(), []);

  useEffect(() => {
    const onPopState = () => setRoute(parseCurrentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const oauth = await completeGoogleOAuthRedirect();
        const nextUser = await fetchSession();
        if (!mounted) return;
        setUser(nextUser);
        if (oauth.authError && !nextUser) {
          setRoute(navigateToRoute({ view: "landing", authError: oauth.authError }, true));
        } else if (nextUser && parseCurrentRoute().view === "landing") {
          setRoute(navigateToRoute({ view: "generate" }, true));
        }
      } catch (error) {
        if (mounted) setSessionError((error as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => subscribeToAuthState(async (event) => {
    if (event === "INITIAL_SESSION") return;
    const nextUser = await fetchSession().catch(() => null);
    setUser(nextUser);
    setRoute(navigateToRoute({ view: nextUser ? "generate" : "landing" }, true));
  }), []);

  if (loading) {
    return <main className="app-shell-loading"><section className="card"><h1>VoiceShort Personal</h1><p>Menyiapkan workspace...</p></section></main>;
  }
  if (!user) {
    return <LandingPage locale={locale} authError={route.authError} onAuthenticated={(next) => { setUser(next); setRoute(navigateToRoute({ view: "generate" }, true)); }} />;
  }
  if (user.disabledAt) {
    return <main className="app-shell-loading"><section className="card"><h1>Akun nonaktif</h1><p>{user.disabledReason || "Hubungi admin."}</p></section></main>;
  }

  const tabs = user.role === "superadmin"
    ? [...personalTabs, { id: "admin" as const, label: "Pengaturan AI", icon: Settings }]
    : personalTabs;
  const activeView = personalView(route, user.role === "superadmin");
  const navigate = (view: PersonalView, jobId?: string) => setRoute(navigateToRoute({ view, jobId }));
  return (
    <DashboardShell
      user={user}
      locale={locale}
      activeView={activeView}
      tabs={tabs}
      sessionError={sessionError}
      onNavigate={navigate}
      onLogout={async () => { await logout(); setUser(null); setRoute(navigateToRoute({ view: "landing" }, true)); }}
    >
      {activeView === "generate" ? (
        <GeneratePage
          locale={locale}
          user={user}
          resumeSessionId={route.jobId}
          onViewJobs={(jobId) => navigate("jobs", jobId)}
          onSubscribe={() => navigate("subscription")}
          onUserUpdated={setUser}
        />
      ) : activeView === "jobs" ? (
        <JobsPage
          locale={locale}
          selectedJobId={route.jobId}
          onSelectJob={(jobId) => navigate("jobs", jobId)}
        />
      ) : activeView === "subscription" ? (
        <SubscriptionPage user={user} onUserUpdated={setUser} onGenerate={() => navigate("generate")} />
      ) : (
        <AdminSettingsPage />
      )}
    </DashboardShell>
  );
}

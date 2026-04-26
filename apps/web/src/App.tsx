import { useEffect, useState } from "react";
import { GeneratePage } from "./pages/GeneratePage";
import { JobsPage } from "./pages/JobsPage";
import { SettingsPage } from "./pages/SettingsPage";

type TabId = "generate" | "jobs" | "settings";

const TAB_LABEL: Record<TabId, string> = {
  generate: "Generate",
  jobs: "Jobs",
  settings: "Settings"
};

function isTabId(value: string | null): value is TabId {
  return value === "generate" || value === "jobs" || value === "settings";
}

function readNavigationState(): { tab: TabId; jobId: string } {
  if (typeof window === "undefined") {
    return { tab: "generate", jobId: "" };
  }
  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");
  const jobId = params.get("jobId") ?? "";
  return {
    tab: isTabId(requestedTab) ? requestedTab : jobId ? "jobs" : "generate",
    jobId
  };
}

export default function App() {
  const initialNavigation = readNavigationState();
  const [tab, setTab] = useState<TabId>(initialNavigation.tab);
  const [focusedJobId, setFocusedJobId] = useState(initialNavigation.jobId);

  const navigateToTab = (nextTab: TabId, jobId = "") => {
    setTab(nextTab);
    setFocusedJobId(nextTab === "jobs" ? jobId : "");

    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams();
    if (nextTab !== "generate") {
      params.set("tab", nextTab);
    }
    if (nextTab === "jobs" && jobId) {
      params.set("jobId", jobId);
    }
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.pushState(null, "", nextUrl);
  };

  useEffect(() => {
    const onPopState = () => {
      const next = readNavigationState();
      setTab(next.tab);
      setFocusedJobId(next.jobId);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>general ai voice over shorts</h1>
        <nav>
          {(Object.keys(TAB_LABEL) as TabId[]).map((tabId) => (
            <button
              key={tabId}
              className={tab === tabId ? "tab active" : "tab"}
              onClick={() => navigateToTab(tabId)}
            >
              {TAB_LABEL[tabId]}
            </button>
          ))}
        </nav>
      </header>
      {tab === "generate" && <GeneratePage onJobCreated={(jobId) => navigateToTab("jobs", jobId)} />}
      {tab === "jobs" && <JobsPage preferredJobId={focusedJobId} />}
      {tab === "settings" && <SettingsPage />}
    </main>
  );
}

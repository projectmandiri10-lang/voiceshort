export type AppView = "landing" | "generate" | "deposit" | "jobs" | "settings" | "admin";

export interface AppRoute {
  view: AppView;
  jobId?: string;
  authError?: string;
}

function buildUrl(route: Partial<AppRoute>): string {
  const params = new URLSearchParams(window.location.search);

  if (route.view) {
    params.set("view", route.view);
  }
  if (route.jobId) {
    params.set("jobId", route.jobId);
  } else {
    params.delete("jobId");
  }
  if (route.authError) {
    params.set("authError", route.authError);
  } else {
    params.delete("authError");
  }

  const search = params.toString();
  return `${window.location.pathname}${search ? `?${search}` : ""}`;
}

export function parseCurrentRoute(): AppRoute {
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get("view");
  const view = rawView === "generate" || rawView === "deposit" || rawView === "jobs" || rawView === "settings" || rawView === "admin"
    ? rawView
    : "landing";

  return {
    view,
    jobId: params.get("jobId") || undefined,
    authError: params.get("authError") || undefined
  };
}

export function navigateToRoute(route: Partial<AppRoute>, replace = false): AppRoute {
  const nextRoute = {
    ...parseCurrentRoute(),
    ...route
  };
  const url = buildUrl(nextRoute);
  if (replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }
  return parseCurrentRoute();
}

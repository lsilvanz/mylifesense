// Real Fitbit integration for a serverless (static) app.
//
// Uses the OAuth2 Implicit Grant flow: Fitbit returns an access token directly
// in the redirect URL fragment, so there's no token-exchange step (which would
// need a server due to CORS) and no client secret. Data endpoints are then read
// straight from the browser. The Client ID is a public identifier — safe here.

const STORAGE_KEY = "mylifesense.fitbit";
const CLIENT_ID_KEY = "mylifesense.fitbit.clientId";
const API = "https://api.fitbit.com";

export interface FitbitSession {
  token: string;
  userId: string;
  scope: string;
  expiresAt: number; // epoch ms
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

// The Client ID comes from an env var (set at build) or, for quick testing, a
// value the user pastes into the UI (stored locally).
export function getClientId(): string | null {
  const env = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID;
  if (env) return env;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CLIENT_ID_KEY);
  } catch {
    return null;
  }
}

export function setClientId(id: string) {
  try {
    window.localStorage.setItem(CLIENT_ID_KEY, id.trim());
  } catch {
    /* ignore */
  }
}

function redirectUri(): string {
  // Must exactly match a Callback URL registered on the Fitbit app.
  return `${window.location.origin}/`;
}

export function getSession(): FitbitSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as FitbitSession;
    if (!s.token || s.expiresAt < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function isConnected(): boolean {
  return getSession() !== null;
}

export function disconnect() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Kick off the OAuth redirect to Fitbit.
export function connect(scopes = "activity heartrate") {
  const clientId = getClientId();
  if (!clientId) throw new Error("Set your Fitbit Client ID first.");
  const params = new URLSearchParams({
    response_type: "token",
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri(),
    expires_in: "604800", // 1 week
  });
  window.location.href = `https://www.fitbit.com/oauth2/authorize?${params.toString()}`;
}

// Call once on app load: if we returned from Fitbit, capture the token from the
// URL fragment and store it. Returns true if a token was captured.
export function captureRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  if (!hash || !hash.includes("access_token=")) return false;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("access_token");
  if (!token) return false;
  const session: FitbitSession = {
    token,
    userId: params.get("user_id") ?? "",
    scope: params.get("scope") ?? "",
    expiresAt: Date.now() + Number(params.get("expires_in") ?? 604800) * 1000,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
  // Clean the token out of the URL.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}

async function apiGet(path: string): Promise<Record<string, unknown>> {
  const session = getSession();
  if (!session) throw new Error("Not connected to Fitbit.");
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${session.token}`, Accept: "application/json" },
    });
  } catch {
    throw new Error("Couldn't reach Fitbit (network or CORS). ");
  }
  if (res.status === 401) {
    disconnect();
    throw new Error("Fitbit session expired — reconnect.");
  }
  if (!res.ok) throw new Error(`Fitbit API error ${res.status}`);
  return res.json();
}

// Fetch a supported daily metric over an inclusive date range.
export async function fetchMetric(
  metric: string,
  start: string,
  end: string
): Promise<DailyPoint[]> {
  if (metric === "steps") {
    const data = (await apiGet(`/1/user/-/activities/steps/date/${start}/${end}.json`)) as {
      "activities-steps"?: { dateTime: string; value: string }[];
    };
    return (data["activities-steps"] ?? []).map((d) => ({ date: d.dateTime, value: Number(d.value) }));
  }
  if (metric === "resting_hr" || metric === "heart") {
    const data = (await apiGet(`/1/user/-/activities/heart/date/${start}/${end}.json`)) as {
      "activities-heart"?: { dateTime: string; value: { restingHeartRate?: number } }[];
    };
    return (data["activities-heart"] ?? [])
      .filter((d) => typeof d.value?.restingHeartRate === "number")
      .map((d) => ({ date: d.dateTime, value: d.value.restingHeartRate as number }));
  }
  throw new Error(`Unsupported Fitbit metric: ${metric}`);
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Pull live daily data for a Sense's Fitbit factors, keyed by factor id. Returns
// {} when not connected or there are no Fitbit factors. This feeds insights/chat
// in memory only — it is never written to the user's entries.
export async function fetchIntegrationData(
  factors: { id: string; entryType: string; config: { provider?: string; metric?: string } }[],
  days = 90
): Promise<Record<string, DailyPoint[]>> {
  const out: Record<string, DailyPoint[]> = {};
  if (!getSession()) return out;
  const end = ymd(new Date());
  const start = ymd(new Date(Date.now() - days * 86400000));
  for (const f of factors) {
    if (f.entryType === "integration" && (f.config.provider ?? "").toLowerCase() === "fitbit") {
      try {
        out[f.id] = await fetchMetric(f.config.metric ?? "steps", start, end);
      } catch {
        /* skip this factor on error */
      }
    }
  }
  return out;
}

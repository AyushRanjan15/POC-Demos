const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "";
const COGNITO_CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "";
const COGNITO_SCOPES = process.env.NEXT_PUBLIC_COGNITO_SCOPES ?? "openid email profile";

const KEY_ID_TOKEN = "auth.id_token";
const KEY_PKCE_VERIFIER = "auth.pkce_verifier";
const KEY_PKCE_STATE = "auth.pkce_state";
const KEY_POST_LOGIN_PATH = "auth.post_login_path";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getRedirectUri(): string {
  return `${window.location.origin}/`;
}

function readJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(normalized));
    return typeof parsed.exp === "number" ? parsed.exp : null;
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  const exp = readJwtExp(token);
  if (!exp) return false;
  return Date.now() < exp * 1000 - 30_000;
}

function buildState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function getPostLoginPath(): string {
  const path = sessionStorage.getItem(KEY_POST_LOGIN_PATH);
  sessionStorage.removeItem(KEY_POST_LOGIN_PATH);
  return path || "/assessment";
}

export function getIdToken(): string | null {
  const token = sessionStorage.getItem(KEY_ID_TOKEN);
  if (!token) return null;
  if (!isTokenValid(token)) {
    sessionStorage.removeItem(KEY_ID_TOKEN);
    return null;
  }
  return token;
}

export function isAuthConfigured(): boolean {
  return Boolean(COGNITO_DOMAIN && COGNITO_CLIENT_ID);
}

export async function redirectToLogin(returnTo: string): Promise<never> {
  if (!isAuthConfigured()) {
    throw new Error("Missing Cognito config: NEXT_PUBLIC_COGNITO_DOMAIN and NEXT_PUBLIC_COGNITO_CLIENT_ID");
  }

  const verifierBytes = new Uint8Array(64);
  crypto.getRandomValues(verifierBytes);
  const verifier = base64UrlEncode(verifierBytes);

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64UrlEncode(new Uint8Array(digest));
  const state = buildState();

  sessionStorage.setItem(KEY_PKCE_VERIFIER, verifier);
  sessionStorage.setItem(KEY_PKCE_STATE, state);
  sessionStorage.setItem(KEY_POST_LOGIN_PATH, returnTo);

  const url = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", COGNITO_CLIENT_ID);
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("scope", COGNITO_SCOPES);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  window.location.href = url.toString();
  throw new Error("Redirecting to login");
}

export async function handleAuthCallback(code: string, stateFromQuery: string | null): Promise<void> {
  const expectedState = sessionStorage.getItem(KEY_PKCE_STATE);
  const verifier = sessionStorage.getItem(KEY_PKCE_VERIFIER);

  if (!expectedState || !verifier || !stateFromQuery || stateFromQuery !== expectedState) {
    throw new Error("Invalid OAuth callback state");
  }

  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: COGNITO_CLIENT_ID,
      redirect_uri: getRedirectUri(),
      code,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status})`);
  }

  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("No id_token in token response");

  sessionStorage.setItem(KEY_ID_TOKEN, body.id_token);
  sessionStorage.removeItem(KEY_PKCE_VERIFIER);
  sessionStorage.removeItem(KEY_PKCE_STATE);

  const target = getPostLoginPath();
  window.history.replaceState({}, "", target);
}

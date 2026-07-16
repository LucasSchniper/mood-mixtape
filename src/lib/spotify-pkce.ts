// Utilidades para el flujo OAuth "Authorization Code with PKCE" de Spotify.
// PKCE no necesita un client secret, así que esta app puede loguear al usuario
// contra su propia cuenta de Spotify sin backend ni credenciales guardadas.

const CODE_VERIFIER_KEY = "spotify_pkce_code_verifier";
export const SPOTIFY_SCOPES = "playlist-modify-public playlist-modify-private";

function base64UrlEncode(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
}

async function challengeFromVerifier(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

export function getRedirectUri() {
  return `${window.location.origin}/spotify/callback`;
}

// Genera el par verifier/challenge, guarda el verifier para el paso de vuelta
// (lo necesita el intercambio código -> token) y arma la URL de login de Spotify.
export async function buildSpotifyAuthorizeUrl(clientId: string) {
  const verifier = randomVerifier();
  const challenge = await challengeFromVerifier(verifier);
  sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export function consumeStoredCodeVerifier() {
  const verifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  return verifier;
}

export async function exchangeCodeForToken(clientId: string, code: string, verifier: string) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error("No se pudo intercambiar el código por un token de Spotify.");
  const data = await res.json();
  return data.access_token as string;
}

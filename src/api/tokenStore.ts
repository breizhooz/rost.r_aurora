// SEC-05 : l'access token vit UNIQUEMENT en mémoire (jamais localStorage), donc
// inaccessible à un XSS et perdu au reload — d'où le bootstrap via /auth/refresh.
// Le refresh token, lui, est un cookie HttpOnly posé par le backend.

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

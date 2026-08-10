// Czysty builder nagłówka Content-Security-Policy — bez zależności server-only,
// testowalny bez proxy. Wołany z updateSession (proxy Next 16) per request.
// Uwaga: 'unsafe-inline' jest TYLKO w style-src (inline style={{}} + style= z
// sanitizera; nonce nie obejmuje atrybutu style). script-src NIE ma
// 'unsafe-inline' — tam liczy się ochrona przed XSS.

export type CspOpts = {
  isDev: boolean;
  supabaseOrigin: string | null;
  // Domyślnie false: bez skonfigurowanego GA polityka zostaje wąska.
  gaEnabled?: boolean;
};

// Hosty Google Analytics 4. Do script-src NIE trafiają celowo: 'strict-dynamic'
// unieważnia listę hostów, a gtag.js jest wstrzykiwany przez zaufany skrypt
// bundla, więc dziedziczy zaufanie. Potrzebne są tylko kanały wysyłki danych.
const GA_CONNECT = [
  "https://www.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
];
const GA_IMG = ["https://www.googletagmanager.com", "https://*.google-analytics.com"];

export function buildCsp(
  nonce: string,
  { isDev, supabaseOrigin, gaEnabled = false }: CspOpts
): string {
  const sbHttps = supabaseOrigin ? [supabaseOrigin] : [];
  const sbWss = supabaseOrigin ? [supabaseOrigin.replace(/^https:/, "wss:")] : [];
  const gaConnect = gaEnabled ? GA_CONNECT : [];
  const gaImg = gaEnabled ? GA_IMG : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      ...sbHttps,
      "https://images.unsplash.com",
      ...gaImg,
    ],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...sbHttps, ...sbWss, ...gaConnect],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
  };

  const parts = Object.entries(directives).map(([name, vals]) => `${name} ${vals.join(" ")}`);
  parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

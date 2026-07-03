// Czysty builder nagłówka Content-Security-Policy — bez zależności server-only,
// testowalny bez proxy. Wołany z updateSession (proxy Next 16) per request.
// Uwaga: 'unsafe-inline' jest TYLKO w style-src (inline style={{}} + style= z
// sanitizera; nonce nie obejmuje atrybutu style). script-src NIE ma
// 'unsafe-inline' — tam liczy się ochrona przed XSS.

type CspOpts = { isDev: boolean; supabaseOrigin: string | null };

export function buildCsp(nonce: string, { isDev, supabaseOrigin }: CspOpts): string {
  const sbHttps = supabaseOrigin ? [supabaseOrigin] : [];
  const sbWss = supabaseOrigin ? [supabaseOrigin.replace(/^https:/, "wss:")] : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...sbHttps, "https://images.unsplash.com"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...sbHttps, ...sbWss],
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

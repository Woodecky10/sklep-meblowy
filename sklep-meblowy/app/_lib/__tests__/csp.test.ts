import { describe, it, expect } from "vitest";
import { buildCsp } from "@/app/_lib/csp";

// Parsuje string CSP na mapę dyrektywa → tokeny.
function parse(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(";").map((p) => p.trim()).filter(Boolean)) {
    const [name, ...tokens] = part.split(/\s+/);
    out[name] = tokens;
  }
  return out;
}

const SB = "https://abc.supabase.co";

describe("buildCsp", () => {
  it("wstrzykuje nonce do script-src z 'strict-dynamic', bez 'unsafe-inline'", () => {
    const d = parse(buildCsp("N0nce", { isDev: false, supabaseOrigin: SB }));
    expect(d["script-src"]).toContain("'self'");
    expect(d["script-src"]).toContain("'nonce-N0nce'");
    expect(d["script-src"]).toContain("'strict-dynamic'");
    expect(d["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("'unsafe-eval' tylko w dev", () => {
    expect(parse(buildCsp("n", { isDev: true, supabaseOrigin: SB }))["script-src"]).toContain("'unsafe-eval'");
    expect(parse(buildCsp("n", { isDev: false, supabaseOrigin: SB }))["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("style-src ma 'unsafe-inline' i NIE ma nonce", () => {
    const d = parse(buildCsp("N0nce", { isDev: false, supabaseOrigin: SB }));
    expect(d["style-src"]).toContain("'unsafe-inline'");
    expect(d["style-src"].join(" ")).not.toContain("nonce");
  });

  it("origin Supabase (https+wss) w img-src/connect-src gdy podany", () => {
    const d = parse(buildCsp("n", { isDev: false, supabaseOrigin: SB }));
    expect(d["img-src"]).toContain(SB);
    expect(d["img-src"]).toContain("https://images.unsplash.com");
    expect(d["connect-src"]).toContain(SB);
    expect(d["connect-src"]).toContain("wss://abc.supabase.co");
  });

  it("brak origin Supabase gdy null (tylko self/data/blob + unsplash w img)", () => {
    const d = parse(buildCsp("n", { isDev: false, supabaseOrigin: null }));
    expect(d["connect-src"]).toEqual(["'self'"]);
    expect(d["img-src"]).toEqual(["'self'", "data:", "blob:", "https://images.unsplash.com"]);
  });

  it("bez GA polityka zostaje wąska (żadnego hosta Google)", () => {
    const csp = buildCsp("n", { isDev: false, supabaseOrigin: SB });
    expect(csp).not.toContain("google");
  });

  it("z GA: kanały wysyłki w connect-src/img-src, ale NIE w script-src", () => {
    const d = parse(buildCsp("n", { isDev: false, supabaseOrigin: SB, gaEnabled: true }));
    expect(d["connect-src"]).toContain("https://*.google-analytics.com");
    expect(d["connect-src"]).toContain("https://*.analytics.google.com");
    expect(d["connect-src"]).toContain("https://www.googletagmanager.com");
    expect(d["img-src"]).toContain("https://*.google-analytics.com");
    // 'strict-dynamic' i tak unieważnia listę hostów w script-src — gtag.js
    // przechodzi jako skrypt wstawiony przez zaufany bundel.
    expect(d["script-src"].join(" ")).not.toContain("google");
    expect(d["script-src"]).toContain("'strict-dynamic'");
  });

  it("z GA: hosty remarketingu Google Ads w connect-src i img-src", () => {
    const d = parse(buildCsp("n", { isDev: false, supabaseOrigin: SB, gaEnabled: true }));
    for (const host of [
      "https://stats.g.doubleclick.net",
      "https://googleads.g.doubleclick.net",
      "https://www.google.com",
    ]) {
      expect(d["connect-src"]).toContain(host);
      expect(d["img-src"]).toContain(host);
    }
  });

  it("bez GA nie ma hostów reklamowych", () => {
    const csp = buildCsp("n", { isDev: false, supabaseOrigin: SB });
    expect(csp).not.toContain("doubleclick");
  });

  it("bez pixela Meta polityka zostaje wąska (żadnego hosta Facebooka)", () => {
    const csp = buildCsp("n", { isDev: false, supabaseOrigin: SB });
    expect(csp).not.toContain("facebook");
  });

  it("z pixelem: kanały wysyłki w connect-src/img-src, ale NIE w script-src", () => {
    const d = parse(buildCsp("n", { isDev: false, supabaseOrigin: SB, metaEnabled: true }));
    // fbevents.js strzela zdarzeniami pod /tr — raz fetchem, raz obrazkiem
    // 1x1 (fallback bez sendBeacon), więc host musi być w obu dyrektywach.
    expect(d["connect-src"]).toContain("https://www.facebook.com");
    expect(d["connect-src"]).toContain("https://connect.facebook.net");
    expect(d["img-src"]).toContain("https://www.facebook.com");
    // 'strict-dynamic' i tak unieważnia listę hostów w script-src — fbevents.js
    // przechodzi jako skrypt wstawiony przez zaufany bundel.
    expect(d["script-src"].join(" ")).not.toContain("facebook");
    expect(d["script-src"]).toContain("'strict-dynamic'");
  });

  it("pixel Meta i GA są od siebie niezależne", () => {
    // Dwa osobne przełączniki: wyłączone GA nie może wyciąć hostów Meta.
    const meta = buildCsp("n", { isDev: false, supabaseOrigin: SB, metaEnabled: true });
    expect(meta).toContain("facebook");
    expect(meta).not.toContain("google");

    const ga = buildCsp("n", { isDev: false, supabaseOrigin: SB, gaEnabled: true });
    expect(ga).toContain("google");
    expect(ga).not.toContain("facebook");
  });

  it("pixel Meta nie rozluźnia dyrektyw, które go nie dotyczą", () => {
    const d = parse(buildCsp("n", { isDev: false, supabaseOrigin: SB, metaEnabled: true }));
    expect(d["frame-src"]).toEqual(["'none'"]);
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
  });

  it("GA nie rozluźnia dyrektyw, które go nie dotyczą", () => {
    const d = parse(buildCsp("n", { isDev: false, supabaseOrigin: SB, gaEnabled: true }));
    expect(d["frame-src"]).toEqual(["'none'"]);
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
  });

  it("twarde dyrektywy obecne", () => {
    const csp = buildCsp("n", { isDev: false, supabaseOrigin: SB });
    const d = parse(csp);
    expect(d["worker-src"]).toEqual(["'self'", "blob:"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(csp).toContain("upgrade-insecure-requests");
  });
});

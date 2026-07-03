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

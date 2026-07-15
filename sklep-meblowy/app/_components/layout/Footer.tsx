import LocalizedLink from "../ui/LocalizedLink";
import Image from "next/image";
import { getSections, getCategories } from "@/app/_lib/categories";
import { COMPANY, isFilled } from "@/app/_lib/company";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import { getSiteTexts, siteText } from "@/app/_lib/site-texts";
import { getMenuItems } from "@/app/_lib/menu-server";
import { prepareMenuItems } from "@/app/_lib/menu";

export default async function Footer() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const [sections, categories, texts, menuRows] = await Promise.all([
    getSections(locale),
    getCategories(locale),
    getSiteTexts(),
    getMenuItems(),
  ]);
  const tagline = siteText(texts, "footer_tagline", locale, t.footer.tagline);
  const footerItems = prepareMenuItems(menuRows, "footer", locale);

  const infoLinks: [string, string][] = [
    [t.footer.about, "/o-nas"],
    [t.footer.contact, "/kontakt"],
    [t.footer.account, "/konto"],
    [t.footer.orderHistory, "/konto/zamowienia"],
    [t.footer.delivery, "/dostawa"],
    [t.footer.returns, "/zwroty"],
    [t.footer.terms, "/regulamin"],
    [t.footer.privacy, "/prywatnosc"],
  ];

  return (
    <footer className="bg-[var(--color-navy)] text-white">
      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Image
              src="/logo-mark.svg"
              alt=""
              width={48}
              height={48}
              className="w-12 h-12"
            />
            <p className="font-display text-2xl font-bold">
              {COMPANY.brandName}
            </p>
          </div>
          <p className="text-sm text-white/60 leading-relaxed max-w-xs mb-4">
            {tagline}
          </p>
          <p className="text-xs text-white/70 leading-relaxed">
            {COMPANY.email}
            {COMPANY.phone && (
              <>
                <br />
                {COMPANY.phone}
              </>
            )}
          </p>
        </div>

        {sections.map((section) => (
          <div key={section.slug}>
            <p className="font-sans text-xs uppercase tracking-widest text-[var(--color-gold)] mb-4">
              {section.label}
            </p>
            <ul className="space-y-3 text-sm text-white/70">
              {categories
                .filter((c) => c.group_slug === section.slug)
                .map((c) => (
                  <li key={c.slug}>
                    <LocalizedLink
                      href={`/sklep?kategoria=${c.slug}`}
                      className="hover:text-[var(--color-gold)] transition-colors"
                    >
                      {c.label}
                    </LocalizedLink>
                  </li>
                ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="font-sans text-xs uppercase tracking-widest text-[var(--color-gold)] mb-4">
            {t.footer.information}
          </p>
          <ul className="space-y-3 text-sm text-white/70">
            {infoLinks.map(([label, href]) => (
              <li key={href}>
                <LocalizedLink href={href} className="hover:text-[var(--color-gold)] transition-colors">
                  {label}
                </LocalizedLink>
              </li>
            ))}
            {/* Podstrony z menu stopki (admin: /admin/podstrony). */}
            {footerItems.map((item) => (
              <li key={item.id}>
                <LocalizedLink
                  href={item.href}
                  className="hover:text-[var(--color-gold)] transition-colors"
                >
                  {item.label}
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 py-6 text-center text-xs text-white/70 px-6">
        © {new Date().getFullYear()} {COMPANY.brandName}. {t.footer.rightsReserved}
        {isFilled(COMPANY.nip) && (
          <>
            {" "}
            | NIP: {COMPANY.nip}
          </>
        )}
      </div>
    </footer>
  );
}

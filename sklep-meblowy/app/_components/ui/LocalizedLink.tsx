"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { localizeHref } from "@/app/_lib/i18n";
import { useClientLocale } from "@/app/_lib/useClientLocale";

export default function LocalizedLink({ href, ...rest }: ComponentProps<typeof Link>) {
  const locale = useClientLocale();
  const finalHref = typeof href === "string" ? localizeHref(href, locale) : href;
  return <Link href={finalHref} {...rest} />;
}

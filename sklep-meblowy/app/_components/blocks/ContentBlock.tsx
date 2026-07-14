import BannerBlock from "./BannerBlock";
import GalleryBlock from "./GalleryBlock";
import ProductsBlock from "./ProductsBlock";
import FaqBlock from "./FaqBlock";
import ReviewsBlock from "./ReviewsBlock";
import type { LocalizedContentBlock } from "@/app/_lib/blocks";
import type { Locale } from "@/app/_lib/i18n";

// Blok treściowy → komponent. Typy systemowe renderuje page.tsx we własnych
// case'ach (mają dane strony: slajdy, kafelki, kolekcje).
export default function ContentBlock({
  block,
  locale,
}: {
  block: LocalizedContentBlock;
  locale: Locale;
}) {
  switch (block.type) {
    case "banner":
      return <BannerBlock content={block.content} />;
    case "gallery":
      return <GalleryBlock content={block.content} />;
    case "products":
      return <ProductsBlock content={block.content} locale={locale} />;
    case "faq":
      return <FaqBlock content={block.content} />;
    case "reviews":
      return <ReviewsBlock content={block.content} />;
  }
}

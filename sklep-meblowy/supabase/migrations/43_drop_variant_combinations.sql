-- Migracja 43: model wariantów „tylko opcje" — usuwa klucz `combinations` z
-- products.variants JSONB. Per-kombinacja stan/promocja/Omnibus/zdjęcia były
-- artefaktem BaseLinkera (wycofany). Opcje + dopłaty (value_prices) zostają.
-- Cena promocyjna/stan/Omnibus/zdjęcia są teraz na poziomie produktu.
update public.products
set variants = variants - 'combinations'
where variants ? 'combinations';

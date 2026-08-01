# ADHD — skill do równoległej dywergencji (rozpoznanie, 2026-08-01)

Źródło: <https://github.com/UditAkhourii/adhd> · autor: Udit Akhouri · licencja MIT · npm `adhd-agent` (0.1.4).
Repo pobrane i przejrzane lokalnie; poniżej opis tego, co w nim faktycznie jest, i jak się tego używa.

## Czym to jest

Skill dla agentów kodujących (Claude Code, Cursor, Codex, Gemini CLI i ~50 innych), który rozwiązuje **przedwczesne zakotwiczenie** modeli autoregresyjnych. Diagnoza autora: zwykły chain-of-thought przykleja się do pierwszej wypowiedzianej myśli, a tree-of-thought rozgałęzia się wprawdzie, ale **w jednym wspólnym kontekście**, więc kotwica i tak przechodzi na wszystkie gałęzie.

Odpowiedź ADHD jest architektoniczna, nie promptowa: rozdziela generatora od krytyka i **fizycznie izoluje** gałęzie.

**Faza 1 — dywergencja (krytyk wyłączony).** Agent uruchamia 5 **równoległych, wzajemnie niewidocznych** podagentów. Każdy dostaje wyłącznie problem, kontekst od użytkownika i jedną „ramę poznawczą", plus zakaz oceniania. Każdy zwraca 6 krótkich pomysłów w JSON-ie, z jawnym zakazem trzech pierwszych oczywistych odpowiedzi („push past them into the awkward middle"). Twardy warunek: gałęzie **nie mogą** widzieć swoich wyników — jeśli je zserializujesz, metoda degeneruje się do „jednej szerszej myśli".

**Faza 2 — konwergencja (krytyk włączony).** Osobny przebieg: punktacja każdego pomysłu w trzech osiach 0–10 (nowość, wykonalność, dopasowanie), oznaczenie **pułapek** (rzeczy atrakcyjnych, ale z ukrytym kosztem) jednolinijkowym uzasadnieniem, klastrowanie po *kącie natarcia*, a nie po słowach kluczowych, i pogłębienie **top 3** wg wagi `nowość 0.35 + wykonalność 0.40 + dopasowanie 0.25`. Każdy pogłębiony pomysł dostaje szkic działania, nośne ryzyko, pierwszy konkretny krok i 3–5 pomysłów potomnych.

**15 ram poznawczych** do wyboru (bierze się 5 na przebieg, dla problemów kodowych 4 z tagiem `code`/`design` + 1 `wild`): inżynier hardware'u, regulator, 10-latek, konkurent próbujący to zepsuć, biologia, logistyka, game design, rynki, inwersja („jak zagwarantować NIE-X"), `$0 i godzina`, `nieskończony budżet i 10 lat`, usuń nośne założenie, speedrunner, kolonia mrówek, on-call o 3 w nocy.

## Co jest w repozytorium

| Ścieżka | Co to |
|---|---|
| `skills/adhd/SKILL.md` | Cały skill — 215 linii instrukcji, zero zależności. To jest realny produkt. |
| `src/` | Implementacja TS/Node tej samej pętli na Claude Agent SDK + CLI (`adhd-agent`). |
| `documentation/` | `frames.md` (ramy), `how-it-works.md`, `evals.md` (metodyka), `install.md`. |
| `bench/results.json` | Transkrypty porównań baseline vs ADHD. |
| `SOURCE-SPEC.md` | Oryginalna specyfikacja prozą, z której skill został zoperacjonalizowany. |

## Jak się instaluje

```bash
npx skills add UditAkhourii/adhd        # autodetekcja agenta (Claude Code, Cursor, Codex, ...)
```

Warianty:
- **CLI/batch, poza Claude Code:** `npm install -g adhd-agent`, potem `adhd "design a rate limiter"`.
- **Biblioteka:** `npm install adhd-agent`.
- **Ręcznie, bez instalatora:** skopiować `skills/adhd/SKILL.md` do `~/.claude/skills/adhd/SKILL.md` (globalnie) albo `.claude/skills/adhd/SKILL.md` (w projekcie). Skill nie ma żadnych zależności — to jeden plik markdown.

## Jak się go używa

- **Jawnie:** `/adhd "jak powinniśmy rozliczać wysyłkę gabarytów?"`. Jawne wywołanie **pomija bramkę wstępną** — autor zakłada, że jak prosisz, to wiesz, po co.
- **Automatycznie:** skill deklaruje trigger na intencje typu brainstorm/ideate oraz na otwarte decyzje projektowe, architekturę, nazewnictwo, kształt API i „mgliste" debugowanie bez znanej przyczyny.
- **Bramka wstępna** (gdy nie wywołasz jawnie) zadaje trzy pytania i **przerywa**, jeśli którekolwiek wypada na nie: czy problem jest otwarty (czy istnieje jedna kanoniczna odpowiedź?), czy stawka jest wysoka, czy sformułowanie było otwarte. Słowa „szybko", „standardowo", „kanonicznie", „po prostu" **wyłączają** skill — to sygnał, że chcesz odpowiedzi wprost.

**Kształt wyjścia** jest częścią metody i nie wolno go zwijać w ścianę prozy:
1. **Brief** — problem w 1–2 liniach.
2. **Wide set** — cała pula pogrupowana w klastry, każdy pomysł z chipem punktacji `[N7 V8 F9]`.
3. **Converge** — shortlista 2–4 pozycji, nieoczywisty-ale-wykonalny wybór oznaczony ★, **pułapki wypisane osobno** z powodem.
4. **Focus** — 3 pogłębione gałęzie (szkic, nośne ryzyko, pierwszy krok, pomysły potomne).
5. **Provocation** — jedno dzikie pytanie na wypadek, gdyby nic nie trafiło.

## Koszt i kiedy tego NIE odpalać

Około **10 wywołań agenta** na przebieg (5 dywergencji + punktacja + klastrowanie + 3 pogłębienia), 30–90 s, **5–10× koszt zwykłej odpowiedzi**. Autor sam pisze: nie do każdego naciśnięcia klawisza. Nie odpalać na: składnię, wyszukanie faktu, buga ze znaną przyczyną, prośbę sformułowaną zamknięcie.

Zadeklarowane anty-wzorce (czyli jak to się psuje): dziesięć wariantów jednego pomysłu udające szerokość; sterta absurdów bez konwergencji; odmowa zajęcia stanowiska („oto 20 pomysłów, wybierz sam"); **udawanie równoległości** przez wypisanie gałęzi po kolei w jednym kontekście.

## Ocena — co z tego jest dowiedzione, a co nie

- **Dowody są autorskie i wąskie.** Deklarowane wyniki (breadth 9.00 vs 4.83, novelty 7.83 vs 2.67, wykrywanie pułapek 9.50 vs 1.83) pochodzą z 6 problemów ocenianych przez sędziego-LLM, w benchmarku autora. Jest też niezależny przegląd badawczy (projekt `han`, 11 źródeł), którego wnioski autor prowadzi jako otwarte issues #16–#18. Traktować jako **obiecujące, nie udowodnione**.
- **Mechanizm jest sensowny niezależnie od liczb.** Izolacja kontekstu przy generowaniu i osobny przebieg krytyka to dokładnie ten sam wzorzec, który u nas działa w recenzjach: świeży subagent bez historii sesji łapie rzeczy, których autor kodu nie widzi. Ta sesja jest tego dowodem — recenzent gałęzi wychwycił, że `createCollection` wstawia `sort_order = 0`, czego nie widział ani plan, ani implementer.
- **Ryzyko operacyjne:** `npx skills add` ciągnie z gałęzi `main` autora, więc zmiany w skillu wjeżdżają cicho przy kolejnych instalacjach. Skill to instrukcje, które agent wykonuje — instalacja jest aktem zaufania. Jeśli chcemy stabilności, lepiej wkleić `SKILL.md` na sztywno do repo i zaktualizować świadomie.
- **Nakładka na to, co już mamy:** `superpowers:brainstorming` prowadzi rozmowę do specyfikacji (jeden wątek, sekwencyjnie). ADHD nie zastępuje go — wchodziłby **przed** nim, na etapie „jak to w ogóle ugryźć". W tym projekcie realne kandydatury: droga do faktur KSeF (program fakturowy vs integracja), model kosztu i logistyki gabarytów, UX panelu dla nietechnicznej osoby, nazewnictwo/pozycjonowanie kolekcji.
- **Czego nie robi:** nie weryfikuje niczego. To generator hipotez z krytykiem stylistycznym, nie bramka jakości — pułapki oznacza model, nie testy.

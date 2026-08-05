# ss-mood-player

Player plików **XMI** (XMIDI, format Miles/AIL) z przełączaniem wariantu muzycznego w trakcie
odtwarzania — inspirowany silnikiem muzyki dynamicznej System Shocka 1 z portu
[Shockolate](https://github.com/Interrupt/systemshock).

XMI to nie MIDI: zdarzenie note-on niesie **czas trwania** zamiast osobnego note-off, czas jest
kodowany „interval bytes", zegar jest stały (PPQN 60 + tempo 500 000 µs/qn = 120 ticków/s), a
przejścia między nastrojami opierają się na chunku `RBRN` i kontrolerze XMIDI 120
(*sequence branch index*). Parser jest więc częścią tego projektu, nie zależnością.

## Uruchomienie

```bash
npm run serve       # http://127.0.0.1:3000
```

Aplikacja w `app/src` **nie ma builda ani zależności runtime instalowanych przez npm** — biblioteki
są zwendorowane jako samodzielne moduły ESM w `app/src/libs/` i mapowane przez import map w
`index.html`. `npm install` w katalogu głównym dotyczy wyłącznie narzędzi deweloperskich
(Playwright, TypeScript do sprawdzania typów z JSDoc).

## Testy

```bash
npm test            # node --test: logika, architektura BCE
npm run typecheck   # tsc --checkJs na JSDoc, bez transpilacji
npm run test:e2e    # Playwright + Chromium: warstwa przeglądarkowa
```

## Architektura

Boundary–Control–Entity, jeden business component `player` (`app/src/player/`). Kierunek zależności
— boundary → control → entity — jest **wymuszony testem** (`tests/unit/architecture.test.js`):
`control/` i `entity/` nie mogą sięgać do `boundary/` ani do Web Audio. Dzięki temu parser,
scheduler i maszyna stanów wariantów działają pod `node --test`, bez przeglądarki.

Web Audio dotyka wyłącznie `player/boundary/AudioOut.js`. Syntezator (`spessasynth_core`) jest
sterowany nuta po nucie z naszego własnego timeline'u — nie dostaje pliku, bo żaden sekwencer MIDI
nie modeluje ani czasów trwania XMI, ani skoków po branch pointach.

## Dane

Pliki XMI **nie są** w repozytorium (prawa autorskie do danych System Shocka). Wrzuć własne do
`data/` — ten katalog jest w `.gitignore`. Testy automatyczne używają generowanych fikstur.

## Konwencje

Projekt stosuje zwendorowane skille [airails](https://github.com/AdamBien/airails) z
`.claude/skills/` (`web-components`, `web-conventions`, `javascript-conventions`, `bce`) oraz
`DESIGN.md`. Świadome odstępstwa:

- **Relatywne URL-e zamiast root-absolute.** Skill `web-components` wymaga `/style.css` itd. na
  potrzeby fallbacku `index.html` przy routingu. Ta aplikacja to jeden ekran bez routera, więc
  fallback nie występuje, a relatywne ścieżki są konieczne, by działała na GitHub Pages pod
  podkatalogiem `/ss-mood-player/`.
- **Import w worklecie jest relatywny.** Import maps nie obowiązują w `AudioWorkletGlobalScope`,
  więc `worklet/SynthProcessor.js` adresuje `../libs/spessasynth_core.js` ścieżką.
- **`node --test` obok Playwrighta.** Skill wymienia tylko testy e2e; parser binarny potrzebuje
  testów jednostkowych, a wbudowany runner Node nie dodaje żadnej zależności.
- **Brak `tokens.json`.** `web-conventions` zabrania formatu DTCG i uznaje CSS custom properties za
  źródło prawdy, więc tokeny żyją w `app/src/tokens.css`, a intencja projektowa w `DESIGN.md`.
- **Testy e2e tylko na Chromium.** Skill wymaga też Firefoksa i WebKita; w tym środowisku
  zainstalowany jest wyłącznie Chromium.
- **`npm run serve` wywołuje zws przez `java --source 25`** (zws jest jednoplikowym skryptem
  Javy 25). Serwer wypisuje `HeadlessException`, bo nie może otworzyć przeglądarki bez X11 — to
  kosmetyczne, pliki serwuje dalej.

## Status

M0: scaffold, zwendorowane biblioteki, plumbing audio (AudioWorklet + render offline w Node), CI.
Parser XMI, scheduler i przełączanie wariantów to kolejne kroki.

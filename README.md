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
npm test            # node --test: parser, timeline, transport, golden RMS, architektura BCE
npm run typecheck   # tsc --checkJs na JSDoc, bez transpilacji
npm run test:e2e    # Playwright + Chromium: worklet, bank, transport w przeglądarce
```

## Render offline (narzędzie debugowania)

```bash
npm run render -- data/THM1.XMI /tmp/out.wav --sequence 9
npm run render -- data/THM1.XMI /tmp/out.wav --sequence 9 --then 17   # przełączenie na granicy pętli
```

Wypisuje tabelę RMS w okienkach 100 ms i log transportu, więc słychać *i widać*, co się stało —
bez przeglądarki i bez karty dźwiękowej. Renderuje ~30× szybciej niż realtime i używa dokładnie
tego samego kodu (`timeline.js`, `transport.js`, `dispatch.js`, `render.js`) co worklet, więc jego
wynik jest dowodem na temat prawdziwej ścieżki odtwarzania. Bez `--soundfont` bierze bank z repo;
`--soundfont ""` nie jest obsługiwane, ale gdy plik nie istnieje, można wskazać własny.

## SoundFont

W repo jest **GeneralUser GS 2.0.3** w formacie SF3 (`app/src/assets/GeneralUserGS.sf3`,
8 423 728 B, sha256 `e2ed326f…`), autorstwa **S. Christiana Collinsa**. Licencja *GeneralUser GS
License v2.0* jest permisywna, zezwala na użycie komercyjne i modyfikacje, a autor **wprost prosi**,
by nie linkować do jego plików, lecz hostować własną kopię — dokładnie to robimy. Pełny tekst
licencji leży obok banku w `GeneralUserGS-LICENSE.txt`.

Kopia pochodzi z repozytorium SpessaSynth (konwersja SF2 → SF3 tego samego banku), dlatego jej
wewnętrzne pole `INAM` mówi „GeneralUser GS 2.0.3 BETA". Bank jest domyślny, nie jedyny — w UI
można wgrać własny SF2/SF3/DLS.

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

Co ustaliliśmy o `THM1.XMI` (CRC32 `e5732a74`, bit w bit plik z retailowego `SOUND/GENMIDI/`):
50 czterotaktowych modułów w siedmiu grupach tonalnych, numeracja programów **General MIDI**
(gra wozi jeden zestaw `THM*.XMI` plus `INI-MT.XMI` i `INI-SC.XMI` — różni się tylko
inicjalizacja urządzenia), kanał 9 to perkusja GM. Kolejności modułów w XMI nie ma — siedzi
w `SOUND/THM1.DAT` i `SOUND/THM1.BIN`.

Eksport do standardowego MIDI, gdy trzeba sprawdzić nuty w innym narzędziu:

```bash
node tools/export-midi.js data/THM1.XMI /tmp/seq9.mid --sequence 9
```

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

## Uwaga o zwendorowanym silniku

`spessasynth_core.js` to **jeden samowystarczalny plik ESM bez ani jednego importu** — dlatego
nadaje się do zwendorowania bez bundlera. Ma natomiast wkompilowany dekoder Vorbisa (stb_vorbis
jako WebAssembly w data-URI), potrzebny do banków SF3. Nic nie dociąga z sieci i działa tak samo
w Node i w AudioWorklecie, ale to znaczy, że **przed pierwszą nutą trzeba poczekać na
`processorInitialized`**: bank SF3 dekodowany przed gotowością dekodera daje ciszę i zapamiętuje ją
na stałe. Worklet kolejkuje żądanie odtwarzania, dopóki nie jest gotowy.

## Status

- **M0** — scaffold, zwendorowane biblioteki, plumbing audio, CI.
- **M1 / M1a** — parser XMI (kontener IFF, interval bytes, czasy trwania nut, `RBRN`, pętle
  `116`/`117`, tempo, nazwy, zaślepki), zweryfikowany na prawdziwym THM1.XMI.
- **M2** — timeline (note-offy z czasów trwania, tick→sample), transport (kwantyzacja zmiany
  wariantu do granicy pętli, event log), SoundFont, `tools/render.js`, golden testy na obwiedni
  RMS i **słyszalny dźwięk w przeglądarce**.

Dalej: silnik nastrojów w stylu `mlimbs` (M3), mikser warstw kanałów (M4), PWA i deploy (M5).

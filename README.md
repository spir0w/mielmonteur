# Miel Monteur bouwt auto's – op Windows 11 en in de browser

*Miel Monteur bouwt auto's* (Levande Böcker 1997, later Transposia) is een
Director 6-spel uit de tijd van Windows 95. Op een computer van nu start het
niet meer goed: 16-bits installatieprogramma, 256 kleuren, een cd die erin moet.

Deze repository maakt het spel weer speelbaar, **zonder het spel te
veranderen**: de originele bestanden draaien op [ScummVM](https://www.scummvm.org),
dat Macromedia Director nabootst, met

- de verbeteringen voor de Mulle Meck-spellen (het Zweedse origineel) uit
  [mellemuck](https://github.com/dankar89/mellemuck): ruim negentig
  reparaties aan ScummVM's Director-engine, opslaan per speler met
  automatisch opslaan, een pauzemenu en besturing met een controller;
- onze eigen toevoegingen: herkenning van álle Nederlandse uitgaven en een
  Nederlandstalig pauzemenu (zie [scummvm/patches](scummvm/patches/README.md));
- een **Windows-pakket** met een starter die het spel zelf zoekt (cd-rom, ISO,
  ZIP, geïnstalleerde versie) en
- een **browserversie** (WebAssembly) die je eigen spelbestanden in de browser
  bewaart.

## Het spel zelf zit er niet bij

De bestanden van het spel staan niet in deze repository en worden er ook niet
mee verspreid. Je hebt je eigen exemplaar nodig: de cd-rom (of een ISO/ZIP
ervan) of een geïnstalleerde versie.

Let op: *abandonware* is geen juridische status. Miel Monteur is nog van zijn
makers, en de Nederlandse uitgever Transposia verkocht de spellen ook als
download (rond de € 10). Gebruik dus een exemplaar dat van jou is.

## Spelen op Windows 10/11

1. Download **MielMonteur-Windows.zip**: bij een uitgave onder *Releases*, of
   bij de laatste geslaagde run onder *Actions → Bouwen → Artifacts*.
2. Pak de ZIP uit (bijvoorbeeld op het Bureaublad, niet in *Program Files*).
3. Dubbelklik op **Miel Monteur.bat**. Zegt Windows *"Windows heeft uw pc
   beschermd"*: *Meer informatie* → *Toch uitvoeren*.
4. De eerste keer zoekt de starter het spel: op de cd-rom, in een
   geïnstalleerde versie (Transposia, Levande), en naar ISO/ZIP-bestanden met
   "miel" of "monteur" in de naam in Downloads, Bureaublad en Documenten.
   Anders kies je zelf het ISO- of ZIP-bestand, of een bestand uit de map van
   het spel. Het spel wordt naar de map `spel` gekopieerd; daarna is de cd niet
   meer nodig.

Tijdens het spelen: **Esc** of **F5** opent het pauzemenu (verder spelen,
opslaan, laden, volledig scherm, stoppen), **Alt+Enter** schakelt volledig
scherm, **Ctrl+F5** opent het menu van ScummVM. Het spel slaat ook zelf op.
Meer in [windows/LEESMIJ.txt](windows/LEESMIJ.txt).

## Spelen in de browser

De browserversie is een statische website (de map `MielMonteur-Web` uit
*Actions* of de uitgave). Je kiest daarin je ISO, ZIP of map; de bestanden
blijven op je eigen computer, in de opslag van de browser (IndexedDB), en
worden nergens naartoe gestuurd. Opgeslagen spellen blijven ook in de browser.

Zo zet je hem online met GitHub Pages:

1. *Settings → Pages*: zet *Source* op **GitHub Actions**. (Voor een privé
   repository is daar een betaald GitHub-abonnement voor nodig; maak de
   repository anders openbaar – er staat geen spel in.)
2. *Settings → Secrets and variables → Actions → Variables*: maak
   `MIEL_PAGES` met de waarde `true`.
3. Bij de volgende push zet de workflow de site op
   `https://<gebruiker>.github.io/<repository>/`.

Het kan ook op elke andere webserver die gewone bestanden serveert (het
`.wasm`-bestand moet als `application/wasm` komen). Direct openen vanaf de
schijf (`file://`) werkt niet; daar is het Windows-pakket voor.

## Welke versies

| Versie | Herkend door | Status |
|---|---|---|
| *Mulle Meck bygger bilar* (Zweeds, Windows) | ScummVM's lijst | Helemaal speelbaar (getest door mellemuck) |
| *Miel Monteur bouwt auto's* (Levande Böcker, 1997) | onze herkenning aan de bestanden | Zelfde spel en indeling als het Zweedse; verwacht speelbaar |
| *Miel Monteur – De mafste auto's bouw je zelf!* (Transposia, 2001) en de download | ScummVM's lijst (`Start.exe`) of onze herkenning | Herkend; nog niet met de echte bestanden getest |
| Duitse, Noorse en andere versies van het autospel | ScummVM's lijst of onze herkenning | Zoals de Zweedse |

De andere Miel Monteur-spellen (boten, vliegtuigen, huizen, ruimte) zitten in
mellemuck's verbeteringen voor zover die werken (boten, huizen), maar de
starter en de webpagina zijn voor het autospel gemaakt.

Dit is gebouwd en getest zonder de echte Nederlandse spelbestanden (de tests
gebruiken lege bestanden met de juiste namen). Werkt jouw versie niet, kijk
dan in `%APPDATA%\ScummVM\Logs\scummvm.log` en open een issue met wat erin
staat en welke versie je hebt (de bestandsnamen op de cd helpen).

## Hoe het werkt

```
scummvm/versie.env          de ScummVM-commit waar alles op gebouwd wordt
scummvm/patches/            0001 mellemuck, 0002 onze Miel Monteur-aanpassingen
scripts/fetch-scummvm.sh    ScummVM ophalen en de patches toepassen
scripts/build-windows.sh    scummvm.exe met MinGW (alleen de Director-engine) + het pakket
scripts/build-mingw-deps.sh SDL2, zlib, libpng en FreeType voor Windows (met SHA-256-controle)
scripts/build-web.sh        ScummVM naar WebAssembly met Emscripten + onze pagina
windows/                    de starter (Miel Monteur.bat → start-miel.ps1) en LEESMIJ.txt
web/                        de webpagina: importeren.js leest ISO/ZIP/map, miel.js de rest
data/fonts/                 lettertypes voor het pauzemenu en Director (OFL)
tests/                      tests (zie hieronder)
.github/workflows/          bouwen en testen bij elke push; een uitgave bij een tag v*
```

Het spel wordt herkend aan de bestanden die elke uitgave van het autospel
heeft, in de map `MOVIES` van de cd: `00.CXT`, `CDDATA.CXT` (de gedeelde
onderdelen), `03.DXR` (de garage), `05.DXR` (de kaart) en `94.DXR` (de
autoshow). De ScummVM-patch, de Windows-starter en de webpagina kijken alle
drie naar dezelfde bestanden.

## Zelf bouwen

Op Linux (of WSL) met Ubuntu 24.04:

```sh
sudo apt install mingw-w64 pkg-config git curl xz-utils zip
scripts/build-windows.sh          # → dist/MielMonteur/
scripts/build-web.sh              # → dist/web/ (haalt Emscripten zelf op)
```

## Tests

```sh
node --test tests/importeren.test.mjs   # ISO (Joliet, ISO 9660, BIN), ZIP, ISO-in-ZIP, map
node --test tests/webpagina.test.mjs    # de pagina in Chromium (Playwright) met een nagebootste ScummVM
pwsh tests/start-miel.tests.ps1         # het zoeken van het spel door de starter
```

In GitHub Actions draait daarnaast `tests/windows-pakket.tests.ps1` op een
Windows-machine met Windows PowerShell 5.1: de starter haalt een nep-spel uit
een ZIP en `scummvm.exe` moet het als *Miel Monteur bouwt auto's* herkennen.

## Licenties

- ScummVM, de patches en alles in deze repository: GPL 3.0 ([LICENSE](LICENSE)).
- Fredoka en Liberation (lettertypes): SIL Open Font License, zie `data/fonts/`.
- SDL2 (zlib), FreeType (FTL), libpng en zlib: licenties in het Windows-pakket.
- *Miel Monteur* / *Mulle Meck* en de spelbestanden zijn van hun makers en
  vallen hier niet onder. Dit is een hobbyproject zonder band met de makers of
  uitgevers.

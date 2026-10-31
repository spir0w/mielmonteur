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

1. Download **MielMonteur-Windows**: onder *Actions → Bouwen* → de laatste
   geslaagde run → *Artifacts* (of bij een uitgave onder *Releases*).
2. Pak de ZIP uit (bijvoorbeeld op het Bureaublad, niet in *Program Files*);
   er staat een map `MielMonteur` in.
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

De browserversie is een statische website (het artifact `MielMonteur-Web`
uit *Actions*, of de uitgave). Je kiest daarin je ISO, ZIP of map; de bestanden
blijven op je eigen computer, in de opslag van de browser (IndexedDB), en
worden nergens naartoe gestuurd. Opgeslagen spellen blijven ook in de browser.

Zo zet je hem online met GitHub Pages:

1. Maak de repository openbaar (*Settings → General → Danger Zone → Change
   repository visibility*); er staat geen spel in. Pages voor een privé
   repository kan alleen met een betaald GitHub-abonnement.
2. *Settings → Pages*: zet *Source* op **GitHub Actions**.
3. Bij de volgende push naar de standaardbranch zet de workflow de site op
   `https://<gebruiker>.github.io/<repository>/` (of start *Actions → Bouwen →
   Run workflow*). Staat Pages uit, dan slaat de workflow dit stilletjes over.

Het kan ook op elke andere webserver die gewone bestanden serveert (het
`.wasm`-bestand moet als `application/wasm` komen). Direct openen vanaf de
schijf (`file://`) werkt niet; daar is het Windows-pakket voor.

### Op een telefoon of tablet

Dat werkt ook, liggend het best. Kies daar het ISO- of ZIP-bestand (een map
kiezen kan op telefoons niet). Tikken op het spel is klikken, en slepen sleept
met de muisknop ingedrukt, dus je kunt onderdelen gewoon naar de auto slepen.
Over het spel staan knoppen voor wat anders een toetsenbord vraagt:

- **pijltjes** om te rijden,
- **Pauze** (Esc, het pauzemenu met opslaan en laden) en **Enter**,
- **⌨** voor het schermtoetsenbord (je naam typen bij het begin) en **⛶**
  voor volledig scherm.

Met **⚙** linksboven zet je elke groep aan of uit, maak je ze groter of
kleiner, en sleep je ze naar een andere plek ("Knoppen verplaatsen"). Dat wordt
onthouden. Op een computer staan de knoppen standaard uit; ook daar zet je ze
met ⚙ aan.

Het spel en de opgeslagen spellen staan in de opslag van de browser; op een
telefoon is dat zo'n 150 tot 350 MB.

## Welke versies

| Versie | Herkend door | Status |
|---|---|---|
| *Mulle Meck bygger bilar* (Zweeds, Windows) | ScummVM's lijst | Helemaal speelbaar (getest door mellemuck) |
| *Miel Monteur bouwt auto's* (Levande Böcker, 1997) | onze herkenning aan de bestanden | Zelfde spel en indeling als het Zweedse; verwacht speelbaar |
| *Miel Monteur – De mafste auto's bouw je zelf!* (Transposia, 2001) en de download | ScummVM's lijst (`Start.exe`) of onze herkenning | Wordt herkend; met de echte bestanden nog niet geprobeerd |
| Duitse, Noorse en andere versies van het autospel | ScummVM's lijst of onze herkenning | Zoals de Zweedse |

De andere Miel Monteur-spellen (boten, vliegtuigen, huizen, ruimte) zitten in
mellemuck's verbeteringen voor zover die werken (boten, huizen), maar de
starter en de webpagina zijn voor het autospel gemaakt.

**Wat wel en niet getest is.** De echte Nederlandse spelbestanden waren bij het
maken niet beschikbaar. Getest is alles tot het moment dat het spel zelf
begint, met een nep-cd (lege bestanden met de juiste namen): de starter op
Windows, het inlezen van ISO/ZIP/map in de browser, en dat `scummvm.exe` op
Windows en ScummVM in de browser de nep-cd herkennen als *Miel Monteur bouwt
auto's* (Nederlands) en het Director 6-spel starten. Het spelen zelf rust op
mellemuck's werk aan de Zweedse versie, die hetzelfde spel is. Werkt jouw
versie niet, kijk dan in `%APPDATA%\ScummVM\Logs\scummvm.log` en open een
issue met wat erin staat en welke versie je hebt (de bestandsnamen op de cd
helpen).

## Hoe het werkt

```
scummvm/versie.env          de ScummVM-commit waar alles op gebouwd wordt
scummvm/patches/            0001 mellemuck, 0002 onze Miel Monteur-aanpassingen
scripts/fetch-scummvm.sh    ScummVM ophalen en de patches toepassen
scripts/build-windows.sh    scummvm.exe met MinGW (alleen de Director-engine) + het pakket
scripts/build-mingw-deps.sh SDL2, zlib, libpng en FreeType voor Windows (met SHA-256-controle)
scripts/build-web.sh        ScummVM naar WebAssembly met Emscripten + onze pagina
windows/                    de starter (Miel Monteur.bat → start-miel.ps1) en LEESMIJ.txt
web/                        de webpagina: importeren.js leest ISO/ZIP/map, bediening.js de
                            knoppen en het aanraken op telefoons, miel.js de rest
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
node --test tests/webpagina.test.mjs    # de pagina in Chromium (Playwright) met een nagebootste ScummVM,
                                        # ook als telefoon: tikken, slepen, knoppen, typen, verplaatsen
pwsh tests/start-miel.tests.ps1         # het zoeken van het spel door de starter
MIEL_WEB_SITE=dist/web node --test tests/webversie.test.mjs   # de gebouwde browserversie, echt
```

In GitHub Actions draait alles bij elke push, en daarnaast:

- `tests/windows-pakket.tests.ps1` op een Windows-machine met Windows
  PowerShell 5.1: de starter haalt een nep-cd uit een ZIP en de gebouwde
  `scummvm.exe` moet hem herkennen als *Miel Monteur bouwt auto's* (Nederlands);
- `tests/webversie.test.mjs` met de gebouwde browserversie in een submap
  (zoals op GitHub Pages): nep-cd inlezen via de pagina, Spelen, en de echte
  ScummVM in WebAssembly moet hem herkennen en het Director 6-spel starten; een
  tik op het scherm moet als muisklik en de Pauze-knop als toets bij SDL
  aankomen.

## Licenties

- ScummVM, de patches en alles in deze repository: GPL 3.0 ([LICENSE](LICENSE)).
- Fredoka en Liberation (lettertypes): SIL Open Font License, zie `data/fonts/`.
- SDL2 (zlib), FreeType (FTL), libpng en zlib: licenties in het Windows-pakket.
- *Miel Monteur* / *Mulle Meck* en de spelbestanden zijn van hun makers en
  vallen hier niet onder. Dit is een hobbyproject zonder band met de makers of
  uitgevers.

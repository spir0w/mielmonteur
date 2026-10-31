# Patches op ScummVM

`scripts/fetch-scummvm.sh` haalt ScummVM op de commit uit `../versie.env` en
past deze patches op volgorde toe.

## 0001-mulle-meck-fixes-mellemuck.patch

Ongewijzigd overgenomen uit [mellemuck](https://github.com/dankar89/mellemuck)
(`patches/scummvm-mulle.patch`, commit `8e21284f`), GPL 3.0 net als ScummVM.
Ruim negentig verbeteringen aan ScummVM's Director-engine waardoor de Mulle
Meck-spellen (Zweeds origineel van Miel Monteur) van begin tot eind speelbaar
zijn: Lingo-gedrag van Director 6, het slepen van onderdelen, rijden op de
kaart, geluid, opslaan per speler met automatisch opslaan, een pauzemenu, de
muisaanwijzer, besturing met een controller en optionele HD-plaatjes. Zie
[mellemuck's docs/scummvm.md](https://github.com/dankar89/mellemuck/blob/main/docs/scummvm.md)
voor elke wijziging en de reden.

## 0002-miel-monteur.patch

Onze toevoegingen voor de Nederlandse versies:

- **Herkenning van elke uitgave van het autospel** (`engines/director/detection.cpp`).
  ScummVM kent maar een paar uitgaven, aan de MD5 van hun programma; de
  Nederlandse cd's van Levande Böcker (1997) en Transposia (2001), de download
  en geïnstalleerde kopieën zitten daar niet bij. Als niets anders past,
  herkennen we het spel aan de films die elke uitgave heeft (`00.CXT`,
  `CDDATA.CXT`, `03.DXR`, `05.DXR` en `94.DXR`, tot drie mappen diep), kiezen
  we het beste Director-programma (de 32-bits Director 6-projector, bijvoorbeeld
  `DATA\MIEL32.EXE`) of, zonder programma, de intro (`10.DXR`), en leiden we de
  taal af uit de naam van het programma (Nederlands als er niets op staat).
  Zo krijgen ook deze versies alle verbeteringen uit 0001, die aan
  `garygadget1` hangen.
- **Het pauzemenu in het Nederlands** (`engines/director/game-menu.cpp`) als het
  spel Nederlands is (of het doel `language=nl` heeft); Zweeds blijft voor de
  andere versies.

# Sneeuw voor macOS ❄

Een kleine menubalk-app die het laat sneeuwen op je Mac:

- Sneeuwvlokken dwarrelen (met wind) over al je schermen.
- Sneeuw hoopt zich op boven op je vensters en onderaan het scherm, en glijdt langzaam over de randen.
- Verschuif een venster of maak het smaller, en de sneeuw die erop lag valt eraf (en landt op wat eronder ligt).
- Beweeg je muis door de sneeuw om er sneeuwballen van te rollen. Een rollende bal wordt vanzelf groter.
- Pak een sneeuwbal vast en gooi hem. Hard tegen een venster of de rand van het scherm? Dan spat hij uiteen.

## Downloaden

Elke push naar `sneeuw-mac/` laat GitHub Actions (op een Mac) de app bouwen. De `Sneeuw.dmg`
verschijnt bij **Releases** en als artifact bij de workflow-run *Sneeuw macOS-app*.

## Zelf bouwen

Op een Mac met Xcode of de Command Line Tools:

```bash
./sneeuw-mac/build.sh
```

Resultaat: `sneeuw-mac/build/Sneeuw.dmg`.

## Hoe het werkt

- `Sources/World.swift`: de simulatie. Posities van vensters komen uit `CGWindowListCopyWindowInfo`
  (geen extra toestemming nodig). Elk venster heeft een hoogtekaart van sneeuw in kolommen van 3 pt.
- `Sources/Overlay.swift`: een doorzichtig, niet-activerend paneel per scherm dat muisklikken doorlaat,
  behalve wanneer de muis boven een sneeuwbal staat (dan kun je hem pakken).
- `Sources/AppDelegate.swift`: menubalk-menu en de animatielus (60 fps, of 30 fps in zuinige modus).

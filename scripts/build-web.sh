#!/usr/bin/env bash
# Bouwt de browserversie: ScummVM (alleen de Director-engine, met onze patches)
# naar WebAssembly met Emscripten, met onze Nederlandse pagina eromheen.
#
#   scripts/build-web.sh [UITVOERMAP]     standaard: dist/web
#
# Nodig: git, python3, make, curl. Emscripten zelf wordt in build/ gezet.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/web}"
# Een eigen kopie van de bron: Emscripten bouwt in de bronmap zelf.
SRC="$ROOT/build/scummvm-web"
EMSDK_VERSION="${EMSDK_VERSION:-4.0.10}"

"$ROOT/scripts/fetch-scummvm.sh" "$SRC"

# ScummVM's eigen bouwscript zet Emscripten neer als die map ontbreekt; wij
# halen hem zelf op (git, met controle) zodat dat niet via wget zonder
# certificaatcontrole gaat. Buiten de bronmap, zodat hij bewaard blijft.
EMSDK_DIR="$ROOT/build/emsdk-$EMSDK_VERSION"
if [[ ! -d "$EMSDK_DIR" ]]; then
	git clone -q --depth 1 --branch "$EMSDK_VERSION" https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
fi
ln -sfn "$EMSDK_DIR" "$SRC/dists/emscripten/emsdk-$EMSDK_VERSION"

(
	cd "$SRC"
	./dists/emscripten/build.sh configure make dist \
		--disable-all-engines --enable-engine=director --disable-detection-full \
		--enable-release --disable-debug --disable-imgui \
		--disable-cloud --disable-libcurl --disable-sdlnet \
		--enable-freetype2 --enable-png --enable-zlib
)

rm -rf "$OUT"
cp -r "$SRC/build-emscripten" "$OUT"
# De lettertypes voor het pauzemenu en Director's Windows-lettertypes; ze
# komen via de data-map (HTTP) binnen, dus de index opnieuw maken.
cp "$ROOT"/data/fonts/*.ttf "$OUT/data/"
python3 "$SRC/dists/emscripten/build-make_http_index.py" "$OUT/data"

# Onze pagina: index.html laadt scummvm.js zelf, met de spelbestanden die de
# speler kiest (ze blijven in de browser, niets wordt geüpload).
cp "$ROOT"/web/index.html "$ROOT"/web/miel.css "$ROOT"/web/miel.js "$ROOT"/web/importeren.js "$OUT/"
# ScummVM's eigen testpagina niet: die gebruikt andere instellingen.
rm -f "$OUT/scummvm.html" "$OUT/manifest.json"
mkdir -p "$OUT/licenties"
cp "$ROOT/LICENSE" "$OUT/licenties/GPL-3.0.txt"
cp "$ROOT/data/fonts/Fredoka-OFL.txt" "$ROOT/data/fonts/Liberation-LICENSE.txt" "$OUT/licenties/"

echo "build-web: klaar: $OUT ($(du -sh "$OUT" | cut -f1))"

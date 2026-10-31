#!/usr/bin/env bash
# Bouwt het Windows-pakket: ScummVM (alleen de Director-engine, met onze
# patches) gecompileerd voor 64-bit Windows met MinGW, plus de starter.
#
#   scripts/build-windows.sh [UITVOERMAP]     standaard: dist/MielMonteur
#
# Nodig: mingw-w64, make, pkg-config, git, curl. Zie de README.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/MielMonteur}"
SRC="$ROOT/build/scummvm"
BUILD="$ROOT/build/scummvm-windows"
DEPS="$ROOT/build/mingw-deps"
HOST=x86_64-w64-mingw32

"$ROOT/scripts/fetch-scummvm.sh" "$SRC"
"$ROOT/scripts/build-mingw-deps.sh" "$DEPS"

mkdir -p "$BUILD"
if [[ ! -f "$BUILD/config.mk" || "$SRC/.miel-stamp" -nt "$BUILD/config.mk" ]]; then
	(
		cd "$BUILD"
		# Alleen onze eigen .pc-bestanden, niet die van het bouwsysteem zelf.
		PATH="$DEPS/bin:$PATH" PKG_CONFIG_LIBDIR="$DEPS/lib/pkgconfig" \
			"$SRC/configure" --host=$HOST \
				--disable-all-engines --enable-engine=director --disable-detection-full \
				--enable-release --disable-debug --disable-imgui \
				--disable-libcurl --disable-sdlnet --disable-cloud --disable-fluidsynth \
				--with-sdl-prefix="$DEPS" --with-zlib-prefix="$DEPS" \
				--with-png-prefix="$DEPS" --with-freetype2-prefix="$DEPS"
	)
fi

# Zonder ScummVM's Chinese/Japanse/Koreaanse lettertypes (38 MB, niet nodig).
# Paden van deze machine niet in de .exe (meldingen bevatten __FILE__).
CXX_MAP="$(sed -n 's/^CXX := //p' "$BUILD/config.mk") -ffile-prefix-map=$ROOT/="
make -C "$BUILD" -j"$(nproc)" CXX="$CXX_MAP" DIST_FILES_ENGINEDATA_BASE_BIG=

rm -rf "$OUT"
mkdir -p "$OUT/programma/data" "$OUT/programma/licenties"
$HOST-strip -o "$OUT/programma/scummvm.exe" "$BUILD/scummvm.exe"
cp "$DEPS/bin/SDL2.dll" "$OUT/programma/"

# scummvm.exe mag naast Windows zelf alleen SDL2.dll nodig hebben; MinGW's
# eigen runtime (libwinpthread, libstdc++, libgcc) moet erin zitten of mee.
for dll in $($HOST-objdump -p "$OUT/programma/scummvm.exe" | sed -n 's/^\s*DLL Name: //p'); do
	case "${dll,,}" in
	sdl2.dll|kernel32.dll|user32.dll|gdi32.dll|winmm.dll|shell32.dll|ole32.dll|oleaut32.dll|advapi32.dll|\
	comdlg32.dll|ws2_32.dll|msvcrt.dll|imm32.dll|version.dll|setupapi.dll|shlwapi.dll|uuid.dll|dinput8.dll|\
	comctl32.dll|uxtheme.dll|dwmapi.dll|winspool.drv|api-ms-win-*|ucrtbase.dll|bcrypt.dll|sapi.dll|dbghelp.dll)
		;;
	libwinpthread-1.dll|libstdc++-6.dll|libgcc_s_seh-1.dll)
		found=$($HOST-g++ -print-file-name="$dll")
		[[ -f "$found" ]] || found=$(find /usr/lib/gcc/$HOST /usr/$HOST -name "$dll" 2>/dev/null | head -1)
		[[ -f "$found" ]] || { echo "build-windows: $dll niet gevonden" >&2; exit 1; }
		cp "$found" "$OUT/programma/"
		;;
	*)
		echo "build-windows: scummvm.exe heeft een onverwachte DLL nodig: $dll" >&2
		exit 1
		;;
	esac
done

cp "$ROOT"/data/fonts/*.ttf "$OUT/programma/data/"
# Windows PowerShell 5.1 leest een script zonder BOM als ANSI: met BOM blijven
# de letters met accenten (geïnstalleerde, kopiëren) heel.
{ printf '\xEF\xBB\xBF'; cat "$ROOT/windows/start-miel.ps1"; } >"$OUT/programma/start-miel.ps1"
cp "$ROOT/windows/Miel Monteur.bat" "$ROOT/windows/Ander spel kiezen.bat" "$ROOT/windows/LEESMIJ.txt" "$OUT/"
# Windows-regeleinden voor wat in Kladblok en cmd.exe geopend wordt.
sed -i 's/\r\?$/\r/' "$OUT/Miel Monteur.bat" "$OUT/Ander spel kiezen.bat" "$OUT/LEESMIJ.txt" "$OUT/programma/start-miel.ps1"
# De broncode van wat er in scummvm.exe zit (GPL): de ScummVM-versie en onze patches.
mkdir -p "$OUT/programma/broncode"
cp "$ROOT/scummvm/versie.env" "$ROOT"/scummvm/patches/*.patch "$OUT/programma/broncode/"

cp "$ROOT/LICENSE" "$OUT/programma/licenties/ScummVM-en-Miel-Monteur-GPL-3.0.txt"
cp "$ROOT/data/fonts/Fredoka-OFL.txt" "$ROOT/data/fonts/Liberation-LICENSE.txt" "$OUT/programma/licenties/"
cp "$ROOT/build/mingw-deps-src/SDL2-"*/LICENSE.txt "$OUT/programma/licenties/SDL2-zlib.txt"
cp "$ROOT/build/mingw-deps-src/freetype-"*/docs/FTL.TXT "$OUT/programma/licenties/FreeType-FTL.txt"
cp "$ROOT/build/mingw-deps-src/libpng-"*/LICENSE "$OUT/programma/licenties/libpng.txt"
cp "$ROOT/build/mingw-deps-src/zlib-"*/LICENSE "$OUT/programma/licenties/zlib.txt"
sed -i 's/\r\?$/\r/' "$OUT"/programma/licenties/*.txt

echo "build-windows: klaar: $OUT ($(du -sh "$OUT" | cut -f1))"

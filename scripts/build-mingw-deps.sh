#!/usr/bin/env bash
# Bouwt de bibliotheken die scummvm.exe nodig heeft voor 64-bit Windows, met
# MinGW vanaf Linux: SDL2 (kant-en-klaar van libsdl.org), en zlib, libpng
# (HD-plaatjes) en FreeType (lettertypes van het pauzemenu en Director 7)
# als statische bibliotheken. Alle downloads worden op hun SHA-256 gecontroleerd.
#
#   scripts/build-mingw-deps.sh [PREFIX]     standaard: build/mingw-deps
#
# Nodig: mingw-w64 (x86_64-w64-mingw32-gcc), make, curl, tar, xz.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${1:-$ROOT/build/mingw-deps}"
WORK="$ROOT/build/mingw-deps-src"
HOST=x86_64-w64-mingw32
JOBS=$(nproc)

SDL_VERSION=2.32.10
SDL_URL="https://github.com/libsdl-org/SDL/releases/download/release-$SDL_VERSION/SDL2-devel-$SDL_VERSION-mingw.tar.gz"
SDL_SHA256=83a5d74012311edc3c0d40ea6faecbe57ad692aa033fa5dc273cc937e3938ff2

ZLIB=zlib-1.3.1
ZLIB_URL="https://github.com/madler/zlib/releases/download/v1.3.1/$ZLIB.tar.gz"
ZLIB_SHA256=9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23

# libpng en FreeType uit Ubuntu's archief: de originele bronpakketten (FreeType
# zonder de niet-vrije documentatie), op een vaste plek die niet verdwijnt.
PNG=libpng-1.6.43
PNG_URL="http://archive.ubuntu.com/ubuntu/pool/main/libp/libpng1.6/libpng1.6_1.6.43.orig.tar.gz"
PNG_SHA256=fecc95b46cf05e8e3fc8a414750e0ba5aad00d89e9fdf175e94ff041caf1a03a

FREETYPE=freetype-2.13.3
FREETYPE_URL="http://archive.ubuntu.com/ubuntu/pool/main/f/freetype/freetype_2.13.3+dfsg.orig.tar.xz"
FREETYPE_SHA256=686ec73cbf6783b245dd068a09ce807b729ac0f8a46dd70f7867923c32fdf4de

mkdir -p "$WORK" "$PREFIX"

# fetch BESTAND URL SHA256: downloaden (één keer) en controleren
fetch() {
	local file="$WORK/$1"
	[[ -f "$file" ]] || curl -fsSL --retry 3 -o "$file" "$2"
	if ! echo "$3  $file" | sha256sum -c --quiet -; then
		rm -f "$file"
		echo "build-mingw-deps: $1 heeft niet de verwachte SHA-256" >&2
		exit 1
	fi
}

if [[ ! -f "$PREFIX/bin/SDL2.dll" ]]; then
	fetch "SDL2-$SDL_VERSION.tar.gz" "$SDL_URL" "$SDL_SHA256"
	rm -rf "$WORK/SDL2-$SDL_VERSION"
	tar -xzf "$WORK/SDL2-$SDL_VERSION.tar.gz" -C "$WORK"
	cp -r "$WORK/SDL2-$SDL_VERSION/$HOST/." "$PREFIX/"
	# sdl2-config en sdl2.pc wijzen naar de bouwmachine van libsdl.org
	sed -i "s|^prefix=.*|prefix=$PREFIX|" "$PREFIX/bin/sdl2-config" "$PREFIX/lib/pkgconfig/sdl2.pc"
	echo "build-mingw-deps: SDL2 $SDL_VERSION"
fi

if [[ ! -f "$PREFIX/lib/libz.a" ]]; then
	fetch "$ZLIB.tar.gz" "$ZLIB_URL" "$ZLIB_SHA256"
	rm -rf "$WORK/$ZLIB"
	tar -xzf "$WORK/$ZLIB.tar.gz" -C "$WORK"
	(
		cd "$WORK/$ZLIB"
		make -f win32/Makefile.gcc PREFIX=$HOST- -j"$JOBS" libz.a >/dev/null
		make -f win32/Makefile.gcc install PREFIX=$HOST- SHARED_MODE=0 \
			INCLUDE_PATH="$PREFIX/include" LIBRARY_PATH="$PREFIX/lib" BINARY_PATH="$PREFIX/bin" >/dev/null
	)
	echo "build-mingw-deps: $ZLIB"
fi

if [[ ! -f "$PREFIX/lib/libpng.a" ]]; then
	fetch "$PNG.tar.gz" "$PNG_URL" "$PNG_SHA256"
	rm -rf "$WORK/$PNG"
	tar -xzf "$WORK/$PNG.tar.gz" -C "$WORK"
	(
		cd "$WORK/$PNG"
		CPPFLAGS="-I$PREFIX/include" LDFLAGS="-L$PREFIX/lib" \
			./configure --host=$HOST --prefix="$PREFIX" --enable-static --disable-shared >/dev/null
		make -j"$JOBS" >/dev/null
		make install >/dev/null
	)
	echo "build-mingw-deps: $PNG"
fi

if [[ ! -f "$PREFIX/lib/libfreetype.a" ]]; then
	fetch "$FREETYPE.tar.xz" "$FREETYPE_URL" "$FREETYPE_SHA256"
	rm -rf "$WORK/$FREETYPE"
	tar -xJf "$WORK/$FREETYPE.tar.xz" -C "$WORK"
	(
		cd "$WORK/$FREETYPE"
		ZLIB_CFLAGS="-I$PREFIX/include" ZLIB_LIBS="-L$PREFIX/lib -lz" \
			./configure --host=$HOST --prefix="$PREFIX" --enable-static --disable-shared \
				--with-zlib=yes --with-png=no --with-bzip2=no --with-brotli=no --with-harfbuzz=no >/dev/null
		make -j"$JOBS" >/dev/null
		make install >/dev/null
	)
	echo "build-mingw-deps: $FREETYPE"
fi

echo "build-mingw-deps: klaar in $PREFIX"

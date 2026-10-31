#!/usr/bin/env bash
# Haalt ScummVM op de vastgezette commit op en past onze patches toe.
#
#   scripts/fetch-scummvm.sh [MAP]     standaard: build/scummvm
#
# Een map die al op die commit staat met precies deze patches wordt
# hergebruikt; anders wordt hij opnieuw opgezet.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../scummvm/versie.env
source "$ROOT/scummvm/versie.env"
SRC="${1:-$ROOT/build/scummvm}"
PATCHES=("$ROOT"/scummvm/patches/*.patch)

stamp() {
	{
		echo "$SCUMMVM_COMMIT"
		sha256sum "${PATCHES[@]}" | cut -d' ' -f1
	} | sha256sum | cut -d' ' -f1
}

if [[ -f "$SRC/.miel-stamp" && "$(cat "$SRC/.miel-stamp")" == "$(stamp)" ]]; then
	echo "fetch-scummvm: $SRC is al bijgewerkt"
	exit 0
fi

rm -rf "$SRC"
mkdir -p "$SRC"
git -C "$SRC" init -q
git -C "$SRC" remote add origin "$SCUMMVM_REPO"
git -C "$SRC" fetch -q --depth 1 origin "$SCUMMVM_COMMIT"
git -C "$SRC" -c advice.detachedHead=false checkout -q FETCH_HEAD

for patch in "${PATCHES[@]}"; do
	echo "fetch-scummvm: $(basename "$patch")"
	git -C "$SRC" apply --whitespace=nowarn "$patch"
done

stamp >"$SRC/.miel-stamp"
echo "fetch-scummvm: ScummVM $SCUMMVM_COMMIT met ${#PATCHES[@]} patches in $SRC"

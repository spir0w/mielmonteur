# Tests voor het zoeken van het spel in windows/start-miel.ps1. Draait met
# PowerShell 7 op elk systeem (pwsh ./tests/start-miel.tests.ps1) en met
# Windows PowerShell 5.1. Alleen ASCII in dit bestand: 5.1 leest het als ANSI.
Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '../windows/start-miel.ps1')

$script:fouten = 0
function Assert-Gelijk($Verwacht, $Kreeg, [string]$Wat) {
	if ($Verwacht -ne $Kreeg) {
		Write-Host "FOUT: $Wat`n  verwacht: $Verwacht`n  kreeg:    $Kreeg"
		$script:fouten++
	} else {
		Write-Host "ok: $Wat"
	}
}

function New-NepSpel([string]$Map, [string[]]$Films = $Kenmerken, [string]$FilmMap = 'MOVIES') {
	New-Item -ItemType Directory -Force -Path (Join-Path $Map 'DATA') | Out-Null
	New-Item -ItemType Directory -Force -Path (Join-Path $Map $FilmMap) | Out-Null
	Set-Content -LiteralPath (Join-Path $Map 'DATA/MIEL32.EXE') -Value 'nep'
	foreach ($f in $Films) {
		Set-Content -LiteralPath (Join-Path (Join-Path $Map $FilmMap) $f) -Value 'nep'
	}
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("miel-test-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
	Assert-Gelijk 'CDDATA.CXT' (Get-KaleNaam 'cddata.cxt;1') 'ISO-versie ;1 eraf'
	Assert-Gelijk '03.DXR' (Get-KaleNaam '03.DXR.') 'punt aan het eind eraf'

	# De cd zelf: DATA\ en MOVIES\
	$cd = Join-Path $tmp 'cd'
	New-NepSpel $cd
	$cdVol = (Get-Item -LiteralPath $cd).FullName
	Assert-Gelijk $cdVol (Get-SpelWortel $cd) 'de cd zelf'
	Assert-Gelijk $cdVol (Get-SpelWortel (Join-Path $cd 'MOVIES')) 'de map MOVIES gekozen: de cd'
	Assert-Gelijk $cdVol (Get-SpelWortel $tmp) 'een map erboven: de cd daarin'

	# Kleine letters en ;1 (een ISO uitgepakt zonder Joliet)
	$klein = Join-Path $tmp 'klein'
	New-NepSpel $klein @('00.cxt;1', 'cddata.cxt;1', '03.dxr;1', '05.dxr;1', '94.dxr;1') 'movies'
	Assert-Gelijk (Get-Item -LiteralPath $klein).FullName (Get-SpelWortel $klein) 'kleine letters en ;1'

	# Alles in een map, zonder MOVIES\ (een geinstalleerde versie)
	$plat = Join-Path $tmp 'plat'
	New-Item -ItemType Directory -Path $plat | Out-Null
	foreach ($f in $Kenmerken) {
		Set-Content -LiteralPath (Join-Path $plat $f) -Value 'nep'
	}
	Assert-Gelijk (Get-Item -LiteralPath $plat).FullName (Get-SpelWortel $plat) 'alles in een map'

	# Een ander spel: de autoshow (94) ontbreekt
	$anders = Join-Path $tmp 'anders'
	New-NepSpel $anders @('00.CXT', 'CDDATA.CXT', '03.DXR', '05.DXR')
	Assert-Gelijk $null (Get-SpelWortel $anders) 'geen autospel'

	# Te diep
	$diep = Join-Path $tmp 'a/b/c/d'
	New-NepSpel $diep
	Assert-Gelijk $null (Find-FilmMap (Join-Path $tmp 'a')) 'meer dan drie mappen diep'
} finally {
	Remove-Item -LiteralPath $tmp -Recurse -Force
}

if ($script:fouten) {
	Write-Host "$($script:fouten) test(s) mislukt"
	exit 1
}
Write-Host 'Alle tests van de starter geslaagd'

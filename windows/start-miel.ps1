<#
	Start "Miel Monteur bouwt auto's" met ScummVM.

	De eerste keer zoekt dit script het spel: de cd-rom in de computer, een
	geïnstalleerde versie, of een ISO- of ZIP-bestand in Downloads, op het
	Bureaublad of in Documenten. Vindt het niets, dan vraagt het waar het spel
	staat. Het spel wordt gekopieerd naar de map "spel" naast dit pakket, zodat
	de cd daarna niet meer nodig is.

	  Miel Monteur.bat              spelen
	  Miel Monteur.bat -Opnieuw     een ander exemplaar van het spel kiezen
	  Miel Monteur.bat -Bron PAD    het spel van PAD nemen (ISO, ZIP of map)
#>
param(
	[switch]$Opnieuw,
	[string]$Bron,
	# Voor de tests: alles klaarzetten, maar ScummVM niet starten.
	[switch]$NietStarten
)

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'

$Programma = $PSScriptRoot
$Pakket = Split-Path -Parent $Programma
$SpelMap = Join-Path $Pakket 'spel'
$OpslagMap = Join-Path $Pakket 'opgeslagen'
$Instellingen = Join-Path $Programma 'scummvm.ini'

# Bestanden die elke uitgave van het autospel heeft, in welke taal ook (de
# herkenning in onze ScummVM kijkt naar dezelfde bestanden).
$Kenmerken = @('00.CXT', 'CDDATA.CXT', '03.DXR', '05.DXR', '94.DXR')

# Een bestandsnaam zoals hij op de cd staat: kopieën van een ISO hebben soms
# nog ";1" en een punt aan het eind.
function Get-KaleNaam([string]$Naam) {
	$i = $Naam.LastIndexOf(';')
	if ($i -ge 0) {
		$Naam = $Naam.Substring(0, $i)
	}
	return $Naam.TrimEnd('.').ToUpperInvariant()
}

# De map met de films van het spel (00.CXT, CDDATA.CXT, ...) in of onder $Map,
# hoogstens $Diepte mappen diep; $null als die er niet is.
function Find-FilmMap([string]$Map, [int]$Diepte = 3) {
	if (-not (Test-Path -LiteralPath $Map -PathType Container)) {
		return $null
	}
	$namen = @(Get-ChildItem -LiteralPath $Map -Force -ErrorAction SilentlyContinue |
		Where-Object { -not $_.PSIsContainer } | ForEach-Object { Get-KaleNaam $_.Name })
	$alles = $true
	foreach ($k in $Kenmerken) {
		if ($namen -notcontains $k) {
			$alles = $false
			break
		}
	}
	if ($alles) {
		return (Get-Item -LiteralPath $Map -Force).FullName
	}
	if ($Diepte -le 1) {
		return $null
	}
	foreach ($sub in @(Get-ChildItem -LiteralPath $Map -Force -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer })) {
		$gevonden = Find-FilmMap $sub.FullName ($Diepte - 1)
		if ($gevonden) {
			return $gevonden
		}
	}
	return $null
}

# De map van het spel zoals ScummVM hem wil: de cd zelf, met DATA\ (het
# programma) en MOVIES\ (de films) erin. $null als $Map het spel niet bevat.
function Get-SpelWortel([string]$Map) {
	$films = Find-FilmMap $Map
	if (-not $films) {
		return $null
	}
	$films = $films.TrimEnd('\', '/')
	$ouder = Split-Path -Parent $films
	if ($ouder -and ((Split-Path -Leaf $films) -ieq 'MOVIES' -or (Test-Path -LiteralPath (Join-Path $ouder 'DATA') -PathType Container))) {
		return $ouder
	}
	return $films
}

function Test-SpelKlaar {
	return [bool](Find-FilmMap $SpelMap)
}

# Zoekt zonder te vragen: cd-rom's, geïnstalleerde versies, en ISO- en
# ZIP-bestanden met "miel" of "monteur" in de naam.
function Find-SpelBronnen {
	$bronnen = New-Object System.Collections.ArrayList
	foreach ($station in [System.IO.DriveInfo]::GetDrives()) {
		if ($station.DriveType -eq 'CDRom' -and $station.IsReady) {
			if (Get-SpelWortel $station.RootDirectory.FullName) {
				[void]$bronnen.Add($station.RootDirectory.FullName)
			}
		}
	}
	$programmaMappen = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, ($env:SystemDrive + '\')) | Where-Object { $_ }
	foreach ($basis in $programmaMappen) {
		foreach ($naam in @('Transposia', 'Levande', 'Miel Monteur', 'MielMonteur')) {
			$map = Join-Path $basis $naam
			if ((Test-Path -LiteralPath $map -PathType Container) -and (Get-SpelWortel $map)) {
				[void]$bronnen.Add($map)
			}
		}
	}
	$gebruiker = [Environment]::GetFolderPath('UserProfile')
	foreach ($naam in @('Downloads', 'Desktop', 'Documents', 'Bureaublad', 'Documenten')) {
		$map = Join-Path $gebruiker $naam
		if (-not (Test-Path -LiteralPath $map -PathType Container)) {
			continue
		}
		Get-ChildItem -LiteralPath $map -Recurse -Depth 2 -Force -ErrorAction SilentlyContinue |
			Where-Object { -not $_.PSIsContainer -and $_.Extension -match '^\.(iso|zip)$' -and $_.Name -match 'miel|monteur' } |
			ForEach-Object { [void]$bronnen.Add($_.FullName) }
	}
	return @($bronnen | Select-Object -Unique)
}

function Show-Melding([string]$Tekst, [string]$Soort = 'Information') {
	if ($env:MIEL_TEST) {
		# Geen vensters in de tests: die zouden blijven wachten op een klik.
		Write-Host "[$Soort] $Tekst"
		return
	}
	Add-Type -AssemblyName System.Windows.Forms
	[void][System.Windows.Forms.MessageBox]::Show($Tekst, 'Miel Monteur', 'OK', $Soort)
}

function Ask-JaNee([string]$Tekst) {
	Add-Type -AssemblyName System.Windows.Forms
	return [System.Windows.Forms.MessageBox]::Show($Tekst, 'Miel Monteur', 'YesNo', 'Question') -eq 'Yes'
}

function Ask-SpelBron {
	Add-Type -AssemblyName System.Windows.Forms
	$dialoog = New-Object System.Windows.Forms.OpenFileDialog
	$dialoog.Title = 'Waar staat Miel Monteur? Kies het ISO- of ZIP-bestand, of een bestand uit de map van het spel'
	$dialoog.Filter = 'Miel Monteur (ISO, ZIP of een bestand van het spel)|*.iso;*.zip;*.exe;*.cxt;*.dxr|Alle bestanden|*.*'
	$dialoog.InitialDirectory = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
	if ($dialoog.ShowDialog() -ne 'OK') {
		return $null
	}
	return $dialoog.FileName
}

# Kopieert de map van het spel naar $SpelMap (robocopy: snel, en de
# alleen-lezen-vlag van de cd gaat eraf).
function Copy-Spel([string]$Wortel) {
	Write-Host "Het spel wordt gekopieerd van $Wortel ..."
	$tijdelijk = "$SpelMap.nieuw"
	if (Test-Path -LiteralPath $tijdelijk) {
		Remove-Item -LiteralPath $tijdelijk -Recurse -Force
	}
	# Een station (D:\) met de schuine streep, een map zonder: robocopy leest
	# "map\" tussen aanhalingstekens anders verkeerd.
	$van = if ($Wortel -match '^[A-Za-z]:\\?$') { $Wortel.Substring(0, 2) + '\' } else { $Wortel.TrimEnd('\') }
	& robocopy.exe $van $tijdelijk /E /A-:R /R:1 /W:1 /NFL /NDL /NJH /NP | Out-Host
	if ($LASTEXITCODE -ge 8) {
		throw "Het kopiëren van het spel is mislukt (robocopy $LASTEXITCODE)."
	}
	if (Test-Path -LiteralPath $SpelMap) {
		Remove-Item -LiteralPath $SpelMap -Recurse -Force
	}
	Rename-Item -LiteralPath $tijdelijk -NewName (Split-Path -Leaf $SpelMap)
}

# Pakt een ZIP of ISO uit in een tijdelijke map naast het pakket. tar.exe zit
# in Windows 10 en 11 en leest beide; Expand-Archive alleen ZIP.
function Expand-Bron([string]$Bestand) {
	$doel = Join-Path $Pakket 'spel.uitpakken'
	if (Test-Path -LiteralPath $doel) {
		Remove-Item -LiteralPath $doel -Recurse -Force
	}
	New-Item -ItemType Directory -Path $doel | Out-Null
	Write-Host "$Bestand wordt uitgepakt ..."
	$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
	$gelukt = $false
	if (Test-Path -LiteralPath $tar) {
		& $tar -xf $Bestand -C $doel 2>&1 | Out-Host
		$gelukt = $LASTEXITCODE -eq 0
	}
	if (-not $gelukt -and $Bestand -match '\.zip$') {
		Expand-Archive -LiteralPath $Bestand -DestinationPath $doel -Force
		$gelukt = $true
	}
	if (-not $gelukt) {
		throw "Kan $Bestand niet uitpakken."
	}
	return $doel
}

# Maakt van een ISO, ZIP, map of bestand in een map de spelmap. Geeft $true
# als het gelukt is.
function Import-Spel([string]$Pad) {
	$Pad = $Pad.Trim('"')
	if (Test-Path -LiteralPath $Pad -PathType Leaf) {
		if ($Pad -match '\.iso$') {
			return (Import-Iso $Pad)
		}
		if ($Pad -match '\.zip$') {
			$uitgepakt = Expand-Bron $Pad
			try {
				$wortel = Get-SpelWortel $uitgepakt
				if (-not $wortel) {
					# Een ZIP met een ISO erin, zoals sommige downloads
					$iso = Get-ChildItem -LiteralPath $uitgepakt -Recurse -Filter *.iso | Select-Object -First 1
					if ($iso) {
						return (Import-Iso $iso.FullName)
					}
					return $false
				}
				Copy-Spel $wortel
				return $true
			} finally {
				Remove-Item -LiteralPath $uitgepakt -Recurse -Force -ErrorAction SilentlyContinue
			}
		}
		# Een bestand uit de map van het spel
		$Pad = Split-Path -Parent $Pad
	}
	$wortel = Get-SpelWortel $Pad
	if (-not $wortel) {
		$ouder = Split-Path -Parent $Pad
		if ($ouder) {
			$wortel = Get-SpelWortel $ouder
		}
	}
	if (-not $wortel) {
		return $false
	}
	Copy-Spel $wortel
	return $true
}

# Een ISO koppelen zoals Verkenner dat doet, het spel kopiëren en weer
# ontkoppelen; lukt koppelen niet, dan uitpakken met tar.exe.
function Import-Iso([string]$Iso) {
	$iso = (Get-Item -LiteralPath $Iso).FullName
	$gekoppeld = $null
	try {
		$gekoppeld = Mount-DiskImage -ImagePath $iso -PassThru
		$letter = ($gekoppeld | Get-Volume).DriveLetter
		if ($letter) {
			$wortel = Get-SpelWortel "${letter}:\"
			if (-not $wortel) {
				return $false
			}
			Copy-Spel $wortel
			return $true
		}
	} catch {
		Write-Host "Koppelen lukte niet ($($_.Exception.Message)); de ISO wordt uitgepakt."
	} finally {
		if ($gekoppeld) {
			Dismount-DiskImage -ImagePath $iso | Out-Null
		}
	}
	$uitgepakt = Expand-Bron $iso
	try {
		$wortel = Get-SpelWortel $uitgepakt
		if (-not $wortel) {
			return $false
		}
		Copy-Spel $wortel
		return $true
	} finally {
		Remove-Item -LiteralPath $uitgepakt -Recurse -Force -ErrorAction SilentlyContinue
	}
}

function Write-Instellingen {
	New-Item -ItemType Directory -Force -Path $OpslagMap | Out-Null
	# ScummVM leest UTF-8 zonder BOM.
	$tekst = @"
[scummvm]
gui_language=nl_NL
enable_unsupported_game_warning=false
autosave_period=30
savepath=$OpslagMap
extrapath=$(Join-Path $Programma 'data')
gfx_mode=opengl
stretch_mode=fit
scale_factor=2
filtering=false
confirm_exit=false

[mielmonteur]
description=Miel Monteur bouwt auto's
gameid=garygadget1
engineid=director
path=$SpelMap
language=nl
platform=windows
"@
	[System.IO.File]::WriteAllText($Instellingen, ($tekst -replace "`r?`n", "`r`n"), (New-Object System.Text.UTF8Encoding $false))
}

function Start-MielMonteur {
	# Bestanden uit een gedownloade ZIP zijn "van internet"; zo vraagt Windows
	# niet bij elk bestand opnieuw of het mag.
	Get-ChildItem -LiteralPath $Programma -Recurse -Force -ErrorAction SilentlyContinue |
		Where-Object { -not $_.PSIsContainer } | Unblock-File -ErrorAction SilentlyContinue

	if ($Opnieuw -and (Test-Path -LiteralPath $SpelMap)) {
		if (-not (Ask-JaNee "Het spel dat nu in de map 'spel' staat wordt vervangen. Opgeslagen spellen blijven bewaard. Doorgaan?")) {
			return
		}
	}

	if ($Bron) {
		if (-not (Import-Spel $Bron)) {
			throw "In $Bron staat geen Miel Monteur bouwt auto's."
		}
	} elseif ($Opnieuw -or -not (Test-SpelKlaar)) {
		$klaar = $false
		Write-Host 'Miel Monteur wordt gezocht ...'
		foreach ($kandidaat in (Find-SpelBronnen)) {
			if (Ask-JaNee "Miel Monteur gevonden:`n`n$kandidaat`n`nDit gebruiken?") {
				$klaar = Import-Spel $kandidaat
				if ($klaar) {
					break
				}
			}
		}
		while (-not $klaar) {
			$keuze = Ask-SpelBron
			if (-not $keuze) {
				Show-Melding "Zonder het spel kan Miel Monteur niet starten.`n`nLeg de cd-rom in de computer, of kies het ISO- of ZIP-bestand van het spel, of een bestand uit de map waarin het spel staat (bijvoorbeeld CDDATA.CXT)."
				return
			}
			$klaar = Import-Spel $keuze
			if (-not $klaar) {
				Show-Melding "Daar staat geen Miel Monteur bouwt auto's.`n`nKies het ISO- of ZIP-bestand van de cd, of een bestand uit de map waarin het spel staat." 'Warning'
			}
		}
	}

	if (-not (Test-Path -LiteralPath $Instellingen)) {
		Write-Instellingen
	}

	if ($NietStarten) {
		return
	}
	Write-Host 'Miel Monteur start ...'
	$scummvm = Join-Path $Programma 'scummvm.exe'
	Start-Process -FilePath $scummvm -WorkingDirectory $Programma -ArgumentList @("--config=`"$Instellingen`"", 'mielmonteur')
}

# Niet starten als een test dit script inleest (". .\start-miel.ps1").
if ($MyInvocation.InvocationName -ne '.') {
	try {
		Start-MielMonteur
	} catch {
		Show-Melding "Er ging iets mis:`n`n$($_.Exception.Message)" 'Error'
		exit 1
	}
}

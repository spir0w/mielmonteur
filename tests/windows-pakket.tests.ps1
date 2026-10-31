# Test van het Windows-pakket op Windows zelf (in de CI met Windows
# PowerShell 5.1): de starter haalt een spel uit een ZIP, en scummvm.exe
# herkent een map met de bestandsnamen van Miel Monteur als het autospel.
# Het spel zelf zit niet in de test: de bestanden zijn leeg, alleen de namen
# en de staart van het "programma" kloppen. Alleen ASCII in dit bestand.
param(
	[Parameter(Mandatory = $true)][string]$Pakket
)
Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
$env:MIEL_TEST = '1'

$Pakket = (Get-Item -LiteralPath $Pakket).FullName
$programma = Join-Path $Pakket 'programma'
$scummvm = Join-Path $programma 'scummvm.exe'
$fouten = 0
function Test-Waar([bool]$Ok, [string]$Wat) {
	if ($Ok) {
		Write-Host "ok: $Wat"
	} else {
		Write-Host "FOUT: $Wat"
		$script:fouten++
	}
}

# Een nep-cd: DATA\MIEL32.EXE met de staart van een Director 6-projector
# (de laatste 4 bytes wijzen naar "79JP", zoals PJ97 op schijf staat) en de
# films waaraan het autospel herkend wordt.
$werk = Join-Path $env:TEMP ('miel-pakket-' + [guid]::NewGuid())
$cd = Join-Path $werk 'cd'
New-Item -ItemType Directory -Force -Path (Join-Path $cd 'DATA'), (Join-Path $cd 'MOVIES') | Out-Null
$projector = New-Object byte[] 128
$projector[0] = 0x4D; $projector[1] = 0x5A
[System.Text.Encoding]::ASCII.GetBytes('79JP').CopyTo($projector, 64)
[System.BitConverter]::GetBytes([uint32]64).CopyTo($projector, 124)
[System.IO.File]::WriteAllBytes((Join-Path $cd 'DATA\MIEL32.EXE'), $projector)
foreach ($f in @('00.CXT', 'CDDATA.CXT', '03.DXR', '05.DXR', '94.DXR', '10.DXR')) {
	[System.IO.File]::WriteAllBytes((Join-Path $cd "MOVIES\$f"), (New-Object byte[] 16))
}
$zip = Join-Path $werk 'Miel Monteur cd.zip'
Compress-Archive -Path (Join-Path $cd '*') -DestinationPath $zip

# 1. De starter: spel uit de ZIP halen en de instellingen schrijven
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $programma 'start-miel.ps1') -Bron $zip -NietStarten
Test-Waar ($LASTEXITCODE -eq 0) "starter klaar (exit $LASTEXITCODE)"
Test-Waar (Test-Path (Join-Path $Pakket 'spel\MOVIES\CDDATA.CXT')) 'spel gekopieerd naar spel\MOVIES'
Test-Waar (Test-Path (Join-Path $Pakket 'spel\DATA\MIEL32.EXE')) 'programma gekopieerd naar spel\DATA'
Test-Waar (-not (Test-Path (Join-Path $Pakket 'spel.uitpakken'))) 'tijdelijke map opgeruimd'
$ini = Join-Path $programma 'scummvm.ini'
Test-Waar (Test-Path $ini) 'scummvm.ini geschreven'
if (Test-Path $ini) {
	$tekst = [System.IO.File]::ReadAllText($ini)
	Test-Waar ($tekst -match 'gameid=garygadget1') 'scummvm.ini: gameid=garygadget1'
	Test-Waar ($tekst.Contains('path=' + (Join-Path $Pakket 'spel'))) 'scummvm.ini: pad naar spel'
	$bytes = [System.IO.File]::ReadAllBytes($ini)
	Test-Waar (-not ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB)) 'scummvm.ini zonder BOM'
}

# 2. ScummVM: herkent hij de map als Miel Monteur? (--add schrijft wat hij vindt
# in een eigen ini en stopt dan)
$testIni = Join-Path $werk 'detectie.ini'
$argumenten = @("--config=`"$testIni`"", '--add', "--path=`"$(Join-Path $Pakket 'spel')`"")
$p = Start-Process -FilePath $scummvm -ArgumentList $argumenten -PassThru -WindowStyle Hidden
# Zonder de handle vast te pakken geeft Windows PowerShell geen ExitCode
$null = $p.Handle
if (-not $p.WaitForExit(120000)) {
	$p.Kill()
	Test-Waar $false 'scummvm.exe --add stopt binnen 2 minuten'
} else {
	Test-Waar ($p.ExitCode -eq 0) "scummvm.exe --add (exit $($p.ExitCode))"
}
if (Test-Path $testIni) {
	$tekst = [System.IO.File]::ReadAllText($testIni)
	Write-Host $tekst
	Test-Waar ($tekst -match '(?m)^gameid=garygadget1') 'ScummVM herkent het autospel (gameid=garygadget1)'
	Test-Waar ($tekst -match '(?m)^language=nl') 'ScummVM ziet een Nederlandse versie (language=nl)'
	Test-Waar ($tekst -match '(?m)^\[mielmonteur') 'doel heet mielmonteur'
} else {
	Test-Waar $false 'ScummVM schreef detectie.ini'
}
$log = Join-Path $env:APPDATA 'ScummVM\Logs\scummvm.log'
if (Test-Path $log) {
	Write-Host '--- scummvm.log ---'
	Get-Content $log -Tail 40 | Write-Host
}

Remove-Item -LiteralPath $werk -Recurse -Force -ErrorAction SilentlyContinue
if ($fouten) {
	Write-Host "$fouten test(s) mislukt"
	exit 1
}
Write-Host 'Windows-pakket: alle tests geslaagd'

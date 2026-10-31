@echo off
rem Start Miel Monteur bouwt auto's. De eerste keer zoekt dit het spel
rem (cd-rom, ISO of ZIP) en zet het in de map "spel".
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0programma\start-miel.ps1" %*
if errorlevel 1 pause

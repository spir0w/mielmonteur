@echo off
rem Kies een ander exemplaar van het spel (een andere cd, ISO of ZIP).
rem Opgeslagen spellen blijven bewaard.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0programma\start-miel.ps1" -Opnieuw
if errorlevel 1 pause

@echo off
REM Validate DynamicsActivities Infrastructure Bicep templates (Windows)

echo.
echo 🔍 Validating Bicep Templates...
echo.

setlocal enabledelayedexpansion
set VALID=1

REM Check main template
az bicep build --file Infrastructure\main.bicep >nul 2>&1
if !errorlevel! equ 0 (
  echo ✅ Infrastructure\main.bicep
) else (
  echo ❌ Infrastructure\main.bicep
  set VALID=0
)

REM Check modules
for %%M in (storage app-insights app-service-plan function-app) do (
  az bicep build --file "Infrastructure\modules\%%M.bicep" >nul 2>&1
  if !errorlevel! equ 0 (
    echo ✅ Infrastructure\modules\%%M.bicep
  ) else (
    echo ❌ Infrastructure\modules\%%M.bicep
    set VALID=0
  )
)

echo.
echo 📋 Validating Parameter Files...
echo.

REM Check parameter files (using PowerShell for JSON parsing)
for %%P in (dev prod) do (
  powershell -Command "try { [void](Get-Content 'Infrastructure\parameters.%%P.json' -Raw | ConvertFrom-Json); exit 0 } catch { exit 1 }" >nul 2>&1
  if !errorlevel! equ 0 (
    echo ✅ Infrastructure\parameters.%%P.json
  ) else (
    echo ❌ Infrastructure\parameters.%%P.json
    set VALID=0
  )
)

echo.

if !VALID! equ 1 (
  echo 🎉 All templates and parameters are valid!
  echo.
  echo 📚 Documentation:
  echo   - Infrastructure\README.md
  echo   - Infrastructure\QUICKSTART.md
  echo.
  echo 🚀 Ready to deploy!
  exit /b 0
) else (
  echo ❌ Validation failed. Please fix errors above.
  exit /b 1
)

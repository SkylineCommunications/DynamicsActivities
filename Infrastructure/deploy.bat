@echo off
REM Deploy DynamicsActivities notification system infrastructure (Windows)

setlocal enabledelayedexpansion

REM Configuration
set SUBSCRIPTION_ID=327a6575-94e4-4d02-bb5d-9a88d68f58b9
set LOCATION=%LOCATION:eastus=%
set ENVIRONMENT=%ENVIRONMENT:dev=%
set RESOURCE_GROUP=%RESOURCE_GROUP%
set NAME_PREFIX=%NAME_PREFIX:dmact=%

REM Check prerequisites
if "%RESOURCE_GROUP%"=="" (
  echo ERROR: RESOURCE_GROUP not set
  echo Usage: set RESOURCE_GROUP=my-rg ^&^& set ENVIRONMENT=dev ^&^& deploy.bat
  exit /b 1
)

echo [INFO] Setting subscription to %SUBSCRIPTION_ID%...
call az account set --subscription "%SUBSCRIPTION_ID%" || exit /b 1

REM Check if resource group exists
echo [INFO] Checking resource group...
call az group exists --name "%RESOURCE_GROUP%" >nul 2>&1
if errorlevel 1 (
  echo [INFO] Creating resource group %RESOURCE_GROUP% in %LOCATION%...
  call az group create --name "%RESOURCE_GROUP%" --location "%LOCATION%" || exit /b 1
)

REM Validate templates
echo [INFO] Validating Bicep templates...
call az deployment group validate ^
  --resource-group "%RESOURCE_GROUP%" ^
  --template-file Infrastructure\main.bicep ^
  --parameters Infrastructure\parameters.%ENVIRONMENT%.json || exit /b 1

REM Deploy infrastructure
echo [INFO] Deploying infrastructure to %ENVIRONMENT% environment...
for /f "tokens=*" %%a in ('powershell -Command "Get-Date -Format 'yyyyMMddHHmmss'"') do set TIMESTAMP=%%a
set DEPLOYMENT_NAME=dmact-%ENVIRONMENT%-%TIMESTAMP%

call az deployment group create ^
  --resource-group "%RESOURCE_GROUP%" ^
  --template-file Infrastructure\main.bicep ^
  --parameters Infrastructure\parameters.%ENVIRONMENT%.json ^
  --name "%DEPLOYMENT_NAME%" || exit /b 1

REM Get outputs
echo [INFO] Retrieving deployment outputs...
for /f "tokens=*" %%a in ('az deployment group show --resource-group "%RESOURCE_GROUP%" --name "%DEPLOYMENT_NAME%" --query "properties.outputs.functionAppName.value" -o tsv') do set FUNCTION_APP_NAME=%%a
for /f "tokens=*" %%a in ('az deployment group show --resource-group "%RESOURCE_GROUP%" --name "%DEPLOYMENT_NAME%" --query "properties.outputs.functionAppUrl.value" -o tsv') do set FUNCTION_APP_URL=%%a
for /f "tokens=*" %%a in ('az deployment group show --resource-group "%RESOURCE_GROUP%" --name "%DEPLOYMENT_NAME%" --query "properties.outputs.storageAccountName.value" -o tsv') do set STORAGE_ACCOUNT=%%a

echo.
echo [INFO] Deployment completed successfully!
echo [INFO] Function App: %FUNCTION_APP_NAME%
echo [INFO] Base URL: %FUNCTION_APP_URL%
echo [INFO] Storage Account: %STORAGE_ACCOUNT%
echo.
echo [INFO] Next steps:
echo  1. Deploy function code:
echo     cd functions
echo     func azure functionapp publish %FUNCTION_APP_NAME% --build remote --build-native-deps
echo.
echo  2. View deployment details:
echo     az deployment group show --resource-group %RESOURCE_GROUP% --name %DEPLOYMENT_NAME%
echo.
echo  3. Stream logs:
echo     func azure functionapp logstream %FUNCTION_APP_NAME%

#!/bin/bash
# Deploy DynamicsActivities notification system infrastructure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SUBSCRIPTION_ID="327a6575-94e4-4d02-bb5d-9a88d68f58b9"
LOCATION="${LOCATION:-eastus}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
RESOURCE_GROUP="${RESOURCE_GROUP:-}"
NAME_PREFIX="${NAME_PREFIX:-dmact}"

# Function to print colored output
print_status() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Validate inputs
if [ -z "$RESOURCE_GROUP" ]; then
  print_error "RESOURCE_GROUP not set"
  echo "Usage: RESOURCE_GROUP=my-rg ENVIRONMENT=dev ./deploy.sh"
  exit 1
fi

# Check prerequisites
print_status "Checking prerequisites..."
command -v az >/dev/null 2>&1 || { print_error "Azure CLI not found"; exit 1; }

# Set subscription
print_status "Setting subscription to $SUBSCRIPTION_ID..."
az account set --subscription "$SUBSCRIPTION_ID"

# Check if resource group exists
if ! az group exists --name "$RESOURCE_GROUP" &>/dev/null; then
  print_status "Creating resource group $RESOURCE_GROUP in $LOCATION..."
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
fi

# Validate templates
print_status "Validating Bicep templates..."
az deployment group validate \
  --resource-group "$RESOURCE_GROUP" \
  --template-file Infrastructure/main.bicep \
  --parameters Infrastructure/parameters.${ENVIRONMENT}.json

# Deploy infrastructure
print_status "Deploying infrastructure to $ENVIRONMENT environment..."
DEPLOYMENT_NAME="dmact-${ENVIRONMENT}-$(date +%s)"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file Infrastructure/main.bicep \
  --parameters Infrastructure/parameters.${ENVIRONMENT}.json \
  --name "$DEPLOYMENT_NAME"

# Get outputs
print_status "Retrieving deployment outputs..."
OUTPUTS=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query properties.outputs)

FUNCTION_APP_NAME=$(echo "$OUTPUTS" | jq -r '.functionAppName.value')
FUNCTION_APP_URL=$(echo "$OUTPUTS" | jq -r '.functionAppUrl.value')
STORAGE_ACCOUNT=$(echo "$OUTPUTS" | jq -r '.storageAccountName.value')

print_status "Deployment completed successfully!"
print_status "Function App: $FUNCTION_APP_NAME"
print_status "Base URL: $FUNCTION_APP_URL"
print_status "Storage Account: $STORAGE_ACCOUNT"

# Next steps
echo ""
print_status "Next steps:"
echo "1. Deploy function code:"
echo "   cd functions"
echo "   func azure functionapp publish $FUNCTION_APP_NAME --build remote --build-native-deps"
echo ""
echo "2. View deployment details:"
echo "   az deployment group show --resource-group $RESOURCE_GROUP --name $DEPLOYMENT_NAME"
echo ""
echo "3. Stream logs:"
echo "   func azure functionapp logstream $FUNCTION_APP_NAME"

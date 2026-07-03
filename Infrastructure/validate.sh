#!/bin/bash
# Validate DynamicsActivities Infrastructure Bicep templates

echo "🔍 Validating Bicep Templates..."
echo ""

VALID=true

# Check main template
if az bicep build --file Infrastructure/main.bicep &>/dev/null; then
  echo "✅ Infrastructure/main.bicep"
else
  echo "❌ Infrastructure/main.bicep"
  VALID=false
fi

# Check modules
for module in storage app-insights app-service-plan function-app; do
  if az bicep build --file "Infrastructure/modules/${module}.bicep" &>/dev/null; then
    echo "✅ Infrastructure/modules/${module}.bicep"
  else
    echo "❌ Infrastructure/modules/${module}.bicep"
    VALID=false
  fi
done

echo ""
echo "📋 Validating Parameter Files..."
echo ""

# Check parameter files
for param in dev prod; do
  if jq empty "Infrastructure/parameters.${param}.json" 2>/dev/null; then
    echo "✅ Infrastructure/parameters.${param}.json"
  else
    echo "❌ Infrastructure/parameters.${param}.json"
    VALID=false
  fi
done

echo ""

if [ "$VALID" = true ]; then
  echo "🎉 All templates and parameters are valid!"
  echo ""
  echo "📚 Documentation:"
  echo "  - Infrastructure/README.md"
  echo "  - Infrastructure/QUICKSTART.md"
  echo ""
  echo "🚀 Ready to deploy!"
  exit 0
else
  echo "❌ Validation failed. Please fix errors above."
  exit 1
fi

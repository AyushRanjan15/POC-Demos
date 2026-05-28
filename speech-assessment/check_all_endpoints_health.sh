#!/bin/bash
# Check health of ALL endpoints in a given environment and print a summary.
# Usage: ./check_all_endpoints_health.sh [dev|staging|prod]

REGION="us-west-2"
PROFILE="work"

# Normalise env arg: accept any case, convert to Title Case for the stack name
RAW_ENV=${1:-staging}
ENV=$(echo "$RAW_ENV" | tr '[:upper:]' '[:lower:]')
ENV_TITLE=$(echo "$ENV" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')

# All registered models/services (mirrors MODELS in models/models_config.py)
MODELS=(
    "als-intelligibility-mtpa"
    "als-naturalness-mtpa"
    "sylber-time"
    "whisperx"
    "huper-phoneme-pipeline"
)

STACK_NAME="SM-API-Endpoints-${ENV_TITLE}-ApplicationStack"
TMP_DIR=$(mktemp -d)

echo "========================================"
echo "  Endpoint Health Check — ${ENV_TITLE}"
echo "========================================"

# Fetch API URL from CloudFormation
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --profile "$PROFILE" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?contains(OutputKey,`ApiUrl`)].OutputValue | [0]' \
    --output text 2>/dev/null)

if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
    echo "❌  Could not retrieve API URL for stack: $STACK_NAME"
    rm -rf "$TMP_DIR"
    exit 1
fi

echo "Stack:   $STACK_NAME"
echo "API URL: $API_URL"
echo ""
echo "Checking ${#MODELS[@]} endpoints in parallel..."
echo ""

# ---------------------------------------------------------------------------
# check_model  — runs in background; writes one result line to $TMP_DIR/$model
# Format: model|http_code|status|ready|elapsed_s
# ---------------------------------------------------------------------------
check_model() {
    local model=$1
    local body_file="$TMP_DIR/${model}.body"
    local start

    start=$SECONDS

    local http_code
    http_code=$(curl -s \
        --max-time 15 \
        -o "$body_file" \
        -w "%{http_code}" \
        -X GET "$API_URL/$model/health" 2>/dev/null) || http_code="000"

    local elapsed=$(( SECONDS - start ))

    local status="unknown"
    local ready="false"
    if [ -f "$body_file" ] && [ -s "$body_file" ]; then
        status=$(python3 -c "
import sys, json
try:
    d = json.load(open('$body_file'))
    print(d.get('status', 'unknown'))
except Exception:
    print('parse_error')
" 2>/dev/null)
        ready=$(python3 -c "
import sys, json
try:
    d = json.load(open('$body_file'))
    print(str(d.get('ready', False)).lower())
except Exception:
    print('false')
" 2>/dev/null)
    fi

    echo "${model}|${http_code}|${status}|${ready}|${elapsed}" > "$TMP_DIR/$model"
}

# Launch all checks in parallel
for model in "${MODELS[@]}"; do
    check_model "$model" &
done
wait

# ---------------------------------------------------------------------------
# Print results table
# ---------------------------------------------------------------------------
printf "%-35s %-6s %-15s %-8s %s\n" "Model" "HTTP" "Status" "Ready" "Time"
printf "%-35s %-6s %-15s %-8s %s\n" "─────────────────────────────────────" "────" "───────────────" "────────" "────"

ready_count=0
warming_count=0
not_ready_count=0
error_count=0

for model in "${MODELS[@]}"; do
    result_file="$TMP_DIR/$model"

    if [ ! -f "$result_file" ]; then
        printf "❓ %-33s %s\n" "$model" "(no result)"
        error_count=$((error_count + 1))
        continue
    fi

    IFS='|' read -r _m http status ready elapsed < "$result_file"

    if [ "$ready" = "true" ]; then
        icon="✅"
        ready_count=$((ready_count + 1))
    elif [ "$status" = "warming_up" ]; then
        icon="⏳"
        warming_count=$((warming_count + 1))
    elif [ "$http" = "000" ]; then
        icon="🔌"
        error_count=$((error_count + 1))
    else
        icon="❌"
        not_ready_count=$((not_ready_count + 1))
    fi

    printf "%s %-33s %-6s %-15s %-8s %s\n" \
        "$icon" "$model" "$http" "$status" "$ready" "${elapsed}s"
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
total=${#MODELS[@]}
echo ""
echo "========================================"
echo "  Summary"
echo "========================================"
printf "  %-14s %d / %d\n" "✅  Ready:"      "$ready_count"    "$total"
printf "  %-14s %d / %d\n" "⏳  Warming up:" "$warming_count"  "$total"
printf "  %-14s %d / %d\n" "❌  Not ready:"  "$not_ready_count" "$total"
printf "  %-14s %d / %d\n" "🔌  Error:"      "$error_count"    "$total"
echo ""

rm -rf "$TMP_DIR"

if [ "$ready_count" -eq "$total" ]; then
    echo "✅  All ${total} endpoints are healthy."
    exit 0
elif [ "$ready_count" -gt 0 ]; then
    echo "⚠️   $ready_count of $total endpoints are ready. Check the table above."
    exit 1
else
    echo "❌  No endpoints are ready."
    exit 2
fi

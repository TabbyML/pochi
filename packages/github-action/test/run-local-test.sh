#!/bin/bash

# run-local-test.sh - Test Pochi GitHub Action locally with act
# Usage: ./run-local-test.sh [instruction] [options]

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
INSTRUCTION="${1:-I'm testing you in virtual env, don't do any gh update operation, just finish the task with attemptCompletion}"
DEBUG_MODE=false
WORKFLOW_FILE="packages/github-action/test/test-workflows/test-pochi-dev.yml"
EVENT_FILE="packages/github-action/test/act-event.json"
SECRETS_FILE="packages/github-action/test/act-secrets.env"

# Parse arguments
shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            DEBUG_MODE=true
            shift
            ;;
        --workflow)
            WORKFLOW_FILE="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Check if act is installed
if ! command -v act &> /dev/null; then
    echo -e "${RED}Error: 'act' is not installed${NC}"
    echo "Install it from: https://github.com/nektos/act"
    echo "  macOS: brew install act"
    echo "  Linux: curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash"
    exit 1
fi

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$PROJECT_ROOT"

# Create temporary event file with custom instruction
TMP_EVENT_FILE="/tmp/act-event-$$.json"
if [ -f "$EVENT_FILE" ]; then
    # Replace the instruction in the comment body
    jq --arg instruction "/pochi $INSTRUCTION" '.comment.body = $instruction' "$EVENT_FILE" > "$TMP_EVENT_FILE"
else
    echo -e "${RED}Error: Event file not found at $EVENT_FILE${NC}"
    exit 1
fi

# Create secrets file if it doesn't exist
if [ ! -f "$SECRETS_FILE" ]; then
    echo -e "${YELLOW}Creating secrets file at $SECRETS_FILE${NC}"
    cat > "$SECRETS_FILE" << EOF
# Secrets for local testing with act
# Copy this to act-secrets.env and fill in your values
POCHI_API_KEY=your-api-key-here
GITHUB_TOKEN=your-github-token-here
EOF
    echo -e "${YELLOW}Please edit $SECRETS_FILE with your API keys${NC}"
fi

# Prepare act command
ACT_CMD="act issue_comment"
ACT_CMD="$ACT_CMD -e $TMP_EVENT_FILE"
ACT_CMD="$ACT_CMD -W $WORKFLOW_FILE"

# Add architecture flag for Apple Silicon
if [[ "$(uname -m)" == "arm64" ]]; then
    ACT_CMD="$ACT_CMD --container-architecture linux/amd64"
fi

# Add secrets if file exists and has content
if [ -f "$SECRETS_FILE" ] && grep -q "POCHI_API_KEY=" "$SECRETS_FILE"; then
    ACT_CMD="$ACT_CMD --secret-file $SECRETS_FILE"
fi

# Add debug flag if enabled
if [ "$DEBUG_MODE" = true ]; then
    ACT_CMD="$ACT_CMD -v"
fi

# Note: Files are copied into container (not bind-mounted) for better compatibility

# Always set POCHI_DEV for local testing
ACT_CMD="$ACT_CMD --env POCHI_DEV=true"

# Display test configuration
echo -e "${GREEN}=== Pochi Local Test Configuration ===${NC}"
echo "Instruction: $INSTRUCTION"
echo "Workflow: $WORKFLOW_FILE"
echo "Debug Mode: $DEBUG_MODE"
echo ""
echo -e "${GREEN}Running act command:${NC}"
echo "$ACT_CMD"
echo ""

# Run act
echo -e "${GREEN}=== Starting Local Test ===${NC}"
eval $ACT_CMD

# Cleanup
rm -f "$TMP_EVENT_FILE"

echo -e "${GREEN}=== Test Complete ===${NC}"
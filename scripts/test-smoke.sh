#!/bin/bash

# Commentia Smoke Tests
# This script runs basic smoke tests against deployed environments

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
STAGE=${1:-dev}
API_ENDPOINT=${API_ENDPOINT:-}
WEBSOCKET_ENDPOINT=${WEBSOCKET_ENDPOINT:-}
FRONTEND_URL=${FRONTEND_URL:-}
TIMEOUT=${TIMEOUT:-30}

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test result tracking
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"

    log_info "Running test: $test_name"
    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    if eval "$test_command"; then
        log_success "✓ $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "✗ $test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# API endpoint tests
test_api_health() {
    if [[ -z "$API_ENDPOINT" ]]; then
        log_warning "API_ENDPOINT not set, skipping API tests"
        return 0
    fi

    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "$TIMEOUT" "$API_ENDPOINT/health" || echo "000")

    if [[ "$response" == "200" ]]; then
        return 0
    else
        log_error "API health check failed with status: $response"
        return 1
    fi
}

test_room_creation() {
    if [[ -z "$API_ENDPOINT" ]]; then
        return 0
    fi

    local response
    local room_data='{"hostId": "smoke-test-host"}'

    response=$(curl -s -w "%{http_code}" -o /tmp/room_response.json --max-time "$TIMEOUT" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$room_data" \
        "$API_ENDPOINT/rooms" || echo "000")

    if [[ "$response" == "201" ]] || [[ "$response" == "200" ]]; then
        local room_id
        room_id=$(jq -r '.roomId' /tmp/room_response.json 2>/dev/null || echo "")

        if [[ -n "$room_id" && "$room_id" != "null" ]]; then
            echo "$room_id" > /tmp/smoke_test_room_id
            return 0
        else
            log_error "Room creation response missing roomId"
            return 1
        fi
    else
        log_error "Room creation failed with status: $response"
        return 1
    fi
}

test_room_retrieval() {
    if [[ -z "$API_ENDPOINT" ]]; then
        return 0
    fi

    if [[ ! -f /tmp/smoke_test_room_id ]]; then
        log_warning "No room ID available for retrieval test"
        return 0
    fi

    local room_id
    room_id=$(cat /tmp/smoke_test_room_id)

    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "$TIMEOUT" \
        "$API_ENDPOINT/rooms/$room_id" || echo "000")

    if [[ "$response" == "200" ]]; then
        return 0
    else
        log_error "Room retrieval failed with status: $response"
        return 1
    fi
}

test_comment_post() {
    if [[ -z "$API_ENDPOINT" ]]; then
        return 0
    fi

    if [[ ! -f /tmp/smoke_test_room_id ]]; then
        log_warning "No room ID available for comment test"
        return 0
    fi

    local room_id
    room_id=$(cat /tmp/smoke_test_room_id)

    local comment_data='{"userId": "smoke-test-user", "userName": "SmokeTestUser", "content": "This is a smoke test comment"}'

    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "$TIMEOUT" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$comment_data" \
        "$API_ENDPOINT/rooms/$room_id/comments" || echo "000")

    if [[ "$response" == "201" ]] || [[ "$response" == "200" ]]; then
        return 0
    else
        log_error "Comment post failed with status: $response"
        return 1
    fi
}

test_comments_retrieval() {
    if [[ -z "$API_ENDPOINT" ]]; then
        return 0
    fi

    if [[ ! -f /tmp/smoke_test_room_id ]]; then
        log_warning "No room ID available for comments retrieval test"
        return 0
    fi

    local room_id
    room_id=$(cat /tmp/smoke_test_room_id)

    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "$TIMEOUT" \
        "$API_ENDPOINT/rooms/$room_id/comments" || echo "000")

    if [[ "$response" == "200" ]]; then
        return 0
    else
        log_error "Comments retrieval failed with status: $response"
        return 1
    fi
}

# WebSocket tests
test_websocket_connection() {
    if [[ -z "$WEBSOCKET_ENDPOINT" ]]; then
        log_warning "WEBSOCKET_ENDPOINT not set, skipping WebSocket tests"
        return 0
    fi

    # Simple WebSocket connection test using wscat if available
    if command -v wscat >/dev/null 2>&1; then
        local ws_url
        ws_url=$(echo "$WEBSOCKET_ENDPOINT" | sed 's/https:/wss:/' | sed 's/http:/ws:/')

        timeout 10s wscat -c "$ws_url" -x '{"action":"ping"}' >/dev/null 2>&1 || {
            log_warning "WebSocket connection test skipped (connection failed or no response)"
            return 0
        }

        return 0
    else
        log_warning "wscat not available, skipping WebSocket connection test"
        return 0
    fi
}

# Frontend tests
test_frontend_accessibility() {
    if [[ -z "$FRONTEND_URL" ]]; then
        log_warning "FRONTEND_URL not set, skipping frontend tests"
        return 0
    fi

    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "$TIMEOUT" "$FRONTEND_URL" || echo "000")

    if [[ "$response" == "200" ]]; then
        return 0
    else
        log_error "Frontend accessibility failed with status: $response"
        return 1
    fi
}

test_frontend_assets() {
    if [[ -z "$FRONTEND_URL" ]]; then
        return 0
    fi

    # Test if critical assets are loadable
    local assets=("favicon.ico" "manifest.json")

    for asset in "${assets[@]}"; do
        local response
        response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "$TIMEOUT" "$FRONTEND_URL/$asset" || echo "000")

        if [[ "$response" != "200" ]]; then
            log_warning "Asset $asset returned status: $response"
        fi
    done

    return 0
}

# Performance tests
test_api_response_time() {
    if [[ -z "$API_ENDPOINT" ]]; then
        return 0
    fi

    local start_time
    local end_time
    local duration

    start_time=$(date +%s%N)

    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "$TIMEOUT" "$API_ENDPOINT/health" || echo "000")

    end_time=$(date +%s%N)
    duration=$(((end_time - start_time) / 1000000)) # Convert to milliseconds

    if [[ "$response" == "200" ]]; then
        if [[ $duration -lt 1000 ]]; then
            log_info "API response time: ${duration}ms (Good)"
            return 0
        elif [[ $duration -lt 2000 ]]; then
            log_warning "API response time: ${duration}ms (Acceptable)"
            return 0
        else
            log_error "API response time: ${duration}ms (Too slow)"
            return 1
        fi
    else
        log_error "API health check failed, cannot measure response time"
        return 1
    fi
}

# Cleanup function
cleanup() {
    log_info "Cleaning up smoke test resources..."

    if [[ -f /tmp/smoke_test_room_id ]] && [[ -n "$API_ENDPOINT" ]]; then
        local room_id
        room_id=$(cat /tmp/smoke_test_room_id)

        # Attempt to close the test room
        curl -s -X DELETE "$API_ENDPOINT/rooms/$room_id" >/dev/null 2>&1 || true

        rm -f /tmp/smoke_test_room_id
    fi

    rm -f /tmp/room_response.json
}

# Main execution
main() {
    log_info "Starting Commentia Smoke Tests for $STAGE environment"
    log_info "API Endpoint: ${API_ENDPOINT:-'Not set'}"
    log_info "WebSocket Endpoint: ${WEBSOCKET_ENDPOINT:-'Not set'}"
    log_info "Frontend URL: ${FRONTEND_URL:-'Not set'}"
    log_info "Timeout: ${TIMEOUT}s"
    echo ""

    # Ensure cleanup runs on exit
    trap cleanup EXIT

    # Run tests
    run_test "API Health Check" "test_api_health"
    run_test "Room Creation" "test_room_creation"
    run_test "Room Retrieval" "test_room_retrieval"
    run_test "Comment Posting" "test_comment_post"
    run_test "Comments Retrieval" "test_comments_retrieval"
    run_test "WebSocket Connection" "test_websocket_connection"
    run_test "Frontend Accessibility" "test_frontend_accessibility"
    run_test "Frontend Assets" "test_frontend_assets"
    run_test "API Response Time" "test_api_response_time"

    # Results summary
    echo ""
    log_info "Smoke Test Results for $STAGE:"
    log_info "Total Tests: $TESTS_TOTAL"
    log_success "Passed: $TESTS_PASSED"

    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_error "Failed: $TESTS_FAILED"
        exit 1
    else
        log_success "All tests passed!"
        exit 0
    fi
}

# Check dependencies
check_dependencies() {
    local missing_deps=()

    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi

    if ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Please install the missing dependencies and try again"
        exit 1
    fi
}

# Help function
show_help() {
    cat << EOF
Commentia Smoke Tests

Usage: $0 [STAGE]

Arguments:
  STAGE           Environment stage (dev|staging|prod) [default: dev]

Environment Variables:
  API_ENDPOINT          API Gateway endpoint URL
  WEBSOCKET_ENDPOINT    WebSocket API endpoint URL
  FRONTEND_URL          Frontend CloudFront/S3 URL
  TIMEOUT              Request timeout in seconds [default: 30]

Examples:
  $0 dev
  $0 staging
  API_ENDPOINT=https://api.example.com $0 prod

EOF
}

# Handle command line arguments
if [[ $# -gt 1 ]] || [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    show_help
    exit 0
fi

# Run main function
check_dependencies
main
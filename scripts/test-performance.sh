#!/bin/bash

# Commentia Performance Tests
# This script runs performance tests against deployed environments

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
STAGE=${1:-staging}
API_ENDPOINT=${API_ENDPOINT:-}
WEBSOCKET_ENDPOINT=${WEBSOCKET_ENDPOINT:-}
CONCURRENT_USERS=${CONCURRENT_USERS:-10}
TEST_DURATION=${TEST_DURATION:-60}
RAMP_UP=${RAMP_UP:-10}

# Performance thresholds
MAX_RESPONSE_TIME_MS=2000
MAX_ERROR_RATE_PERCENT=5
MIN_THROUGHPUT_RPS=10

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

# Check dependencies
check_dependencies() {
    local missing_deps=()

    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi

    if ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq")
    fi

    if ! command -v bc >/dev/null 2>&1; then
        missing_deps+=("bc")
    fi

    # Check for optional performance testing tools
    if ! command -v hey >/dev/null 2>&1 && ! command -v ab >/dev/null 2>&1; then
        log_warning "No performance testing tool found (hey or ab)"
        log_info "Install 'hey' for better performance testing: go install github.com/rakyll/hey@latest"
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Please install the missing dependencies and try again"
        exit 1
    fi
}

# Performance test functions
test_api_load() {
    local endpoint="$1"
    local test_name="$2"

    log_info "Running load test: $test_name"
    log_info "Endpoint: $endpoint"
    log_info "Concurrent users: $CONCURRENT_USERS, Duration: ${TEST_DURATION}s"

    local results_file="/tmp/perf_${test_name//[ \/]/_}.json"

    if command -v hey >/dev/null 2>&1; then
        # Use hey if available
        hey -z "${TEST_DURATION}s" -c "$CONCURRENT_USERS" -o json "$endpoint" > "$results_file" 2>/dev/null || {
            log_error "Load test failed for $test_name"
            return 1
        }

        # Parse hey results
        local total_requests response_time_avg response_time_95 error_rate throughput

        total_requests=$(jq -r '.summary.total' "$results_file")
        response_time_avg=$(jq -r '.summary.average * 1000' "$results_file" | bc)
        response_time_95=$(jq -r '.latencyDistribution[] | select(.percentage == 95) | .latency * 1000' "$results_file" | bc)
        error_rate=$(jq -r '.summary.errorDist // {} | to_entries | map(.value) | add // 0' "$results_file")
        throughput=$(jq -r '.summary.requestsPerSec' "$results_file")

        # Calculate error rate percentage
        local error_rate_percent=0
        if [[ $total_requests -gt 0 ]] && [[ $error_rate -gt 0 ]]; then
            error_rate_percent=$(echo "scale=2; $error_rate * 100 / $total_requests" | bc)
        fi

        log_info "Results for $test_name:"
        log_info "  Total Requests: $total_requests"
        log_info "  Average Response Time: ${response_time_avg}ms"
        log_info "  95th Percentile: ${response_time_95}ms"
        log_info "  Error Rate: ${error_rate_percent}%"
        log_info "  Throughput: ${throughput} RPS"

        # Evaluate results against thresholds
        local test_passed=true

        if (( $(echo "$response_time_95 > $MAX_RESPONSE_TIME_MS" | bc -l) )); then
            log_error "  ✗ Response time too high: ${response_time_95}ms > ${MAX_RESPONSE_TIME_MS}ms"
            test_passed=false
        else
            log_success "  ✓ Response time acceptable: ${response_time_95}ms"
        fi

        if (( $(echo "$error_rate_percent > $MAX_ERROR_RATE_PERCENT" | bc -l) )); then
            log_error "  ✗ Error rate too high: ${error_rate_percent}% > ${MAX_ERROR_RATE_PERCENT}%"
            test_passed=false
        else
            log_success "  ✓ Error rate acceptable: ${error_rate_percent}%"
        fi

        if (( $(echo "$throughput < $MIN_THROUGHPUT_RPS" | bc -l) )); then
            log_error "  ✗ Throughput too low: ${throughput} RPS < ${MIN_THROUGHPUT_RPS} RPS"
            test_passed=false
        else
            log_success "  ✓ Throughput acceptable: ${throughput} RPS"
        fi

        if [[ "$test_passed" == true ]]; then
            log_success "✓ $test_name passed all performance criteria"
            return 0
        else
            log_error "✗ $test_name failed performance criteria"
            return 1
        fi

    elif command -v ab >/dev/null 2>&1; then
        # Fallback to Apache Bench
        log_info "Using Apache Bench for testing"

        local total_requests=$((CONCURRENT_USERS * TEST_DURATION / 10))
        ab -n "$total_requests" -c "$CONCURRENT_USERS" -g "/tmp/ab_${test_name//[ \/]/_}.tsv" "$endpoint" > "$results_file" 2>/dev/null || {
            log_error "Load test failed for $test_name"
            return 1
        }

        # Parse ab results
        local response_time_mean response_time_95 requests_per_sec failed_requests

        response_time_mean=$(grep "Time per request:" "$results_file" | head -1 | awk '{print $4}')
        requests_per_sec=$(grep "Requests per second:" "$results_file" | awk '{print $4}')
        failed_requests=$(grep "Failed requests:" "$results_file" | awk '{print $3}')

        log_info "Results for $test_name (Apache Bench):"
        log_info "  Mean Response Time: ${response_time_mean}ms"
        log_info "  Requests per Second: $requests_per_sec"
        log_info "  Failed Requests: $failed_requests"

        # Basic threshold check for ab results
        if (( $(echo "$response_time_mean > $MAX_RESPONSE_TIME_MS" | bc -l) )); then
            log_error "  ✗ Response time too high"
            return 1
        else
            log_success "  ✓ Response time acceptable"
        fi

        return 0

    else
        # Simple concurrent curl test as fallback
        log_info "Using simple concurrent curl test"

        local pids=()
        local start_time end_time
        local success_count=0
        local total_count=$CONCURRENT_USERS

        start_time=$(date +%s)

        for ((i=1; i<=CONCURRENT_USERS; i++)); do
            (
                for ((j=1; j<=5; j++)); do
                    if curl -s -f -m 10 "$endpoint" >/dev/null 2>&1; then
                        echo "success"
                    else
                        echo "failure"
                    fi
                    sleep 1
                done
            ) > "/tmp/curl_test_$i.log" &
            pids+=($!)
        done

        # Wait for all background jobs
        for pid in "${pids[@]}"; do
            wait "$pid"
        done

        end_time=$(date +%s)
        local duration=$((end_time - start_time))

        # Count successes
        for ((i=1; i<=CONCURRENT_USERS; i++)); do
            local successes
            successes=$(grep -c "success" "/tmp/curl_test_$i.log" 2>/dev/null || echo "0")
            success_count=$((success_count + successes))
            rm -f "/tmp/curl_test_$i.log"
        done

        local total_requests=$((CONCURRENT_USERS * 5))
        local error_rate_percent=0
        local throughput=0

        if [[ $total_requests -gt 0 ]]; then
            error_rate_percent=$(echo "scale=2; ($total_requests - $success_count) * 100 / $total_requests" | bc)
            throughput=$(echo "scale=2; $success_count / $duration" | bc)
        fi

        log_info "Results for $test_name (Simple Test):"
        log_info "  Total Requests: $total_requests"
        log_info "  Successful Requests: $success_count"
        log_info "  Error Rate: ${error_rate_percent}%"
        log_info "  Throughput: ${throughput} RPS"
        log_info "  Duration: ${duration}s"

        if (( $(echo "$error_rate_percent > $MAX_ERROR_RATE_PERCENT" | bc -l) )); then
            log_error "  ✗ Error rate too high"
            return 1
        else
            log_success "  ✓ Error rate acceptable"
        fi

        return 0
    fi
}

# WebSocket performance test
test_websocket_performance() {
    if [[ -z "$WEBSOCKET_ENDPOINT" ]]; then
        log_warning "WEBSOCKET_ENDPOINT not set, skipping WebSocket performance tests"
        return 0
    fi

    if ! command -v wscat >/dev/null 2>&1; then
        log_warning "wscat not available, skipping WebSocket performance tests"
        return 0
    fi

    log_info "Running WebSocket performance test"

    local ws_url
    ws_url=$(echo "$WEBSOCKET_ENDPOINT" | sed 's/https:/wss:/' | sed 's/http:/ws:/')

    local connections=5
    local messages_per_connection=10
    local success_count=0
    local pids=()

    for ((i=1; i<=connections; i++)); do
        (
            local connection_success=0
            for ((j=1; j<=messages_per_connection; j++)); do
                echo '{"action":"ping","data":"test"}' | timeout 5s wscat -c "$ws_url" >/dev/null 2>&1 && {
                    connection_success=$((connection_success + 1))
                }
                sleep 0.1
            done
            echo "$connection_success"
        ) > "/tmp/ws_test_$i.log" &
        pids+=($!)
    done

    # Wait for all WebSocket tests
    for pid in "${pids[@]}"; do
        wait "$pid"
    done

    # Collect results
    for ((i=1; i<=connections; i++)); do
        local connection_success
        connection_success=$(cat "/tmp/ws_test_$i.log" 2>/dev/null || echo "0")
        success_count=$((success_count + connection_success))
        rm -f "/tmp/ws_test_$i.log"
    done

    local total_messages=$((connections * messages_per_connection))
    local success_rate=0

    if [[ $total_messages -gt 0 ]]; then
        success_rate=$(echo "scale=2; $success_count * 100 / $total_messages" | bc)
    fi

    log_info "WebSocket Performance Results:"
    log_info "  Total Messages: $total_messages"
    log_info "  Successful Messages: $success_count"
    log_info "  Success Rate: ${success_rate}%"

    if (( $(echo "$success_rate < 90" | bc -l) )); then
        log_error "  ✗ WebSocket success rate too low"
        return 1
    else
        log_success "  ✓ WebSocket performance acceptable"
        return 0
    fi
}

# Memory and CPU stress test simulation
test_resource_usage() {
    if [[ -z "$API_ENDPOINT" ]]; then
        return 0
    fi

    log_info "Running resource usage test"

    # Create a large payload to test memory handling
    local large_comment=""
    for ((i=1; i<=100; i++)); do
        large_comment+="This is a long comment to test memory usage. "
    done

    # Create a test room first
    local room_data='{"hostId": "perf-test-host"}'
    local room_response
    room_response=$(curl -s -X POST -H "Content-Type: application/json" -d "$room_data" "$API_ENDPOINT/rooms" 2>/dev/null || echo "")

    local room_id
    room_id=$(echo "$room_response" | jq -r '.roomId' 2>/dev/null || echo "")

    if [[ -z "$room_id" || "$room_id" == "null" ]]; then
        log_warning "Could not create test room for resource usage test"
        return 0
    fi

    # Send multiple large comments concurrently
    local large_comment_data
    large_comment_data=$(jq -n --arg content "$large_comment" '{"userId": "perf-test-user", "userName": "PerfTestUser", "content": $content}')

    local concurrent_requests=5
    local pids=()
    local success_count=0

    for ((i=1; i<=concurrent_requests; i++)); do
        (
            if curl -s -f -X POST -H "Content-Type: application/json" -d "$large_comment_data" "$API_ENDPOINT/rooms/$room_id/comments" >/dev/null 2>&1; then
                echo "success"
            else
                echo "failure"
            fi
        ) > "/tmp/resource_test_$i.log" &
        pids+=($!)
    done

    # Wait for all requests
    for pid in "${pids[@]}"; do
        wait "$pid"
    done

    # Count successes
    for ((i=1; i<=concurrent_requests; i++)); do
        if grep -q "success" "/tmp/resource_test_$i.log" 2>/dev/null; then
            success_count=$((success_count + 1))
        fi
        rm -f "/tmp/resource_test_$i.log"
    done

    # Cleanup test room
    curl -s -X DELETE "$API_ENDPOINT/rooms/$room_id" >/dev/null 2>&1 || true

    local success_rate=0
    if [[ $concurrent_requests -gt 0 ]]; then
        success_rate=$(echo "scale=2; $success_count * 100 / $concurrent_requests" | bc)
    fi

    log_info "Resource Usage Test Results:"
    log_info "  Large Payload Requests: $concurrent_requests"
    log_info "  Successful Requests: $success_count"
    log_info "  Success Rate: ${success_rate}%"

    if (( $(echo "$success_rate < 80" | bc -l) )); then
        log_error "  ✗ Resource usage test failed"
        return 1
    else
        log_success "  ✓ Resource usage test passed"
        return 0
    fi
}

# Main execution
main() {
    log_info "Starting Commentia Performance Tests for $STAGE environment"
    log_info "API Endpoint: ${API_ENDPOINT:-'Not set'}"
    log_info "WebSocket Endpoint: ${WEBSOCKET_ENDPOINT:-'Not set'}"
    log_info "Concurrent Users: $CONCURRENT_USERS"
    log_info "Test Duration: ${TEST_DURATION}s"
    echo ""

    if [[ -z "$API_ENDPOINT" ]]; then
        log_error "API_ENDPOINT is required for performance testing"
        exit 1
    fi

    local tests_passed=0
    local tests_total=0

    # API Load Tests
    tests_total=$((tests_total + 1))
    if test_api_load "$API_ENDPOINT/health" "Health Endpoint"; then
        tests_passed=$((tests_passed + 1))
    fi

    # Room operations load test
    tests_total=$((tests_total + 1))
    if test_api_load "$API_ENDPOINT/rooms" "Room Operations"; then
        tests_passed=$((tests_passed + 1))
    fi

    # WebSocket performance test
    tests_total=$((tests_total + 1))
    if test_websocket_performance; then
        tests_passed=$((tests_passed + 1))
    fi

    # Resource usage test
    tests_total=$((tests_total + 1))
    if test_resource_usage; then
        tests_passed=$((tests_passed + 1))
    fi

    # Results summary
    echo ""
    log_info "Performance Test Results for $STAGE:"
    log_info "Total Tests: $tests_total"
    log_success "Passed: $tests_passed"

    if [[ $tests_passed -lt $tests_total ]]; then
        local failed=$((tests_total - tests_passed))
        log_error "Failed: $failed"
        exit 1
    else
        log_success "All performance tests passed!"
        exit 0
    fi
}

# Help function
show_help() {
    cat << EOF
Commentia Performance Tests

Usage: $0 [STAGE]

Arguments:
  STAGE                 Environment stage (dev|staging|prod) [default: staging]

Environment Variables:
  API_ENDPOINT          API Gateway endpoint URL (required)
  WEBSOCKET_ENDPOINT    WebSocket API endpoint URL
  CONCURRENT_USERS      Number of concurrent users [default: 10]
  TEST_DURATION         Test duration in seconds [default: 60]
  RAMP_UP              Ramp-up time in seconds [default: 10]

Performance Thresholds:
  MAX_RESPONSE_TIME_MS      Maximum 95th percentile response time [default: 2000ms]
  MAX_ERROR_RATE_PERCENT    Maximum error rate percentage [default: 5%]
  MIN_THROUGHPUT_RPS        Minimum throughput in requests per second [default: 10]

Dependencies:
  Required: curl, jq, bc
  Optional: hey (recommended), ab, wscat

Examples:
  $0 staging
  CONCURRENT_USERS=20 TEST_DURATION=120 $0 prod
  API_ENDPOINT=https://api.example.com $0 staging

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
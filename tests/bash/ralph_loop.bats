#!/usr/bin/env bats
# Tests for ralph/ralph_loop.sh
# Validates pure logic functions: load_ralphrc, can_make_call,
# validate_allowed_tools, build_loop_context, generate_session_id,
# check_claude_version, init_claude_session.

setup() {
    load 'test_helper/common-setup'
    _common_setup

    # Source ralph_loop.sh to load function definitions.
    # RALPH_DIR is already exported by _common_setup (temp dir), and the script
    # respects it via ${RALPH_DIR:-.ralph}. Side effects: set -e, library sourcing,
    # variable init, mkdir (in temp dir since RALPH_DIR is pre-set).
    source "$PROJECT_ROOT/ralph/ralph_loop.sh"

    # Disable set -e leaked by ralph_loop.sh so tests that call functions
    # without `run` don't abort on intermediate non-zero exits.
    set +e

    # Re-export RALPH_DIR and re-derive path variables for test isolation.
    export RALPH_DIR
    LOG_DIR="$RALPH_DIR/logs"
    DOCS_DIR="$RALPH_DIR/docs/generated"
    STATUS_FILE="$RALPH_DIR/status.json"
    PROGRESS_FILE="$RALPH_DIR/progress.json"
    CALL_COUNT_FILE="$RALPH_DIR/.call_count"
    TIMESTAMP_FILE="$RALPH_DIR/.last_reset"
    EXIT_SIGNALS_FILE="$RALPH_DIR/.exit_signals"
    RESPONSE_ANALYSIS_FILE="$RALPH_DIR/.response_analysis"
    CLAUDE_SESSION_FILE="$RALPH_DIR/.claude_session_id"
    RALPH_SESSION_FILE="$RALPH_DIR/.ralph_session"
    RALPH_SESSION_HISTORY_FILE="$RALPH_DIR/.ralph_session_history"
    LIVE_LOG_FILE="$RALPH_DIR/live.log"

    # Reset defaults after sourcing (sourcing captures env state in _env_ vars)
    MAX_CALLS_PER_HOUR=100
    CLAUDE_TIMEOUT_MINUTES=15
    CLAUDE_OUTPUT_FORMAT="json"
    CLAUDE_ALLOWED_TOOLS="Write,Read,Edit,Bash(git *),Bash(npm *),Bash(pytest)"
    CLAUDE_USE_CONTINUE="true"
    CLAUDE_SESSION_EXPIRY_HOURS=24
    VERBOSE_PROGRESS="false"
    CLAUDE_MIN_VERSION="2.0.76"
    CLAUDE_CODE_CMD="claude"
    PLATFORM_DRIVER="claude-code"
    DRIVER_DISPLAY_NAME="Claude Code"
    RALPHRC_LOADED=false
    RUNTIME_CONTEXT_LOADED=false

    # Clear _env_ prefixed vars so .ralphrc overrides are not blocked
    _env_MAX_CALLS_PER_HOUR=""
    _env_CLAUDE_TIMEOUT_MINUTES=""
    _env_CLAUDE_OUTPUT_FORMAT=""
    _env_CLAUDE_ALLOWED_TOOLS=""
    _env_CLAUDE_USE_CONTINUE=""
    _env_CLAUDE_SESSION_EXPIRY_HOURS=""
    _env_VERBOSE_PROGRESS=""
    _env_CB_COOLDOWN_MINUTES=""
    _env_CB_AUTO_RESET=""

    mkdir -p "$RALPH_DIR/logs" "$RALPH_DIR/docs/generated"
}

teardown() {
    _common_teardown
}

# ===========================================================================
# load_ralphrc
# ===========================================================================

@test "load_ralphrc returns 0 when no .ralphrc file exists" {
    run load_ralphrc
    assert_success
}

@test "load_ralphrc sets RALPHRC_LOADED=true when file exists" {
    echo 'MAX_CALLS_PER_HOUR=50' > "$RALPHRC_FILE"
    load_ralphrc
    assert_equal "$RALPHRC_LOADED" "true"
}

@test "load_ralphrc applies .ralphrc overrides" {
    echo 'MAX_CALLS_PER_HOUR=42' > "$RALPHRC_FILE"
    load_ralphrc
    assert_equal "$MAX_CALLS_PER_HOUR" "42"
}

@test "load_ralphrc: env vars take precedence over .ralphrc" {
    echo 'MAX_CALLS_PER_HOUR=42' > "$RALPHRC_FILE"
    _env_MAX_CALLS_PER_HOUR="200"
    MAX_CALLS_PER_HOUR="200"
    load_ralphrc
    assert_equal "$MAX_CALLS_PER_HOUR" "200"
}

@test "load_ralphrc prefers the bundled .ralph/.ralphrc file" {
    echo 'MAX_CALLS_PER_HOUR=41' > "$RALPH_DIR/.ralphrc"
    echo 'MAX_CALLS_PER_HOUR=84' > ".ralphrc"
    load_ralphrc
    assert_equal "$MAX_CALLS_PER_HOUR" "41"
}

@test "load_ralphrc falls back to project-root .ralphrc when bundled config is missing" {
    rm -f "$RALPH_DIR/.ralphrc"
    echo 'MAX_CALLS_PER_HOUR=84' > ".ralphrc"
    load_ralphrc
    assert_equal "$MAX_CALLS_PER_HOUR" "84"
}

# ===========================================================================
# can_make_call
# ===========================================================================

@test "can_make_call returns 0 when under limit" {
    echo "5" > "$CALL_COUNT_FILE"
    run can_make_call
    assert_success
}

@test "can_make_call returns 1 when at limit" {
    echo "$MAX_CALLS_PER_HOUR" > "$CALL_COUNT_FILE"
    run can_make_call
    assert_failure
}

@test "can_make_call returns 0 when count file missing" {
    rm -f "$CALL_COUNT_FILE"
    run can_make_call
    assert_success
}

# ===========================================================================
# validate_allowed_tools
# ===========================================================================

@test "validate_allowed_tools accepts empty input" {
    run validate_allowed_tools ""
    assert_success
}

@test "validate_allowed_tools accepts valid tools" {
    run validate_allowed_tools "Write,Read,Edit"
    assert_success
}

@test "validate_allowed_tools rejects invalid tools" {
    run validate_allowed_tools "Write,InvalidTool,Read"
    assert_failure
    assert_output --partial "Invalid tool"
}

@test "validate_allowed_tools accepts Bash with any parenthesized content" {
    run validate_allowed_tools "Bash(docker compose *),Write"
    assert_success
}

# ===========================================================================
# build_loop_context
# ===========================================================================

@test "build_loop_context includes loop number" {
    run build_loop_context 7
    assert_success
    assert_output --partial "Loop #7"
}

@test "build_loop_context includes remaining task count" {
    cat > "$RALPH_DIR/@fix_plan.md" << 'EOF'
- [ ] First incomplete task
- [x] Completed task
- [ ] Second incomplete task
EOF
    run build_loop_context 3
    assert_success
    assert_output --partial "Remaining tasks: 2"
}

@test "build_loop_context truncates to 500 characters" {
    run build_loop_context 1
    assert_success
    local len=${#output}
    [[ $len -le 500 ]]
}

# ===========================================================================
# generate_session_id
# ===========================================================================

@test "generate_session_id produces ralph- prefix" {
    run generate_session_id
    assert_success
    assert_output --regexp '^ralph-[0-9]+-[0-9]+$'
}

@test "generate_session_id produces unique values" {
    local id1 id2
    id1=$(generate_session_id)
    id2=$(generate_session_id)
    [[ "$id1" != "$id2" ]] || {
        # Very unlikely but possible with same timestamp+RANDOM
        # Try once more
        id2=$(generate_session_id)
        [[ "$id1" != "$id2" ]]
    }
}

# ===========================================================================
# check_claude_version
# ===========================================================================

@test "check_claude_version: above minimum returns success" {
    _mock_cli claude 0 "claude v3.0.0"
    CLAUDE_CODE_CMD="claude"
    run check_claude_version
    assert_success
}

@test "check_claude_version: below minimum returns failure" {
    _mock_cli claude 0 "claude v1.0.0"
    CLAUDE_CODE_CMD="claude"
    run check_claude_version
    assert_failure
}

@test "check_claude_version: missing binary returns success with warning" {
    CLAUDE_CODE_CMD="nonexistent_claude_binary_xyz"
    run check_claude_version
    assert_success
}

# ===========================================================================
# init_claude_session
# ===========================================================================

@test "init_claude_session: returns empty when no session file" {
    rm -f "$CLAUDE_SESSION_FILE"
    run init_claude_session
    assert_success
    assert_output ""
}

@test "init_claude_session: returns session ID from valid file" {
    echo "session-abc-123" > "$CLAUDE_SESSION_FILE"
    # Touch the file to make it recent (not expired)
    touch "$CLAUDE_SESSION_FILE"
    run init_claude_session
    assert_success
    assert_output "session-abc-123"
}

@test "init_claude_session: reads session ID from legacy JSON file" {
    jq -n --arg sid "legacy-session-456" --arg ts "$(_minutes_ago_iso 10)" \
        '{session_id: $sid, timestamp: $ts}' > "$CLAUDE_SESSION_FILE"

    run init_claude_session
    assert_success
    assert_output "legacy-session-456"
}

@test "init_claude_session: does not resume expired legacy JSON session timestamps" {
    jq -n --arg sid "legacy-session-expired" --arg ts "$(_minutes_ago_iso $((25 * 60)))" \
        '{session_id: $sid, timestamp: $ts}' > "$CLAUDE_SESSION_FILE"

    run init_claude_session
    assert_success
    assert_output ""
    [[ ! -f "$CLAUDE_SESSION_FILE" ]]
}

@test "init_claude_session: returns empty for expired session" {
    echo "old-session-456" > "$CLAUDE_SESSION_FILE"
    CLAUDE_SESSION_EXPIRY_HOURS=0
    run init_claude_session
    assert_success
    assert_output ""
}

# ===========================================================================
# Tier 2 — Filesystem side effects
# ===========================================================================

# ===========================================================================
# init_call_tracking
# ===========================================================================

@test "init_call_tracking resets counter on new hour" {
    echo "2024010100" > "$TIMESTAMP_FILE"
    echo "50" > "$CALL_COUNT_FILE"
    init_call_tracking
    local count
    count=$(cat "$CALL_COUNT_FILE")
    [[ "$count" == "0" ]]
}

@test "init_call_tracking preserves counter for same hour" {
    local current_hour
    current_hour=$(date +%Y%m%d%H)
    echo "$current_hour" > "$TIMESTAMP_FILE"
    echo "25" > "$CALL_COUNT_FILE"
    init_call_tracking
    local count
    count=$(cat "$CALL_COUNT_FILE")
    [[ "$count" == "25" ]]
}

@test "init_call_tracking creates exit signals file if missing" {
    rm -f "$EXIT_SIGNALS_FILE"
    init_call_tracking
    [[ -f "$EXIT_SIGNALS_FILE" ]]
    # Should contain valid JSON
    jq empty "$EXIT_SIGNALS_FILE"
}

# ===========================================================================
# update_status
# ===========================================================================

@test "update_status creates valid JSON status file" {
    update_status 5 10 "executing_loop" "running"
    [[ -f "$STATUS_FILE" ]]
    jq empty "$STATUS_FILE"
    local status
    status=$(jq -r '.status' "$STATUS_FILE")
    assert_equal "$status" "running"
}

@test "update_status includes loop count and calls" {
    update_status 12 45 "analyzing_response" "running"
    local loop_count
    loop_count=$(jq -r '.loop_count' "$STATUS_FILE")
    assert_equal "$loop_count" "12"
    local calls
    calls=$(jq -r '.calls_made_this_hour' "$STATUS_FILE")
    assert_equal "$calls" "45"
}

# ===========================================================================
# save_claude_session
# ===========================================================================

@test "save_claude_session extracts session ID from JSON output" {
    local output_file="$RALPH_DIR/test_output.json"
    echo '{"metadata": {"session_id": "ses-abc-123"}}' > "$output_file"
    save_claude_session "$output_file"
    local saved
    saved=$(cat "$CLAUDE_SESSION_FILE")
    assert_equal "$saved" "ses-abc-123"
}

@test "save_claude_session extracts session ID from Codex JSONL output" {
    local output_file="$RALPH_DIR/test_output.jsonl"
    cp "$FIXTURES_DIR/codex_jsonl_response.jsonl" "$output_file"

    save_claude_session "$output_file"

    local saved
    saved=$(cat "$CLAUDE_SESSION_FILE")
    assert_equal "$saved" "codex-thread-123"
}

@test "save_claude_session extracts session ID from Cursor JSON output" {
    local output_file="$RALPH_DIR/test_output.json"
    cp "$FIXTURES_DIR/cursor_json_response.json" "$output_file"

    save_claude_session "$output_file"

    local saved
    saved=$(cat "$CLAUDE_SESSION_FILE")
    assert_equal "$saved" "cursor-session-123"
}

@test "save_claude_session does nothing when output file missing" {
    rm -f "$CLAUDE_SESSION_FILE"
    save_claude_session "$RALPH_DIR/nonexistent.json"
    [[ ! -f "$CLAUDE_SESSION_FILE" ]]
}

# ===========================================================================
# reset_session
# ===========================================================================

@test "reset_session clears Claude session file" {
    echo "old-session" > "$CLAUDE_SESSION_FILE"
    reset_session "test_reset"
    [[ ! -f "$CLAUDE_SESSION_FILE" ]]
}

@test "reset_session resets exit signals to empty arrays" {
    echo '{"test_only_loops": [1,2], "done_signals": [3], "completion_indicators": [4]}' > "$EXIT_SIGNALS_FILE"
    reset_session "test_reset"
    local test_loops
    test_loops=$(jq '.test_only_loops | length' "$EXIT_SIGNALS_FILE")
    assert_equal "$test_loops" "0"
}

@test "reset_session writes reason to session file" {
    reset_session "circuit_breaker_open"
    [[ -f "$RALPH_SESSION_FILE" ]]
    local reason
    reason=$(jq -r '.reset_reason' "$RALPH_SESSION_FILE")
    assert_equal "$reason" "circuit_breaker_open"
}

# ===========================================================================
# log_session_transition
# ===========================================================================

@test "log_session_transition creates history file on first call" {
    rm -f "$RALPH_SESSION_HISTORY_FILE"
    log_session_transition "active" "reset" "test_reason" 5
    [[ -f "$RALPH_SESSION_HISTORY_FILE" ]]
    local count
    count=$(jq 'length' "$RALPH_SESSION_HISTORY_FILE")
    assert_equal "$count" "1"
}

@test "log_session_transition appends to existing history" {
    echo '[{"timestamp": "2024-01-01T00:00:00", "from_state": "init", "to_state": "active", "reason": "start", "loop_number": 0}]' > "$RALPH_SESSION_HISTORY_FILE"
    log_session_transition "active" "reset" "another_reason" 10
    local count
    count=$(jq 'length' "$RALPH_SESSION_HISTORY_FILE")
    assert_equal "$count" "2"
}

@test "log_session_transition caps history at 50 entries" {
    # Create 50 existing entries
    local entries='['
    for i in $(seq 1 50); do
        [[ $i -gt 1 ]] && entries+=','
        entries+="{\"timestamp\":\"t\",\"from_state\":\"a\",\"to_state\":\"b\",\"reason\":\"r\",\"loop_number\":$i}"
    done
    entries+=']'
    echo "$entries" > "$RALPH_SESSION_HISTORY_FILE"

    log_session_transition "active" "reset" "overflow" 51
    local count
    count=$(jq 'length' "$RALPH_SESSION_HISTORY_FILE")
    assert_equal "$count" "50"
}

# ===========================================================================
# Tier 3 — External dependencies
# ===========================================================================

# ===========================================================================
# load_platform_driver
# ===========================================================================

@test "load_platform_driver: loads claude-code driver and sets CLAUDE_CODE_CMD" {
    PLATFORM_DRIVER="claude-code"
    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    load_platform_driver
    assert_equal "$CLAUDE_CODE_CMD" "claude"
}

@test "load_platform_driver: sets driver display name for runtime logging" {
    PLATFORM_DRIVER="cursor"
    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    load_platform_driver
    assert_equal "$DRIVER_DISPLAY_NAME" "Cursor CLI"
}

@test "setup_tmux_session uses the active driver name for the output pane" {
    PLATFORM_DRIVER="cursor"
    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    DRIVER_DISPLAY_NAME="Claude Code"
    CLAUDE_CODE_CMD="claude"

    mkdir -p "$RALPH_DIR/bin"
    cat > "$RALPH_DIR/bin/tmux" <<'TMUX'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$RALPH_DIR/tmux.log"
if [[ "$1" == "show-options" ]]; then
    echo "0"
fi
exit 0
TMUX
    chmod +x "$RALPH_DIR/bin/tmux"
    export PATH="$RALPH_DIR/bin:$PATH"

    exit() {
        return "${1:-0}"
    }

    setup_tmux_session

    assert_equal "$DRIVER_DISPLAY_NAME" "Cursor CLI"
    [[ "$CLAUDE_CODE_CMD" != "claude" ]]
    assert_file_exist "$RALPH_DIR/tmux.log"
    run grep -F -- "select-pane -t" "$RALPH_DIR/tmux.log"
    assert_output --partial "Cursor CLI Output"
}

@test "load_platform_driver: fails for non-existent driver" {
    PLATFORM_DRIVER="nonexistent-platform"
    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    run load_platform_driver
    assert_failure
}

# ===========================================================================
# User-facing help and guidance
# ===========================================================================

@test "show_help uses driver-agnostic bmalph guidance" {
    run show_help

    assert_success
    assert_output --partial "Ralph Loop"
    assert_output --partial "Use 'bmalph init'"
    assert_output --partial "Show live driver output in real-time"
    assert_output --partial "Set driver execution timeout in minutes"
    assert_output --partial "bmalph run"
    refute_output --partial "Ralph Loop for Claude Code"
    refute_output --partial "Show Claude Code output in real-time"
    refute_output --partial "ralph-setup my-project"
}

@test "main recommends bmalph commands when the prompt file is missing" {
    SCRIPT_DIR="$PROJECT_ROOT/ralph"

    run main

    assert_failure
    assert_output --partial "Prompt file '$RALPH_DIR/PROMPT.md' not found!"
    assert_output --partial "Initialize bmalph in this project: bmalph init"
    assert_output --partial "Restore bundled Ralph files in an existing project: bmalph upgrade"
    assert_output --partial "Generate Ralph task files after planning: bmalph implement"
    refute_output --partial "ralph-enable"
    refute_output --partial "ralph-setup"
    refute_output --partial "ralph-import"
}

# ===========================================================================
# should_exit_gracefully
# ===========================================================================

@test "should_exit_gracefully returns empty when no signals" {
    echo '{"test_only_loops": [], "done_signals": [], "completion_indicators": []}' > "$EXIT_SIGNALS_FILE"
    rm -f "$RESPONSE_ANALYSIS_FILE"
    rm -f "$RALPH_DIR/@fix_plan.md"
    local result
    result=$(should_exit_gracefully)
    assert_equal "$result" ""
}

@test "should_exit_gracefully detects permission_denied" {
    echo '{"test_only_loops": [], "done_signals": [], "completion_indicators": []}' > "$EXIT_SIGNALS_FILE"
    _mock_response_analysis true false false 0
    local result
    result=$(should_exit_gracefully)
    assert_equal "$result" "permission_denied"
}

@test "should_exit_gracefully detects test_saturation" {
    echo '{"test_only_loops": [1,2,3], "done_signals": [], "completion_indicators": []}' > "$EXIT_SIGNALS_FILE"
    rm -f "$RESPONSE_ANALYSIS_FILE"
    local result
    result=$(should_exit_gracefully)
    assert_equal "$result" "test_saturation"
}

@test "should_exit_gracefully detects plan_complete" {
    echo '{"test_only_loops": [], "done_signals": [], "completion_indicators": []}' > "$EXIT_SIGNALS_FILE"
    rm -f "$RESPONSE_ANALYSIS_FILE"
    cat > "$RALPH_DIR/@fix_plan.md" << 'PLAN'
- [x] First task done
- [x] Second task done
PLAN
    local result
    result=$(should_exit_gracefully)
    assert_equal "$result" "plan_complete"
}

@test "should_exit_gracefully: no exit when incomplete tasks remain" {
    echo '{"test_only_loops": [], "done_signals": [], "completion_indicators": []}' > "$EXIT_SIGNALS_FILE"
    rm -f "$RESPONSE_ANALYSIS_FILE"
    cat > "$RALPH_DIR/@fix_plan.md" << 'PLAN'
- [x] Done task
- [ ] Still pending
PLAN
    local result
    result=$(should_exit_gracefully)
    assert_equal "$result" ""
}

# ===========================================================================
# execute_claude_code
# ===========================================================================

@test "execute_claude_code: success path increments call count" {
    _skip_if_xargs_broken
    echo "0" > "$CALL_COUNT_FILE"
    echo '{"test_only_loops": [], "done_signals": [], "completion_indicators": []}' > "$EXIT_SIGNALS_FILE"

    # Create a mock claude that outputs valid JSON
    _mock_cli claude 0 '{"result": "ok", "metadata": {"session_id": "test-session"}}'
    CLAUDE_CODE_CMD="claude"
    CLAUDE_USE_CONTINUE="false"
    LIVE_OUTPUT=false

    # Create minimal prompt file
    echo "Test prompt" > "$RALPH_DIR/PROMPT.md"
    PROMPT_FILE="$RALPH_DIR/PROMPT.md"

    # Load the real driver so driver_build_command is available
    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    PLATFORM_DRIVER="claude-code"
    load_platform_driver

    run execute_claude_code 1
    assert_success
    # Check call count was incremented
    local count
    count=$(cat "$CALL_COUNT_FILE" 2>/dev/null || echo "0")
    [[ "$count" -ge 1 ]]
}

@test "execute_claude_code: API limit returns exit code 2" {
    _skip_if_xargs_broken
    echo "0" > "$CALL_COUNT_FILE"
    echo '{"test_only_loops": [], "done_signals": [], "completion_indicators": []}' > "$EXIT_SIGNALS_FILE"

    # Create a mock claude that fails with limit message
    _mock_cli claude 1 "Error: 5 hour usage limit reached. Please try back later."
    CLAUDE_CODE_CMD="claude"
    CLAUDE_USE_CONTINUE="false"
    LIVE_OUTPUT=false

    echo "Test prompt" > "$RALPH_DIR/PROMPT.md"
    PROMPT_FILE="$RALPH_DIR/PROMPT.md"

    # Load the real driver so driver_build_command is available
    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    PLATFORM_DRIVER="claude-code"
    load_platform_driver

    run execute_claude_code 1
    assert_equal "$status" "2"
}

@test "execute_claude_code: codex JSONL output is analyzed without silent failure" {
    _skip_if_xargs_broken
    echo "0" > "$CALL_COUNT_FILE"
    echo '{"test_only_loops": [], "done_signals": [], "completion_indicators": []}' > "$EXIT_SIGNALS_FILE"

    _mock_cli codex 0 "$(cat "$FIXTURES_DIR/codex_jsonl_response.jsonl")"
    CLAUDE_USE_CONTINUE="true"
    LIVE_OUTPUT=false

    echo "Implement the task" > "$RALPH_DIR/PROMPT.md"
    PROMPT_FILE="$RALPH_DIR/PROMPT.md"

    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    PLATFORM_DRIVER="codex"
    load_platform_driver

    run execute_claude_code 1
    assert_success

    local saved
    saved=$(cat "$CLAUDE_SESSION_FILE")
    assert_equal "$saved" "codex-thread-123"

    run jq -r '.output_format' "$RESPONSE_ANALYSIS_FILE"
    assert_output "json"

    run jq -r '.analysis.exit_signal' "$RESPONSE_ANALYSIS_FILE"
    assert_output "true"
}

@test "execute_claude_code: cursor driver resumes saved sessions" {
    _skip_if_xargs_broken
    echo "0" > "$CALL_COUNT_FILE"
    echo '{"test_only_loops": [], "done_signals": [], "completion_indicators": []}' > "$EXIT_SIGNALS_FILE"
    echo "stale-session-123" > "$CLAUDE_SESSION_FILE"

    mkdir -p "$RALPH_DIR/bin"
    cat > "$RALPH_DIR/bin/cursor-agent" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$RALPH_DIR/cursor_args.log"
cat <<'OUT'
{"result":"Completed the auth module updates.\n\n---RALPH_STATUS---\nSTATUS: COMPLETE\nEXIT_SIGNAL: true\n---END_RALPH_STATUS---","session_id":"cursor-session-123"}
OUT
exit 0
EOF
    chmod +x "$RALPH_DIR/bin/cursor-agent"
    export PATH="$RALPH_DIR/bin:$PATH"

    CLAUDE_USE_CONTINUE="true"
    LIVE_OUTPUT=false
    export OSTYPE="linux-gnu"
    unset OS

    echo "Implement the task" > "$RALPH_DIR/PROMPT.md"
    PROMPT_FILE="$RALPH_DIR/PROMPT.md"

    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    PLATFORM_DRIVER="cursor"
    load_platform_driver

    run execute_claude_code 1
    assert_success

    run grep -- "--resume" "$RALPH_DIR/cursor_args.log"
    assert_success
    assert_output --partial "stale-session-123"
}

@test "prepare_live_command_args converts Claude JSON mode into stream-json" {
    echo "Implement auth" > "$RALPH_DIR/PROMPT.md"
    PROMPT_FILE="$RALPH_DIR/PROMPT.md"

    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    PLATFORM_DRIVER="claude-code"
    load_platform_driver
    build_claude_command "$PROMPT_FILE" "" ""

    prepare_live_command_args
    local args_str="${LIVE_CMD_ARGS[*]}"
    [[ "$args_str" =~ "--output-format stream-json" ]]
    [[ "$args_str" =~ "--verbose" ]]
    [[ "$args_str" =~ "--include-partial-messages" ]]

    run get_live_stream_filter
    assert_success
    assert_output --partial "stream_event"
}

@test "prepare_live_command_args keeps Codex JSONL command unchanged" {
    echo "Implement auth" > "$RALPH_DIR/PROMPT.md"
    PROMPT_FILE="$RALPH_DIR/PROMPT.md"

    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    PLATFORM_DRIVER="codex"
    load_platform_driver
    build_claude_command "$PROMPT_FILE" "" ""

    prepare_live_command_args
    local args_str="${LIVE_CMD_ARGS[*]}"
    [[ "$args_str" =~ "--json" ]]
    [[ ! "$args_str" =~ "--include-partial-messages" ]]

    run get_live_stream_filter
    assert_success
    assert_output --partial "item.completed"
}

@test "prepare_live_command_args converts Cursor JSON mode into stream-json" {
    echo "Implement auth" > "$RALPH_DIR/PROMPT.md"
    PROMPT_FILE="$RALPH_DIR/PROMPT.md"

    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    PLATFORM_DRIVER="cursor"
    load_platform_driver
    build_claude_command "$PROMPT_FILE" "" ""

    prepare_live_command_args
    local args_str="${LIVE_CMD_ARGS[*]}"
    [[ "$args_str" =~ "--output-format stream-json" ]]

    run get_live_stream_filter
    assert_success
    assert_output --partial '.type == "assistant"'
}

@test "supports_live_output rejects drivers without structured streams" {
    SCRIPT_DIR="$PROJECT_ROOT/ralph"
    PLATFORM_DRIVER="copilot"
    load_platform_driver

    run supports_live_output
    assert_failure
}

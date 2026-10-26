#!/bin/bash
# A minimal stand-in for `pi --mode rpc`, enough to exercise framing,
# response correlation, extension dialogs and shutdown.
echo "fake pi starting" >&2
while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  type=$(printf '%s' "$line" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
  case "$type" in
    get_state)
      printf '{"id":"%s","type":"response","command":"get_state","success":true,"data":{"sessionId":"s1","sessionFile":"/tmp/s1.jsonl","isStreaming":false}}\n' "$id" ;;
    prompt)
      printf '{"id":"%s","type":"response","command":"prompt","success":true,"data":{"disposition":"started"}}\n' "$id"
      printf '{"type":"agent_start"}\n'
      printf '{"type":"tool_execution_start","toolCallId":"c1","toolName":"bash","args":{"command":"echo hi"}}\n'
      printf '{"type":"tool_execution_end","toolCallId":"c1","toolName":"bash","result":{"content":[{"type":"text","text":"hi \xe2\x80\xa8 sep"}]},"isError":false}\n'
      printf '{"type":"extension_ui_request","id":"u1","method":"select","title":"Pick","options":["A","B"]}\n' ;;
    extension_ui_response)
      value=$(printf '%s' "$line" | sed -n 's/.*"value":"\([^"]*\)".*/\1/p')
      printf '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"picked %s"}],"stopReason":"stop"}}\n' "$value"
      printf '{"type":"agent_settled","aborted":false}\n' ;;
    bad)
      printf 'not json\n' ;;
    *)
      printf '{"id":"%s","type":"response","command":"%s","success":false,"error":"unknown"}\n' "$id" "$type" ;;
  esac
done
echo "fake pi exiting" >&2

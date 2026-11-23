#!/usr/bin/env python3
"""A scripted ACP agent for testing Tower's ACP bridge without a real LLM CLI.

Speaks the Agent Client Protocol on stdio, starts the MCP server the client
gives it on `session/new` (Tower's), and supports test modes via FAKE_ACP_MODE:
  - normal (default): logs cause, writes done.txt, tries ../escape.txt, submits
  - probe_builtins: attempts built-in tool permission requests across Claude,
    Codex, Gemini CLI, and OpenCode payload shapes, plus a valid mcp__tower__
    tool, reporting every decision back via agent_message_chunk
  - blocked: calls submit(outcome="blocked", blocker_reason=...)
  - multimodal: inspects session/prompt image content blocks and echoes summary
"""
import json
import os
import subprocess
import sys

mcp = None
mcp_id = [0]
client_req_id = [9000]
MODE = os.environ.get("FAKE_ACP_MODE", "normal")


def out(obj):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", **obj}) + "\n")
    sys.stdout.flush()


def ask_client(method, params):
    client_req_id[0] += 1
    rid = client_req_id[0]
    out({"id": rid, "method": method, "params": params})
    while True:
        line = sys.stdin.readline()
        if not line:
            raise SystemExit("client closed")
        m = json.loads(line)
        if m.get("id") == rid and "method" not in m:
            return m.get("result", {})


def mcp_call(method, params):
    mcp_id[0] += 1
    mcp.stdin.write(
        json.dumps({"jsonrpc": "2.0", "id": mcp_id[0], "method": method, "params": params}) + "\n"
    )
    mcp.stdin.flush()
    while True:
        line = mcp.stdout.readline()
        if not line:
            raise SystemExit("mcp server closed")
        m = json.loads(line)
        if m.get("id") == mcp_id[0]:
            return m.get("result", {})


def tool(name, args):
    r = mcp_call("tools/call", {"name": name, "arguments": args})
    return "".join(c.get("text", "") for c in r.get("content", []))


def say(sid, text):
    out(
        {
            "method": "session/update",
            "params": {
                "sessionId": sid,
                "update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": text}},
            },
        }
    )


def run_probe_builtins(sid):
    options = [
        {"kind": "allow_once", "optionId": "a1"},
        {"kind": "reject_once", "optionId": "r1"},
    ]
    probes = [
        ("claude_bash", {"options": options, "toolCall": {"title": "Bash", "_meta": {"claudeCode": {"toolName": "Bash"}}}}),
        ("claude_webfetch", {"options": options, "toolCall": {"title": "WebFetch", "_meta": {"claudeCode": {"toolName": "WebFetch"}}}}),
        ("codex_shell", {"options": options, "toolCall": {"name": "shell", "title": "shell", "_meta": {"codex": {"toolName": "shell"}}}}),
        ("gemini_read_file", {"options": options, "toolCall": {"name": "read_file", "title": "read_file", "_meta": {"gemini": {"toolName": "read_file"}}}}),
        ("gemini_web_fetch", {"options": options, "toolCall": {"name": "web_fetch", "_meta": {"gemini": {"toolName": "web_fetch"}}}}),
        ("opencode_bash", {"options": options, "toolCall": {"tool": "bash", "title": "bash", "_meta": {"opencode": {"toolName": "bash"}}}}),
        ("spoofed_title", {"options": options, "toolCall": {"title": "mcp__tower__bash", "_meta": {"claudeCode": {"toolName": "Bash"}}}}),
        ("tower_read", {"options": options, "toolCall": {"title": "mcp__tower__read", "_meta": {"claudeCode": {"toolName": "mcp__tower__read"}}}}),
    ]
    results = {}
    for label, params in probes:
        res = ask_client("session/request_permission", params)
        results[label] = res.get("outcome", {})
    say(sid, json.dumps(results))


for line in sys.stdin:
    msg = json.loads(line)
    method, rid, params = msg.get("method"), msg.get("id"), msg.get("params", {})
    if method == "initialize":
        out(
            {
                "id": rid,
                "result": {
                    "protocolVersion": 1,
                    "agentCapabilities": {
                        "loadSession": False,
                        "promptCapabilities": {"image": True},
                    },
                },
            }
        )
    elif method == "session/new":
        s = params["mcpServers"][0]
        env = {**os.environ, **{e["name"]: e["value"] for e in s.get("env", [])}}
        mcp = subprocess.Popen(
            [s["command"], *s["args"]],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            env=env,
            text=True,
        )
        mcp_call(
            "initialize",
            {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "fake"}},
        )
        out({"id": rid, "result": {"sessionId": "fake-session"}})
    elif method == "session/prompt":
        sid = params["sessionId"]
        if MODE == "probe_builtins":
            run_probe_builtins(sid)
        elif MODE == "blocked":
            say(sid, "Cannot complete honestly due to conflicting spec.")
            tool(
                "submit",
                {
                    "outcome": "blocked",
                    "summary": "Specification contradicts read-only scope",
                    "blocker_reason": "C1 requires modifying config.lock which is read-only",
                    "criteria": [],
                },
            )
        elif MODE == "multimodal":
            blocks = params.get("prompt", [])
            images = [b for b in blocks if b.get("type") == "image"]
            texts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
            say(
                sid,
                json.dumps(
                    {
                        "image_count": len(images),
                        "mimes": [b.get("mimeType") for b in images],
                        "data_lens": [len(b.get("data", "")) for b in images],
                        "text_count": len(texts),
                    }
                ),
            )
            tool("submit", {"summary": "inspected screenshot", "criteria": []})
        else:
            say(sid, "Looking at the workspace. ")
            tool("log", {"kind": "cause", "text": "done.txt is missing"})
            tool("write", {"path": "done.txt", "content": "ok\n"})
            # Writing outside the workspace is refused by Tower's MCP server.
            refused = tool("write", {"path": "../escape.txt", "content": "x"})
            say(sid, "escape: " + ("refused" if "outside" in refused else "WRITTEN"))
            tool(
                "submit",
                {
                    "summary": "created done.txt",
                    "criteria": [{"id": "C1", "met": True, "evidence": "wrote it"}],
                },
            )
        out({"id": rid, "result": {"stopReason": "end_turn"}})
    elif method == "session/cancel":
        pass
    elif rid is not None:
        out({"id": rid, "error": {"code": -32601, "message": "unknown"}})

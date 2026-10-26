#!/usr/bin/env python3
"""A scripted ACP agent for testing Tower's ACP bridge without Claude Code.

It speaks the Agent Client Protocol on stdio, starts the MCP servers the
client gives it on session/new (Tower's), and on each prompt does its work
only through those MCP tools: creates done.txt, logs a cause, submits.
"""
import json, os, subprocess, sys

mcp = None
mcp_id = [0]


def out(obj):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", **obj}) + "\n")
    sys.stdout.flush()


def mcp_call(method, params):
    mcp_id[0] += 1
    mcp.stdin.write(json.dumps({"jsonrpc": "2.0", "id": mcp_id[0], "method": method, "params": params}) + "\n")
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
    out({"method": "session/update", "params": {"sessionId": sid, "update": {
        "sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": text}}}})


for line in sys.stdin:
    msg = json.loads(line)
    method, rid, params = msg.get("method"), msg.get("id"), msg.get("params", {})
    if method == "initialize":
        out({"id": rid, "result": {"protocolVersion": 1, "agentCapabilities": {"loadSession": False}}})
    elif method == "session/new":
        s = params["mcpServers"][0]
        env = {**os.environ, **{e["name"]: e["value"] for e in s.get("env", [])}}
        mcp = subprocess.Popen([s["command"], *s["args"]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=env, text=True)
        mcp_call("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "fake"}})
        out({"id": rid, "result": {"sessionId": "fake-session"}})
    elif method == "session/prompt":
        sid = params["sessionId"]
        say(sid, "Looking at the workspace. ")
        tool("log", {"kind": "cause", "text": "done.txt is missing"})
        tool("write", {"path": "done.txt", "content": "ok\n"})
        # Writing outside the workspace is refused by Tower's MCP server.
        refused = tool("write", {"path": "../escape.txt", "content": "x"})
        say(sid, "escape: " + ("refused" if "outside" in refused else "WRITTEN"))
        tool("submit", {"summary": "created done.txt", "criteria": [{"id": "C1", "met": True, "evidence": "wrote it"}]})
        out({"id": rid, "result": {"stopReason": "end_turn"}})
    elif method == "session/cancel":
        pass
    elif rid is not None:
        out({"id": rid, "error": {"code": -32601, "message": "unknown"}})

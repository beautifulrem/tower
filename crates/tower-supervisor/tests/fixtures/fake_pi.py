#!/usr/bin/env python3
"""A scripted stand-in for `pi --mode rpc` used by the supervisor tests.

It speaks the same JSONL protocol and behaves like an agent running with the
tower-goal extension: it edits files in its working directory, calls `log`,
`ask_user` (as an extension dialog) and `submit`. PI_FAKE_SCENARIO selects
the behaviour:

  pass           create done.txt, log a cause, submit
  fail_then_fix  submit without the file; on the rework prompt create it
  ask            ask a question, write the answer to done.txt, submit
  idle           settle without submitting (twice)
"""
import json, os, sys, threading

scenario = os.environ.get("PI_FAKE_SCENARIO", "pass")
lock = threading.Lock()
pending = {}
cost = [0.0]
prompts = [0]
session = os.path.join(sys.argv[sys.argv.index("--session-dir") + 1], "s.jsonl") if "--session-dir" in sys.argv else "/tmp/s.jsonl"

def out(obj):
    with lock:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()

def respond(cid, command, data=None, ok=True):
    out({"id": cid, "type": "response", "command": command, "success": ok, "data": data or {}})

def tool(name, args, result="ok"):
    out({"type": "tool_execution_start", "toolCallId": f"c{name}{prompts[0]}", "toolName": name, "args": args})
    out({"type": "tool_execution_end", "toolCallId": f"c{name}{prompts[0]}", "toolName": name,
         "result": {"content": [{"type": "text", "text": result}]}, "isError": False})

def dialog(title):
    ev = threading.Event()
    rid = f"ui{prompts[0]}"
    pending[rid] = {"event": ev}
    out({"type": "extension_ui_request", "id": rid, "method": "input", "title": title})
    ev.wait(10)
    return pending.pop(rid).get("value")

def settle():
    cost[0] += 0.01
    out({"type": "turn_end", "message": {}, "toolResults": []})
    out({"type": "agent_end", "messages": [], "willRetry": False})
    out({"type": "agent_settled", "aborted": False})

def run(message):
    prompts[0] += 1
    n = prompts[0]
    out({"type": "agent_start"})
    out({"type": "turn_start"})
    out({"type": "message_update", "assistantMessageEvent": {"type": "text_delta", "delta": "looking"}})
    if scenario == "pass":
        tool("log", {"kind": "cause", "text": "缺少 done.txt"})
        tool("bash", {"command": "touch done.txt"})
        open("done.txt", "w").write("ok\n")
        tool("submit", {"summary": "创建了 done.txt", "criteria": [{"id": "C1", "met": True, "evidence": "ls 看到了"}]})
    elif scenario == "fail_then_fix":
        if "did not pass" in message:
            open("done.txt", "w").write("fixed\n")
            tool("submit", {"summary": "补上了文件", "criteria": [{"id": "C1", "met": True, "evidence": "ok"}]})
        else:
            tool("submit", {"summary": "应该好了", "criteria": [{"id": "C1", "met": True, "evidence": "我觉得"}]})
    elif scenario == "ask":
        answer = dialog('tower:' + json.dumps({"tower": "question", "question": "写什么？", "options": ["a", "b"], "why": ""}))
        open("done.txt", "w").write((answer or "none") + "\n")
        tool("submit", {"summary": "写入了答案", "criteria": [{"id": "C1", "met": True, "evidence": "ok"}]})
    elif scenario == "idle":
        out({"type": "message_end", "message": {"role": "assistant", "content": [{"type": "text", "text": "嗯"}], "stopReason": "stop"}})
    settle()

for line in sys.stdin:
    try:
        cmd = json.loads(line)
    except ValueError:
        continue
    t, cid = cmd.get("type"), cmd.get("id")
    if t == "get_state":
        respond(cid, t, {"sessionFile": session, "sessionId": "s"})
    elif t == "get_session_stats":
        respond(cid, t, {"cost": cost[0]})
    elif t == "get_available_models":
        respond(cid, t, {"models": [{"provider": "fake", "id": "m1", "name": "Fake", "reasoning": False,
                                      "cost": {"input": 1, "output": 2}, "contextWindow": 1000}]})
    elif t in ("prompt", "steer", "follow_up"):
        respond(cid, t, {"disposition": "started" if t == "prompt" else "queued"})
        if t == "prompt":
            threading.Thread(target=run, args=(cmd.get("message", ""),), daemon=True).start()
    elif t == "abort":
        respond(cid, t)
    elif t == "extension_ui_response":
        p = pending.get(cmd.get("id"))
        if p is not None:
            p["value"] = cmd.get("value")
            p["event"].set()
    else:
        respond(cid, t, ok=False)

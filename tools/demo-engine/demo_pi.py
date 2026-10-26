#!/usr/bin/env python3
"""Tower demo engine: a scripted stand-in for `pi --mode rpc`.

It speaks Pi's RPC protocol and acts like a coding agent running with the
tower-goal extension, without calling any model. Use it to try Tower's
interface with no credentials: point Settings → "pi 可执行文件" at this file
and add the repository created by `tools/demo-engine/make_demo_repo.sh`.

Behaviour depends on words in the goal's intent:
  "询问" / "ask"      asks the human a question before fixing
  "返工" / "rework"   submits a wrong fix first, then fixes it on rework
  "卡住" / "stuck"    stops without submitting
  otherwise          reads, runs the tests, logs the cause, fixes, submits
"""
import json, os, re, subprocess, sys, threading, time

lock = threading.Lock()
pending = {}
state = {"cost": 0.0, "n": 0}
session_dir = sys.argv[sys.argv.index("--session-dir") + 1] if "--session-dir" in sys.argv else "/tmp"
session = os.path.join(session_dir, "demo-session.jsonl")
SLOW = float(os.environ.get("PI_DEMO_DELAY", "0.9"))


def out(obj):
    with lock:
        sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def respond(cid, command, data=None, ok=True):
    out({"id": cid, "type": "response", "command": command, "success": ok, "data": data or {}})


def say(text):
    for i in range(0, len(text), 12):
        out({"type": "message_update", "assistantMessageEvent": {"type": "text_delta", "delta": text[i:i + 12]}})
        time.sleep(0.03)
    out({"type": "message_end", "message": {"role": "assistant", "content": [{"type": "text", "text": text}], "stopReason": "toolUse"}})


def tool(name, args, run=None):
    state["n"] += 1
    cid = f"call_{state['n']}"
    out({"type": "tool_execution_start", "toolCallId": cid, "toolName": name, "args": args})
    time.sleep(SLOW)
    text, err = ("ok", False) if run is None else run()
    out({"type": "tool_execution_end", "toolCallId": cid, "toolName": name,
         "result": {"content": [{"type": "text", "text": text}]}, "isError": err})
    state["cost"] += 0.004


def bash(cmd):
    def run():
        p = subprocess.run(["/bin/sh", "-c", cmd], capture_output=True, text=True, timeout=120)
        return (p.stdout + p.stderr)[-4000:] or "(no output)", p.returncode != 0
    tool("bash", {"command": cmd}, run)


def read(path):
    def run():
        try:
            return open(path).read()[:4000], False
        except OSError as e:
            return str(e), True
    tool("read", {"path": os.path.abspath(path)}, run)


def edit(path, old, new):
    def run():
        src = open(path).read()
        if old not in src:
            return "text not found", True
        open(path, "w").write(src.replace(old, new, 1))
        return f"Edited {path}", False
    tool("edit", {"path": os.path.abspath(path), "oldText": old, "newText": new}, run)


def log(kind, text):
    tool("log", {"kind": kind, "text": text})


def ask(question, options, why):
    rid = f"ui_{state['n']}"
    ev = threading.Event()
    pending[rid] = {"event": ev}
    title = "tower:" + json.dumps({"tower": "question", "question": question, "options": options, "why": why}, ensure_ascii=False)
    state["n"] += 1
    cid = f"call_{state['n']}"
    out({"type": "tool_execution_start", "toolCallId": cid, "toolName": "ask_user", "args": {"question": question, "options": options}})
    out({"type": "extension_ui_request", "id": rid, "method": "input", "title": title})
    ev.wait()
    answer = pending.pop(rid).get("value") or ""
    out({"type": "tool_execution_end", "toolCallId": cid, "toolName": "ask_user",
         "result": {"content": [{"type": "text", "text": f"The human answered: {answer}"}]}, "isError": False})
    return answer


def turn_end():
    out({"type": "turn_end", "message": {}, "toolResults": []})


def settle():
    turn_end()
    out({"type": "agent_end", "messages": [], "willRetry": False})
    out({"type": "agent_settled", "aborted": False})


def criteria_ids(message):
    return re.findall(r"^- (C\d+) ", message, re.M) or ["C1"]


def submit(summary, message):
    tool("submit", {"summary": summary, "criteria": [{"id": c, "met": True, "evidence": "本地 npm test 通过"} for c in criteria_ids(message)]})


def files():
    p = subprocess.run(["git", "ls-files"], capture_output=True, text=True)
    return [f for f in p.stdout.split() if f.endswith((".js", ".ts", ".json"))][:4]


def fix_cart():
    if os.path.exists("src/cart.js"):
        edit("src/cart.js", "sum + item.price + item.qty", "sum + item.price * item.qty")


def intent_of(message):
    """The goal's intent, remembered across runs (each run is a new process)."""
    path = os.path.join(session_dir, "demo-intent.txt")
    m = re.search(r"## Intent\n(.*?)\n", message)
    if m:
        open(path, "w").write(m.group(1))
        return m.group(1)
    try:
        return open(path).read()
    except OSError:
        return ""


def run(message):
    out({"type": "agent_start"})
    out({"type": "turn_start"})
    intent = intent_of(message)
    rework = "did not pass" in message
    changes = "asked for changes" in message
    if any(w in intent for w in ("卡住", "stuck")):
        say("我先看一下代码结构。")
        for f in files()[:2]:
            read(f)
        say("我不太确定接下来该做什么。")
        out({"type": "message_end", "message": {"role": "assistant", "content": [{"type": "text", "text": "需要更多信息。"}], "stopReason": "stop"}})
        settle()
        return
    if rework:
        say("验证没有通过，我看一下失败输出。")
        log("cause", "上次只改了折扣，没有修数量的乘法")
        fix_cart()
        bash("npm test 2>&1 | tail -5")
        submit("修正了 total 中单价与数量的运算", message)
        settle()
        return
    if changes:
        say("按评审意见修改。")
        log("decision", "按评审意见补充了注释")
        if os.path.exists("src/cart.js"):
            edit("src/cart.js", "function total(", "// 总价 = Σ 单价 × 数量\nfunction total(")
        bash("npm test 2>&1 | tail -5")
        submit("按评审意见补充了注释", message)
        settle()
        return
    say("先读一下相关代码，再跑一遍测试看失败在哪。")
    for f in files():
        read(f)
    log("next", "先复现失败的测试")
    bash("npm test 2>&1 | tail -8")
    turn_end()
    log("cause", "total() 把单价和数量相加了，应该相乘")
    if any(w in intent for w in ("询问", "ask the")):
        answer = ask("折扣要在乘以数量之前还是之后计算？", ["之前", "之后"], "决定了 total() 的公式")
        log("decision", f"按你的回答，折扣在数量相乘{answer}计算")
    if any(w in intent for w in ("返工", "rework")):
        log("assumption", "测试数据里的数量都是 1，可以忽略数量")
        say("我认为改成这样就够了。")
        submit("调整了 total 的计算", message)
        settle()
        return
    fix_cart()
    bash("npm test 2>&1 | tail -5")
    log("progress", "测试在本地通过")
    say("改动完成，测试在我的环境里通过了。")
    submit("把 total() 中的单价与数量改为相乘，并保留原有接口", message)
    settle()


if "--version" in sys.argv:
    print("demo-engine 0.1 (scripted, no model)")
    sys.exit(0)

for line in sys.stdin:
    try:
        cmd = json.loads(line)
    except ValueError:
        continue
    t, cid = cmd.get("type"), cmd.get("id")
    if t == "get_state":
        respond(cid, t, {"sessionFile": session, "sessionId": "demo", "isStreaming": False})
    elif t == "get_session_stats":
        respond(cid, t, {"cost": round(state["cost"], 4)})
    elif t == "get_available_models":
        respond(cid, t, {"models": [{"provider": "demo", "id": "scripted", "name": "Demo (scripted)", "reasoning": False,
                                     "cost": {"input": 0, "output": 0}, "contextWindow": 0}]})
    elif t == "prompt":
        respond(cid, t, {"disposition": "started"})
        threading.Thread(target=run, args=(cmd.get("message", ""),), daemon=True).start()
    elif t in ("steer", "follow_up"):
        respond(cid, t, {"disposition": "queued"})
    elif t == "abort":
        respond(cid, t)
    elif t == "extension_ui_response":
        p = pending.get(cmd.get("id"))
        if p is not None:
            p["value"] = cmd.get("value")
            p["event"].set()
    else:
        respond(cid, t, ok=False)

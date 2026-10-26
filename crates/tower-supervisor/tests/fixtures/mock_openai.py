#!/usr/bin/env python3
"""A scripted OpenAI-compatible chat completions server for testing Tower
against the real Pi. Each request's position in the script is the number of
tool results already in the conversation. Prints the port it listens on."""
import json, os, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STEPS = [
    ("log", {"kind": "cause", "text": "缺少 result.txt"}),
    ("bash", {"command": "echo hello > note.txt && cat note.txt"}),
    ("bash", {"command": "echo pwned > ../escape.txt 2>&1 || echo WRITE_DENIED"}),
    ("bash", {"command": "cat \"$HOME/.ssh/id_test\" 2>&1 || echo READ_DENIED"}),
    ("bash", {"command": "env | grep -c _API_KEY || true"}),
    ("read", {"path": "~/.ssh/id_test"}),
    ("edit", {"path": "note.txt", "edits": [{"oldText": "hello", "newText": "hello, edited in the sandbox"}]}),
    ("read", {"path": "note.txt"}),
    ("bash", {"command": "curl -sS -m 5 -o /dev/null https://example.com 2>/dev/null && echo NET_OPEN || echo NET_DENIED"}),
    ("grep", {"pattern": "hello"}),
    ("bash", {"command": "git push origin main"}),
    ("ask_user", {"question": "写入哪个字母？", "options": ["a", "b"]}),
    ("write", {"path": "result.txt", "content": "@ANSWER@\n"}),
    ("submit", {"summary": "按回答写入了 result.txt", "criteria": [{"id": "C1", "met": True, "evidence": "写入了文件"}]}),
]

# A model that makes the failing test pass by changing what it expects.
CHEAT = [
    ("read", {"path": "test/cart.test.js"}),
    ("edit", {"path": "test/cart.test.js", "edits": [{"oldText": "assert.equal(total(), 17);", "newText": "assert.equal(total(), 11);"}]}),
    ("submit", {"summary": "Tests pass now", "criteria": [{"id": "C1", "met": True, "evidence": "node --test passes"}]}),
]

if os.environ.get("MOCK_SCENARIO") == "cheat":
    STEPS = CHEAT


def answer_from(messages):
    for m in reversed(messages):
        content = m.get("content")
        text = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
        if m.get("role") == "tool" and "The human answered:" in text:
            return text.split("The human answered:")[1].strip().strip('"').split("\\n")[0].strip()
    return "none"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        messages = body.get("messages", [])
        step = sum(1 for m in messages if m.get("role") == "tool")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()

        def send(obj):
            self.wfile.write(f"data: {json.dumps(obj, ensure_ascii=False)}\n\n".encode())
            self.wfile.flush()

        base = {"id": "c", "object": "chat.completion.chunk", "created": 0, "model": "scripted"}
        if step < len(STEPS):
            name, args = STEPS[step]
            args_text = json.dumps(args, ensure_ascii=False).replace("@ANSWER@", answer_from(messages))
            send({**base, "choices": [{"index": 0, "delta": {"role": "assistant", "tool_calls": [
                {"index": 0, "id": f"call_{step}", "type": "function", "function": {"name": name, "arguments": args_text}}]}, "finish_reason": None}]})
            send({**base, "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]})
        else:
            send({**base, "choices": [{"index": 0, "delta": {"role": "assistant", "content": "完成。"}, "finish_reason": None}]})
            send({**base, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]})
        send({**base, "choices": [], "usage": {"prompt_tokens": 100, "completion_tokens": 10, "total_tokens": 110}})
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
print(server.server_address[1], flush=True)
server.serve_forever()

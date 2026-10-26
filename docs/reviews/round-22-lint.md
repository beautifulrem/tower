# 第 22 轮 · lint 补记：(w) 表格行解析的容错

日期：2026-10-15 · 范围：`reviews/lint/xref.py` 的 (w) 与 (w′)，以及全量复跑。

## 1. 问题

07/08 作者报告：`08` §8.4/§8.8 的表格中，首格以 `` `stalled{prepare_failed}` `` 开头的行会使 (w) 崩溃（`AttributeError`），整个运行中止，而不是报告一条 lint 问题。作者随后把这两行改写为“`` `stalled` ``（子类型 `` `prepare_failed` ``，ADR-148）”以绕开崩溃。旧解析器会忽略这种写法中的子类型，两行都只被当作 `stalled`。

原因是 `check_w()` 内部的 `table_rows()` 用 `` `([a-z_]+)` `` 匹配首格。这个正则不接受花括号中的子类型，匹配失败时直接对 `None` 取 `.group(1)`。另外，(w′) 用 `| `kind`` 子串判断某个 kind 在 `08` 中是否有行；首格写成 `` `kind{sub}` `` 时，这一判断会把已有的行当作缺失。

## 2. 修改（`reviews/lint/xref.py`）

- **新增模块级 `parse_ny_cell(cell)`**：返回 `(kind, 检测器或子类型 | None)`，无法解析时返回 `None`，不抛异常。接受以下写法：
  - `` `kind` ``
  - `` `kind{sub}` ``
  - “`` `kind` ``（`` `det` ``……）”
  - “`` `kind` ``（`detector = det`……）”
  - “`` `kind` ``（子类型 `` `sub` ``）”
  - “`` `kind` ``（owner: ……）”
- **新增 `ny_table_rows(txt)`**：返回 `(可解析的行, 无法解析的首格)`。列数不足或首格无法解析的行进入第二个列表。
- **`check_w()`**：改用 `ny_table_rows()`。无法解析的行报为 `UNPARSABLE_ROW <表> <首格>`，计入失败数，运行继续。
- **`check_w2()`（w′）**：判断 `08` §8.4/§8.8 是否有某个 kind 的行时，改用同一解析器，不再用子串匹配，因此 `` `kind{sub}` `` 写法的行同样计入。

## 3. 植入错误测试

在临时副本的 `08` §8.4 中插入三行：

| 植入的首格 | 预期 | 结果 |
|---|---|---|
| `` `stalled{prepare_failed}` `` | 正常解析为 `stalled / prepare_failed`；§8.8 已有同名行，不报 | 未报 ✓ |
| `` `anomaly` ``（子类型 `` `foo_bar` ``） | 解析为 `anomaly / foo_bar`；§8.8 无对应行 → `NO_OUTCOME` | `NO_OUTCOME anomaly/foo_bar` ✓ |
| `` `Stalled-X{ `` | 无法解析 → `UNPARSABLE_ROW`，运行不中止 | `UNPARSABLE_ROW 08 §8.4 `Stalled-X{` ✓，退出码 1，其余检查照常输出 |

直接调用解析器的结果：

- `` `stalled{prepare_failed}` `` → `('stalled', 'prepare_failed')`
- “`` `stalled` ``（子类型 `` `loop` ``）” → `('stalled', 'loop')`
- “`` `sentinel` ``（`` `detector = sandbox_violation` ``，…）” → `('sentinel', 'sandbox_violation')`
- `Stalled` → `None`

## 4. 全量复跑

```
$ python3 docs/reviews/lint/xref.py --checks rstuvwxyzckdnSeRq ; echo exit=$?
headings=558 adrs=148 section_refs=3091 problems=0
(r) unique-definition contradictions=0
(s) three-way enums: 8/8 consistent
(u) SP6b batch-table disagreements=0
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 80)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(w′) pauseReason → Needs-You problems=0
(y) cross-column CHECK vs 16 problems=0
(z) push/PR/remote polling presented as M1=0
(c) continuation literal shape vs 02=0
(d) deleted mechanism names outside history=0
(n) contract-test references=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(s′) enum values used in rule text / pseudo-code outside the registered set=0
(e) ADR back-markers: 97 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 26 pairs, differing values=0
(q) verbatim-quote mismatches=0
(t) open markers=0
exit=0
```

全部通过。`08` §8.4 与 §8.8 中“`` `stalled` ``（子类型 `` `prepare_failed` ``，ADR-148）”两行现在被解析为 `stalled / prepare_failed` 并互相配对，以后改回 `` `stalled{prepare_failed}` `` 写法也不会再崩溃。本补记只修了 lint 工具，未修改任何设计文档。

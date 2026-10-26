# 第 19 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 依据：`16-registry.md`、`15` ADR-001–145 与 ADR-133 第 19 轮补记（M1 维持 37 个日历周，2026-11-09 → 2027-07-23）、`reviews/round-19.md`（R19-D15-01）及第 19 轮回应。只做机械修正，需要设计裁决的列入 §4。

## 1. 结果

```
$ python3 docs/reviews/lint/xref.py --checks rstuvwxyzckdnSeRq ; echo exit=$?
headings=558 adrs=145 section_refs=3049 problems=0
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
(e) ADR back-markers: 90 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 26 pairs, differing values=0
(q) verbatim-quote mismatches=0
(t) open markers=0
exit=0
```

**全部检查通过。** 新检查在命令行中写作 `R`（r′）与 `q`。

修正前只有 (q) 报 1 条：`10` §10.1.2 声称与 `07` 逐字一致，但没有引文，实际也不是逐字（§2.1）。

R19-D15-01 点名的 cgroup 粒度冲突与 `06` 的逐字引用漏项，作者已在本轮修订中改正。新检查对当前文本为 0，并已用植入的错误确认能捕获这两类问题（§3）。

## 2. 修正清单

### 2.1 文档

- **`10` §10.1.2 “两种检出”**：“写出规则（与 `07` §7.3.2 **逐字一致**……）”→“（与 `07` §7.3.2 为同一规则：`07` 为概述，本节逐项展开；ADR-111/116/124）”。两处的规则内容一致，但 `10` 是分项展开，`07` 是一段概述，文字并不逐字相同，“逐字一致”的声明不成立。

### 2.2 第 19 轮改变的规则：旧表述扫描（任务 4）

| 类别 | 结果 |
|---|---|
| “知悉”结束存活期间 | 0。`04` §4.8.8、`06` §6.1.10、`07` §7.4.1 与 §7.10.3、`08` §8.4 与 §8.8、`10` §10.3.1、`16` 均为“只结束打扰，存活期间到存活者全部退出为止” |
| Agent 进程 cgroup 每 Goal 一个 | 0。`10` §10.3.1 为唯一取值（每 Goal 一个父 cgroup、每 Run 一个子 cgroup），`06` §6.1.10 引用 |
| `spawnHook` 作为令牌注入点 | 0。`05` §5.3.5 与契约测试 D38 写明令牌由 `BashOperations.exec` 自身注入。`11` §11.7 中“批准后只对该次 bash 调用经 `spawnHook` 注入”的是密钥环境变量，不是 Run 令牌，与本条无关 |
| `TOWER_ORIGIN` 用于归因 | 0。`06`、`07`、`10`、`11`、`16` 均为“只用于诊断，不作为归因依据” |
| 按 index 撤回 | 0。ADR-144 正文已就地划去，并改为 `openingId` |
| M1 不是 37 周 / 2027-07-23 | 0。“32–36 周”只出现在 `14` 历次处理段、`16` 废弃表；“32 周（至 2027-06-18）”是增 1 人方案的现值 |

### 2.3 lint 工具（`reviews/lint/xref.py`）

- **新增 (r′)（参数 `R`）**：
  - 收集所有指向其他文档章节、并在同一子句中出现“一致 / 唯一定义 / 只引用 / 为准”的引用。
  - 若两处**互相**指向对方所在章节，且两句有共同主题词（ASCII 标识符，例如 `cgroup`），就比较三类事实：带单位的数字；“每 X 一个”的粒度；属于 (s) 已登记枚举的取值。三者中任一不同即报出。
  - `16` §16.1.13 废弃表引用旧写法，不计入。共同主题词过滤用于排除只是互相引用、主题不同的句子（开发时曾把 `10` §10.3.1 关于 I4 的句子与一条讨论 I2 分界的句子误配）。
- **新增 (q)**：凡含“逐字引用 / 逐字一致 / word for word”的段落：
  - 必须用“…”给出引文（内部嵌套引号按配对处理）；
  - 按段首加粗标签，在被引章节中找到同名段落；
  - 去除空白、`**`、反引号、引号并统一全半角括号后，引文必须与该段正文完全相同；
  - 没有引文的“逐字”声明报为 `UNVERIFIABLE_VERBATIM_CLAIM`。
- **(r) 新增四个第 19 轮概念**（规范位置 `10` §10.3.1 或 `06` §6.4.3）：
  - “知悉”不结束存活期间；
  - cgroup 粒度（每 Goal 父、每 Run 子）；
  - Run 令牌的注入点与 `TOWER_ORIGIN` 不作归因；
  - 开场按 id 撤回。

## 3. 植入错误验证（任务 2）

在临时副本中：

| 检查 | 植入的错误 | 结果 |
|---|---|---|
| (r′) | 把 `10` §10.3.1 改回“Linux 以每个 Run 一个 cgroup 为主，与 `06` §6.1.10 一致”，并把 `06` §6.1.10 改回“粒度以 `10` §10.3.1 为唯一定义：每个 Goal 一个”（即 R19-D15-01 第 1 项的原状） | 报出 `MUTUAL_CLAIM_DIFFERS 06:190 ↔ 10:232 粒度 ['Goal'] vs ['Run']` |
| (q) | 从 `06` §6.4.3 引用 `03` §3.2.1 的引文中删去“以及 rebase（M2）带入的 base 变化”（即 R19-D15-01 第 3 项的原状） | 报出 `QUOTE_DIFFERS 06 822 vs 03 §3.2.1 “验证失败是否自动返工”`，并给出首个不同处的上下文 |
| (r) 第 19 轮概念 | 植入：“‘知悉’后结束存活期间”“cgroup 粒度：每个 Goal 一个”“令牌由沙箱 bash 的 `spawnHook`/`operations` 注入”“按 `TOWER_ORIGIN` 归因”“`goal.openings.withdraw{goalId, index}`” | 五句全部报出 |

## 4. 需要设计裁决的问题（未修改）

| # | 问题 | 位置 | 说明 / 选项 |
|---|---|---|---|
| U1 | **兜底重试超过 64 次之后是否生成树** | 见下 | 裁决与它所指的唯一定义互相矛盾 |

U1 的两方：

- **第 18 轮 lint 裁决**（`15`，ADR-139/144 附）：“兜底最多 64 次；**超过时无法生成树**，按 `nested_repo`（运行中为 `nested_repo_live`）阻断并记 Fact”，并写“`10` §10.1.2 为唯一定义”。
- **`10` §10.1.2 第 3 步**：“兜底重试超过 64 次时停止重试，**检查点或 pin 以已排除的路径完成**，未能收录的路径同样列入 `excludedPaths`”。`06` §6.2.2（“之后以已排除的路径完成”）与 `13` §13.11.1 的预算行同此。

两种写法对“超过 64 次后有没有检查点 / pin”给出相反答案：前者没有树（Goal 只能停在阻断状态），后者有一棵排除了这些路径的树。两者都以 `nested_repo` 阻断 Verified，差别在于检查点链与“删除这些条目”之后能否从这棵树继续。

选项：

- **(a)** 以 `10` 为准，在裁决文本中把“无法生成树”改为“以已排除的路径完成”；
- **(b)** 以裁决为准，改 `10`、`06`、`13`，并说明此时检查点链如何处理。

(r′) 没有捕获这一项：两处不是互相声称一致，`15` 只是单向指向 `10`。

## 5. 复现

```
python3 docs/reviews/lint/xref.py --checks rstuvwxyzckdnSeRq
```

写“与 X 一致”“以 X 为唯一定义”时，两处的数字、粒度与枚举取值必须相同，(r′) 会比较。写“逐字引用”时，必须用“…”给出引文，(q) 会与被引段落逐字比较；只是规则相同、文字不同的，请写“同一规则”，不要写“逐字”。

## 主干裁决

- 兜底重试超过 64 次：改为把全部已拒绝路径的父目录整体排除后再生成一次树（总能完成），检查点与 pin 照常生成并以 `nested_repo` 阻断；`15` 裁决文字与 `10` §10.1.2 已统一（`06`、`13` 的“以已排除的路径完成”与之相容）。复跑 exit 0。

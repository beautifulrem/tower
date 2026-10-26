# 第 53 轮评审回应（收尾：评审结论中的观察）

决策：ADR-181（`15` 末尾；ADR-180 标题加 “Amended by ADR-181”）。本文件关闭 `round-53.md` §5 “不扣分的观察”全部 15 条。行号为修改后的近似位置。

## 观察 → 改动

| # | 观察 | 文件 | 行 | 改动 |
|---|---|---|---|---|
| 1 | `04` §4.8.2 倒计时表自带一套文案 | `04` | L785、L831 | `CountdownLabel` 一行改为引用 `08` §8.7.1 倒计时文案表的五种情形（唯一定义），样式指向 `12` §12.12；§4.8.5 S0 卡片说明改为按 `08` “S0 执行授权”一行显示 |
| 2 | 重新 seal 的 `P` 在写入 `B-v<k>` 后有歧义 | `10` | L600–613、L1251 | B 定义为本 Goal 最近一次 seal 写入的分支，P 为该次写入的 seal，都取自最近一条 `integration.performed`（新增 `branch` 字段）；首行改为“被撤销的 seal 曾写入 B”，按写入记录判定，不按 git 祖先关系，并写明理由；写入 `B-v<k>` 后它成为新的 B，之后的重新 seal 在其上快进或另开分支；B 被删除时以 `baseCommit` 为父写入同名分支 |
| | | `16` | L515 | §16.1.14 `integration.performed{…, branch, …}` |
| 3 | `integrationRevertedSeal` 何时清除 | `16` | L52 | 写明从不清除、只由再一次 `undo_integrate` 覆盖，以及为什么不会误伤：`integrated` 要求最近一次验收的 seal；首行按写入记录判定；`reverted` 标记只在非 `integrated` 时显示 |
| | | `02` | L224 | 注释补“从不清除，再次撤销时覆盖” |
| 4 | 手动重建在原子 `rename` 之后、提交之前崩溃 | `06` | L140 | 续做前把已存在的卫星工作目录与 gitdir 原样移入同一文件系统上的旁路目录，续做成功后删除，不把它当作已完成的重建 |
| | | `10` | L1174 | 情形 E 的“中途崩溃”一句同步 |
| 5 | 手动重建失败后重启是否再自动重建 | `06` | L139 | 已带 `satellite_missing` 且 `satellite_rebuilding=0` 的 Goal 不触发自动重建行：之前的重建（自动或人选）已失败，重启不再自动重建，Needs-You 保持打开，由人再选 |
| | | `10` | L1174 | 情形 E 补“失败后不再自动重试，重启也不重试” |
| 6 | `16` 改写清单自称穷举但有遗漏 | `16` | L35 | 补 `request_changes`（`sentinel_high` 中 → `run`）与 `revert_external_change`（存活进程且目标为 `verify`/`review` → `verify_new`），与 `03` L69 一致；lint (k) 通过 |
| 7 | `engine.*` 存储类型名不一致 | `06` | L775 | 写入唯一规则：存储 `type` = `engine.` + `EngineEvent.t`，`.` 改为 `_`（`engine.tool_start`/`engine.tool_end` 等），`engine.error`/`engine.exit` 原样；列表改用存储名；说明正文中 `tool.start`/`tool.end` 指线上事件名 |
| | | `02` | L717 | `TowerEvent.type` 注释引用该规则 |
| | | `16` | L515、L499 | §16.1.14 `engine` 行改用存储名并引用 `06` §6.3；§16.1.13 登记不带前缀的写法为已取代；lint (i) 通过 |
| 8 | `HumanDecision.target` 没有在 `16` 单列 | `16` | L146 | 新增一行，键与 `02` §2.7 一致（含 `checkpointN`、`openingId`），注明各键的使用者；lint (o) 比较 8 行、无差异 |
| 9 | 密钥路径表缺 §16.8 视为可能含凭据的配置 | `11` | L158 | 补 `~/.gitconfig`、`~/.config/git/config`、`~/.cargo/config.toml`、`~/.config/uv/uv.toml`、`~/.config/pip/pip.conf`、`~/.pip/pip.conf`、`~/.yarnrc.yml`、Go env 文件（`go env GOENV`，macOS 默认 `~/Library/Application Support/go/env`），标为“可能含凭据”，与 §16.8 一致，按 `secrets.access` 分类 |
| 10 | T25 读取残余只写“被忽略” | `11` | L654 | 补“未跟踪且未被忽略的文件”（副本只复制已跟踪文件，但真实检出中两类都在原处） |
| | | `14` | L133 | G46(ap) 期望改为 `notes/token.txt` 与 `.cache/creds` 在真实检出中都可读 |
| 11 | 链接检查器没有地址规则与威胁条目 | `07` | L922 | §7.4.9 新增目标地址规则（唯一定义）：先解析后检查，拒绝回环、链路本地、私网、唯一本地、未指定与元数据地址；连接使用检查过的地址；不自动跟随重定向、逐跳检查；被拒绝的链接使该检查为 `skipped`（`address_refused`），按 `links_unchecked` 计入 V；不可由合同或 `VerifyProfile` 关闭 |
| | | `11` | L664 | 威胁表新增 T34：只写缺失的不变量与危害类别（服务端请求伪造一类），不含利用细节 |
| 12 | 试运行计数口径不一；“观测”一词冲突 | `04` | L1075、L1096–1097 | C4 改为 `失败 0/1`；新增计数写法规则（一律 `通过数/用例数`）；“base 上的一次观测”改为“base 上的一次试运行结果”，注明不是 `12` §12.5.1 的“观测” |
| | | `07` | L470 | 同一措辞替换 |
| | | `16` | L498 | §16.1.13 登记旧说法，lint (D) 守住 |
| 13 | `12` 软矛盾示例没有 X 规则能产生 | `12` | L293–295 | 改为 X1 的例子：自由文本“已修复 webhook.ts 中的幂等检查”，而本次运行的改动中没有该文件 |
| 14 | G46(an) 输入缺 `paused(verify_failed_limit)`；(al) 未标 M2 | `14` | L133 | (an) 输入构造达到返工上限的 `paused(verify_failed_limit)` Goal，并在降级后执行不带 `note` 的 `goal.resume`；(al) 标 M2 |
| 15 | `createBranchedSession` 是实例方法 | `10` | L769、L771 | “分叉为新 Goal”改为对源文件另开专用实例 `SessionManager.open(源文件, 新 Goal 会话目录, 新卫星)` 后调用实例方法，用完即弃；写明不在源 Goal 的实例或运行时上调用；返回路径不存在时按失败处理；Best-of-N 同样每个分叉用一个新实例，`parentSession` 都指向源文件 |
| | | `05` | L1180、L1344 | §5.8 表改用同一做法，不用 `runtime.fork`；D40 注明 `createBranchedSession` 是实例方法 |
| | | `16` | L500 | §16.1.13 登记旧写法 |

## Pi v1.2.0 核实（第 15 条）

- `packages/coding-agent/src/core/session-manager.ts:1632-1748`：`createBranchedSession(leafId)` 是实例方法；L1712–1714 把 `this.fileEntries`、`this.sessionId`、`this.sessionFile` 换成新文件；L1680–1681 新文件头 `cwd: this.cwd`、`parentSession: previousSessionFile`；L1673 新文件位于 `this.getSessionDir()`；L1719–1724 路径中没有 user/assistant 消息时不立即写文件。
- 同文件 `:1766-1791`：`SessionManager.open(path, sessionDir?, cwdOverride?)`：`cwdOverride` 成为实例的 cwd，`sessionDir` 决定分叉文件的位置。
- `packages/coding-agent/src/core/agent-session-runtime.ts:262-350`：`fork()` 自己也是先 `SessionManager.open(currentSessionFile, sessionDir)` 另开实例（L315–316）再分叉，然后 `teardownCurrent` 并把整个运行时切到新会话（L320–328）。所以它不适合“源 Goal 保留、新 Goal 另起”。

## 排期

- 第 11 条是实际的实现工作：W9 +0.02（Agent 线，计入 W9a，不在依赖链上）。其余 14 条按 WBS 行逐项不足 0.01，计 0。第 15 条只是换成正确的 API，调用次数不变，计 0。
- `14` §14.3.4 与 `15` ADR-133 “第 53 轮补正”的数字一致，由脚本计算：WBS 122.16；Agent 26.28，冻结前所需 25.88 × 1.1 = 28.468 → 28.47，余量 0.53；系统线不变（余量 0.12）；增 1 人方案 128.00 人周，T = 130.00 / 5.5 = 23.64，仍为 33 周；M1 维持 38 周。

## lint

`python3 reviews/lint/xref.py --checks rstuvwxyzckdnSeRqpoPiD`：exit 0（ADR 181；(o) 8 行；(i) 31 个名称；(D) 46 个短语）。

# 第 52 轮评审回应（收尾：观察、作者回报与 lint）

决策：ADR-179（`15` 末尾；ADR-178 标题加 “Amended by ADR-179”）。本文件关闭 `round-52.md` §5 “不扣分的观察”全部条目、§3.1 建议的两项 lint，以及 `round-52-response-writers.md` 之后发现的两处缺口。行号为修改后的近似位置。

## Pi 的措辞

| 条目 | 文件 | 行 | 改动 |
|---|---|---|---|
| D58 / F7 | `05` | L1362 | D58：“只发出一条普通消息、不触发登录”改为“不触发登录（认证失效时直接报认证错误：`prompt` 的预检先于发送，`agent-session.ts:2118-2131`；认证有效时它作为一条普通消息进入会话，ADR-179）”。v1.2.0 源码核实：L2118 `hasConfiguredAuth`，L2127 抛出 “Run '/login …' to re-authenticate”，在 `_startRun` 之前 |
| C39(a) | `05` | L1411 | 限定为**已认证**的 faux provider；补“认证失效时同一命令由预检直接报认证错误、不发出消息、不进入登录流程” |
| F7 | `06` | L1171 | 括注改为“`pi /login <provider>` 不触发登录（认证失效时直接报认证错误）”，引用 ADR-176/179 |
| `shellPath` | `11` | L273 | `createBashToolDefinition(...)` 的参数中删去 `shellPath`；补“`shellPath` 不作为参数传入（传入 `operations` 时 Pi 忽略它，v1.2.0 `bash.ts:248`），由沙箱执行层用 `getShellConfig(shellPath)` 构造 `operations`（`05` §5.3.5）”。源码核实：`bash.ts:248` 为 `options?.operations ?? createLocalBashOperations({ shellPath: options?.shellPath })`；`getShellConfig` 在 `index.ts:496` 导出 |

## 生命周期与恢复

| 条目 | 文件 | 行 | 改动 |
|---|---|---|---|
| 恢复前 safety 检查点 | `10` | L791 | `restorePaths` 定义处：M1 中“可再撤销”的含义是内容保留在影子中（回退到非回合检查点属于 M2，`06` §6.4.3 `run.rewind`、`04` §4.7.2）；M2 实现回退时，该检查点对 `paths` 中来源不明的路径记 `externalPaths`（与 drain 期间的回合检查点相同） |
| 接管入口 | `03` | L78 | `human` 行 `take_over` 入口列补 `ready`（只在检出完成标记存在时，准备阶段不允许，见 `ready` 行）；继续目标写“从 `running`/`ready` 接管 → `run`” |
| M2 标注 | `03` | L85 | “撤销人的改动（回退到人编辑前的检查点）后 `retry_verify`”加 **M2**，并注明 `run.rewind` 在 `03` §3.2 的转移边随 M2 回退一并补上 |
| 检出丢失 | `06` | L142 | §6.1.6 选项“交给 Agent 继续”改为“继续（`goal.resume`）”，文案按 `takeoverFrom`：`in_review`/`accepted` → “回到评审”，`running`/`ready` → “交给 Agent 继续”，`paused` → 按保留的继续目标（`verify`/`verify_new` 时为“重新验证”） |
| 检出丢失 | `10` | L948 | 同一规则，以 `06` §6.1.6 为准 |
| `run.requested` 时点 | `06` | L296 | §6.2.4：`run.requested` 一律在准入通过时发出，§6.4.3 各命令行中的 `run.requested{…}` 都指这一条；未通过时只写 `queued_run` |
| `run.requested` 时点 | `06` | L853 | §6.4.3 “暂停出口的统一写法”：`run` → 经 §6.2.4 准入，准入通过时发 `run.requested{resume}`（原文写在准入之前） |
| 试运行 | `06` | L864 | `contract.trial_criterion`：不经 `verify(goal, trigger)`、没有 `VerifyTrigger`（`07` §7.4.1），不生成 pin、不改变状态、不进入 `decide()`；结果写入合同页与卡片 |
| 试运行 | `03` | L125 | §3.4.1 第 3 步括注同一规则 |
| 试运行 | `16` | L51 | `VerifyTrigger` 行补“合同试运行没有 `VerifyTrigger`” |

## 事件类型索引

| 文件 | 行 | 改动 |
|---|---|---|
| `16` | L497–526 | 新增 §16.1.14 “事件类型索引”（放在 §16.1.13 之后，不改变 lint 依赖的 §16.1.13 编号）：按前缀列出 `goal`、`human`、`run`、`engine`、`verify`、`fact`、`contract`、`needs_you`、`review`/`comment`、`settings`/`project`、`prepare`、`agent_proc`、`system`、`integration`、`workspace`/`binding`/`mirror`、`memory`/`attention`、`privacy`/`scratch`/`autonomy`/`export`、`watermark`、`audit` 的事件类型与定义位置，覆盖 `16` 各行与 `06` §6.3 事件注释、§6.4.3 事件列中出现的全部事件；表前写明“只是索引，`06` §6.3 仍是定义处”；末行注明 `tower.*` 是开场注入与会话条目，不是事件类型 |
| `06` | L404 | §6.3 事件注释加“全部事件类型的索引见 16 §16.1.14，本节仍是定义处” |

## 安全登记

| 文件 | 行 | 改动 |
|---|---|---|
| `11` | L156 | §11.3.1 密钥路径表补 `~/.git-credentials`、`~/.config/git/credentials`、`~/.cargo/credentials.toml`、`~/.cargo/credentials`；`~/.config/gh/**` 注明含 `hosts.yml`（`~/.netrc`、`~/.pypirc`、`~/.docker/config.json` 原已在表中）；注明 S2 下只影响 S0 的分类与技能路径排除 |
| `06` | L978 | §6.4.7 禁止远程清单补 `project.merge`/`project.split`（与 §6.4.3 该行及 `16` §16.5 一致） |
| `02` | L185 | `Goal.s0GrantExpiresOn?: "run_end" \| "next_run_start"`：远程批准的 S0 授权按事件失效，到达时 `s0Grant` 回到 `none`，本机批准为空 |
| `02` | L317 | `AutonomyMatrix.grants[]` 加 `expiresOn?: "run_end" \| "next_run_start"`，与 `until` 取先到者 |
| `06` | L479 | DDL `goals.s0_grant_expires_on`（`CHECK` 两值或 NULL）；`run.ended`/`run.started` 的同一事务中置回 `s0_grant='none'` 并清除 |
| `06` | L897 | `s0.grant` 行：远程批准时同一事务写 `s0_grant_expires_on`（Run 中 → `run_end`，没有 Run → `next_run_start`） |
| `16` | L33 | 新增 `Goal.s0GrantExpiresOn` / `AutonomyMatrix.grants[].expiresOn` 行 |
| `11` | L115、L578 | §11.2 授权表“本 Goal 内同类”注明远程选择时带 `expiresOn`；§11.9 统一有效期后注明两个字段（规则仍只在 §11.9 定义） |

## 文案与线框（`04`、`07`）

| 文件 | 行 | 改动 |
|---|---|---|
| `04` | L1073–1074 | 合同线框 C3、C4：`✓ 红灯，可证明完成` → `◇ 红灯 · 能区分前后`（框宽不变，显示宽度逐行核对为 164） |
| `04` | L1095 | §4.10.2：“合同能证明‘完成’”改为“合同有能区分改动前后的机器标准”，并注明试运行是 base 上的一次观测、红灯不证明完成，完成只以验证器在 pin 上的结果为准；`◇ 没有能证明完成的机器标准` → `◇ 没有能区分改动前后的机器标准` |
| `04` | L1319 | 同一提示文案同步 |
| `07` | L470 | 试运行红灯徽标改为 `◇ 红灯 · 能区分前后（…若红灯源于此，它不是有效红灯）`，与 `04`、`11` 的说法一致 |
| `04` | L1292–1293 | 本地文件线框：`web/fixtures/seed.json` 的“机密”列 `无` → `未检出`，`[标记为机密]` 移到第二行（框宽 95 不变） |
| `04` | L1301 | 规则补“不是机密的条目写 `未检出`，不写‘无’（只做过模式扫描）” |
| `04` | L1028、L1032 | 应用级简报 G-0142、G-0147 的进度改为两轨（`已验证 … 、观测 3/4`，框宽 115 不变）；同框 L1033（`⚙ 超时默认`）原本短 1 列，顺带补齐 |
| `04` | L319–324 | 账本线框：补第二条“无依据”（与表头“无依据 2”一致），按 §4.5.2“硬矛盾 → 软矛盾 → 无依据”重排，“另有 9 条一致”→“另有 8 条一致”（1 + 1 + 2 + 8 = 全部 12；框宽 160 不变） |

## 作者回报中的缺口

| 文件 | 行 | 改动 |
|---|---|---|
| `15` | L1151 | ADR-134 的 `{kind:"run"}` 一项：`satellite_missing` 后加〔settle 序列中丢失时为 settle，ADR-178〕 |
| `04` | L319–324 | 账本线框计数，见上 |

## lint 新检查发现并修正的文档问题

| 文件 | 行 | 改动 |
|---|---|---|
| `16` | L1209 | §16.8.3 Yarn Berry：“按角色的副本”补“副本按 §16.8 规则 5：白名单 + URL userinfo 剥除 + 凭据判定” |
| `16` | L1211 | §16.8.3 Rust：“草案同 §16.8.2 的副本方案”补“（白名单 + URL userinfo 剥除 + 凭据判定，§16.8 规则 5）” |

## ADR 与排期

| 文件 | 行 | 改动 |
|---|---|---|
| `15` | L1941 | ADR-178 标题加“Amended by ADR-179”（lint (e)） |
| `15` | L1988 起 | 新增 ADR-179（Amends ADR-178）：以上各项与两项 lint |
| `14` | L215 | §14.3.4 头段新增“**第 52 轮补正（0 人周，R52 观察与作者回报、ADR-179）**”：各项按 WBS 行逐项不足 0.01，计 0；WBS 122.02、各线数值、余量与 M1 = 38 周不变（同第 49 轮的零增量写法） |
| `14` | L398 | 轮次列表加“第 52 轮补正（ADR-179）0” |
| `15` | L1140 | ADR-133 新增“第 52 轮补正（ADR-133 附，ADR-179）”：计 0，同第 49 轮 |

## lint

新增两项检查（`reviews/lint/xref.py`，文件头的说明与 Usage 已更新）：

- **(p)** `16` §16.8 中描述用户配置副本或净化副本的表格行（出现“净化”“副本方案”，或“副本”前 40 字内有配置线索：配置、`~/`、用户、`.toml`、`.yml`、`.conf`、`…rc`）必须同时出现“白名单”与“凭据判定”。缓存的“CoW 私有副本”“可写副本”不触发；表头行跳过。首次运行：8 行副本行，缺失 2（§16.8.3 Yarn Berry、Rust），均为真实遗漏（规则 5 写明“今后新增的生态行自动适用”），已改文档，没有误报需要调整。
- **(o)** `16` §16.1 中键列为 `02` 类型（`T` 或 `T.field`，含 `[]`）、值列以对象形状 `{…}` 开头的行，与 `02` 的定义逐键比较（顶层，以及 16 写出的一层嵌套 `key?: {…}`，如 `humanCheckout.params`）；16 形状中的 `…` 允许省略；形状的联合留给 (c)；跳过 §16.1.13；`02` 解析先去掉 `//` 注释再做括号匹配。首次运行：比较 7 行（`Goal.queuedRun`、`drainingFor`、`baseChoice`、`externalChange`、`humanCheckout`（含 `params`）、`pendingHandBack`、`stopConditionSilences[]`），差异 0（R52-D15-01 已对齐）；用人为改动的形状验证过能报出缺键与多键。
- 两项都打印 `UNPARSABLE=<n>`，无法解析的行列出但不使退出码非零；本轮均为 0。

新的检查串：`python3 reviews/lint/xref.py --checks rstuvwxyzckdnSeRqpo`，退出码 0：

- xref：566 个标题、179 个 ADR、3807 处章节引用，问题 0；
- (r) 0；(s) 8/8 一致；(u)(v)(w)(x)(w′)(y)(z)(c)(d)(n)(k)(s′) 0，(v) 96 条命令；
- (e) 148 对，缺失 0；(r′) 34 对，差异 0；(q) 0；(t) 0；
- (p) 8 行，缺失 0；(o) 7 行，差异 0，UNPARSABLE 0。

编写过程中 (d) 与 (s′) 各报出一处，都是新索引表的写法：前缀列写成 `agent_proc.` 会命中已删除名 `agent_proc.*`，`human.decision{kind, …}` 会被当成种类 `kind`。已把前缀列改为不带点的写法，并改为 `human.decision{…}`。旧检查串 `rstuvwxyzckdnSeRq` 同样退出码 0。

# 第 52 轮评审回应（写作）

决策：ADR-178（`15` 末尾）。主干见 `round-52-response-spine.md`。行号为修改后的近似位置。有两个选项的条目按 ADR-178 所选方案落实。

## Agent 可读副本的总规则（R52-D11-01，重要）

| 文件 | 行 | 改动 |
|---|---|---|
| `16` | L1117 | §16.8 规则新增第 5 条“Agent 或验证器可读副本的总规则”（唯一定义）：白名单 + URL userinfo 剥除 + `10` §10.1.2 凭据判定，今后新增的生态行自动适用 |
| `16` | L1169 | §16.8.2 Go 行：`GOENV=$GS/go/env` 改为净化副本，白名单 `GOPROXY`、`GOPRIVATE`、`GONOSUMDB`、`GONOPROXY`、`GOFLAGS`，userinfo 剥除并经凭据判定，引用规则 5 |
| `14` | L133 | G46(ak) 场景加 Go 项目（`GOPROXY=https://u:tok@…`、`GOINSECURE`），期望 `$GS/go/env` 只含剥除后的 `GOPROXY` 与 `GOPRIVATE` |

## 远程矩阵的封闭表（R52-D11-02）

| 文件 | 行 | 改动 |
|---|---|---|
| `16` | L891 | 总规则 3 改为“改变安全边界、验收依据或不可逆”，字段级命令以下方封闭表为准，未列出的字段一律仅本机 |
| `16` | L946–977 | 新增“`Contract` 的逐字段远程规则”封闭表（唯一定义）：逐字段列出 web 允许的方向与仅本机的方向；`review.viewPolicy` 降低、`unattended` 任何改动、`maxReworkCycles` 提高、`stopConditions` 删除或修改、`criteria[].kind` 改写（含 exec → human）、`command`/`timeoutSec`/`artifactGlob` 改动、artifact `network` 新增主机都在仅本机一侧；⚙️ 字段不能经命令修改 |
| `16` | L979–999 | 新增“`VerifyProfile` 的逐字段远程规则”封闭表（字段取自 `07` §7.13）：运行命令的字段（`runners`、`commands`、`prepare`、`setup`、`services`、`teardown`、`integration`）、`packageManager`/`node`/`ports`、`env.vars` 一律仅本机；`irrelevantGlobs`、`generatedPaths`、`prefetch`、`runnerExceptions`、`sentinelExceptions`、`flakeQuarantine`、`env.network`、`testPathOverrides.remove` 只有删减方向可在 web；`rerunFailed` 只能降低、`bigFileBytes` 只能提高；时限与资源字段任意方向 |
| `16` | L912、L939 | `project.verify_profile.update` 与 `contract.amend` 行改为引用封闭表 |
| `16` | L933 | 新增 `test.quarantine` 行：`decide`，web/mobile ✗（改变验收依据，与 `sentinel.override` 同类）；“隔离该测试”提议在远程只能延后到桌面 |
| `06` | L866、L884 | `contract.amend`、`project.verify_profile.update` 的 scope 列改为引用 `16` §16.5 封闭表 |
| `06` | L897 | `test.quarantine` scope 改为“decide（仅本机）” |
| `06` | L977 | §6.4.7 禁止远程清单加 `test.quarantine`；字段级一句加两张封闭表 |
| `11` | L578 | §11.9 远程决策约束：加 `test.quarantine`；`contract.amend`/`project.verify_profile.update` 按 `16` §16.5 的两张封闭表 |
| `07` | L747 | §7.4.4 网络行删去“合同 `network` 中声明的主机”：唯一放行来源是 `VerifyProfile.env.network`（仅本机），artifact 的 `network` 只供链接检查器 |
| `11` | L363 | §11.6.3 删去“标准可在合同中声明 `network`”，改为只来自 `VerifyProfile.env.network` |
| `14` | L133 | G46 新增 (ao)：web 端各字段方向、`test.quarantine` 被拒，验证槽位不能访问 artifact `network` 中的主机 |

## Tower 构造的 Agent 可读副本（R52-D11-03）

| 文件 | 行 | 改动 |
|---|---|---|
| `11` | L386 | §11.6.5 Scratch cwd：`ls-files --cached`，只复制已跟踪文件，未跟踪与被忽略的文件一律不复制 |
| `11` | L652 | T25 评级理由加“读取的残余”：真实检出中被忽略、未列入清单、名字不匹配模式的文件仍可读，有意保留 |
| `09` | L458 | §9.11 `## Imported context` 只导入用户检出之外的祖先目录中的上下文文件；检出内未跟踪的文件不导入，提示加入本地文件清单 |
| `11` | L333 | 与 `09` 一致：Imported context 不导入用户检出内的未跟踪文件 |
| `14` | L133 | G46 新增 (ap) |

## 生命周期（R52-D4-01..04）

| 条目 | 文件 | 行 | 改动 |
|---|---|---|---|
| D4-01 | `05` | L584 | §5.5 settle 判定表新增一行（唯一去向）：重跑 settle 时阻塞条目仍未作答 → 这些条目属于已结束的 Run，不再阻塞 `claimed`；Needs-You 保持打开，作答入 `pendingOpenings`；上一行加指向 |
| D4-01 | `03` | L111 | I4 补同一规则 |
| D4-01 | `06` | L145 | settle 中崩溃行：I4(a) 成立时未答的阻塞条目不阻止 `claimed` |
| D4-01 | `06` | L909 | `needs_you.answer`：没有活跃 Run 时不送达，决定追加到 `pending_openings` |
| D4-01 | `03` L69、`16` L35 | | 自带开场的列表加“所属 Run 已结束的阻塞条目的作答” |
| D4-02 | `03` | L68 | settle 序列中进入的原因列举加 `satellite_missing` |
| D4-02 | `03` | L69 | 改写清单加 `rebuild_satellite`（`settle` → `run`）；自带开场加 `tower.satellite_rebuilt` |
| D4-02 | `03` | L94 | `satellite_missing` 行：settle 序列中继续目标为 `settle`；自动重建失败时清除 `satelliteRebuilding`；手动重建后 `run` 加开场、`settle` 改写为 `run` |
| D4-02 | `06` | L139 | 卫星丢失恢复行：settle 序列写 `settle`；重建失败同一事务清除 `satellite_rebuilding`；指向下一行 |
| D4-02 | `06` | L140 | §6.1.6 新增“手动重建卫星中途崩溃”行：按决定中的 `checkpointN` 从头续做，不改用最新检查点 |
| D4-02 | `06` | L892 | `goal.hand_back` 加与 `take_over` 相同的卫星守卫；接管期间的重建按 `rebuiltTree` 计入 |
| D4-02 | `06` | L920 | `goal.rebuild_satellite`：开始时置 `satellite_rebuilding=1`；成功时写 `rebuiltTree`（接管期间）；`run` 追加 `tower.satellite_rebuilt`，`settle` 显式改写为 `run` 并追加；失败清除标志 |
| D4-02 | `10` | L886、L895 | §10.8.4 hand_back 前置守卫；第 6 步以 `humanCheckout.rebuiltTree` 代替 T0 作比较基准，重建写入不进入外部改动判定，写回后卫星整体为 T1 |
| D4-02 | `10` | L1169 | 情形 E：settle 序列中丢失为 `settle`；升级时清除 `satelliteRebuilding`；接管期间写 `rebuiltTree`；手动重建后的开场与改写、崩溃续做 |
| D4-02 | `02` L171–179、`06` L472、`16` L42 | | `humanCheckout.rebuiltTree?` |
| D4-02 | `16` | L34、L290 | 继续目标改写清单加 `rebuild_satellite`；新增注入 `tower.satellite_rebuilt{checkpointN}` 行 |
| D4-03 | `03` | L59、L60 | `in_review`、`accepted` 行补“🧑 `contract.amend`（新增或修改标准）→ `verifying`” |
| D4-03 | `03` | L69 | 改写清单加 `amend_contract`：`review{state, pin}` → `verify{pin}`（lint (k) 对照 `06`） |
| D4-03 | `03` | L167 | §3.4.5 `paused` 列：继续目标为 `review` 时改写为 `verify{pin}` |
| D4-03 | `06` | L866 | `contract.amend` 写明状态效果（`in_review`/`accepted` → `verifying`、`claimed`/`verifying` 重验、`paused` 中 `review` → `verify{pin}`） |
| D4-03 | `16` | L34 | 改写清单加 `amend_contract`（→ `verify{pin}`） |
| D4-04 | `02` | L493 | `HumanDecision.kind` 加 `lower_risk_tier` |
| D4-04 | `06` | L637 | `decisions.kind` CHECK 加 `lower_risk_tier` |
| D4-04 | `16` | L143 | `HumanDecision.kind` 行加 `lower_risk_tier`（仅本机；不算合同修订，列出不计入的四个消费方） |
| D4-04 | `06` | L857 | `goal.update_meta`：降低时记 `human.decision{lower_risk_tier}`，删去 `amend_contract` + `reason.code` 的写法 |
| D4-04 | `16` | L938 | 远程矩阵 `goal.update_meta` 行同步（仅本机不变） |
| D4-04 | `14` | L133 | G46(an) 期望改为 `lower_risk_tier`，并验证降级不解锁 `verify_failed_limit` |

## 其余

| 条目 | 文件 | 行 | 改动 |
|---|---|---|---|
| R52-D5-01 | `05` | L1261 | §5.10 新增“登录的前提”（唯一定义）：OAuth 类需要已安装的 `pi` CLI；API 密钥类不需要；首次运行探测 CLI |
| R52-D5-01 | `04` | L1437 | §4.18.1 第 1 步：删去“复用 Pi 的登录流程”，改为探测 `pi` CLI 后的两种提示，Tower 内没有登录入口 |
| R52-D5-01 | `06` | L1170 | F7 指向 `05` §5.10 的前提；未检测到 CLI 时的文案 |
| R52-D6-01 | `02` | L171–179、L508 | `humanCheckout.params?: {mode?, note?, sealNote?, externalResolution?, resolvePinHits?}`；`HumanDecision.targetTree` 注释指向 `.params` |
| R52-D6-01 | `06` | L472 | DDL 注释同步形状 |
| R52-D6-01 | `06` | L892 | `goal.hand_back` ①：同一事务写 `human_checkout.params` |
| R52-D6-01 | `06` | L901 | `inspect.bring_back`：`human_checkout` 带 `params:{sealNote}` |
| R52-D6-01 | `06` | L142 | 崩溃续写从 `human_checkout.params` 读取交还参数 |
| R52-D6-01 | `10` | L909 | §10.8.4 第 7 步：同一事务持久化 `params` |
| R52-D6-01 | `16` | L42 | `Goal.humanCheckout` 形状补 `targetTree?`、`rebuiltTree?`、`params?`（同时关闭 R52-D15-01 第一项） |
| R52-D7-01 | `05` | L1135 | §5.7.3 `addressed` 行：非 hunk 锚点没有 ⚙️ 来源，`requiresChange` 的只能由人关闭，界面不显示“已处理” |
| R52-D7-01 | `02` | L553 | `requiresChange` 注释同步 |
| R52-D7-01 | `04` | L331 | 线框“转向（未锚定）”的回执止于 `┆ Agent 称已回应 · 未锚定的评论只能由你关闭`（框宽不变） |
| R52-D7-01 | `04` L430、`08` L704 | | 摘要“2 条评论已处理”改为“2 条评论 ⚙ hunk 已变” |
| R52-D7-01 | `04` L499、`12` L697 | | 回执说明加非 hunk 锚点一句 |
| R52-D7-02 | `12` | L238 | 计划步骤 `✓` = 关联标准（`criteriaIds`）全部由验证器新鲜通过；交叉校验一致保留 `┆✓` 加徽章；发现（Finding）同理不换成 `✓` |
| R52-D7-02 | `12` | L289–296 | 规范示例：硬矛盾改为 X6（提交自评 ↔ 验证器失败），原自由文本示例改为软矛盾 `◇ 可能不一致` |
| R52-D7-02 | `04` | L317–322 | 线框：S3 `┆✓` 后加 `一致 · 2 条事实`；账本硬矛盾行改为 X6，原“过期”行改为 X2 软矛盾，表头计数改为“矛盾 1 · 可能不一致 1 · 无依据 2”（框宽不变） |
| R52-D7-02 | `04` | L347、L348 | §4.5.2 计划与账本规则同步 |
| R52-D7-02 | `07` | L1377 | 软矛盾字形 `?` 改为 `12` 的 `◇` |
| R52-D8-01 | `12` | L679 | `CountdownLabel` 改为直接引用 `08` §8.7.1 的五种情形 |
| R52-D8-01 | `08` L319、`04` L157 | | “下一件”的理由加 `⚙ 规则推荐` 前缀（`04` 侧栏框宽不变，理由缩为“阻塞 3 分钟”） |
| R52-D9-01 | `12` | L686 | 评审队列：风险字形高 `▪▪`、中 `▪`（不用 danger 的 `■`），已看/已计入用空心/实心 `✓`，不用 `●`/`○` |
| R52-D9-01 | `04` | L434–445、L489 | 评审队列线框改为 `▪▪`/`▪` 与 `✔`（实心）/`✓`（空心）图例，补中风险字形；L489 说明同步 |
| R52-D9-01 | `04` | L692–705 | 诊断时间线：检查点 `●` 改为 `┃`（实心竖线），失败命令 `■` 改为中性的 `○✕`（框宽不变） |
| R52-D9-01 | `12` | L714 | `TimelineScrubber` 写明 ASCII 记法与失败命令的中性字形 |
| R52-D9-01 | `04` | L753 | Needs-You 列表“进度 0/6”改为两轨“已验证 0/6 · 观测 1/6” |
| R52-D13-01 | `10` | L601–604 | §10.6 重新 seal 表首行：P 是被撤销的 seal 或以它为祖先时，以当前 `baseCommit` 为父写入 `B-v<k>` |
| R52-D13-01 | `10` | L1107 | 撤销一条加指向 |
| R52-D13-01 | `06` | L916 | `goal.accept` 的重新 seal 说明加例外 |
| R52-D13-01 | `14` | L127 | G40 新增 (e) |
| R52-D14-01 | `14` | L133 | G46(an)：S0 授权在该 Run 结束时失效，随后的验证进入 `paused(s0_grant_pending)`，再次批准后以同一 pin 验证 |
| R52-D14-01 | `04` | L831 | §4.8.5 S0 授权卡新增“在远程客户端批准”：选项与后果文案如实说明 |
| R52-D14-01 | `11` | L578 | §11.9 统一有效期后写明这一后果 |
| R52-D15-01 | `02` | L496 | `HumanDecision.target.openingId?` |
| R52-D15-01 | `06` | L262 | “`fingerprint.changed` Fact”改为“指纹变化即触发判定（这不是 Fact）” |
| R52-D15-01 | `06` | L869 | “这里不该停”改为写 `human.decision{resume}` 的 `reason.code`、`target.criterionId` |
| R52-D15-01 | `06` | L911 | `needs_you.dismiss` 删去 `not_actionable`（全文没有 `outcomeClass` 映射，也无其他用处） |
| R52-D15-01 | `16` | L42 | 见 R52-D6-01 |
| 多项 | `16` | L484–494 | §16.1.13 被取代的说法表新增 11 行（`amend_contract` 记降级、合同 `network`、开放措辞的远程规则、Scratch 复制未跟踪文件、Imported context 全量导入、交还参数后落盘、计划步骤 `✓`、评审队列 `●`/`○`/`■`、以被撤销的 seal 为父、两种不存在的 Fact、`not_actionable`） |
| — | `14` | L133 | G46 新增 (aq)（手动重建在 `run`/`settle`/接管三种情形，重建中途崩溃、交还） |
| — | `14` | L31 | SP6b 补跑现值改为 4.98 人周（原文停在第 42 轮的 4.90，与 W7 行不一致，顺带修正） |

## 排期（第 52 轮）

`14` §14.3.4 头段（L215）登记“第 52 轮相对第 51 轮的增量”；`15` ADR-133 新增第 52 轮补记（L1131）。两处数值一致。

| WBS 行 | 增量 | 计入（主责线） |
|---|---|---|
| W3 | +0.03 | 系统 → 按 ADR-136 改派桌面（重跑 settle 与作答入队 0.01；重建后的开场与 `settle → run`、`hand_back` 守卫 0.01；修订标准的 `verifying` 边与 `review → verify{pin}` 0.01；`lower_risk_tier` 替换原审计，0） |
| W7-rest | +0.04 | 系统 → 改派桌面 0.02（`human_checkout.params` 0.01、手动重建崩溃续做 0.01）、安全 0.02（`rebuiltTree` 比较基准与写回集合，外部写入归因一类） |
| W7 SP6b | +0.03 | Agent（G46(ao)(ap)(aq)、(ak)(an) 补组、G40(e)；现值 4.98） |
| W6 | +0.02 | Agent（`tower.satellite_rebuilt`、Imported context 过滤） |
| W8 | +0.01 | Agent（Go `$GS/go/env` 白名单与剥除） |
| W11 | +0.01 | 桌面（计划步骤 `✓` 条件与徽章） |
| W15 | +0.01 | 桌面（撤销后再 seal 的父提交） |
| W16 | +0.01 | 设计（`pi` CLI 探测与登录前提） |
| 其余 | 0 | 封闭表、`test.quarantine`、远程 S0 卡片属于 M2 `serve`；Scratch 属于 M2；验证器网络是删减；字形与文案替换；登记 |
| **合计** | **+0.16** | Agent +0.06、桌面 +0.07、设计 +0.01、安全 +0.02、系统 0 |

- WBS 121.86 → **122.02**（`14` L238）；各行主责拆分之和等于该行估计（脚本核对 W1–W19 全部一致）。
- 角色合计（`14` L246–250）：Agent 26.21、系统 26.35、桌面 27.62、设计 28.40、安全 13.44，合计 122.02。
- 冻结前所需：Agent 25.81 × 1.1 = 28.391 → 28.39；系统 28.88（不变）；桌面 25.82 × 1.1 = 28.402 → 28.40；设计 25.40 × 1.1 = 27.94；安全 12.94 × 1.1 = 14.234 → 14.23，按 0.5 人计 28.46。
- 余量（29 减取整值）：系统 **0.12**（不变）、Agent 0.61、桌面 0.60、设计 1.06、安全 0.54，**全部为正**。系统线的 0.07 若不改派，系统线冻结前所需为 26.32 × 1.1 = 28.952 → 28.95，余量 0.05。
- 甘特余量格（`14` L406–410）：Agent 0.61、桌面 0.60、设计 1.06、安全 0.54，系统 0.12 不变。
- 轮次列表：`14` L16 与 L398 改为“第 25–52 轮不变”，L398 增“第 52 轮 +0.16”；L392 改为“第 52 轮后……27.94–28.88”；L400 改为“第 43–52 轮的增量都不在链上”。
- 增人备选（`14` L400）：28.39 + 28.88 + 28.40 + 27.94 + 14.23 = 127.84；T = 129.84 / 5.5 = 23.607 → 23.61；0.5 × 23.61 = 11.81，新人承担 14.23 − 11.81 = 2.42 人周安全线工作（文中“约 2.4 人周”不变）；23.61 + 2 = 25.61 → 26 个工作周 → 第 29 周末冻结，M1 = 33 周（不变）。
- 依赖链 19.7（不变）。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；第 38 周末 2027-07-30）。

## lint

`python3 reviews/lint/xref.py --checks rstuvwxyzckdnSeRq`：退出码 0，全部检查为 0；(v) 96 条命令（`test.quarantine` 在 06 标为仅本机，16 单列 ✗），(s) 8/8 一致（`lower_risk_tier` 三处登记），(k) 新增的 `rebuild_satellite → run` 与 `amend_contract → verify` 两对在 03 与 06 一致，(r′) 34 对。

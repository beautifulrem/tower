# 第 51 轮评审回应（写作）

决策：ADR-176（`15` 末尾）。主干见 `round-51-response-spine.md`。行号为修改后的近似位置。有两个选项的条目按 ADR-176 所选方案落实。

## 注册表认证的来源（R51-D11-01）

| 文件 | 行 | 改动 |
|---|---|---|
| `11` | L438 | §11.7.0 投递表第一列改为“注册表认证（只限用户级 `~/.npmrc`；项目 `.npmrc` 的认证行不读取，ADR-167/176）” |

## Agent 可读副本中的凭据（R51-D11-02）

| 文件 | 行 | 改动 |
|---|---|---|
| `16` | L1064 | §16.8.1 用户级 npmrc 行：`$GS/npmrc` 由删除清单改为**白名单**（`registry`、`@<scope>:registry`、`ca`、`strict-ssl`、重试与超时、`save-*`、`engine-strict`、`legacy-peer-deps`、`auto-install-peers`、`audit`、`fund`、`update-notifier`、`progress`、`loglevel`、`color`）；列明在白名单之外的类别（认证行、代理、客户端证书与私钥、执行类与路径类）；保留的值再经 `10` §10.1.2 的凭据判定剔除；V 列 `$VS/npmrc` 同 A 列 |
| `16` | L1071 | §16.8.1 新增“用户级 gitconfig（ADR-176，唯一定义）”行：`GIT_CONFIG_GLOBAL` → `$GS/gitconfig`，展开 `include` 后按白名单生成（`user.name`/`user.email`、换行与路径显示类 `core.*`、`init.defaultBranch`、`color.*`、非执行的 `diff.*`/`merge.*`/`pull.*`/`rebase.*` 显示与行为键、`rerere.enabled`、`log.date`、`status.showUntrackedFiles`、不以 `!` 开头的 `alias.*`）；`credential.*`、`include*`、`http.*`、`url.*.insteadOf`、`remote.*`、`core.*Command`、`hooksPath`、`fsmonitor`、pager/editor、`excludesFile`、diff/merge 驱动、`filter.*`、签名类都在其外；保留的值再经 `10` §10.1.2 的凭据判定剔除 |
| `11` | L333 | S2 只读行：净化副本的规则改为“两者都按白名单，保留的值再经凭据判定剔除，键表唯一定义在 `16` §16.8”，删去原删除清单 |
| `11` | L387 | §11.6.5 Scratch S2 行：新增**仓库元数据配置文件**读拒绝（真实检出 gitdir 与 `commonDir` 中的 `config`、`config.worktree`、`worktrees/*/config.worktree`、`modules/**/config`，含 `.git` 指针指向的 gitdir），口径与 Goal 的检出读拒绝一致；读拒绝按路径模式生成（见 R51-D11-03） |
| `02` | L662 | `Scratch.cwd` 注释：真实检出只读，其中机密路径与仓库元数据配置文件读拒绝 |
| `14` | L53 | A3 结果列：缺失配置补录进“净化副本的白名单”，只收非执行、非凭据的键 |
| `14` | L133 | G46 新增 (ak)（gitconfig/npmrc 中各类凭据形态，副本只含白名单键、搜索凭据值无命中）与 (al)（Scratch 读 `.git/config`、`config.worktree`、机密条目被拒绝） |

## 改变安全边界的设置只能在本机（R51-D11-03）

| 文件 | 行 | 改动 |
|---|---|---|
| `06` | L856 | `goal.update_meta`：降低 `riskTier` 时同一事务另记 `human.decision{amend_contract}`（`reason.code:"lower_risk_tier"`，不产生新合同版本），作为合同修订审计；scope 列“full（字段级：降低 `riskTier` 仅本机）” |
| `06` | L931 | `engine.set_prefs`：`resources.gate=false` → `E_INVALID`；scope 列“字段级：`adapter`、`resources.checkpoints` 仅本机” |
| `06` | L878 | `project.local_files.remove`：Scratch 读拒绝按路径模式生效、不随移除解除；scope“`isSecret` 条目时仅本机” |
| `06` | L895 | `s0.grant`/`s0.deny`：远程批准的授权按 `11` §11.9 的统一有效期 |
| `06` | L976 | §6.4.7 禁止远程的命令：补字段级或按条件仅本机的三项与远程 S0 授权有效期 |
| `16` | L888–889 | 批准审批行的有效期改为引用 `11` §11.9；新增 `s0.grant`/`s0.deny` 行（`decide`，web/mobile ✓*） |
| `16` | L896 | 本地文件清单行：web 改 ✓*；`remove` 对 `isSecret` 条目仅本机；Scratch 读拒绝不随移除解除 |
| `16` | L925 | 新增 `goal.update_meta` 行（字段级：降低 `riskTier` 仅本机，记 `amend_contract` 审计） |
| `16` | L930 | `engine.set_prefs` 行改为字段级规则（仿 `project.verify_profile.update`）：`adapter`、`resources.checkpoints` 仅本机，`resources.gate` 不可设置 |
| `16` | L961 | §16.6 检查点/门禁行：门禁不能关闭（任何 `riskTier`、任何入口），`checkpoints` 只能在本机修改 |
| `05` | L956 | gate 判定第 1 步删去“`features.gate=false` 时放行”，改为门禁不能关闭 |
| `05` | L1268 | §5.10 开关表 `gate` 行改为“不可关闭（任何 `riskTier`）” |
| `11` | L578 | §11.9 远程决策约束：补降低 `riskTier`、`engine.set_prefs` 字段、移除 `isSecret` 条目为仅本机，门禁不能关闭；新增**远程授权的统一有效期（唯一定义）**：经远程选择或批准的 Goal 级授权（“本 Goal 内同类”与 S0 执行授权）有效至当前 Run 结束，无 Run 时批准的至下一个 Run 开始，与授权自身有效期取先到者 |
| `11` | L106 | S0 授权：远程批准时按 §11.9 的统一有效期，取先到者 |
| `11` | L387 | Scratch 读拒绝按路径模式：`isSecret` 文件名模式与元数据配置模式作用于整个真实检出，不随移出清单解除；按内容或用户标记的条目移出只能在本机 |
| `14` | L133 | G46 (al) 含 web 端移除 `isSecret` 条目被拒、本机移除后仍读拒绝；新增 (an)（远程降低/提高 `riskTier`、`adapter`/`model`/`gate`、手机批准的 S0 授权在下一个 Run 失效） |

## `mark_secret` 后的已有副本（R51-D11-04，方案 (a)）

| 文件 | 行 | 改动 |
|---|---|---|
| `16` | L523 | `ProjectLocalFile` 行（唯一定义）新增 **已有副本**：条目由非机密变为机密时，在按 Project 的本地文件锁下从活跃卫星与人工编辑检出中删除副本；Tower 自己的写入，按 ADR-128 归因，不触发 `external_change`，路径被 git 忽略、不改变指纹；检验检出与运行中槽位只提示；当前内容加入精确匹配集；确认文案写“Agent 可能已经读到过这份内容”。标题与 ADR 列加 ADR-176 |
| `06` | L880 | `project.local_files.mark_secret` 命令行补同样效果（引用 `16`） |
| `04` | L1298 | §4.15.1 `标记为机密`：已复制副本随即删除、检验目录与运行中验证只提示；给出确认文案全文 |
| `11` | L659 | T32 缓解列与评级理由：“没有自动播种路径”，标记前已播种的副本按 `16` 删除，Agent 可能已读到，如实说明 |
| `10` | L384 | 归因表第 1 行的 Tower 写回窗口加入“`mark_secret` 删除已播种的本地文件副本” |
| `14` | L133 | G46 新增 (am)（删除、无 `external_change`、检验检出保留并提示、脱敏） |

## 生命周期（R51-D4-01..04）

| 文件 | 行 | 改动 |
|---|---|---|
| `03` | L57 | `claimed` 行补 `→ paused(human)`（🧑 `pause`，继续目标 `verify{pin}`） |
| `03` | L60 | `accepted` 行补 `→ running`（`request_changes`）、`→ paused(human)`（`take_over`）、`inspect.bring_back → verifying`；注明带 `reverted` 标记时出口不变 |
| `03` | L68 | 继续目标写入规则加例外：开 Run 的转移遇硬上限进入 `paused(budget_hard_cap)` 时一律写 `run` |
| `03` | L78 | `human` 行入口补 ready、claimed；已 `paused(*)` 时按 `16` §16.1.1 优先级并入，继续目标不变 |
| `03` | L80 | `budget_hard_cap` 行入口补“任何开 Run 的转移（含 `request_changes`）”，继续目标 `run` |
| `16` | L34 | `Goal.continuation` 写入规则加同一例外 |
| `06` | L867 | `goal.pause`：“已在 `paused` 时按 `16` §16.1.1 的优先级并入（`human` 成为 `pause_reason`，原原因进入 `also_applies`），继续目标不变” |
| `03` | L61、L158 | 撤销合入：`goal.undo_integrate` → `accepted`（`reverted`，`goals.integration_reverted_seal`），出口沿用 `accepted`，不直接复活 |
| `10` | L1098 | `integrated` 唯一条件加一项：不是被撤销的 seal；被撤销的 seal 判定前即忽略，不记 Fact、不改变状态 |
| `10` | L1102 | 撤销一条：同一事务回到 `accepted` 并写 `integration_reverted_seal` |
| `06` | L479 | goals DDL 新增 `integration_reverted_seal TEXT` |
| `06` | L917 | `goal.undo_integrate`：只在宽限期内；写状态变化与列；不提供直接复活 |
| `06` | L920 | `goal.resurrect`：写明源状态只限 `archived`/`abandoned`（守卫不变，补写） |
| `02` | L217 | `Goal.integrationRevertedSeal?` |
| `16` | L51 | 新增 `Goal.integrationRevertedSeal` 行 |
| `06` | L919 | 新增命令 `goal.rebuild_satellite{goalId, checkpointN}`（`full`）：只在 `satellite_missing` 时可用，按情形 E 以所选检查点重建，成功的同一事务解除本原因、不改写继续目标；与 `run.rewind` 的区别 |
| `02` | L486、L489 | `HumanDecision.kind` 加 `rebuild_satellite`；`target.checkpointN?` |
| `06` | L636 | `human_decisions.kind` CHECK 加 `rebuild_satellite` |
| `16` | L143 | `HumanDecision.kind` 行加 `rebuild_satellite` |
| `16` | L928 | 远程矩阵“回退 / 分叉 / 接管 / 交还”行加 `goal.rebuild_satellite`（只写 Tower 的卫星，允许远程，手机不提供入口） |
| `03` L94、`06` L139、`08` L405、`10` L1164、`04` L1496 | | `satellite_missing` 的“从更早的检查点重建”选项指向 `goal.rebuild_satellite` |
| `05` | L583 | D4-04 方案 (b)：删去“原来的 submit 视为作废”；有效提交保留，继续目标 `settle`，作答后经 `settle` 进入 `claimed`，答案入 `pendingOpenings`、在之后的 Run 送达 |
| `03` | L111 | I4：删去“提醒 Agent 确认是否仍要提交”，同上 |
| `03` | L88 | `question_timeout` 行：出口补 `→ claimed`；继续目标为 `settle` 时作答不立即送达 |
| `03` L69、`16` L35 | | 自带开场的决定列表加“继续目标为 `settle` 时的作答” |

## 其余

| 条目 | 文件 | 行 | 改动 |
|---|---|---|---|
| R51-D5-01 | `06` | L1169 | F7 文案改为“在终端启动 `pi`，输入 `/login <provider>`” |
| R51-D5-01 | `05` | L1359、L1408 | §5.11.1 新增依赖 D58（类 C：位置参数作为首条消息、`/login` 只在交互编辑器中处理）与契约测试 C39 |
| R51-D6-01 | `06` | L141 | 崩溃恢复从 `human_checkout.targetTree` 读取 T1；写回集合同 `10` 第 7 步 |
| R51-D6-01 | `06` | L891 | `goal.hand_back` ①：同一事务写 `human_checkout.targetTree = T1`；注明 `take_external` 跳过 ①–③（决定中 `targetTree` 记 T0） |
| R51-D6-01 | `06` | L900 | `inspect.bring_back`：`human_checkout` 带 `targetTree:T1` |
| R51-D6-01 | `06` | L471 | DDL `human_checkout` 形状加 `targetTree?` |
| R51-D6-01 | `02` | L173、L501 | `humanCheckout.targetTree?`（唯一落点）；`HumanDecision.targetTree?`（只作审计） |
| R51-D6-01 | `10` | L904 | 第 7 步：同一事务持久化 `syncState` 与 `humanCheckout.targetTree` |
| R51-D7-01 | `07` | L277 | stat 失配：按 I2 与 `external_change` 的分界处理，来源不明者进入 `paused(external_change)` |
| R51-D7-02 | `05` | L1099、L1123、L1133、L1134 | `addressed` 只有 ⚙️ 来源；Agent 的引用只进入 `acknowledged`，界面词“已回应”，写作 `┆ Agent 称已回应`，不满足闸门 |
| R51-D7-02 | `02` L546、`03` L137、`16` L212 | | `requiresChange` 的闸门只认 ⚙️ `addressed` 或人关闭 |
| R51-D7-02 | `06` L974、`16` L878、`11` L578 | | 远程验收条件 ③ 改为“没有既未 `addressed`（⚙️）也未被人关闭的 `requiresChange` 评论” |
| R51-D7-02 | `06` | L691 | DDL 删去 `addressed_by_claim` |
| R51-D7-02 | `04` L496、L499、L1338；`12` L698 | | 回执与验收约束文案：已处理只有 `⚙ hunk 已变`，Agent 引用为“Agent 称已回应” |
| R51-D7-02 | `08` | L706 | `requiresChange` 摘要按来源分开计数 |
| R51-D9-01 | `12` | L223、L236、L238、L660 | Claim 行注明唯一的 `┆✓` 形式；新增系统印章 `⚙ 超时默认`（与 `⚙ Tower 注入` 同族）；新增计划步骤与发现的字形集（`○`、`┆▸`、`┆✓`、`✓`（交叉校验一致）、`✕ 不一致`、`◆`）；`HumanStamp` 删去“你 · 默认” |
| R51-D9-01 | `04` | L317、L347、L694、L1031 | 线框 `S3 ┆✓`；计划行引用 `12` 的字形集；时间线 `┆ 发现 1`；重入简报 `⚙ 超时默认` |
| R51-D9-01 | `08` | L624 | “替你做的决定”语法列改为系统印章 `⚙ 超时默认` / Claim |
| R51-D12-01 | `09` | L482 | 影子检查点 ref 位于 `~/.tower/goals/<goalId>/git/<projectId>.git`；开启“保留审计地标”时地标另写入用户仓库 |
| R51-D13-01 | `10` | L787 | `restorePaths` 定义：恢复之前先做 safety 检查点（可再撤销），完成后再做一个；事件 `safety` 字段为恢复前的检查点 |
| R51-D13-01 | `10` L404、`06` L887 | | 撤销外部改动引用同一顺序 |
| R51-D13-01 | `10` | L896、L906 | `take_human` 写回集合为“T0→T1 的差异 ∪ E”（E 按 T1 写出或删除），崩溃续写同一集合；`external_change` 在写回完成时解除 |
| R51-D15-01 | `16` | L285 | 新增事件 `agent_proc.kill_requested{by:"human"}` 行 |
| R51-D15-01 | `16` | L50 | `VerifyTrigger` 补 `agent_bg ↔ agent_bg` |
| R51-D15-01 | `14` | L133 | G46 (w) 的 `contract.amended` 改为 `contract.ratified{v+1}` |
| R51-D15-01 | `15` | L1700 | ADR-169 正文加括注“即 `contract.ratified{v+1}`；系统中没有名为 `contract.amended` 的事件” |
| 多项 | `16` | L475–482 | §16.1.13 被取代的说法表新增 8 行（删除清单净化、门禁可关闭、提交作废、🤖 `addressed`、`你 · 默认`、恢复后才做 safety、T1 记在决定中、撤销合入后直接复活） |

## 排期（第 51 轮）

`14` §14.3.4 头段（L215）登记“第 51 轮相对第 50 轮的增量”（第 50 轮只是措辞，0）；`15` ADR-133 新增第 51 轮补记（L1122）。两处数值一致。

| WBS 行 | 增量 | 计入（主责线） |
|---|---|---|
| W3 | +0.04 | 系统 → 按 ADR-136 改派桌面（`03` 补边与硬上限例外、`integration_reverted_seal`、`rebuild_satellite` 命令与种类、降低 `riskTier` 审计与 `gate` 拒绝，各 0.01） |
| W7-rest | +0.04 | 系统 → 改派桌面 0.03（重建 0.02、`targetTree` 0.01）、安全 0.01（safety 前置与 `take_human` 写回集合） |
| W7 SP6b | +0.02 | Agent（G46(ak)–(an)） |
| W8 | +0.02 | Agent（npmrc/gitconfig 白名单与凭据剔除） |
| W9 | +0.02 | Agent（`mark_secret` 删除副本、写入窗口、提示、精确匹配集） |
| W6 | +0.01 | Agent（D58、C39） |
| W10 | +0.01 | 安全（Scratch 元数据读拒绝、按路径模式） |
| W11 | +0.03 | 桌面（确认文案与提示、步骤字形与印章、选择检查点重建） |
| W13 | +0.01 | 设计（摘要按来源计数、出口登记） |
| W15 | +0.01 | 桌面（被撤销的 seal 不触发 `integrated`） |
| 其余 | 0 | W12 `addressed` 删减与显示相抵；D4-04 相抵；登记与文案；`serve` 的字段级远程规则属于 M2 |
| **合计** | **+0.21** | Agent +0.07、桌面 +0.11、设计 +0.01、安全 +0.02、系统 0 |

- WBS 121.65 → **121.86**（`14` L238）；各行主责拆分之和等于该行估计（脚本核对）。
- 角色合计（`14` L246–250）：Agent 26.15、系统 26.35、桌面 27.55、设计 28.39、安全 13.42，合计 121.86。
- 冻结前所需：Agent 25.75 × 1.1 = 28.325 → 28.33；系统 28.88（不变）；桌面 25.75 × 1.1 = 28.325 → 28.33；设计 25.39 × 1.1 = 27.929 → 27.93；安全 12.92 × 1.1 = 14.212 → 14.21，按 0.5 人计 28.42。
- 余量（29 减取整值）：系统 **0.12**（不变）、Agent 0.67、桌面 0.67、设计 1.07、安全 0.58，全部为正。系统线的 0.08 若不改派，系统线冻结前所需为 28.96，余量 0.04。
- 甘特余量格（`14` L406–410）：Agent 0.67、桌面 0.67、设计 1.07、安全 0.58，系统 0.12 不变。
- 轮次列表：`14` L16 与 L398 改为“第 25–51 轮不变”，L398 增“第 50 轮 0、第 51 轮 +0.21”；L392 改为“第 51 轮后……27.93–28.88”；L400 改为“第 43–51 轮的增量都不在链上”。
- 增人备选（`14` L400）：28.33 + 28.88 + 28.33 + 27.93 + 14.21 = 127.68；T = 129.68 / 5.5 = 23.578 → 23.58；0.5 × 23.58 = 11.79，新人承担 14.21 − 11.79 = 2.42 人周安全线工作；23.58 + 2 = 25.58 → 26 个工作周 → 第 29 周末冻结，M1 = 33 周（不变）。
- 依赖链 19.7（不变）。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；第 38 周末 2027-07-30）。

## lint

`python3 reviews/lint/xref.py --checks rstuvwxyzckdnSeRq`：退出码 0，全部检查为 0；(v) 96 条命令（新增 `goal.rebuild_satellite`），(s) 8/8 一致（`rebuild_satellite` 三处登记），(r′) 33 对。

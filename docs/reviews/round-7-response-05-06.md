# 第 7 轮评审回应：`05`、`06`

以 ADR-096..100 为准。每条一行：条目 → 修订位置。

- R7-D5-01（MCP HTTP 的 `authProvider`）→ `05` §5.3.5“这些变量怎样到达子进程”：`towerMcpTransport` 的 HTTP 分支原样透传工厂第三参数 `authProvider`（v1.2.0 已核实：`extensions/mcp/runtime.ts:59-63` 签名、`83-88` `usesOAuth`、`185-199` 由 OAuth 凭据存储或 `auth.provider` 构造、`378` 传入工厂、`104-109` 默认工厂同样透传）；`headers` 的引用解析按 `resolveHeadersOrThrow` 规则自实现（未从包入口导出）；D53 行补充；C21 增加 OAuth HTTP MCP 用例（本地 401 桩；`pi-mcp/testing` 只导出内存传输）。ADR-065 正文修订注属 `15`。
- R7-D2-01（包内技能）→ `05` §5.3.6 读允许列表行按 ADR-100 增加 `~/.pi/agent/{npm,git}/**/{skills,prompts}/**`、移除 `extensions/**`；列出仍不可用的来源（settings `skills` 自定义路径，`settings-manager.ts:1108` `getSkillPaths`；临时包 `~/.pi/agent/tmp/`）；§5.10 “Adapt Pi”行同步。
- R7-D11-01（裸仓库布局）→ `05` §5.3.5 主防线加入 `safe.bareRepository=explicit`（ADR-096），§5.3.6 `GIT_CONFIG_*` 行改为 3 项（第一项属主防线）、git 发现行 Host 列同步；`06` GitService 行（所有沙箱外 git 环境注入；嵌套仓库扫描识别裸仓库布局）、§6.2.4 准入环境拼装同步。
- R7-D11-02(a)（Tower 读取卫星 gitdir）→ `05` §5.3.6 git 行、`06` GitService 行：按 ADR-100 改为 Tower 自行只读解析提交对象，不在卫星 gitdir 上运行 git；四种操作的封闭清单。(b) 同 R7-D2-01。
- R7-D13-01（嵌套调用绕过垫片）→ `05` §5.3.6 git 发现与垫片行：`GIT_EXEC_PATH=<垫片 exec-path>`（ADR-097）与备选。
- R7-D4-01（我来改的全部出路）→ `06` §6.4.3：`goal.discard_human_edits`（去向按 `take_over_from` 与树比较，从不开 Run）、`inspect.bring_back`（in_review/accepted → verifying{human_change}，以 T_pin 为基线）、`goal.hand_back` 清除与旧 pin 绑定的 `also_applies` 原因并清空 `pending_verify`、`take_over` 期间暂停自动 rebase/机会式验证/合并队列（出队、交还或放弃后按原位置重新入队）；§6.2 GitService 行、§6.2.4 机会式验证段同步；`05` §5.8 接管行补充其他出路对 Pi 会话的影响。
- R7-D6-01（写回幂等）→ `06` §6.3 `human_checkout` 增加 `syncState`、`written`；`goal.hand_back` 把目标树 T1 写入影子并记在 `human.decision`；§6.1.6 恢复行对 `syncing` 以 T1 幂等续写、不做“卫星被改动”检查；检出丢失时的选项改为 `goal.take_over` / `goal.resume` / `goal.discard_human_edits`。
- R7-D8-01(a)（交还对话框承诺）→ `06` `goal.hand_back` 行：`also_applies` 仍非空时保持 `paused`，对话框事先显示“交还后仍暂停：<原因>”（对话框文案属 `04`）。
- R7-D13-02（多仓库回退）→ `06` `run.rewind`/`run.fork_goal` 行：规则在本行自足（无检查点祖先 → `baseCommit`；降级档位时标注“恢复到第 n 回合的最近快照”）；`10` §10.13 待同步。(d) 属 M3，归 `10`/`11`。
- R7-D15-01 第 6 项 → `06` 拆分 `goal.hand_back`（要求检出）与 `goal.retry_after_human_change`（`paused(human_change_verify_failed)`，无检出）；`goal.resume` 的提示命令同步。第 7 项 → 同 R7-D6-01。第 9 项 → `06` DDL 注释：`also_applies` 只存原因名，`resume_to` 列原样保留。第 12 项 → 同 R7-D13-02。

## 需要主干处理

- `03` §3.2.1：`human_change_verify_failed` 行（L75）的“交给 Agent（`hand_back`）”改称 `retry_after_human_change`。
- `16`：L26 改为“`also_applies` 只存原因名，`resumeTo` 列保留”；命令表加 `retry_after_human_change`、`discard_human_edits`、`inspect.bring_back`。
- `00` §0.5.1：登记 settings 自定义路径与临时包中的技能不可用。
- `10` §10.13：收录多仓库回退规则。
- `15`：给 ADR-065 正文加修订注。

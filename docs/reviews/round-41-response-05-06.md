# 第 41 轮评审回应：`05`、`06`

以 ADR-167 为准。每条一行：条目 → 修订位置。

- R41-D7-01（以沙箱记录判定）→ `06` VerifierScheduler 行：验证器沙箱对未播种机密文件路径设置“拒绝并报告”的读取规则；失败**且**有读取记录才记 `secret_file_unseeded`，否则普通失败（含自动返工）；SP6a 测量 Seatbelt 报告能力，不可用时回退为普通失败加提示。`05` C29 增加 (e)（含 dotenv 打印文件名的反例）。
- R41-D4-01（出口）→ `06` VerifierScheduler 行列出三条出口；`goal.request_changes` 行：允许自 `paused(verify_env_error{secret_file_unseeded})` 发起，解除本原因、继续目标改写为 `run`、评论进入开场。
- R41-D4-02（本地文件命令）→ `06` 新命令 `project.local_files.add`、`.remove`（本机或 web）与 `.approve`（`approve_local_file`，仅本机）；`project_local_files.approved_decision_id` 注释改为指向该决定；`decisions.kind` 的 `CHECK` 加入 `approve_local_file`；§6.4.7 禁止远程清单同步。
- R41-D8-01（人工编辑检出）→ `06` `goal.hand_back` 第 ① 步：一律排除机密本地文件的路径（T1、检查点、seal）。`05` C29(d) 同步。
- R41-D11-01（npmrc 信任边界）→ `06` 安装器第 1 阶段与 `05` §5.3.6、§5.3.1：只读用户级 `~/.npmrc`（`${VAR}` 以登录环境展开），不读项目 `.npmrc` 的认证行。
- R41-D11-02（字段级远程规则）→ `06` `project.verify_profile.update` 行：安全放宽类字段仅本机，其余 web 可用、手机禁止。
- 陈旧文字 → `06` §6.6.1 `run/` 注释与“密钥”行：`run/` 只有两类使用者（Engine Host 的云 SDK 原始凭据、安装器第 1 阶段的认证行），检验检出的机密文件不经此目录。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| Agent | W9 | +0.05 | 拒绝并报告规则与读取记录判定、回退路径（不再解析输出文本，−0.02） |
| 系统 | W3 | +0.04 | 三条本地文件命令、`request_changes` 自 `verify_env_error` 发起、字段级远程规则 |
| 系统 | W7-core | +0.01 | 交还时排除机密本地文件路径 |
| Agent | W8 | 0 | 认证行只读用户级 npmrc（范围收窄） |
| **合计** | | **+0.1** | 系统 0.05 |

## 需要主干处理

- `03` §3.2.1 `verify_env_error` 行补上 `contract.amend` 与 `request_changes` 两条出口（ADR-167 已指明）。

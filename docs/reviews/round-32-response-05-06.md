# 第 32 轮评审回应：`05`、`06`

以 ADR-158（含补记）为准。每条一行：条目 → 修订位置。

- R32-D11-01（macOS 同用户可观察）→ `05` §5.3.6：提供商密钥不进入任何环境——SDK 以 `setRuntimeApiKey`（只写内存覆盖层、不落盘，v1.2.0 `model-runtime.ts:599-632` 核实）；隔离 agentDir 时 `ModelRuntime.create({credentials: new InMemoryCredentialStore()})`。**核实结果与协调者所述有一处不同**：`AuthStorage.inMemory()` 存在（`core/auth-storage.ts:357`），但 v1.2.0 包入口只导出 `readStoredCredential`（`index.ts:26`），`exports` 只有 `.` 与 `./rpc-entry`，无法以公开 API 使用；因此改用 pi-ai 导出的 `InMemoryCredentialStore`（`ai/src/auth/credential-store.ts:9`，`ai/src/index.ts:22`），效果相同。新增 D57；RPC（M2）改为 0600 `auth.json`；C29 改为“Tower 不把机密放入任何参数或环境，Host 环境不含提供商密钥”（原“沙箱读不到其他进程”与 RPC 凭据通道一并取代）；S2 读允许列表行注明简报告知 `ps` 不可用。`06` GitService 行：macOS 上带凭据 URL 的远端不执行网络命令，Fact `remote_credential_blocked{remote}` 与凭据判定规则；VerifierScheduler 行：机密默认 `<NAME>_FILE` 注入，`secretsVia:"env"` 显式声明并标注。
- R32-D6-01（平台二进制的身份识别）→ `06` §6.1.10：settle 时进程树与令牌取并集；“环境为空”与“读取失败”都视为无法确认；脱离进程树且读不到环境的进程为登记窗口，其写入按来源不明处理。
- R32-D4-01 / R32-D13-01（分叉不自动选择）→ `06` GitService 行：`baseTip()` 分叉时不改 `baseCommit`，记 `base_diverged{towerFetchedAt, userObservedAt}`；`base_unchanged_nonancestor{from, to}`；新命令 `goal.base.choose{side}`（按补记只决定观测基准，不改动工作区，记事件 `goal.base.chosen`）。
- R32-D8-01（命令补齐）→ `06` §6.4.3 新增 `goal.base.check`、`goal.base.choose`、`project.remote.recheck`；进入 `in_review` 前的 fetch 不阻塞、最多 10 s。
- R32-D13-02（M2 队列）→ `06` GitService 行：推送失败记 `push_failed{stage, exitCode?}`，条目进入 `awaiting_push`，不占用该 base 的队列。
- 新事实类型 → `06` `facts.kind` 注释补齐。
- ADR-158 补记 2 → `05` §5.3.6 凭据行：云 SDK 只传指向文件的变量，原始密钥变量写入 Tower 数据目录下 0600 凭据文件后传路径；`06` §6.2.4 Host 环境拼装同步；`base_fetch_failed{remote, error}` 加入 `facts.kind` 注释，`in_review` 前 fetch 与 `goal.base.check` 失败时记录。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| 系统 | W7-core | +0.05 | 凭据 URL 判定与阻止、`baseTip` 不自动选择与三条命令、`in_review` 前 fetch 的 10 s 上限 |
| 系统 | W4 | +0.03 | 进程树与令牌取并集、“无法确认”判定 |
| Agent | W6 | 0 | 密钥注入沿用 `setRuntimeApiKey`，隔离 agentDir 改用 `InMemoryCredentialStore`（替换，量相当） |
| 安全 | W10 | +0.02 | 机密文件注入（`<NAME>_FILE`）与 C29 改写 |
| **合计** | | **+0.1** | `awaiting_push` 计入 M2 |

## 需要主干处理

- `15` ADR-158：“`AuthStorage.inMemory()`”应改为“`InMemoryCredentialStore`（pi-ai 导出）或 `setRuntimeApiKey`”——`AuthStorage` 未从 v1.2.0 包入口导出。
- `16`：事件 `goal.base.chosen`；命令 `goal.base.check`/`goal.base.choose`/`project.remote.recheck` 的远程规则；合并队列状态 `awaiting_push`。

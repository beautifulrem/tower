# 第 103 轮评审回应

决策：
- ADR-231（`15` 末尾，L4746 起）；
- ADR-230、ADR-229、ADR-227、ADR-049 标题加 “Amended by ADR-231”；
- ADR-230 的 R102-D5-01 一条补〔ADR-231 更正〕；
- ADR-133 第 103 轮补记（`15` L1507）。

本文件关闭 `round-103.md` §4 的 7 条次要条目与 §5 的 11 条观察。行号为修改后的位置。

**收敛规则**（同 ADR-186–230）：只用三种办法关闭条目：
1. 把说法改弱，但保证为真；
2. 删除或推迟不属于 M1 主循环的机制；
3. 在已有的唯一定义处加至多一条守卫、一行或一个字段。

**本轮的取向**：
- 能交给 Pi 自己的逻辑的，不在 Tower 中重写。R103-D5-01 没有采用评审建议的 “按条目形式判定”：那要在 Tower 中复写 Pi 对 `$VAR`、`!` 命令与 `models.json` 的解析。改为删去 Tower 自己的 `auth.json` 条目检查，直接问 Pi（`checkAuth`）。
- 7 条都在已有的唯一定义处加一句或一行，引用处只改为引用。
- R103-D6-02 沿用已有的暂停原因 `app_quit`，不新增暂停原因。

新增的只有：
- `Run.outcomeReason` 的一个已用值 `disk_full`（开放字符串）；
- `12` §12.8 应用级横幅的一条视觉规则；
- `16` §16.2.6 磁盘预算一行中 F8 解除的阈值（每 30 s，可用 ≥ 2 GB）；
- Host 环境中的一个变量 `NODE_EXTRA_CA_CERTS`；
- `06` §6.8 F7 运行期的一个检测键 `Provider is not configured: <provider>`。

不新增状态、暂停原因、事件类型、表、列、命令、字段、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或常驻进程。删去对 `readStoredCredential` 的依赖。

安全不变式全部保留：
- Tower 不会自动把机密交给 Agent 可影响的进程。模型密钥仍只经运行时注入、只在 Host 内存中，Host 环境中仍没有任何模型密钥。探查运行时不带运行时覆盖、不刷新 OAuth、用后丢弃。`$VAR` 与 `!` 命令由 Pi 按你自己的 Pi 配置在 Host 中解析，与终端中的 `pi` 相同，Tower 不为此另传变量。
- Host 环境不引用 Agent 可写的位置。`NODE_EXTRA_CA_CERTS` 与 ① 的工具链变量落在其中时不传入；`NODE_EXTRA_CA_CERTS` 不进入 Agent 的 bash。
- 沙箱外的 Tower 进程不在 Agent 可控的 git 元数据上运行 git。提交数的遍历仍由隔离 worker 只读解析 H/.git。
- Tower 从不自动删除人的工作现场，也不删除另一个 Tower 安装正在使用的目录。

安全问题只写到设计层面。

---

## Pi v1.2.0 核实（`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注 `ai`）

- **R103-D5-01：Pi 有自己的判定入口，覆盖评审列出的全部来源**：
  - `core/model-runtime.ts:485-487`：`ModelRuntime.checkAuth(providerId)` 转给 `Models.checkAuth`；`ai/src/models.ts:683-692`、`:657-681`：读出该 provider 的凭据后，OAuth 条目直接判为已配置（`:662-664`，不刷新），其余经 provider 的 `check` 或 `resolveProviderAuth`。
  - `core/auth-storage.ts:442-448`：`read` 以 `resolveConfigValue(credential.key, credential.env)` 解析 `key`；`core/resolve-config-value.ts:88-89`（`$VAR` 只取条目的 `env` 与 `process.env`）、`:145-151`、`:185-216`（`!` 命令以 shell 执行，10 s 时限，结果在进程内缓存）。所以 `$VAR` 与 `!` 命令在检查时就按 Pi 的规则解析。
  - `core/provider-composer.ts:438-456`：组合后的 `check`——有存储凭据时看解析后的 `key`（为空时交给 provider 自己的 `resolve`，Anthropic 回落到环境变量，`ai/src/providers/anthropic.ts:28-47`）；否则看 `models.json` 的 `apiKey`（`!` 命令不执行，`$VAR` 只查变量是否存在）；再到 provider 读取的环境。结果的 `source` 依次为 `stored credential`、`configured API key` 或环境来源；OAuth 为类型 `oauth`。
  - **“不带 Tower 的运行时密钥”怎样问**：`core/runtime-credentials.ts:24-28` 的覆盖先于存储，所以 Host 自己的运行时在注入之后的 `checkAuth` 只会看到 Tower 的密钥。`core/model-runtime.ts:109-124, 217-218`：`ModelRuntime.create({authPath, modelsPath, refreshOnCreate: false})` 新建的运行时没有任何覆盖；`index.ts:232-236` 自包入口导出 `ModelRuntime`。`core/auth-storage.ts:333-346`：同一 `authPath` 的存储共享读取状态，`:393-399, 402-440`：变化时在文件锁内读取。
  - **不用的两条**：`getProviderAuthStatus`（`core/model-runtime.ts:646-657`）在有覆盖时直接返回 `runtime`，`stored` 一支只看条目是否存在；`readStoredCredential`（`core/auth-storage.ts:497-507`）不解析、不看 `models.json`。
  - **进行中的 Run**：`core/runtime-credentials.ts:6` 覆盖是每个运行时一张表；`core/model-runtime.ts:658-697` 每次请求重新求凭据；未配置时 `:676` 抛出，经 `:705-712` 与 `ai/src/api/lazy.ts:46-59` 成为流的错误消息。`ai/src/models.ts:649-655`：读凭据失败时抛 `ModelsError("auth")`。`core/resolve-config-value.ts:229-238`：`models.json` 的命令失败时的错误文本。
- **R103-D5-02**：`core/http-dispatcher.ts:81-100`：模型请求经 undici 的 `EnvHttpProxyAgent`（`setGlobalDispatcher`）。`git grep` 在 `packages/ai/src` 与 `packages/coding-agent/src` 中没有 `NODE_EXTRA_CA_CERTS`、`SSL_CERT_FILE`、`SSL_CERT_DIR` 的引用：Pi 不自己处理 CA。Node 在进程启动时读取 `NODE_EXTRA_CA_CERTS`；`SSL_CERT_FILE`、`SSL_CERT_DIR` 只在 `--use-openssl-ca` 时使用（Node 文档）。
- **观察**：`extensions/mcp/runtime.ts:111-113`（`mcp.json` 的 `env` 值以 `resolveConfigValueOrThrow` 解析，解析不出即抛出）、`core/exec.ts:36-46`（观察 1）；`packages/ai/src` 中没有 `AZURE_CONFIG_DIR`（观察 8）；`ai/src/auth/credential-store.ts:40-56`、`core/agent-session.ts:3993-4000`、`:2459-2469`、`ai/src/providers/amazon-bedrock.ts:65-70`（观察 10）。

---

## R103-D5-01（次要）：存储凭据的检查漏了条目形式、`models.json` 一层与进行中的 Run

不采用评审建议的 “按条目形式判定”，改为直接问 Pi。

- **唯一定义** `11` §11.7.1 模型凭据一行（L517），改名为 “与你的 Pi 配置中凭据的先后”：
  - 依据：终端中的 Pi 依次取存储的凭据、`models.json` 的 `apiKey`、环境变量；导入的密钥来自 shell 的环境变量，是最后一层。所以 Tower 只在 **Pi 自己判定**你的 Pi 配置中没有凭据时注入。
  - **询问**：每次 `host.spawn` 与每个 Run 创建会话之前，Host 新建一个不带运行时覆盖的探查运行时（同一份 `auth.json`、`models.json`），以 `checkAuth(provider)` 询问，用后丢弃。
  - **判定**：类型为 `oauth`，或 `source` 为 `stored credential`、`configured API key` 时，凭据来自你的 Pi 配置，不注入、已注入的移除；为空或来自环境时注入。Host 环境中没有模型密钥，环境一类的结果只可能来自 Tower 按 `05` §5.3.6 ⑦ 传入的变量（如 Bedrock 的 `AWS_PROFILE`），注入之后与终端中环境变量一层的结果相同。
- **(a) 条目形式**：
  - `$VAR` 条目在 Host 中解析不出，判为没有；Tower 照 ADR-049 类型表导入该变量并注入，与终端结果相同。这消除了与 ADR-049 类型表的冲突，也恢复了 ADR-229 之前可用的配置。
  - `!` 命令的条目由 Pi 在 Host 中以白名单环境执行。依赖其他会话变量的命令得到空值、判为没有：有导入的密钥就注入（终端中命令失败时同样回落到环境变量），没有就按 F7 失败。命令结果在 Host 进程内缓存到退出，如实写明。
- **(b) `models.json` 一层**：配了 `apiKey` 时不注入，用哪份凭据、由谁计费与终端相同。其中以 `!` 开头的在请求时执行，失败时以 Pi 自己的错误失败（如实登记）。
- **(c) 范围**：
  - 每个 Host 一个 `ModelRuntime`，检查、注入与移除按 Host 进行，在 Host 启动与该 Host 上每个 Run 开始时生效；已在传输中的请求保留发出时的凭据。
  - 正在进行的 Run 用该 Host 当前求出的凭据：Run 中途 `/login` 时这次 Run 仍用已注入的密钥；打包模式下同一 Host 上另一个 Goal 的 Run 开始时的检查同样改变它，从下一次请求起生效（如实写明）。
  - Run 中途 `/logout` 而这次没有注入时，下一次请求由 Pi 判为未配置。`06` §6.8 F7 ① 原来不识别这一文本，补一个检测键 `Provider is not configured: <provider>`，走已有的 F7 路径；该 Host 上下一个 Run 开始时的检查注入导入的密钥。
- **文案**：首次运行与模型选择器改为 `已有你的 pi 配置中的凭据，Tower 用它`。
- **同步**：`05` §5.3.6 SDK 一条、首次运行、D57（依赖改为 `ModelRuntime.create` 与 `checkAuth`，注明 `readStoredCredential` 不再使用）；`04` §4.18.1 第 2 步；`16` 云 SDK 凭据一行；ADR-230 的 R102-D5-01 一条加〔ADR-231 更正〕。
- **测试**：G46 (d) 补第九组：`$VAR` 条目、`!` 命令条目、`models.json` 的 `apiKey`、打包模式下另一 Goal 的 Run 开始、Run 中途 `/logout`。

## R103-D5-02（次要）：Host 环境的封闭列表没有 CA 证书变量

取评审的第一种写法。

- `05` §5.3.6 “Host 环境的变量” ⑤ 与代理一行加 `NODE_EXTRA_CA_CERTS`：
  - Pi 不自己读取 CA 设置，Node 只在进程启动时读取它，所以它必须在 Host 环境中；
  - 取最近一次从登录 shell 读到的值：首次运行记录，与代理一起告知（`Tower 的模型请求与 MCP 服务器使用它`），“重新读取” 替换，设置页列出；
  - 指向 Agent 可写的位置时不传入，首次运行写明原因；
  - 随 ⑤ 进入 `mcpBaseEnv`，不进入 bash（S2 一行不变）。
- `SSL_CERT_FILE`、`SSL_CERT_DIR` 不传入：Node 只在 `--use-openssl-ca` 时使用它们，Pi 也不读取。
- `00` §0.5.1 S2 一行补一句：Tower 自己的运行进程不受此限，模型请求与 MCP 服务器使用你登录 shell 中的 `NODE_EXTRA_CA_CERTS`。
- G46 (d) 第九组含 CA 一组（TLS 拦截的本地代理；另一次变量指向 `<wtRoot>` 之下）。

## R103-D6-01（次要）：重新接上的 Host 在没有 Run 时置位 `hostExpected`

取评审的写法。

- `08` §8.6.1 `hostExpected` 一行（L365）：第二个置位分支只对在该 Host 上有已过 `run.started`、尚未 `run.ended` 的 Run 的 Goal 置位；其余 Goal（暂停中、准备阶段中）等其下一个 Run 的 `run.started`。
- §8.6.3 “挂死” 一句（L393）同步：交回的存活 Host 只对有进行中 Run 的 Goal 从重新接上时起计。
- G35c (x) 补两组：暂停不足 5 分钟后只杀死 Supervisor 再继续，新 Run 的会话创建阻塞 45 s；准备阶段中只杀死 Supervisor。两组都不判挂死。

## R103-D6-02（次要）：F8 的 drain 去向、只读的解除与横幅

- **唯一定义** `06` §6.8 F8 一行（L1197）：
  - **暂停原因**：drain 沿用 `app_quit`。磁盘满与应用退出同属 Tower 整体停下、与该 Goal 无关，解除的规则也相同，所以不新增暂停原因（lint (s) 的集合不变）。`run.ended` 的 `outcome_reason` 写 `disk_full`，卡片据此写 `已暂停 · 磁盘已满 · 释放空间后自动恢复`（`12` §12.6.5）。
  - **写入次序**：drain 的写入先于只读切换。写不进时（SQLite 回滚整个事务）不重试：Run 照样被中止，目标留在 Supervisor 进程内，恢复可写时先按同一规则补写。Supervisor 其间重启时按 §6.1.6 的同一规则进入 `paused{app_quit 或 engine_crash}`。
  - **只读期间**：会写数据库的命令返回 `E_STATE`（`磁盘已满，数据库只读`）；`goal.delete_kept` 不写数据库，照常可用。
  - **解除**：Supervisor 每 30 s、以及每次 `goal.delete_kept` 完成之后，复查发生过 `ENOSPC` 的卷；可用空间都 ≥ 2 GB 时恢复可写、撤下横幅、恢复准入，不需要重启 Tower。本次由 F8 暂停、只有 `app_quit` 的 Goal 按 §6.1.4 第 5 项解除（只在 `resumeOnLaunch` 打开时，与重启 Tower 的结果相同）。这一集合只在 Supervisor 进程内，如实写明 Supervisor 其间重启时的去向。
- **视觉**：`12` §12.8 补应用级横幅：主窗口顶部通栏一行，中性底与 `◇`，不用状态色（按 §12.4.3 “要注意但不需要你决定”），不可关闭，条件解除时瞬时消失，不计入 “至多一个自动覆盖层”。
- **同步**：`04` §4.18.3 补磁盘满一行；`08` §8.1 指向 F8 与 `12` §12.8；`16` §16.2.6 磁盘预算一行登记阈值；`02` §2.6、`06` §6.3 DDL 注释与 `16` §16.1.4 登记 `disk_full`。
- **测试**：G35e (q)：两个 Goal 运行中以小容量测试卷写满；一组 drain 的事务也以 `SQLITE_FULL` 失败；删除一个人的工作现场后 30 s 内自动恢复；另一组只读期间只杀死 Supervisor。

## R103-D13-01（次要）：使用中而检验目录已不存在时的 `inspect.open`

- `10` §10.2 “使用中” 的唯一定义（L255）补一句：打开检验同样按状态判定，检验仍使用中时不论目录是否存在都返回 `E_STATE`、不新建第二个检验目录，界面指向 `inspect.close`。
- `10` §10.8.3 第 1 步、`06` §6.4.3 `inspect.open` 一行同步。
- G46 同一组补 `inspect.open` 一步：返回 `E_STATE`，没有第二个检验目录与端口段。

## R103-D13-02（次要）：另一个 Tower 安装持有租约时的目录

取 “不允许删除”。租约本就要保证 Tower 不破坏另一个安装，接管租约是已有的出口。

- `10` §10.2 “列出的来源”（L259）补一句：
  - 该 Project 因另一个安装的仓库租约（`refs/tower/_owner` 属于另一个 `installId` 且仍在租期内）而只读时，其 `<wtRoot>` 中没有本机 Goal 行的这类目录标 `另一台 Tower 正在使用`；`hostname` 与本机相同时写 `另一个 Tower 安装正在使用`，与 `06` §6.1.9 的 Needs-You 文案一致。
  - 不提供 `删除`，`goal.delete_kept` 返回 `E_STATE`；租约过期并由本机接管之后照常。
- `06` §6.1.9 只读的范围（L184）补 “不删除这些目录”；`06` §6.4.3 `goal.delete_kept` 一行同步。
- G46 补一组：另一份数据目录持有租约时，该目录的标注与 `E_STATE`。

## R103-D15-01（次要）：`06` L323 的复述与 ① 中工具链变量的取值来源

- **(a)** `06` §6.2.4 准入链（L323）删去括号中 Host 环境变量的复述，只留 “变量的完整列表只按 `05` §5.3.6 ‘Host 环境的变量’”，另指向模型凭据的唯一定义。旧写法 “ADR-055 的端口段与 `${port:N}` 模板” 登入 `16` §16.1.13 第 103 轮一行，由 (D) 检查（变异检查见 `round-103-lint.md`）。
- **(b)** `05` §5.3.6 ①：
  - 工具链变量的取值与 ④ 同一规则：取最近一次从登录 shell 读到的值（首次运行记录，“重新读取” 替换），有值才传入，落在 Agent 可写位置时不传入。
  - `PNPM_HOME` 只列在 ④，① 写明二者合为 `16` §16.8 的同一组七个。
  - “首次运行检测” 的 “另取” 与设置页列出的值补上 ① 的工具链变量与 `NODE_EXTRA_CA_CERTS`。

---

## §5 的观察

1. **封闭的工具链列表对用户可见**：`00` §0.5.1 新增一行（只有七个工具链变量；扩展经 `pi.exec` 的子进程可能失败；`mcp.json` 的 `$NAME` 引用解析不出、该服务器不启动，写字面值即可）。`05` §5.10 静态清单在有扩展或 MCP 服务器时，确认卡片另写同一句。
2. **`listedAt`**：取求值开始、第一次读取这些目录之前的时刻。卷不提供建立时间时改比较目录的 `ctime`：改名与顶层条目的增删都会更新它，偏保守，最多多一次重新求值。不新增字段（`10` §10.2，`06` §6.4.3 不变）。
3. **交还对话框的提交数**：`10` §10.1.2 写明交还对话框用同一写法（`至少 N 个提交`、`200+ 个提交`，求值失败写 `无法计算`），`ignoredCommits` 取数字或 `null`；§10.1.3 “任何失败都省略该信息” 注明这一例外；`04` §4.6.7 线框与 G46 改为 `至少 1 个提交`。
4. **“含本地机密文件的副本”的来源**：由目录本身求出——所属 Project 的机密本地文件清单中任一路径存在于该目录中时注明，不依赖 `inspect_with_secrets` 的记录；`（已清除）`、`来源未知` 与人工编辑检出同样适用（`10` §10.2、`09` §9.12.4）。
5. **存储提示**：“已查看” 按四类条件分别记；48px 细栏（含窗口窄于 1100px）中设置图标带不含文字的 `◇`（`08` §8.1、`04` §4.3.2）。
6. **提交遍历**（`10` §10.1.2）：
   - 沿全部父提交，从 `worktrees/*/HEAD` 一并起数；附注标签取所指提交，指向其他对象的 ref 跳过；
   - “`repack` 之后不变” 限定为 H 起点之后的提交，以镜像中提交为起点的 ref 偏保守一事如实写明；
   - 嵌套仓库在确认框中另列一行 `<路径>/.git（嵌套仓库，随之删除）`；
   - 估计独占大小的 `mtime` 扫描：产生或删除之后只重扫那一个目录，打开存储面板时才重扫全部，都在后台 worker 中进行；`13` §13.11.3 写明成本与条目数成正比、不计入交互预算（`10` §10.4.4）。
7. **`readStoredCredential` 吞掉读取错误**：随 R103-D5-01 不再使用它。探查以 Pi 的文件锁读取 `auth.json`，不会读到写了一半的文件；读取失败时 Pi 抛出，Tower 按 “没有” 处理并注入，到下一次检查为止（如实登记，`11` §11.7.1）。
8. **Host 环境的复述与开放项**：
   - `11` §11.7.1 与 `16` 云 SDK 凭据一行删去 `AZURE_CONFIG_DIR` 与 “等”；
   - `mcpBaseEnv` 只在 `05` §5.3.5 列出，`11` §11.7.1、T28 与 C21 改为引用（C21 断言 Host 的 `TMPDIR` 在其中）；
   - ④ 不进入 `mcpBaseEnv`，以 `npx` 启动的服务器可能用另一份 npm 配置，如实登记，出路是在 `mcp.json` 的 `env` 中写明；
   - `16` §16.8 `PATH` 行改为指向 `05` §5.3.6 ①。
9. **同步与指向**：`06` §6.4.3 `goal.take_over` 一行补 “drain 之后的改名先等进行中的 `goal.delete_kept`”；`09` §9.12.4 的出处改为 `05` §5.3.5 “MCP 继承用户的 Pi 配置” 一条与 §5.3.6 “Pi 运行开关” 一行。
10. **Pi 行号**：D57 改为 `ai/src/auth/credential-store.ts:40-56`；`10` §10.8 改为 `agent-session.ts` L3993–4000；`06` §6.1.4 drain 图改为 `:2459-2469`；`06` §6.1.6 的引文改为 `ai/src/providers/amazon-bedrock.ts:65-70`（Bedrock 判定看 `AWS_PROFILE`，凭据由 AWS SDK 从文件读取）。
11. **增人备选的取整**：`14` §14.3.4 取整规则后补一句：T 先舍入时 5.5T − 2 与全部工作可差不到 0.03 人周，由向上取整为工作周数吸收；本轮 5.5 × 24.04 − 2 = 130.22，恰好相等。

---

## 排期

- **+0.03 人周**（WBS 124.15 → 124.18）：
  - W16 +0.02（设计）：Pi 的 `checkAuth` 判定、按 Host 的范围与 `/logout`、G46 (d) 第九组（0.01）；`NODE_EXTRA_CA_CERTS`、① 的取值记录与重新读取、封闭列表的用户说明（0.01）。W16 现值 3.56。
  - W4 +0.01（桌面）：F8 的 drain 原因与写入次序、只读的解除、G35e (q)。W4 现值 4.61。
  - 其余（`hostExpected` 的置位条件、`inspect.open`、租约标注、横幅视觉、复述与十一条观察）按 WBS 行逐项不足 0.01，计 0。
- **角色合计**：Agent 26.65、系统 26.38、桌面 28.12、设计 29.39、安全 13.64（合计 124.18）。
- **冻结前所需**：桌面 26.32 × 1.1 = 28.952 → 28.95；设计 26.39 × 1.1 = 29.029 → 29.03（最长）；Agent 28.88、系统 28.91、安全 14.45（按 0.5 人 28.90）不变。
- **余量**：系统 1.09、Agent 1.12、桌面 1.05、设计 0.97、安全 1.10（未舍入 1.092、1.125、1.048、0.971、1.092），都远高于改派阈值约 0.12。
- **依赖链**：仍为 19.91（W4、W16 不在链上）。
- **结论**：按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结 2027-07-09；M2 至 2027-11-12；M3 在 2028-02）。
- **增人备选仍为 34 周**：28.88 + 28.91 + 28.95 + 29.03 + 14.45 = 130.22；T = 132.22 / 5.5 = 24.04；新人约 2.43 人周安全线工作（14.45 − 12.02）；24.04 + 2 = 26.04 → 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02；下一个台阶仍是 135.52。
- 同步位置：`14` §14.1 M1 一行、§14.3.4 增量段、W4 与 W16 行、功能合计、角色容量表、范围句、依赖链口径、结论、增人备选、甘特图余量、§14.8；`15` ADR-133 第 103 轮补记与 ADR-231 末段。lint (C) 通过，变异检查起作用。

## lint

exit 0，见 `round-103-lint.md`：ADR 231，section_refs 9714，(e) 279 对，(D) 593 个短语，(C) 19 行，全部为 0。

## 偏离与未决

- **R103-D5-01 不按条目形式判定，改问 Pi**：比评审的两种写法都少一层 Tower 自己的规则。代价：
  - 每次 Host 启动与每个 Run 之前新建一个探查运行时（只读本地 `models.json` 与内置目录，不联网）；
  - `auth.json` 中的 `!` 命令会在检查时由 Pi 在 Host 中执行一次（之后在该进程内缓存），与请求时执行的是同一条命令。
  - 判定依赖 Pi 的 `AuthCheck.source` 标签（`stored credential`、`configured API key`）。它们是 Pi 自己的文案，Pi 升级时随依赖行 D57 复核。
- **R103-D5-01 环境一类的结果按 “没有” 处理**：Host 环境中可能使 Pi 判为已配置的只有 Tower 按 ⑦ 传入的变量（如 Bedrock 的 `AWS_PROFILE`）。它们与导入的密钥同属 Tower 提供，所以不计为你的 Pi 配置。否则 `AWS_BEARER_TOKEN_BEDROCK` 与 `AWS_PROFILE` 并存时，Tower 会用 profile 而终端用令牌。
- **R103-D6-02 不新增暂停原因**：新增原因要在 `02`、`03`、`06`、`12`、`16` 五处登记并给出恢复出口，而这个出口与 `app_quit` 相同。原因的区分只落在 `outcome_reason` 与卡片文案上。如实登记：最后一个 Run 的 `run.ended` 写不进、Supervisor 又在恢复之前重启时，卡片只能写 `应用退出`。
- **R103-D6-02 的阈值**（每 30 s、2 GB）是设计选择，登记在 `16` §16.2.6，M1 自用期内按 G35e (q) 与实际情况复核。
- **R103-D13-02 取 “不允许删除”**，不取 “显式确认后允许”（理由见上）。
- **未决**：无。

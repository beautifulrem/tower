# 11 · 安全与自主度

本文定义 Tower 在 Agent 每一次动作上“允许什么、问什么、禁止什么”，以及当这些策略判断失误时，什么东西真正兜底。

依据：R7（合同编译为运行时围栏）、R5/ADR-010（逐动作弹窗是滋扰告警：93–97% 被直接批准）、theory §C6（自主度矩阵）、§C14（单向门）、§C15（安全与权限）、Pi `docs/security.md`（“观看 transcript、项目信任、审阅改动都不构成安全边界”）、`research/pi.md` §9、§12.4。

## 11.0 两层模型：策略 ≠ 边界

| 层 | 作用 | 实现 | 能被绕过吗 |
|---|---|---|---|
| **策略层（Policy）** | 理解意图、减少打扰、把合同变成运行时规则 | tower-goal 扩展的 `tool_call` 钩子 + 分类器 + 自主度矩阵 | **能**。bash 可以被混淆（`echo cm0gLXJmIH4= \| base64 -d \| sh`），分类器会出错（Anthropic 的 auto-mode 分类器在其评测中对危险动作有 17% 漏报，theory §C15） |
| **边界层（Boundary）** | 策略失误时限制爆炸半径 | OS 沙箱（文件写入、网络出口、凭据可读性）、凭据代理、worktree 隔离 | 只能通过沙箱逃逸 |
| **检测层（Detection）** | 事后发现策略层漏掉的越界 | 每回合检查点 diff 对照围栏（`10` §10.7）、哨兵（`07`）、审计日志 | 不阻止，但保证“不沉默” |

三条硬规则：

1. **分类器永远不是 Agent 与单向门之间唯一的东西。** 单向门（推送、发布、部署、外部 API 写入、密钥）至少需要人批准，且凭据本身不在 Agent 可达范围内（§11.6.4）。
2. **不确定 → ask，除非边界层已限定爆炸半径。** 对无法解析的命令，有 OS 沙箱时按 `exec.arbitrary` 的矩阵级别处理；无沙箱时提升到 `ask`。这是在“安全”与“滋扰告警”（ADR-010）之间的唯一可辩护的折中：不确定性只在有边界兜底时被容忍。同一原则适用于“确定地运行 Agent 写的代码”：`exec.test`/`exec.build` 的命令本身可被精确分类，但它执行的是 Agent 刚写的测试与源码，等价于任意代码执行；因此只有在 S2 下才 silent，S0 下按 ADR-022 需要一次 Goal 级授权（§11.2）。
3. **策略判断的输入只来自 Harness。** 审批卡片上的“这个动作做什么”由解析器生成（Fact 语法），Agent 的理由以 Claim 语法附在后面（R1）。

---

## 11.1 动作类（Action Classes）

术语：本文中的“worktree”指 Goal 的工作目录——ADR-060 之后即**卫星克隆的工作区**（`10` §10.1）；动作类 id（`read.worktree`、`edit.outside_worktree` 等）沿用 `16` §16.1.10 的登记名。卫星的 gitdir 在工作目录之外（`<wtRoot>/_gitdirs/<goalId>`，ADR-081），整体归 Agent（ADR-089），对它的读写按 `read.worktree`/`git.local` 处理；Tower 从不以发现方式打开它。

| id | 含义 | 例 | 单向门 |
|---|---|---|---|
| `read.worktree` | 读本 Goal worktree / 本 Goal 数据目录 | `read src/a.ts`、`grep -rn pay src`（bash） | |
| `read.pi_resources` | 读 Pi 资源目录与上下文文件（ADR-091/100）：`~/.pi/agent/{skills,prompts}/**`、Pi 包内的技能与提示（`~/.pi/agent/{npm,git}/**` 与临时包 `~/.pi/agent/tmp/**` 中按约定的 `skills/`、`prompts/`，以及 `package.json#pi.skills`/`pi.prompts` 声明的任意子路径）、扩展经 `resources_discover` 提供的技能 `baseDir`（只限 `baseDir` 本身）、`~/.agents/skills/**`、Run 启动时从用户 Pi settings 解析出的 `skills`/`prompts` 路径（realpath，见 §11.6.2）、Run 启动时 Host 实际枚举到的已启用技能 `baseDir`（与 §11.6.2 同一集合，含以显式路径传入的项目技能，ADR-204）、卫星内 `.pi/**` 与 `.agents/**`、卫星祖先目录中的上下文文件（只放行名字集合，`16` §16.1.12“上下文文件名与受保护名字”）。**不含** `~/.pi/agent/extensions/**`（ADR-100：扩展由 Host 加载，Agent 无需读取，其中常有配置或密钥） | `read ~/.pi/agent/skills/pdf/SKILL.md` | |
| `read.external` | 读 worktree 之外的非敏感路径 | `read ~/code/other/README.md`、`read file:///tmp/build.log`（路径按 Pi 的同一求法，§11.3.1） | |
| `edit.in_scope` | 写 `scope.include` 内、非 protected 的文件 | `edit src/checkout/pay.ts` | |
| `edit.out_of_scope` | 写 worktree 内但在围栏外 | `edit src/auth/session.ts`（围栏只含 checkout） | |
| `edit.protected` | 写 `scope.protected`（测试快照、CI、lockfile、Agent 配置等，§11.3.3） | `write .github/workflows/ci.yml` | |
| `edit.tests` | 写测试文件（按 `allowTestEdits` 映射：forbid/ask/allow→notify） | `edit src/__tests__/pay.test.ts` | |
| `edit.outside_worktree` | 写 worktree 之外 | `write ~/.zshrc`、`write @~/.zshrc`、`write file:///etc/hosts` | ✓ |
| `exec.test` | 运行合同标准命令 / 项目测试命令（脚本体相对 base 未改）。**执行的是 Agent 写的代码**，安全性取决于沙箱档位（ADR-022） | `pnpm test -- checkout` | |
| `exec.build` | 运行已知构建/检查命令（lint/typecheck/build，脚本体未改） | `pnpm tsc --noEmit` | |
| `exec.arbitrary` | 其他命令，或无法完全解析的命令 | `python scripts/migrate_data.py` | |
| `net.registry` | 访问包注册表与代码托管的只读端点 | `pnpm install`（已有依赖） | |
| `net.other` | 其他出站网络 | `curl https://api.example.com` | |
| `dep.add` | 新增/升级依赖（命令或清单编辑） | `pnpm add left-pad`、编辑 `package.json` dependencies | |
| `config.change` | 修改构建/CI/测试/工具配置 | `vitest.config.ts`、`tsconfig.json`、`Dockerfile` | |
| `git.local` | 本地只读或在 Goal 分支上追加 | `git status`、`git diff`、`git add`、`git commit` | |
| `git.history_rewrite` | 改写 Goal 分支本地历史 | `git reset --hard`、`git commit --amend`、`git rebase`、`git stash`、`git clean` | |
| `git.branch_escape` | 离开 Goal 分支或改仓库配置 | `git checkout main`、`git switch`、`git worktree …`、`git config …`、`git branch -D …`、`git update-ref` | |
| `git.push` | 推送 | `git push` | ✓ |
| `git.pr` | 创建/修改 PR、issue 评论等托管平台写操作 | `gh pr create`、`gh issue comment` | ✓ |
| `git.merge` | 把 Goal 合入 base（本地或远端） | Tower 集成动作、`gh pr merge` | ✓ |
| `secrets.access` | 读取凭据或请求密钥注入。**请求密钥注入归 M2**（ADR-161）；M1 中这一类只用于分类读取凭据的命令，批准也不会让 Agent 获得密钥库中的机密 | `cat .env`、`printenv`、`security find-generic-password` | ✓ |
| `fs.delete.recoverable` | 删除 worktree 内已跟踪或已检查点的文件 | `rm src/old.ts` | |
| `fs.delete.unrecoverable` | 删除 worktree 外、或被忽略且未检查点的内容 | `rm -rf ~/Library/Caches/x` | ✓ |
| `system.change` | 改系统状态 | `brew install`、`launchctl`、`crontab`、`kill <非子进程>`、`chmod` worktree 外 | ✓ |
| `external.side_effect` | 对外部系统的不可逆写入 | `vercel deploy`、`kubectl apply`、`terraform apply`、`npm publish`、`psql -h prod …`、`curl -X POST` 到非 localhost、发邮件 | ✓ |
| `tower.tool` | `ask_user` / `log` / `submit` / `propose_contract` / `review_report` | — | 永远允许 |
| `tool.external` | 沙箱外工具（按来源判定：用户扩展注册的工具、MCP 工具与 MCP 资源工具）的全部调用，不看注解（ADR-185/186；分类唯一定义在 §11.3.4） | 扩展工具 `deploy_preview`、`mcp__db__run_query` | |

### 自主度级别

| 级别 | 行为 | 对 Mode / 注意力的影响 |
|---|---|---|
| `forbid` | `tool_call` 返回 `{block: true, reason}`；reason 告诉模型“这是 Tower 策略，可用 `ask_user` 申请” | 记 Fact `sentinel{detector:"policy_block"}`；（M2）10 分钟内 ≥ 3 次同类被拒 → `stalled` 检测（S7 `policy_wall`，`07`；M1 中没有 S7，ADR-194） |
| `ask` | 阻塞工具调用，生成 Needs-You `approval`（`02` §2.9），`costOfDelay: "agent_blocked"` | Mode = `blocked_guard`；超时默认动作 = **拒绝**（`defaultIfIgnored`，默认 30 分钟；合同 `unattended:"wait"` 时不超时，Agent 保持阻塞；单向门在任何设置下都不会超时放行） |
| `notify` | 放行；记 Fact；进入 Re-entry 简报（severity 1，攒批） | 不打扰 |
| `silent` | 放行；仅 Trace 可见 | 无 |

级别有序：`silent < notify < ask < forbid`。

---

## 11.2 预设（Presets）

`Contract.autonomy`（`02` §2.5）由预设初始化，人可逐格修改；修改作为合同修订的一部分（I3）。

| 动作类 | spike | 标准修复（默认） | 生产热修 | 依赖升级 | 调研 |
|---|---|---|---|---|---|
| `read.worktree` | silent | silent | silent | silent | silent |
| `read.pi_resources`（ADR-091/100） | silent | silent | silent | silent | silent |
| `read.external` | notify | ask | ask | ask | notify |
| `edit.in_scope` | silent | silent | notify | silent | 仅 artifacts 目录 silent，其余 forbid |
| `edit.out_of_scope` | notify | ask | forbid | ask | forbid |
| `edit.protected` | ask | ask | forbid | ask（`allowNewDependencies=true` 时锁文件不在 protected 中，改动走 `dep.add`） | forbid |
| `edit.tests`（`allowTestEdits`；`allow` 映射为 `notify`，§11.1，ADR-183） | allow | ask | ask | ask | forbid |
| `edit.outside_worktree` | forbid | forbid | forbid | forbid | forbid |
| `exec.test` / `exec.build`（S2） | silent | silent | silent | silent | silent |
| `exec.test` / `exec.build`（S0，ADR-022） | 首次 ask → Goal 级授权 | 首次 ask → Goal 级授权 | 首次 ask → Goal 级授权 | 首次 ask → Goal 级授权 | 首次 ask → Goal 级授权 |
| `exec.arbitrary`（有沙箱） | silent | notify | notify | notify | notify |
| `exec.arbitrary`（无沙箱） | ask | ask | ask | ask | ask |
| `net.registry` | silent | silent | silent | silent | silent |
| `net.other` | notify | ask | ask | ask | ask |
| `dep.add` | notify | ask | forbid | 合同列出的包 notify，其余 ask | forbid |
| `config.change` | notify | ask | ask | ask | forbid |
| `git.local` | silent | notify | notify | notify | forbid（除只读） |
| `git.history_rewrite` | silent | notify | ask | notify | forbid |
| `git.branch_escape` | forbid | forbid | forbid | forbid | forbid |
| `git.push` / `git.pr`（Agent 侧） | forbid | forbid | forbid | forbid | forbid |
| `git.merge` | forbid | ask | ask | ask | forbid |
| `secrets.access` | forbid | ask | ask | forbid | forbid |
| `fs.delete.recoverable` | silent | notify | notify | notify | forbid |
| `fs.delete.unrecoverable` | ask | ask | forbid | ask | forbid |
| `system.change` | ask | ask | forbid | ask | forbid |
| `external.side_effect` | forbid | ask | ask（双确认） | forbid | forbid |
| `tool.external`（ADR-185/186；级别下限为 ask——`decide()` 先钳到下限，合同中更低的值不生效，§11.3.5；合同编辑器在下限为 ask 的格上显示有效级别 `ask`、不提供更低的选项，ADR-187） | ask | ask | ask | ask | ask |
| 其他配套 | 集成模式锁定“仅保留分支” | — | `plan` 必填（计划闸门）、`riskTier=high`（因而 `review.viewPolicy="all"`，`02` §2.5） | `scope.protected` 中移除锁文件；验证增加 `audit` 标准 | `kind=investigation`；Changes = Findings |

“双确认”：审批卡片要求按住确认 1.5 s 或输入目标名（例如环境名 `prod`；解析不出目标名时输入卡片上显示的动作类名，`16` §16.3）——针对单向门的防误触（theory §C10 的移动端约束同样适用：`serve` 远程端不能批准单向门，§11.9）。

**S0 授权（ADR-022）。** S0 下首次运行测试/构建命令时生成一条 `approval`：“允许本 Goal 在无沙箱环境中运行测试与构建（它们执行 Agent 写的代码，以你的权限运行）”。批准后记为 `Goal.s0Grant = granted`（`02` §2.4；它是 Goal 的状态，不是运行时 `Grant`，也不经 `applyGrants`，ADR-182）；验证器在 S0 下运行该 Goal 的代码使用同一授权。**失效（唯一定义，ADR-182）**——以下任一先到即失效，`s0Grant` 回到 `none`、清除 `s0GrantExpiresOn`：(i) `contract.amend` 生效（同一事务，`06` §6.4.3；`lower_risk_tier` 不是合同修订，不触发）；(ii) 某个检查点相对上一个检查点的变更路径命中 `scope.protected`（测试快照、CI、被验收标准引用的脚本、生命周期脚本等，`02` §2.5；与 §11.4 事后检测同一次计算，在记录该检查点的同一事务中失效，不论检查点作者）；(iii) 经远程连接批准时，§11.9 远程授权的统一有效期（`s0GrantExpiresOn`，ADR-176/180）。失效的粒度是检查点：同一回合内受保护改动之后、该回合检查点之前的测试运行仍使用旧授权（该受保护改动本身至少经过 `ask`，降级档位下最多 3 个回合），登记为已知窗口，不另设门禁时的失效点（ADR-183）。本机批准的授权在失效前不再询问；失效后需要时再次询问（`04` §4.8.5）；拒绝则该 Goal 只能产出“观测到”之外的 `human` 标准结果，并在能力摘要中显示“S0 · 未授权执行”。

### 授权（Grant）

为避免同一动作反复审批（滋扰告警），每个 `ask` 的批准选项包括：

| 选项 | 作用域 | 允许的类 |
|---|---|---|
| 仅这一次 | 本次 toolCallId | 全部 |
| 本 Goal 内同类（匹配器） | `Grant{scope:"goal", goalId, class, matcher, expiresAt=Goal 结束}`（形状与存放的唯一定义在 `02` §2.5：存于该 `approve_action` 决定的 `payload.grant`，每个 Run 开始时编入 `policy.json`）；只能在本机选择（ADR-180） | 全部，单向门除外 |
| 本项目内同类（**M3**，ADR-183） | `Grant{scope:"project", projectId, class, matcher, expiresAt=30 天}`；只能在本机选择；随 §11.5 的“已获得的自主度”面板一同提供（列出与撤销都在那里），M1 不提供该选项 | 非单向门；计入自适应自主度证据（§11.5） |

一次审批命中多个处于 `ask` 的类时（例如范围外的测试路径、多类 bash 调用）只提供“仅这一次”（ADR-183：`Grant` 只有一个类，按类授权会让其余类仍为 `ask`）。生成不出匹配器时（例如程序位置是变量的 `opaque` 调用）同样只提供“仅这一次”——空匹配器的授权不匹配任何调用（§11.3.5 `matches`，ADR-187）；`tool.external` 在本 Goal 不可信内容与对外通信都为真时同样只提供“仅这一次”（条件只在 §11.3.4，ADR-227）。M1 中仍有效的“本 Goal 内同类”授权列在 Goal 页的自主度区块（`04` §4.5），可逐类撤销（`autonomy.revoke{projectId, class, goalId}`：只撤销**本 Goal** 中该类的运行时授权，不影响合同 `autonomy.grants` 与其他 Goal；作用范围唯一定义在 §11.3.5 排除 (b)，ADR-184）。远程客户端的审批只提供“仅这一次”（`16` §16.5，ADR-180）：运行时授权都来自本机，因此不需要事件型失效；ADR-179 写在合同 `AutonomyMatrix.grants[]` 上的 `expiresOn` 已删除（合同不可变，I3）。授权的效果只有一种——把 `ask` 降到 `notify`，不越过 `forbid`、硬底线与单向门下限；编入规则、撤销与降级后的排除都唯一定义在 §11.3.5 `applyGrants`（ADR-182）。

匹配器由 Harness 从解析结果生成并展示，不由 Agent 提供：命令前缀（`pnpm run e2e`）、路径 glob（`src/auth/**`）、主机（`api.stripe.com`）、包名（`zod@^3`）、沙箱外工具名（`tool.external` 专用，精确匹配，§11.3.4）。

---

## 11.3 分类：把 Pi 工具调用映射到动作类

```ts
type Certainty = "exact" | "heuristic" | "opaque";
interface Classification {
  classes: ActionClass[];                 // 一次调用可能命中多个类
  certainty: Certainty;
  subjects: { paths?: string[]; hosts?: string[]; packages?: string[]; git?: string; program?: string[]; tool?: string };   // tool：沙箱外工具的注册名（§11.3.4）
  reasons: string[];                      // 人可读，Fact 语法显示在审批卡片
  hardFloor?: string;                     // 命中不可覆盖的禁止规则
}
```

### 11.3.1 文件类工具（`read`/`edit`/`write`）

Pi 的事件类型给出确定的路径字段（`ReadToolCallEvent`、`EditToolCallEvent`、`WriteToolCallEvent` 等，`extensions/types.ts` L1205–1248），因此 certainty = `exact`（路径不能确定地求出时为 `opaque`，见下方“求路径”）：

```
p = piResolve(input.path, cwd)                         # 与 Pi 内置文件工具同一求法（下方“求路径”，ADR-219）；不能确定地求出 → 按 opaque 判定
for q in [p] + (read ? readVariants(p) : []):          # read 的名字变体各判定一次，取最严格者
real = realpath(最长已存在前缀(q)) + 剩余部分          # 调用前的分类（审批分级）；访问时的强制见下方“使用时强制”（ADR-220）
if !inside(real, worktreeRoots):   read → 命中 Pi 资源目录或祖先上下文文件 → read.pi_resources（ADR-091）   # 与受保护位置的比较按下方“比较的规范形式”
                                          否则 read.external
                                   edit/write → edit.outside_worktree
else（工作区内的 edit/write）：收集**全部**适用的文件类（ADR-183，取代按 protected → 测试 → 范围截断的 elif 链）——
                                   match(scope.protected) → edit.protected（名字按 16 §16.1.12 的比较规则，ADR-204）；isTestPath(real) → edit.tests；
                                   !match(scope.include) or match(scope.exclude) → edit.out_of_scope；三者都不适用 → edit.in_scope
                                   （多类并存时 decide 取最严格者，§11.3.5；与“同一路径命中多条规则取最严格者”一致，ADR-182/183）
# 读取凭据（卫星内外同一规则，ADR-223）：read 或 edit 的读取一侧命中密钥路径表 → 追加 secrets.access（卫星内的 read 另为 read.worktree）
#   是否命中按下方密钥路径表的作用范围与除外：卫星中的跟踪状态取自 base 树；回退位置下本 Goal 的卫星工作区不因 ~/.tower/** 命中（ADR-224）
# 内容检查（write 的 content / edit 的替换后内容）：
if 文件是依赖清单 且 新增/修改了依赖键 → 追加 dep.add（subjects.packages = 新增项）
if 文件匹配配置表 → 追加 config.change
```

- **求路径**（唯一定义，ADR-219；`05` §5.11.1 D60 与 C41 引用）：分类所用的路径就是 Pi 内置文件工具在 `execute` 中求出、交给文件系统的路径（v1.2.0 `core/tools/write.ts:65`、`edit.ts:161`、`read.ts:124`；`tool_call` 钩子看到的是未经这一步的原始参数，`edit` 的 `prepareArguments` 不动 `path`，`edit.ts:103-134`）。即 `resolveToCwd`（`core/tools/path-utils.ts:48-50`）：经 `normalizePath`（`utils/paths.ts:76-101`）依次把 Unicode 空格变体（U+00A0、U+2000–U+200A、U+202F、U+205F、U+3000）换成普通空格、去掉一个前导 `@`、把恰为 `~` 与以 `~/` 开头的值展开为主目录（其他以 `~` 开头的值，如 `~user/x`，不展开）、把以 `file://` 开头的值经 `fileURLToPath` 转为本地路径，再以 `path.resolve` 相对会话 `cwd` 按词法求出绝对路径（`:103-107`；Windows 上的另两个分支同样照搬）。`read` 另经 `resolveReadPathAsync`（`path-utils.ts:86-118`）：求出的路径不存在时依次试 AM/PM 前的窄空格、NFD、弯引号及 NFD 加弯引号四个变体；这些替换作用于整条路径、可能改变目录部分，所以 `readVariants` 对四个变体不论是否存在都各判定一次，取最严格者。这些函数不从包入口导出（`package.json` 的 `exports` 只有 `.` 与 `./rpc-entry`；`src/index.ts:336-392` 导出工具工厂、`*Operations` 与 `*ToolOptions` 类型和少数辅助函数（如 `withFileMutationQueue`、`truncate*`、`formatSize`），不含求路径的函数，`:490-496` 不含 `utils/paths.ts`），所以 `piResolve` 是 Tower 固定于 v1.2.0 的移植，由契约测试 C41 在一组夹具上与 Pi 自己的求值逐项比对，Pi 升级时随 D60 复核。移植不能确定地求出路径时——Pi 一侧会抛错的值（如 `fileURLToPath` 拒绝的主机名或编码的 `/`）、取不到主目录——该调用按 `opaque` 判定（§11.3.5 的 `decide` 照常以 `env.sandbox` 求值；这些值在 Pi 一侧都会抛错，不发生任何读写），不按 `exact` 判定。`..` 已由 `path.resolve` 按词法消去，Pi 交给文件系统的路径中不再有 `..`，所以这里只有一种求值（沙箱外工具的两种求值见 §11.3.4）。本条只用于这三个文件工具：bash 的路径参数按 shell 的展开（§11.3.2），沙箱外工具的参数按 §11.3.4 路径检查。
- **使用时强制**（唯一定义，ADR-220；`05` §5.3.5、D61、C42 与 T3 引用）：分类在 `tool_call` 钩子中进行，Pi 在之后的 `execute` 中才访问文件。Pi 默认并行执行同一条助手消息中的工具调用：整批调用的钩子先逐个跑完，然后才并发执行（`packages/agent/src/agent.ts:253` 的 `toolExecution` 默认 `"parallel"`，`agent-loop.ts:508-523, 586-648`）；同一批中的 bash，或仍在运行的后台进程，因此能在分类与访问之间改变卫星中的路径分量（例如把一级目录换成指向用户主检出的符号链接）。所以**文件工具实际访问的位置由访问那一刻的 OS 沙箱判定，分类只决定审批分级**：Tower 以包入口导出的 `createReadToolDefinition`、`createEditToolDefinition`、`createWriteToolDefinition` 构造这三个工具，与沙箱 bash 一样以 `customTools` 注入（`05` §5.3.5），并传入 Tower 自己的 `operations`——`ReadOperations` 的 `readFile`、`access`、`detectImageMimeType`，`EditOperations` 的 `readFile`、`writeFile`、`access`，`WriteOperations` 的 `writeFile`、`mkdir`（Pi `core/tools/read.ts:48-55`、`edit.ts:83-90`、`write.ts:27-32`；工厂取 `options.operations`，`read.ts:92`、`edit.ts:147`、`write.ts:48`，求出的绝对路径只经它们读写文件内容，`read.ts:124-155`、`edit.ts:161-198`、`write.ts:65-82`；`operations` 之外只有两处元数据访问，见残余 (ii)）。S2 下这些操作都由**文件辅助进程**执行（规格的唯一定义，ADR-221/222；取值登记在 `16` §16.2.8）：**形态与生命周期**——按次启动的一次性子进程：在与沙箱 bash 同一包装、同一档位（§11.6.2）中由 Tower 启动的系统自带命令（`/bin/sh`、`/bin/test`、`/bin/cat`、`mkdir -p`；都在 S2 允许执行的系统路径中，不加载 Pi，不另设运行时或构建目标），完成即退出。Pi 在一次调用中依次调用几个操作（`read` 为 `access` → `detectImageMimeType` → `readFile`，`read.ts:127, 129, 135/155`；`edit` 为 `access` → `readFile` → `writeFile`，`edit.ts:176, 186, 198`；`write` 为 `mkdir` → `writeFile`，`write.ts:78, 82`），Tower 把它们合并为读取一次、写入一次启动（ADR-222）：**读取**——`access` 时由一个 `/bin/sh` 先 `test -e`、再 `test -r`（`edit` 另加 `test -w`，与 Pi 默认实现的 `R_OK`/`W_OK` 相同，`read.ts:59`、`edit.ts:95`），分别对应 `ENOENT`、`EACCES`（Pi 的 `edit` 把 `error.code` 写进错误文字，`edit.ts:179-181`），然后 `exec /bin/cat` 交回整份内容（被沙箱拒绝同样对应 `EACCES`；`cat` 的其他失败映射为 Pi 默认实现在同一情形下给出的错误码，如目标为目录时 `EISDIR`，不一律为 `EACCES`，ADR-223）；同一次调用随后的 `detectImageMimeType` 与 `readFile` 直接用这份内容，不再启动进程——这份缓存按调用作用域（ADR-223）：Pi 的各操作只收到 `absolutePath`，所以 Tower 包装这三个工具的 `execute`，每次调用以新的 `operations` 构造该次的工具定义，同一批中对同一路径的两次 `read` 各自启动、不共用，调用结束或中止时随之丢弃；**写入**——`mkdir` 只记下目录，由写入的同一个 `/bin/sh` 先 `mkdir -p` 再经重定向写入（内容从标准输入传入、路径作为参数）。所以一次 `read` 一次启动、`write` 一次、`edit` 两次，开销预算、测量与回退见 `13` §13.11.1；访问仍在该进程打开文件的那一刻由 S2 判定，合并不改变本条的强制。图像类型由 Host 对这份内容的前 4100 字节按 Pi 的同一纯字节判定求出（`utils/mime.ts:3-23`；包入口只导出在调用者进程中直接打开文件的 `detectSupportedImageMimeTypeFromFile`，`src/index.ts:494`，所以 Tower 移植纯字节的那一半，C42 与 Pi 比对）；不带 Run 令牌、不算 Agent 进程；它的内存与 Agent 的工具子进程一样计入该 Goal 的进程树预留（`13` §13.8.3），不计入 Engine Host 一行。**上限与超时**——Pi 的 `read` 先整读文件、再按 2000 行 / 50 KB 截断或取 `offset`/`limit`，`edit` 整读整写（`read.ts:135, 155`、`truncate.ts:11-12`；`edit.ts:186, 198`），所以单次读取的回复与写入的请求都是整份文件：上限 16 MB，按 Host 承受得起的单文件大小取，不按 Pi 截断后的大小（S2 下合并读取不先取大小，上限在交回的字节流上执行：超出即杀掉该进程，ADR-223）；超出时该次操作失败，工具结果写“文件超过 16 MB，Tower 的文件工具不读写它；请用 bash 分段处理（如 `sed -n`、`head -c`）”；每次操作墙钟上限 10 s。S0 下没有辅助进程（残余 (iii)），同一 `operations` 在 Host 中以 Node 的 `fs` 执行：16 MB 上限照样适用（读取以有上限的读取循环判定——大小为 0 的特殊文件与读取期间增长的文件同样受限，ADR-223；写入按内容长度判定；工具结果的文字相同），10 s 超时不适用（所以 S0 下读取 FIFO 一类不结束的文件没有时限，与 Pi 自己的内置工具相同）（进程内的文件调用无法以杀进程中止，与 Pi 自己的内置工具相同，ADR-222）。**失败**——超时时 Tower 先杀掉该进程所在的进程组、等它们退出，再使该次操作失败，所以报告为失败的写入不会在之后落盘；启动失败、崩溃或回复不合规（它与 Agent 的进程同在一个沙箱中，Host 把它的回复当作不可信数据，与文件内容本身相同）同样只使这一次操作失败，工具结果写明原因（超时、启动失败、崩溃、回复不合规与 16 MB 的失败都以不带 `code` 的错误抛出：Pi 的 `edit` 对带 `code` 的错误只写“Error code: <code>”，`edit.ts:176-181`，带上它会丢掉这里的文字，ADR-223），不重试，之后的操作照常各起一个进程。写入在进程启动之后失败时，目标文件可能已被截断或只写了一部分（重定向先截断再写，与 Pi 自己的 `fs.writeFile` 同样不原子；Host 崩溃时正在写的进程读到标准输入的结束，写完已收到的部分后退出，窗口同样至多一次写入），所以这时的工具结果另写“文件可能已部分写入，请重新读取后再改”（ADR-222）；不改为写临时文件再改名：改名会把符号链接与硬链接换成普通文件、丢掉文件原有的权限位，被杀时还会把临时文件留在卫星中、进入下一个检查点。**M1 不另行检测反复失败**：每次失败只返回一个错误结果，与 Pi 自己的文件工具报错相同；`07` §7.7.1 的 S1 只看 bash 命令的退出码，不覆盖文件工具（ADR-222）。Pi 的 `edit`/`write` 在中止时也等进行中的文件操作结束才返回（`edit.ts:164-167`、`write.ts:68-71`），所以 settle 终止进程时（`06` §6.1.10）没有仍在写的辅助进程，不另加停止步骤；`read` 在中止时立即返回（`read.ts:116-119`），它的辅助进程只读，由 10 s 超时收回。操作系统在打开的那一刻按读写允许列表判定真实路径，分类之后换上的符号链接、路径分量或 `..` 都不能把访问带到 S2 不允许的位置；被拒绝的操作使该工具报错，并记 `sandbox_violation`（§11.6.2，`toolCallId` 为该文件工具的调用）。文件工具的权限从此不超过沙箱 bash：S2 拒绝的访问（S2 读允许列表之外的 `read.external`、密钥路径表、卫星中 `.pi`、`.agents`、`AGENTS*.md`、`CLAUDE.md` 的写入，§11.6.2）即使经批准也会失败，与 bash 相同（`00` §0.5.1）。**残余**：(i) S2 下，分类之后被改向到 S2 允许范围之内另一路径（如卫星中受保护的文件）的写入，不被这一条拦住——这是 bash 本来就能做到的，由事后检测与验证时的 `scope_breach` 兜底（§11.4）；(ii) `operations` 之外的两处访问都在 Host 中进行、只涉及元数据：`read` 的名字变体探测（`resolveReadPathAsync`，`path-utils.ts:86-118`，Node 的 `fs.access`），只透露某个变体名字是否存在；`edit`/`write` 经 `withFileMutationQueue` 对求出的路径取 `realpath`，只用作同一文件串行化的键（`file-mutation-queue.ts:16-26`；`ENOENT`/`ENOTDIR` 之外的错误原样成为工具错误，不记 `sandbox_violation`；登记队列是 Host 进程内的单一链，`:5, 33-49`，打包 Host 中一次慢的路径解析会延后同一 Host 中其他 Goal 的编辑）；读写本身仍经辅助进程；(iii) **S0 下没有沙箱**，同一 `operations` 在 Host 中直接执行（与 S0 下的 bash 相同），分类是唯一的防线，分类与访问之间的窗口不被封闭（T3 的 S0 评级）。
- **比较的规范形式**（ADR-220）：受保护的位置——第 3 条硬底线位置（§11.3.3）与密钥路径表中的绝对条目——编入 `policy.json` 时各取字面与 `realpath` 两种形式；求出的路径以 `p` 与 `real` 两种形式与之比较，任一命中即按命中。放宽一侧的 `worktreeRoots` 与 Pi 资源目录只取 `realpath` 形式、只以 `real` 判定在其内。所以受保护位置本身经符号链接存放时（点号文件管理器把 `~/.aws` 链到别处，或主检出以经链接的路径登记）同样命中。S2 下这只影响审批分级（沙箱策略中的路径本就先取 `realpath`，§11.6.2）；S0 下它是分类的一部分。
- **S2 必然拒绝的访问不询问**（唯一定义，ADR-221/222；`04` §4.10.2、`00` §0.5.1、C42 与 G46 引用）：S2 下，文件工具求出的路径按上一条的规范形式（拒绝一侧任一形式命中即算，允许一侧以 `real` 判定）对照本 Run S2 档位的同一份路径数据（与生成档位所用的相同，随 `policy.json` 下发；名字规则按 `16` §16.1.12；显式包含 Seatbelt 基础档允许读取的系统路径，所以 `/usr/include` 一类不被误判为拒绝，ADR-222）——`read`、`edit` 的读取在读允许列表之外或命中读拒绝，`edit`、`write` 的写入在写允许列表之外或命中写拒绝（含上下文文件名）——时，该调用带 `hardFloor`（§11.3.5 `decide` 首行，forbid）：不出审批卡、不可授权，也不发生访问、不记 `sandbox_violation`。返回给模型的文字为“沙箱不允许访问该路径（S2），批准也不会改变；需要它时改用 `ask_user`。Pi 截断输出提示的 Full output 文件同样在沙箱之外：需要全文时在 bash 中把输出重定向到 `$TMPDIR` 下的文件，再分段查看；MCP 结果与 codemode 写出的全文文件不能这样重定向，需要时以更窄的参数重新调用该工具”（ADR-224）。这只决定是否询问，访问仍由 S2 判定：判定与 S2 不一致时，误判为允许的回到“批准后被拒绝”，误判为拒绝的只少一次本可成功的读写（`read` 的名字变体取最严格者，一个不会被打开的变体落在拒绝范围时同样如此）。**读取凭据不在本条之内**（ADR-222/223，与 bash 同一规则）：读取一侧命中密钥路径表、且写入一侧（若有）不落在拒绝范围的调用，本条不为它加 `hardFloor`，照常归 `secrets.access`（上方伪代码，卫星内外相同，ADR-223）、按自主度矩阵询问——与 bash 读取凭据的命令出同一张单向门审批卡。**先后**（ADR-223；文件工具与 bash 同一规则，唯一定义在 §11.3.3 第 3 条“分类的先后”，ADR-225）：§11.3.3 第 3 条硬底线先于本例外——例外只撤去本条所加的 `hardFloor`，命中第 3 条的调用照常 forbid、不出卡——如影子、`$TI` 与各 Host 临时目录中的文件（它们在 `~/.tower/**` 之下，也命中密钥路径表）；`$VS` 只在回退位置下才在 `~/.tower/**` 之下，两种位置下都按第 3 条；用户主检出与 `_human`、`_inspect` 中的 `.env` 一类按下方密钥路径表的作用范围 (i) 同样命中，同样按第 3 条 forbid（ADR-224）。**卡上的 S2 句子**（唯一定义，ADR-223；`04` §4.10.2、`12` §12.12 引用）：S2 下，只在这次求出的读取路径都落在 S2 读拒绝范围（本条的同一份路径数据）时，卡上写明“S2 下批准也不会让沙箱允许这次读取（M1）”——文件工具对 Agent 写允许范围之外的这类读取都是如此，bash 中路径能求出的这类读取命令（如 `cat ~/.aws/credentials`）同样如此；写允许范围之内的（如卫星中 base 未跟踪的 `.env`，下方密钥路径表的作用范围 (ii)）S2 允许读取，卡上不写这一句，批准即读到（ADR-224）；其余 bash 的 `secrets.access`（§11.3.2 表中的环境与凭据命令）不写这一句，改写批准后实际发生什么：`printenv`、`env`、`set` 读到的是 bash 的白名单环境（`05` §5.3.6 `bashEnv`）；`security find-*` 与钥匙串存储的 `gh auth token` 在 S2 中查找钥匙串被拒绝（A8 回退取消该拒绝时，只受钥匙串条目的访问控制与系统授权提示约束，§11.6.2 钥匙串一行；文件存储的 `gh` 令牌在 `~/.config/gh/hosts.yml` 中，读取同样被 S2 拒绝）；`op read`、`vault read` 经进程间通信或网络取值，不受 S2 文件读拒绝约束（网络仍只经沙箱代理）。人拒绝时不发生访问；批准时访问照常由 S2 判定，被拒绝的按 §11.6.2 “经批准的目标”只记 severity 1。所以 Agent 读取凭据的尝试不论经哪个工具，都以同一张卡告知人（ADR-125 的信号不因工具而变弱）。bash 的其余读写同样不适用本条（一条命令的读写只能启发式求出，审批卡照旧），经批准后被 S2 拒绝的访问同样按“经批准的目标”只记 severity 1。
- **依赖清单**：`package.json`（`dependencies|devDependencies|peerDependencies|optionalDependencies` 的键或版本变化）、`Cargo.toml`（`[*dependencies]`）、`pyproject.toml`（`project.dependencies`、`tool.poetry.*dependencies`）、`requirements*.txt`（新增行）、`go.mod`（`require`）、`Gemfile`。对比对象是文件当前内容（解析失败 → certainty `heuristic`）。
- **测试路径**（默认，项目可改）：`**/*.{test,spec}.*`、`**/__tests__/**`、`test/**`、`tests/**`、`**/*_test.go`、`**/test_*.py`、`**/__snapshots__/**`、`**/*.snap`。
- **密钥路径表**：**未被 git 跟踪或被忽略的** `**/.env`、`**/.env.*`（`.env.example` 除外）、`*.pem`、`*.key`、`*.p12`、`id_*`（非 `.pub`）——**这些无锚定模式的作用范围**（唯一定义，ADR-224；取代 ADR-223 只在卫星工作区与 Pi 资源目录中匹配的写法）：(i) **Agent 的写允许范围之外**（§11.6.2 写允许一行之外的一切：主目录与其中的其他仓库、外接卷、Pi 资源目录、`$SH`、系统路径等）处处匹配、不论跟踪状态（开头的“未被 git 跟踪或被忽略”只在 (ii) 的卫星工作区中适用），编入 S2 档位的读拒绝与必然拒绝的路径数据；只有 **CA 证书包允许清单**除外、照常可读——系统的 `/etc/ssl/cert.pem` 与 `/etc/ssl/certs/**`（macOS 上为 `/private/etc/ssl/…`），Homebrew 的 `<前缀>/etc/ca-certificates/cert.pem` 与 `<前缀>/etc/openssl@*/cert.pem`（`<前缀>` 为 `/opt/homebrew` 或 `/usr/local`），以及 `$SH` 中由 Tower 写入的 CA 证书包（名为 `cacert.pem`、`cert.pem`、`ca-bundle.pem` 的文件）；钥匙串文件不在清单中；Linux（M2）的清单与写拒绝一行的 `.git` 名字同列为 M2 决定点；镜像 `objects/` 中的文件名是对象哈希与 `pack-*`，不命中这些模式；清单之外命中的文件读拒绝，SP6a A3 的日常工作流因此缺文件时补录进清单（只收 CA 证书包）；工具自带的 CA 包（如 Python certifi 的 `cacert.pem`、pip 自带的一份）不在清单中、同样读拒绝，是否以名字规则（如 `**/certifi/cacert.pem`）收入列为 M2 决定点（M1 的验证只支持 Node）；你为企业代理放在主目录中的 CA 文件（`NODE_EXTRA_CA_CERTS`、`cafile` 所指）同样读不到，登记在 `00` §0.5.1（ADR-225）。(ii) **写允许范围之内**（本 Goal 的卫星工作区与 gitdir、`_stores/<goalId>/`、`$TMPDIR/tower-<goalId>/`）只作分类、不编入 S2：Tower 自己的路径不把真实凭据放进这里——含机密的本地文件不播种进卫星（ADR-165），交还与带回不写回 base 中未跟踪的凭据形路径（`10` §10.8.4 第 5 步，ADR-225）——所以这里名字形如凭据的文件由 Agent 与它运行的程序写入；沙箱外工具（用户扩展与 MCP 服务器）以你的权限写进来的除外，它们可能是真实凭据（残余见 §11.3.4 路径检查一条，§11.8 对此只显示沙箱外工具风险说明，ADR-225/226）。因此 S2 允许读取，Agent 自己写出的 `id_*`、`*.pem` 一类经批准即可读，也不产生 `sandbox_violation`。卫星工作区的**跟踪状态取自本 Goal 的 base 树**（各 binding 的 `baseCommit` 树：生成 `policy.json` 时列出 base 树中名字命中这些模式的被跟踪路径，它们按普通文件处理，含 ADR-078 的已跟踪 env 文件），不取卫星索引、检查点或 pin；所以 Run 中新建或新提交的这类文件按未跟踪处理——文件工具与 bash 的读取命令读它们归 `secrets.access`（spike、依赖升级与调研三种预设下 forbid，其余预设出单向门卡；名字恰好命中的普通新文件，如 `id_utils.ts`，每次读取都要批准，如实写出），Agent 运行的程序读它们（如测试读取 `node_modules` 中的 `*.pem` 夹具）不经分类、照常成功；以及 `~/.ssh/**`、`~/.aws/**`、`~/.config/gcloud/**`、`~/.config/gh/**`（含 `hosts.yml`）、`~/.netrc`、`~/.npmrc`、`~/.pypirc`、`~/.docker/config.json`、`~/.kube/config`、`~/.git-credentials`、`~/.config/git/credentials`、`~/.cargo/credentials.toml`、`~/.cargo/credentials`、`~/.pi/agent/auth.json`、`~/.pi/agent/mcp-auth.json`、`~/.pi/agent/models.json`（可能含明文密钥；`~/.pi/agent` 指用户 agentDir，`PI_CODING_AGENT_DIR` 有值时另含该目录下的这三个文件，`05` §5.3.6，ADR-209/211）、`~/.tower/**`（凭据存储文件的补全，ADR-179；S2 下用户主目录本就在 bash 的读允许列表之外，补全影响的是文件工具与 bash 的分类与技能路径排除（S2 下文件工具的访问另由沙箱强制，上文“使用时强制”），ADR-219/220。**回退位置下本 Goal 的卫星工作区除外**（唯一定义，ADR-218/224；§11.3.2、§11.3.4 路径检查 (2)、`10` §10.4.3 引用）：`<wtRoot>` 回退到 `~/.tower/worktrees/…` 时，本 Goal 的卫星工作区（§11.6.2 回退位置例外中 Agent 读写项的第一项）不因这一项命中，对本 Goal 的一切工具都如此——文件工具的分类（上方伪代码的读取凭据一行）、bash 命令按参数路径的分类（§11.3.2）与沙箱外工具的路径检查——与默认位置下相同（回退后权限与默认位置相同，§11.6.2）；只对本 Goal 的调用，其他 Goal 的卫星照常命中、且在第 3 条硬底线之内；表中其他条目（如其中 base 未跟踪的 `.env`）与第 3 条硬底线照常适用。回退位置下 Agent 的其余读写项（`_gitdirs/<goalId>`、`_stores/<goalId>/`、`$SH`、`_stores/_shim/`）不在此列：文件工具与 bash 按路径读取它们时比默认位置多归一次 `secrets.access`（更严；日常工作流经 git、包管理器与环境变量访问它们，不经路径参数）。沙箱外工具的路径检查另不含本 Host 的 stdio MCP 空目录，唯一定义在 §11.3.4 路径检查 (2)，ADR-218）；以及**可能含凭据的工具配置**（与 `16` §16.8 一致：这些文件只以白名单净化副本提供给 Tower 之外的代码，原文件视为可能含凭据，ADR-181）：`~/.gitconfig`、`~/.config/git/config`、`~/.cargo/config.toml`、`~/.config/uv/uv.toml`、`~/.config/pip/pip.conf`、`~/.pip/pip.conf`、`~/.yarnrc.yml`、Go env 文件（`go env GOENV` 给出的路径，macOS 默认 `~/Library/Application Support/go/env`）。这一组同样按 `secrets.access` 分类，影响范围同上（文件工具的分类与技能路径排除）。**已被 git 跟踪的 env 文件**（`.env.test`、`.env.development` 等已提交文件）对 Agent 可读（ADR-078，R4-D8-02）：读取结果仍经 §11.7 的密钥扫描，命中即按密钥处理（脱敏并记 `secrets.access` Fact）。

### 11.3.2 `bash`

bash 的输入只有 `command` 与 `timeout`（`tools/bash.ts` L40–43）。分类器必须解析 shell：

0. **分期（ADR-038）**：M1 使用**保守的分词 + 正则**实现——只识别不含 `$(`、反引号、`eval`、管道到解释器、heredoc 的简单命令序列（`&&`/`;`/`|` 分隔），其余一律 `opaque`（无沙箱即 ask）。M2 换成下述 AST 实现，以降低审批率（E7 阈值见 `14`）。两种实现共用规则表与测试语料。
1. **解析**（M2）：用真正的 shell 语法解析器得到 AST（候选：tree-sitter-bash 的 WASM 构建，或 mvdan/sh 的 WASM 构建；M0 实验 SP7 选型）。解析失败 → `opaque`。
2. **展开结构**：遍历列表（`;`、`&&`、`||`）、管道、子 shell、`{ }`、函数体、`$(…)`/反引号、进程替换；每个**简单命令**单独分类；整次调用取所有类的并集，certainty 取最差者。
3. **跟踪 cwd**：字面量 `cd <path>` 更新后续命令的 cwd；非字面量 `cd "$X"` 之后的路径解析全部降为 `opaque`。
4. **剥离包装器**：`env A=b`、`command`、`builtin`、`exec`、`nohup`、`time`、`timeout N`、`nice`、`stdbuf` → 内层命令；`sudo`/`doas`/`su` → 硬底线（forbid）；`xargs [opts] cmd` → 内层命令，参数未知 → `heuristic`；`find … -exec cmd {} \;` → 内层命令；`find … -delete` → 删除。
5. **重定向**：`>`、`>>`、`&>`、`tee`、`dd of=` 的目标按 §11.3.1 作为写路径分类；`< file` 作为读。
6. **解释器与动态执行**：`eval`、`bash -c "$X"`、`sh -c <非字面量>`、`python -c`、`node -e`、`ruby -e`、`perl -e`、`| sh`、`| bash`、`source <非仓库文件>` → `opaque`；`bash -c '<字面量>'` → 递归解析字面量。
7. **程序位置是变量**（`$CMD args`）→ `opaque`。
8. **仓库脚本**：`npm run X` / `pnpm X` / `yarn X` / `make X` / `just X` / `./scripts/x.sh` / `python scripts/x.py`：
   - 若脚本定义（`package.json#scripts.X`、`Makefile` 目标、脚本文件本身）在 worktree 中**与 baseCommit 一致** → 递归分类脚本体（深度 ≤ 3），命中合同标准命令或 `VerifyProfile` 测试/构建命令 → `exec.test`/`exec.build`；
   - 若脚本定义被本 Goal 修改过 → `opaque`，并记 Fact `sentinel{detector:"script_modified_then_run"}`（“先改脚本再运行”是绕过分类的典型手法）。
9. **程序规则表**（节选；完整表随实现维护并有单元测试语料，见 `14` E7）：

| 程序 / 模式 | 类 | certainty |
|---|---|---|
| `cat head tail less wc sort uniq cut tr diff cmp file stat ls tree rg grep fd find(无 -delete/-exec) jq yq basename dirname realpath echo printf true false test [` | `read.*`（按参数路径） | exact |
| `sed -i`、`perl -i`、`awk`（程序含 `>`/`system(`） | 写 → §11.3.1；否则 read | heuristic |
| `cp mv install ln mkdir touch chmod(worktree 内) truncate` | 写目标按 §11.3.1 | exact |
| `rm rmdir unlink git rm` | worktree 内且路径已跟踪或在最近检查点中 → `fs.delete.recoverable`；否则 `fs.delete.unrecoverable` | exact（含 glob 时 heuristic） |
| `rm -rf` 目标为 `/`、`~`、`$HOME`、`..` 越出 worktree、`*` 在 worktree 根以外 | 硬底线 forbid | exact |
| `pnpm/npm/yarn/bun install`（无包名）、`npm ci`、`uv sync`、`cargo fetch/build/test`、`go build/test` | `net.registry` + `exec.build`/`exec.test` | exact |
| `npm i <pkg>`、`pnpm add`、`yarn add`、`bun add`、`pip install <pkg>`（非 `-r`/`-e .`）、`uv add`、`uv pip install <pkg>`、`poetry add`、`cargo add`、`cargo install`、`go get`、`go install x@v`、`gem install`、`bundle add` | `dep.add` + `net.registry` | exact |
| `npx <pkg>`、`pnpm dlx`、`bunx`、`uvx`、`pipx run` | `dep.add` + `exec.arbitrary`（下载并执行未审查的包） | exact |
| 合同 `exec` 标准命令、`VerifyProfile.test/build/lint`（规范化后字符串相等；按第 2 步展开后的**每个简单命令**逐个比较，相等的那个取本行，其余简单命令照常分类，整次调用仍取并集、不短路，ADR-180；合同中的 `exec` 标准只能在本机新增或修改，`16` §16.5） | `exec.test` / `exec.build` | exact |
| `vitest jest pytest mocha go test cargo test rspec phpunit dotnet test` | `exec.test`（测试配置文件相对 base 被改过 → 额外 `config.change` 提示） | heuristic |
| `git status/diff/log/show/blame/add/commit/restore(工作区)/rev-parse/ls-files/grep` | `git.local` | exact |
| `git reset/rebase/commit --amend/stash/clean/cherry-pick/revert` | `git.history_rewrite` | exact |
| `git config`（`--local` 或默认，写卫星 gitdir） | `git.local`（ADR-089：gitdir 整体归 Agent，其配置只被沙箱内的 git 读取）；`--global`/`--system` → `edit.outside_worktree` | exact |
| `git remote`、`git submodule`、`git worktree` | `git.branch_escape`（`git worktree add` 在卫星内需要创建 `.git` 指针、在卫星外需要写 worktree 之外，S2 下都会失败）。卫星内的 `checkout`/`switch`/`branch -D`/`update-ref`/`tag` 只影响卫星（检查点在影子中），按 `git.history_rewrite`（notify）处理 | exact |
| `git push`（任何形式）、`gh pr …`、`gh release …` | `git.push`/`git.pr`：Agent 侧在所有预设下 forbid（卫星没有远端，推送由 Tower 在验收后代理执行，ADR-074）；目标为用户仓库路径时另为硬底线 | exact |
| `gh pr/issue/release/api(非 GET)`、`glab …` | `git.pr` 或 `external.side_effect` | exact |
| `curl/wget/http/xh`：无方法或 GET、主机在允许表 → `net.registry`；其他主机 → `net.other`；`-X POST/PUT/PATCH/DELETE`、`-d`、`--data*`、`-F`、`-T` 到非 localhost → `external.side_effect` | 如左 | exact（URL 为变量时 opaque） |
| `ssh scp rsync(远端) nc telnet ftp sftp` | `net.other`；`ssh host <cmd>` → `external.side_effect` | exact |
| `docker run/build/pull`、`podman` | `exec.arbitrary` + `net.other`；`docker push` → `external.side_effect` | exact |
| `kubectl/helm`（非 get/describe/logs）、`terraform apply/destroy`、`pulumi up`、`aws/gcloud/az`（非 describe/list/get）、`vercel/netlify/fly/heroku/railway` 部署、`npm/cargo/twine/gem publish`、`stripe`（写操作）、`psql/mysql/mongosh/redis-cli` 指向非 localhost | `external.side_effect` | exact / heuristic |
| `printenv`、`env`（无参数）、`set`、`cat /proc/*/environ`、`security find-*-password`、`op read`、`vault read`、`gh auth token` | `secrets.access` | exact |
| `brew/apt/dnf/port install`、`launchctl`、`systemctl`、`crontab`、`defaults write`、`kill/pkill/killall`（目标非本 Run 子进程）、写 shell rc 文件 | `system.change` | exact |
| `sudo doas su`、`chmod -R 777 /`、`:(){ :\|:& };:`、写 `~/.tower/**`（回退位置下本 Goal 的读写项除外，只按 §11.6.2 回退位置的例外，ADR-198）、关闭沙箱的环境变量 | 硬底线 forbid | exact |
| 不在表中的程序 | `exec.arbitrary` | heuristic |

### 11.3.3 范围围栏的默认 protected 集合

默认值以 `02` §2.5 `ScopeFence.protected` 为准（Agent 指令/信任类：`.pi/**`、`.agents/**`、`AGENTS*.md`、`CLAUDE.md`、`.mcp.json`、`.envrc`、`.npmrc`、`.husky/**`；验证类：测试快照、CI 配置、被验收标准引用的 `package.json#scripts` 脚本、**项目生命周期脚本**（`preinstall`/`install`/`postinstall`/`prepare` 及其调用的文件，修改触发 `lifecycle_script_changed`，`07`）；锁文件由 `allowNewDependencies` 推导：`false` 时视同 protected）。这些路径**影响后续 Run 的上下文、信任或执行**（理由见 §11.8 与威胁表 T4/T5）。`protected` 的全部模式（含下面第 1 项补充的）都按 `16` §16.1.12“上下文文件名与受保护名字”的比较规则匹配，只差大小写或等价变体的名字同样命中（ADR-204）。分类器在此基础上做三件事：

1. **按 protected 处理**（与 `02` 默认值同级）：任意子目录中的上下文文件 `**/AGENTS*.md`、`**/CLAUDE.md`（ADR-203）；`.pnpmfile.cjs`（ADR-085：它是在安装器中执行的项目代码）；补丁文件 `patches/**` 与 `pnpm.patchedDependencies` 的值所指路径；`package.json` 的 `pnpm.patchedDependencies`、`pnpm.overrides`、`overrides`、`resolutions`、`pnpm.packageExtensions` 键，以及 **`pnpm-workspace.yaml` 中影响解析的键** `overrides`、`catalog`/`catalogs`、`packageExtensions`、`patchedDependencies`（ADR-092/098，R6-D7-01、R7-D7-01：它们能把运行器改向补丁、`link:` 或经 `npm:` 别名改向注册表上的另一个包）。运行器相关包按 **lockfile 解析图**认定（别名展开后的真实包名、注册表来源与版本），不按 `package.json` 中的名字；涉及运行器的上述改动、别名、非已配置注册表来源记 `runner_patched`（severity 2），相对 base 的版本变化记同一检测器的 severity 1 提示（`07` §7.4.3）。以上都按项目生命周期脚本对待（lifecycleIndirection，`07`），修改触发 `lifecycle_script_changed`，与 `02` §2.5 一致。
2. **按 `config.change` 处理**（不是 protected）：`.yarnrc*`、`.tool-versions`、`.nvmrc`、`.node-version`、`.gitlab-ci.yml`、`.circleci/**`（Node 版本文件的变化：验证改用 pin 声明的版本，结论标为“有保留的已验证（Node 版本与项目档案不同）”并生成确认条目，`07` §7.4.3，R6-D7-03d）。
3. **硬底线**（文件工具：分类 forbid，S2 下访问时另由沙箱强制，§11.3.1 使用时强制；bash 中路径能求出的读写——§11.3.2 按参数路径分类的命令与重定向——同样分类 forbid，其余由 S2 保证，§11.6.2；对沙箱外工具见 §11.3.4。**分类的先后**（唯一定义，ADR-225；§11.3.1 的“先后”与 `05` §5.3.6 临时目录一行引用）：文件工具与 bash 求出的路径先判本条，命中即带 `hardFloor`（forbid、不出审批卡、不可授权），不再按密钥路径表追加 `secrets.access`——所以读取各 Host 临时目录中 Pi 的 Full output 文件不出读取凭据卡。返回给模型的文字为“该路径属于 Tower 不向 Agent 开放的位置，批准也不会改变”，路径在 Host 临时目录中时另加 §11.3.1 必然拒绝返回文字中的后一句（bash 的全文：把输出重定向到 `$TMPDIR` 下的文件；MCP 结果与 codemode 的全文文件：以更窄的参数重新调用该工具，ADR-226）；S2 与 S0 相同；本条的作用范围是 Goal 的 Run，Scratch（M2）的“真实检出读允许”与本条的关系在 M2 设计 Scratch 时限定；**告知强度**：这样直接尝试的读取只记 severity 1 的 `policy_block`，而经混淆、由 S2 拒绝的同一读取记 severity 2 的 `sandbox_violation`，信号反而较弱——如实登记，M1 不改：按受保护类别升级会重新带回 Host 临时目录的误报，ADR-226）：**读写**用户主检出及其 `commonDir`、其他 Goal 的卫星与 gitdir、`<wtRoot>/_verify/**`、`_inspect/**`、`_human/**`（与 Agent 的 bash 一致，ADR-082；取代此前的“用户检出读允许”）；读写影子目录 `~/.tower/goals/*/git/`、安装器私有目录 `$TI`（`~/.tower/installer/`；ADR-165 起不再长期保存明文令牌）与验证器存储 `$VS`（含 depcache）；读写各 Host 的临时目录 `~/.tower/tmp/<hostId>/`（Pi 的输出文件所在，`05` §5.3.6 唯一定义，ADR-224）；写各 Host 的 stdio MCP 服务器空工作目录 `~/.tower/mcp-cwd/<hostId>/`（`05` §5.3.5，ADR-214/216；以它为基准解析的相对路径只在越出它时按硬底线判定，残余见 §11.3.4，ADR-217）；写 Tower 镜像（只允许读其 `objects/`，alternates 需要；`objects/` 之外的读取不在本条，按密钥路径表的 `~/.tower/**` 一项归 `secrets.access`，S2 与 S0 都出读取凭据卡，S2 下批准也读不到，§11.3.1，ADR-226）与共享缓存 `$SH`；在卫星工作目录**任意深度**创建名字在 ASCII 大小写折叠下等于 `.git` 的条目（ADR-089/123；其余等价变体由 watcher 兜底，`10` §10.1.2）。卫星 gitdir 整体归 Agent（ADR-089），文件工具写它按 `git.local` 处理。

`02` 规定 protected 路径的改动“需 ask”，因此各预设中 `edit.protected` 的级别不低于 ask（§11.2）；同一路径命中多条规则时取最严格者：分类器收集全部适用的文件类（受保护的测试路径同时归 `edit.protected` 与 `edit.tests`，范围外的受保护路径同时归 `edit.protected` 与 `edit.out_of_scope`，§11.3.1，ADR-182/183），`decide` 取最严格者。

### 11.3.4 自定义工具、MCP 工具与 codemode

- **工具来源（唯一定义，ADR-186）**：门禁按工具的**注册来源**判定，不按工具名。来源取 Pi `getAllTools()` 中该工具的 `sourceInfo.path`（v1.2.0 `core/extensions/types.ts:2122-2130`、`core/agent-session.ts:1498-1510`；扩展注册的工具取注册它的扩展的来源，`core/extensions/loader.ts:289-298`；同名时以生效的定义为准——扩展之间先注册者胜、SDK `customTools` 压过一切，`runner.ts:637-647`、`agent-session.ts:3529-3553`）。只有下列来源按各自的规则分类：**Tower 注入的文件工具**（`<sdk:read>`、`<sdk:edit>`、`<sdk:write>`，§11.3.1，访问在 S2 中执行，ADR-220）与 **Tower 注入的沙箱 bash**（`<sdk:bash>`，§11.3.2）——白名单即 `05` §5.3.5 的 `TOWER_BUILTINS`（`read`、`bash`、`edit`、`write`），四者的生效定义恒为 Tower 以 `customTools` 注入的版本；对应的 `builtin:read`、`builtin:edit`、`builtin:write`、`builtin:bash` 只在回归保护触发、Goal 已降为 S0 时生效（`05` §5.3.5），按同样的规则分类；tower-goal 注册的 Tower 工具（`tower.tool`，§11.4）；Host 以 `builtin` 条目加载的 `builtin:codemode` 与 `builtin:tool-search`（见本节末条）。**其余一切来源都是沙箱外工具**（§11.4 的 `isOutOfSandboxTool` 即此判定）：用户扩展注册的工具，以及 `builtin:mcp` 注册的 MCP 工具与 MCP 资源工具。用户扩展注册同名的 `codemode`、`tool_search` 或 Tower 工具名而取代内置实现时（Pi `docs/mcp.md:268`、`extensions/index.ts:9-13`），来源随之变为该扩展，按沙箱外工具处理；没有任何按名字的豁免。注册了 Pi 内置工具名的扩展工具在 SDK 下不会生效（`read`、`bash`、`edit`、`write` 被 Tower 注入的版本取代，其余名字被 `excludeTools` 移出注册表，`05` §5.3.5，ADR-220；`00` §0.5.1），万一生效同样按来源归沙箱外工具；Tower 工具被遮蔽时 Run 不会开始（来源自检唯一定义在 `05` §5.3.5，ADR-187）；Run 中途才注册的同名工具在调用时由 gate 第 1 步阻断，Goal 暂停为 `prepare_failed`，不出现审批卡（`05` §5.6.5，ADR-188）。**`builtin:` 来源的允许表**（ADR-190）：v1.2.0 中 Pi 内置工具的来源是 `builtin:<工具名>`（`core/agent-session.ts:3544`），Host 以 builtin 条目加载的扩展所注册工具的来源是 `builtin:<扩展名>`（`core/resource-loader.ts:382, 727-740`，`core/extensions/loader.ts:296-299, 595-602`），两者的 `sourceInfo.source` 都是 `"builtin"`，只看前缀无法区分。所以 `builtin:` 来源中只有两组按上文各自的规则分类：`TOWER_BUILTINS` 各名字的 `builtin:<工具名>`（只在回归保护下生效，见上）；`05` §5.3.5 `extensionFactories` 中 `builtin: true` 条目的路径 `builtin:codemode`、`builtin:tool-search`、`builtin:mcp`（类别见上文与本节 codemode、MCP 条）。**白名单之外的 Pi 内置工具** = 来源以 `builtin:` 开头、但不在这张允许表中的工具（v1.2.0 的 `powershell`——不传执行实现时在本地、不经沙箱运行，Pi `core/tools/powershell.ts:32, 55`——与 `grep`、`find`、`ls`——Tower 不提供它们，`grep` 直接派生 `rg`、不经 `operations`，`core/tools/grep.ts:119-168`，ADR-220——以及以后的 Pi 版本新增的内置工具，ADR-189/190）：Host 以 `excludeTools` 不注册它们，任何阶段都不会活跃（`05` §5.3.5）；万一出现，门禁按沙箱外执行处理，硬底线 forbid，不可授权，既不按 `bash` 的规则分类，也不以 Goal 的沙箱档位求值。Pi 内置工具中，只有被 Tower 以 `customTools` 替换的 `read`、`bash`、`edit`、`write` 按有沙箱求值（S0 下照常按无沙箱）。**已知窗口**（ADR-189）：Pi 在 `beforeToolCall` 之前就取定要执行的工具（`packages/agent/src/agent-loop.ts:708-730`），门禁按调用时的注册表查来源；同一回合内有扩展注册了覆盖内置工具名的工具时，这次实际执行的内置工具按 `tool.external` 判定（逐次 ask，参数路径扫描照常），方向偏严。
- **用户扩展注册的工具**：沙箱外工具。**分类结果（唯一定义，ADR-185/186；`16` §16.1.10 的工具表只引用本条）**：沙箱外工具的每次调用只归一个类 `tool.external`，certainty = `heuristic`，`subjects.tool` = 生效的工具注册名；**Tower 不按注解分类**——`readOnlyHint`、`openWorldHint` 等是工具作者给的提示，Pi 不核实（`types.ts:518-531`），缺省时按 MCP 默认值视为非只读、可能触达开放世界（`docs/extensions.md:167`）。`tool.external` 在各预设中为 `ask`，级别下限为 ask（`decide()` 先把矩阵级别钳到下限，合同中更低的值不生效，§11.3.5），所以**每次调用都 ask**。审批只有两种授权：“仅这一次”，或“本 Goal 内同类”（`Grant{scope:"goal", class:"tool.external", matcher: <工具名>}`，§11.2；项目作用域属 M3，ADR-184）——匹配器与 `subjects.tool` 精确相等、不接受模式，只放行这一个工具，与其他类的匹配器不在同一命名空间；授权后同一工具的调用为 `notify`，合同把该类设为 `forbid` 时授权不生效（§11.3.5 `applyGrants`）。**按工具名授权的条件**（唯一定义，ADR-227；§11.2、§11.3.5 排除 (d)、§11.8 风险说明与 T16 只引用本句）：本 Goal 的致命三要素（§11.8）中**不可信内容与对外通信都为真**时——加载了 MCP 服务器的 Goal 恒如此（ADR-032）；私有数据一项对沙箱外工具至少是“未知”（§11.8 私有数据一行，ADR-226）——`tool.external` 不提供“本 Goal 内同类”，审批卡只有“仅这一次”，该工具的每次调用都 ask；已有的这类授权（运行时 `Grant` 与合同 `autonomy.grants` 中的 `tool.external` 项）在这一条件下不编入 `policy.json`，条件在 Goal 中途成立时（例如另一类授权使对外通信变为真）于下一次编入时失效。条件不成立时照常提供，选项上方显示 §11.8 的沙箱外工具风险说明并加半句 `授权后该工具的调用不再逐次询问`；合同编辑器对带 `tool.external` 授权的合同同样加这半句。**条件成立时的显示**（ADR-228）：审批卡在“仅这一次”上方以同一样式（`12` §12.12 `ExternalToolNote`）显示 `本目标有不可信内容与对外通信：外部工具每次调用都需要你批准`；合同编辑器与 Goal 页对按 §11.3.5 (d) 不编入的授权显示 `在本目标不生效（不可信内容与对外通信）`，不显示“不再逐次询问”；本 Goal 已有这类授权时，会使条件成立的授权选项（例如 `net.other` 的“本 Goal 内同类”）上方加半句 `授权后外部工具 <名字> 的授权在本目标不生效`。理由：私有数据一项对沙箱外工具无法判定，本节其他“无法判定”都取更严的一边（T7/T26 按能写计、路径扫描按写处理、不透明参数至少 ask）；合同批准处不因此警告（ADR-226 的取舍：对 MCP 用户恒出现、又清不掉的警告会被习惯性地坚持批准），这一面实际由逐次 ask 承担，所以三要素的另外两项都成立时不让它被撤掉。参数路径扫描（下文）照常叠加：命中硬底线仍 forbid，命中密钥路径另加 `secrets.access`（一次审批命中两个 ask 类，只有“仅这一次”），相对路径使 certainty 为 `opaque`、至少 ask（这类工具不在 S2 中运行，`decide` 恒以 `env.sandbox = false` 求值，§11.4）。**取舍（ADR-186）**：沙箱外工具的效果 Tower 无法判定，可能是部署、外部写入或网络访问；`tool.external` 仍不是单向门——可以授予按工具名的 Goal 级授权（条件见上），不需要双确认。理由是授权以一个工具名为单位、只能由人在本机显式给出；需要逐次确认的工具，人不授予授权，或把该类设为 `forbid`。**代价**（ADR-228，登记于此，`00` §0.5.1 与 T10 引用）：配置了 MCP 服务器时，加载它的 Goal 的不可信内容与对外通信恒为真，所以每个沙箱外工具的每次调用都出一张只有“仅这一次”的审批卡——`approval`、`agent_blocked`、基础级别 L3（`08` §8.3.1）；Goal 桶取空后降为 L2 进收件箱，Agent 阻塞等人（`08` §8.5.3）；代码智能类 MCP 在一个 Run 中被调用几十次是常见的。告警纪律的两个出口——按工具名授权与自适应晋升（§11.5 受级别下限 ask 所限）——对这一类都不可用，人能做的只有逐次批准、把该类设为 `forbid`、把该 Goal 设为高风险（M1 中对单个 Goal 不加载 MCP 的唯一做法，同时也不加载用户扩展、并加计划闸门，`16` §16.1.1 `Goal.riskTier` 行与 §16.6 “用户扩展与 MCP”行，ADR-212/229），或不配置 MCP。逐次 ask 只在不被习惯性点过时才承担 §11.8 警告不覆盖的那一面，所以这一类的审批数、反射批准率与 Agent 阻塞时长单独度量，越过 `14` E3 的复审线时提前评估沙箱外工具的可核实能力声明（M2 决定点，`14` §14.4.1）。**已知限制**：授权绑定名字而不是实现——同一 Goal 内 MCP 服务器改变工具列表，或规范化后名字冲突、按注册顺序加哈希后缀（Pi `extensions/mcp/tools.ts:78-92`），使同一名字指向另一实现时，授权照样生效；Goal 页按类撤销，一次撤销本 Goal 的全部 `tool.external` 授权，不能只撤销其中一个工具。
- **MCP 工具与 MCP 资源工具**（`mcp__<server>__<tool>`；资源工具 `list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource`，v1.2.0 `core/mcp-servers.ts:28-30`、`extensions/mcp/resources.ts:254, 278, 302`，名字不以 `mcp__` 开头）：按 ADR-032 继承用户的 Pi 配置（`~/.pi/agent/mcp.json` 有服务器则启用，经 codemode/tool_search，与 Pi CLI 一致）。MCP 工具**结果一律视为不可信内容**，MCP 服务器**一律视为对外通信能力**（§11.8 三要素）；两者都是 `builtin:mcp` 注册的沙箱外工具，按上一条归 `tool.external`（匹配器 = 生效的全名；资源工具标了 `readOnlyHint`，同样不看）。MCP 服务器进程本身在 Engine Host 之外、沙箱之外运行（与用户扩展同属 §11.8.2 的“沙箱外代码”）。用户扩展注册 `/mcp` 而取代内置 MCP 时（Pi `docs/mcp.md:264-266`），Run 不开始（`05` §5.3.5“内置 MCP 的来源自检”，ADR-215），所以本节对 MCP 的规则总是在 `builtin:mcp` 与 `towerMcpTransport` 生效时适用。
- **沙箱外工具的路径检查（R3-D11-03、R4-D11-04）**：用户扩展工具与 MCP 工具在 Engine Host 中、S2 之外以用户权限运行，S2 挡不住它们。门禁对这类工具的参数做**路径扫描**：递归检查参数中所有字符串值；这类工具的读写方向门禁无法判定（Tower 不按注解分类，见上一条），所以第 3 条中只禁止写的位置在 (1)(3) 中同样按写处理（ADR-215）。**求值**（唯一定义，ADR-218/219；(1)(3) 与下一条 (b) 共用）：每个路径——(1) 的绝对路径、`~` 路径展开后与 `file:` URI 解码后的路径，(3) 与 (b) 以各基准解析出的相对路径——都按两种方式各求一次：按词法规范化 `..`，与按操作系统的方式（先解析符号链接、再处理其后的 `..`）；两种方式在最后几段尚不存在时都对最长已存在前缀取 `realpath`、其余照写；两个结果都判定、取更严格者。服务器可能采用其中任一种，Agent 又能在卫星中建立符号链接。各类路径：(1) 绝对路径、`~` 路径与 `file:` URI（**`~` 路径**（ADR-218）：以 `~` 开头的值按 shell 的规则展开——恰为 `~` 或以 `~/` 开头的展开为你的主目录，与 Pi 的 `expandHome` 相同（`extensions/mcp/runtime.ts:89-96`），`~user/…` 展开为该用户的主目录，无法展开的不作 `~` 路径；同一个值另按 (3) 当作字面的相对路径检查一次。**`file:` URI**（ADR-217/218）：按 RFC 8089 取路径部分——`file:///p`、`file://localhost/p`、`file:/p`，scheme 与 `localhost` 不区分大小写——解码百分号转义后视为绝对路径；带查询（`?…`）或片段（`#…`）的，去掉它们与把它们当作路径的一部分（不严格的服务器可能这样取）各取一次路径、各查一次；主机部分是其他名字的，以及 `file:` 之后不以 `/` 开头的，不是本地路径，视为不透明参数、至少 ask）按上述两种方式求值后，落在第 3 条硬底线之内的 forbid（不可授权覆盖；与 ADR-082 一致，用户主检出**读写都在硬底线内**——代码智能类 MCP 应以 `roots`（Pi 声明为卫星）为根运行，R6-D15-01 #2；服务器自己按 `roots` 在卫星中运行程序（如语言服务器启动项目中的工具）仍属 T16 的残余，ADR-214 没有改变这一点；stdio 服务器的工作目录不是卫星，未写绝对 `cwd` 时是本 Host 的空目录 `~/.tower/mcp-cwd/<hostId>/`，`05` §5.3.5，ADR-214/216）；(2) 命中 §11.3.1 密钥路径表的（含 `$TI`；含由 `file:` URI 解码出的路径）→ `secrets.access`（即使工具带 `readOnlyHint:true`，也不按 `read.external` 处理）；表中的 `~/.tower/**` 一项在这里不含两处由 Tower 拥有、不存放密钥的位置：本 Host 的空目录 `~/.tower/mcp-cwd/<hostId>/`（只在路径检查中除外，唯一定义在此，ADR-218；每个 Host 进程新建，下一条 (a)），以及 `<wtRoot>` 回退时本 Goal 的卫星工作区（对本 Goal 的一切工具除外，只对本 Goal 的调用，唯一定义在 §11.3.1 密钥路径表的该项，ADR-224）；落在其中的结果不因这一项归 `secrets.access`，表中其他条目（如其中 base 未跟踪的 `.env`）与第 3 条硬底线照常适用；(3) **相对路径**（含 `/` 或等于 `.`、`..`，且不以 `/` 或 `<scheme>://` 开头的字符串值，ADR-186；`file:` URI 按 (1)，其他 scheme 的 URI 不视为路径，ADR-217；以 `~` 开头的值也在其中——不展开 `~` 的服务器把它当作相对自己工作目录的路径——同时按 (1) 展开检查一次，两种解释的结果都判定、取更严格者，ADR-218；“含 `/` 或等于 `.`、`..`”的条件同样适用，`~`、`~foo`、`~1.2.3` 这类不含 `/` 的值只按 (1) 检查，ADR-219）：经 `towerMcpTransport` 启动的 stdio 服务器的工具按下一条解析，落在第 3 条硬底线之内的 forbid（唯一的例外见下一条 (b)）；其余——用户扩展工具与 HTTP 服务器的工具没有已知的基准，以及解析后不落在硬底线内的——视为不透明参数，至少 ask。这是尽力而为：工具可能根据非路径参数自行决定读写位置。因此威胁表 T7/T26 的评级按“是否加载了沙箱外工具”分档（它们是否写文件系统 Tower 无法判定，按能写计，ADR-226）。**残余**（ADR-225）：这类工具写进 Agent 写允许范围的文件（例如一个拉取环境文件的工具写出的 `.env`）不受 S2 与本条约束，可能含真实凭据；之后 Agent 运行的程序读取它们不经分类（§11.3.1 密钥路径表的作用范围 (ii)），只有文件工具与 bash 的直接读取出读取凭据卡；§11.8 对会加载沙箱外工具的 Goal 显示风险说明，不计入致命三要素的私有数据（Tower 无法判定，ADR-226）；不可信内容与对外通信都为真时，这类工具不能按工具名授权，每次调用都 ask（§11.3.4 按工具名授权的条件，ADR-227）。
- **stdio MCP 服务器的空工作目录与相对路径**（唯一定义，ADR-215/216；`05` §5.3.5、`06` §6.6.1、`00` §0.5.1 引用）：(a) **每个 Host 进程一个空目录** `~/.tower/mcp-cwd/<hostId>/`，由 Tower 拥有：Supervisor 在 `host.spawn` 时、Host 进程启动之前（因而在该 Host 启动任何 MCP 服务器之前）把它建为空目录（已存在时先删除，删除不跟随符号链接，`10` §10.1.3 的方式），并把路径随 `host.spawn` 的启动参数交给该 Host；该 Host 进程退出（含崩溃）后 Supervisor 删除它，Supervisor 启动恢复时——在 main 交回存活 Host 的端口之后（`06` §6.1.3）——删除不属于存活 Host 的残留目录。`hostId` 跨进程复用（`hostEpoch` 每次进程启动加一，`05` §5.2.2）：同一 `hostId` 的下一个 Host 进程（崩溃后的“重启并恢复”、挂死后强杀再启动，`06` §6.1.3）只在上一个进程确认退出、其目录已删除之后才 spawn，所以退出清理从不删除后继进程的目录（ADR-217）；目录删除失败（如服务器在其中留下删不掉的条目）时不 spawn，按 Host 握手失败处理（`06` F4b）；启动恢复以 main 交回的存活 Host 判定，Supervisor 在建目录之后崩溃时，main 已启动的 Host 的目录保留，未启动的按残留删除（ADR-218）。它只给这一个 Host 进程用，从不在 Host 之间共享，也从不在其他 Host 启动时被删除或重建，所以别的 Goal 开 Run 不影响本 Host 中正在运行的服务器（ADR-216）。各 Host 的这一目录都在第 3 条硬底线（写）之内，三种沙箱都拒绝读写（§11.6.2）。服务器自己或经批准的调用留在其中的东西，只影响同一 Host 进程中之后启动的服务器（交接与恢复时的新会话；打包模式下含同一 Host 承载的其他 Goal，`06` §6.1.1），不越过该 Host 进程的生命周期。Pi 在关闭连接时经传输的 `close()` 按进程组终止 stdio 服务器（各在自己的进程组，`packages/mcp/src/transports/stdio.ts:100-101`、`:152-179`），在进程正常退出时经 `exit` 钩子终止（`:43-52`）；Host 非正常退出（被信号终止、超出内存上限、运行时中止；未捕获的 JS 异常仍会运行 `exit` 钩子）时两者都不运行，服务器可能比 Host 活得久：它们的 stdin 随 Host 关闭、不再收到请求，多数随即退出，其工作目录照常删除；`close()` 在服务器进程已退出时只结束 stdin、不再按进程组终止（`:160-163`），所以服务器留下的子进程也可能在连接关闭之后存活；仍在运行的属 §11.8.2 “用户确认的那段代码的行为”的残余（ADR-217/218），包括启动时记下了工作目录的绝对路径、之后经它写进后继进程新建的同名目录的服务器。(b) 经 `towerMcpTransport` 启动的每个 stdio 服务器（含扩展以 `pi.registerMcpServer` 注册的）的工作目录由 Tower 求出（`05` §5.3.5），门禁因此知道它。该服务器的 MCP 工具参数中的相对路径以两个基准各解析一次（按上一条的两种方式求值，ADR-218/219；MCP 工具属于哪个服务器取自 Tower 的工厂为该连接记下的条目，不由 `mcp__<server>__<tool>` 的名字反推——名字经规范化可能冲突而加哈希后缀，Pi `extensions/mcp/tools.ts:78-92`；从一次调用找到该条目，按 `getAllTools()` 中该工具的 `namespace.aliases`——Pi 注册时设为原始服务器名，`extensions/mcp/index.ts:391-395, 424`、`core/extensions/types.ts:2121-2131`——取服务器名，取不到时以本 Host 全部 stdio 服务器的工作目录各解析一次，ADR-219；资源工具以参数指明的服务器取工作目录）：`roots`（卫星），以及该服务器**实际的工作目录**——`05` §5.3.5 求出的 spawn `cwd`：写了绝对 `cwd` 时是该目录，写了相对 `cwd`（含 `..`）时是以本 Host 的空目录为基准求出的目录，未写时是本 Host 的空目录（ADR-217；服务器按自己的工作目录解析相对参数，Pi 的 stdio 传输以它启动子进程，`extensions/mcp/runtime.ts:118`）。任一结果落在第 3 条硬底线之内即 forbid，不可授权覆盖；命中 §11.3.1 密钥路径表的按上一条 (2) 归 `secrets.access`；其余至少 ask。例如绝对 `cwd` 在你的主检出之内时，相对路径落在主检出之内，与其他对主检出的读写一样 forbid。**唯一的例外**（ADR-216/217/218）：工作目录是本 Host 的空目录时（未写 `cwd`，或相对 `cwd` 求出的正是该目录，如 `.`、`./`；按求出的目录判定，不按写法），以它为基准求出、仍在该目录之内的结果不因该目录在第 3 条中而 forbid，也不按密钥路径表的 `~/.tower/**` 归 `secrets.access`（上一条 (2)）——所以 `owner/repo`、分支名这类不是本地路径的参数不会因此被拒绝，与其他相对路径一样按 `tool.external` 至少 ask；以 `..` 越出该目录的结果照常判定，落在影子目录、安装器私有目录、其他 Host 的空目录或你的主检出等硬底线位置的 forbid。残余：一次经人批准、结果在本 Host 空目录之内的调用可以写进该目录，按 (a) 只影响同一 Host 进程中之后启动的服务器，Host 退出时删除；其他 Host 的空目录都在硬底线之内，所以从不跨 Host。不含 `/` 的单个文件名仍不当作路径，上一条末句的尽力而为限制不变（T7/T26）；最直接的情形是绝对 `cwd` 在你的主检出之内：单个文件名与不按路径检查的参数作用于主检出而不受检查，含 `/` 的参数（`owner/repo` 也在其中）则落在主检出之内、一律 forbid（ADR-218）。
- **codemode 与 `tool_search`**（来源为 `builtin:codemode` / `builtin:tool-search` 时；被取代时按第一条处理）：codemode 的脚本运行在无 Node API、无文件系统、无网络的 QuickJS 沙箱中，只能通过 `tools.*` 调用其他工具（`docs/codemode.md`）；嵌套调用带 `parentToolCallId`，**同样经过 `tool_call` 钩子**（`agent-session.ts` L658–673）。因此 codemode 本身归为 `tower.tool` 级的“容器”，按嵌套调用逐一判定；`tool_search` 只在已注册工具的元数据上检索，把匹配的工具加入下一次模型调用可见的集合（v1.2.0 `extensions/tool-search/tool.ts:200-209, 219-229`），不执行任何动作、没有声明注解，同样归 `tower.tool` 级，被它加载的工具照常逐次判定（ADR-186）；嵌套调用被 `ask` 时脚本阻塞，被 `forbid` 时脚本收到异常（“已发生的调用不会撤销”）。**嵌套调用的发起者不限于 codemode**（已知限制，ADR-189）：v1.2.0 中任何工具的 `execute` 都拿到 `ctx.executeTool`（`core/extensions/types.ts:383-394`），已获批准的沙箱外工具因此也能嵌套调用 Tower 工具，gate 第 1 步按来源放行；后果限于一次不是由模型发起的 `log` 或 `submit`，提交之后仍由验证裁决，不越权。

### 11.3.5 决策函数

```ts
function decide(c: Classification, m: AutonomyMatrix, g: Grant[], env: { sandbox: boolean }): Level {
  if (c.hardFloor) return "forbid";
  const floor = (k: ActionClass) => isOneWayDoor(k) || k === "tool.external" ? "ask" : "silent";   // 级别下限的唯一执行点（02 §2.5，ADR-186）：作用于矩阵级别、在授权之前；合同中更低的值不生效
  let level = maxLevel(c.classes.map(k => applyGrants(maxLevel([m.levels[k], floor(k)]), k, c.subjects, g)));   // m: 02 §2.5 AutonomyMatrix
  if (c.certainty === "opaque") {
    level = env.sandbox ? maxLevel([level, m.levels["exec.arbitrary"]])   // 矩阵中的 exec.arbitrary 即“有沙箱时”的级别
                        : maxLevel([level, "ask"]);                       // 无沙箱：至少 ask（§11.2 两行）
  }
  return level;   // 单向门恒至少 ask：floor 给出下限，applyGrants 不降低单向门，opaque 只会提高（ADR-186 删除了此前把 silent 的单向门提到 notify 的一行）
}

// applyGrants（唯一定义，ADR-182）：授权只能把 ask 降到 notify，不改变任何其他级别
function applyGrants(level: Level, k: ActionClass, subjects: Subjects, g: Grant[]): Level {
  if (level !== "ask" || isOneWayDoor(k)) return level;   // forbid（合同、预设或降级给出的）不被任何授权越过；单向门不能形成授权
  return g.some(x => x.class === k && matches(x.matcher, subjects)) ? "notify" : "ask";   // 不降到 silent：授权放行的动作仍可见
  // matches：matcher 或对应的主体为空时不匹配（ADR-186）；tool.external 只比较 x.matcher === subjects.tool（精确相等，§11.3.4，ADR-185）；其余类按命令前缀 / 路径 glob / 主机 / 包名
}
```

**哪些授权进入 `g`（编入 `policy.json` 的唯一规则，ADR-182）**：每个 Run 开始时，以及授权、撤销或降级之后，Supervisor 把下列授权编入 `policy.json` 的 `grants`——合同 `autonomy.grants`（批准合同时写入）与运行时 `Grant`（`02` §2.5，§11.2 的“本 Goal 内同类”；M3 另有项目级），排除：(a) 已过 `expiresAt` / `until` 的；(b) 被撤销或降级覆盖的（作用范围的唯一定义，ADR-184）：M1 的 Goal 页撤销 `autonomy.revoke{projectId, class, goalId}`（省略 `level`）只排除**该 Goal** 中该类在撤销之前产生的运行时 `Grant`——不影响合同 `autonomy.grants` 与其他 Goal 的授权（合同授权只经 `contract.amend` 删除）；省略 `goalId` 的项目范围撤销、带 `level` 的撤销与自适应降级（均为 M3，§11.5）排除本项目中该类在其之前产生的全部授权，含各 Goal 的运行时 `Grant` 与合同 `autonomy.grants`；(c) 产生**之前**本 Goal 的合同修订把该类收紧过的（按事件序号比较：授权早于把该类级别改得严于上一版的那次 `amend_contract` 时不作用于本 Goal；收紧之后人在同一类上新给的授权照常生效——与 (b) 同一写法，ADR-183）；(d) `tool.external` 的授权，在本 Goal 的不可信内容与对外通信都为真时（按编入时的三要素求值；条件只在 §11.3.4 “按工具名授权的条件”，ADR-227）。授权因此不作用于合同把该类设为 `forbid` 的 Goal（第一行），也不越过硬底线（`decide` 首行）与单向门下限。S0 执行授权不是 `Grant`，不经本函数（§11.2）。

---

## 11.4 执行点：tower-goal 的 `tool_call` 钩子

```ts
pi.on("tool_call", async (event, ctx) => {
  if (towerLevelBySource(event)) return;                             // tower-goal 的 Tower 工具与 builtin 的 codemode、tool_search：按来源，不按名字（§11.3.4，ADR-186）
  const c = await classify(event, goalCtx());                         // 纯函数 + 内存查表（不启动 git 子进程，见下方“判定开销”），p95 ≤ 5 ms
  const level = decide(c, goalCtx().contract.autonomy, goalCtx().grants,
                       { sandbox: sandbox.active && !isOutOfSandboxTool(event) });   // 沙箱外工具（按来源，§11.3.4 工具来源）不在 S2 中运行：恒按无沙箱求值（ADR-185/186）
  audit.record({ toolCallId: event.toolCallId, parent: event.parentToolCallId, c, level });
  switch (level) {
    case "silent": return;
    case "notify": host.emit("fact.policy_notify", { c, toolCallId: event.toolCallId }); return;
    case "forbid": return { block: true, reason: policyReason(c) };   // 返回给模型的文本
    case "ask": {
      const d = await host.requestApproval({ c, toolCallId: event.toolCallId,
                 agentRationale: lastLogClaim() }, ctx.signal);   // 超时与默认项：ADR-023（默认永不超时；use_defaults 时到期只能拒绝；单向门永不超时）
      if (d.kind === "approve") { if (d.grant) goalCtx().grants.push(d.grant); return; }
      return { block: true, reason: d.note ? `Human denied: ${d.note}` : "Human denied this action." };
    }
  }
});
```

实现要点（均已对照 Pi 源码；gate 在集成层的机制——`policy.json` 的编译与热加载、ask 的 `kind:"approval"` 对话框信封经 `ctx.ui.input` 往返、bash 默认 `timeout` 注入、draining 分支、故障保护——以 `05` §5.6 为准）：

- **处理器顺序与输入冻结——分适配器描述。** `emitToolCall` 依次调用所有扩展的处理器，后面的处理器看到前面的输入修改，且修改后不再校验（`runner.ts` L1249–1267；`types.ts` L1250–1255）；处理器抛出的异常会被转为错误结果，调用被阻断（ADR-046 核实）。

  | | SDK（默认，M1） | RPC（“使用我安装的 pi”，M2） |
  |---|---|---|
  | tower-goal 位置 | `extensionFactories` 末尾，**最后**加载（`resource-loader.ts` L775–781），门禁看到最终输入（ADR-024） | `-e` 加载；处理器顺序无法从 RPC 获知。**ADR-065：只有当用户的扩展集合不含 `tool_call`/`tool_result` 处理器、也不覆盖 `bash` 时才允许使用 RPC**（静态清单 + 启动自检），此时门禁之外没有其他会修改输入的处理器，顺序无关 |
  | 防篡改 | 契约测试断言门禁之后无其他 `tool_call` 处理器 | **不冻结输入**（ADR-065 取代 ADR-046 的冻结：Pi 公开 API 要求扩展原地修改 `event.input` 改参数，冻结会阻断这类扩展的每次调用）；只保留 `tool_result` 中的哈希比对（事后发现，severity 3）——由于适用范围已排除拦截型扩展，正常情况下不会触发 |
  | 事后兜底 | 门禁记录批准输入的哈希，`tool_result` 中比对（severity 3） | 同左；但被后续处理器 block 的调用不会到达 `tool_result`，门禁对未完成的批准记录做超时清理（避免泄漏） |
  | 同名 `bash` 覆盖 | 沙箱 bash 以 SDK `customTools` 注入，压过一切扩展同名定义（ADR-041；`read`、`edit`、`write` 同样注入，§11.3.1，ADR-220）；用户扩展的同名 bash 在静态清单确认卡片上明示“将被 Tower 沙箱版本取代”（ADR-066）；启动自检只是回归保护 | 覆盖 `bash` 的扩展集合不允许使用 RPC（ADR-065）；每次 `tool_call` 用 `pi.getAllTools()` 复核生效 `bash` 的来源（运行期 `registerTool` 可能改变注册表），不符 → 该 Goal 降为 S0（ADR-041） |
  | 脱敏的位置 | tower-goal 的 `tool_result` 处理器最后运行 | 不是最后：后续处理器可整体替换 `content`/`details`，抹掉脱敏或 `details.tower`；Supervisor 在 Engine Host 转发 `tool.end` 前再做一次同样的脱敏（§11.7） |
  | 适用范围 | 全部 | 只限“无拦截型扩展”的用户（ADR-065）；不再按风险等级区分。不满足时 UI 说明原因并要求改用 SDK 适配器 |
- **判定开销（R1-D11-08）。** 门禁不在关键路径上启动 git 子进程：脚本体（`package.json#scripts`、`Makefile` 目标、`scripts/**`）相对 base 是否改动，由每个检查点（`10` §10.7）预先计算为 `scriptDigest` 表随 `policy.json` 下发；门禁只做内存查表。p95 ≤ 5 ms 的预算由 E7 语料回放测量。
- **用户 bash（R4-D2-03）。** tower-goal 注册 `user_bash` 处理器，在 S2 下返回与 Agent bash 相同的沙箱化 `operations`（Pi 自带 sandbox 示例的做法），使经 Pi 输入的人工命令（`!cmd`、RPC 的 `bash` 命令）同样受沙箱约束；人需要完整权限时使用自己的终端。
- **工具被覆盖。** 扩展之间同名工具“先注册者胜”，SDK `customTools` 压过一切（ADR-041，`agent-session.ts` L3529–3553）。沙箱 bash 以 `createBashToolDefinition(cwd, {operations, spawnHook, commandPrefix, exposeSessionEnvironment: true})` 构造，`commandPrefix`/`shellPath` 取自用户 Pi 设置；`shellPath` 不作为参数传入（传入 `operations` 时 Pi 忽略它，v1.2.0 `bash.ts:248`），由沙箱执行层用 `getShellConfig(shellPath)` 构造 `operations` 时使用（`05` §5.3.5，ADR-179），`spawnHook` 的环境按 `bashEnv` 过滤：`PI_*` 只保留 Pi 的五个会话变量，不按前缀保留（唯一定义 `05` §5.3.6，ADR-066/212）。Run 开始前 Host 读取生效 `bash`（与 `read`、`edit`、`write`，ADR-220）的 `sourceInfo`：SDK 下必须为对应的 `<sdk:…>`，RPC 下必须属于 tower-goal；不符 → 该 Goal 降为 S0（能力摘要显示“沙箱被扩展 X 覆盖 → S0”），ADR-022 授权路径生效，并记哨兵 `bash_overridden`（severity 2，Needs-You kind `sentinel`，去重键 `s:{goalId}:bash_overridden`，出口与定类按 `08` §8.8 `sentinel` 一行；只可能在 RPC 适配器下出现，M2；ADR-201）。它不是 §11.2 的 S0 执行授权 `approval`：后者在降级后首次运行测试或构建时照常另行询问。Tower 工具的生效来源必须是 tower-goal，不符时不开 Run（`05` §5.3.5，ADR-187）；其他工具的来源扩展记入审计。
- **阻塞期间的模式。** `ask` 期间 Mode = `blocked_guard`（`02` §2.4），Needs-You 条目 `kind: "approval"`，`costOfDelay: "agent_blocked"`；审批卡片显示：解析出的程序与参数、命中的类、路径/主机/包、所在合同条款（Fact 语法），以及 Agent 最近一次 `log` 的说法（Claim 语法）。
- **事后检测（检测层）。** bash 可能写到分类器未预见的地方；S2 下分类之后被改向沙箱允许范围之内另一路径的文件工具写入也是如此（§11.3.1 使用时强制的残余 (i)）。每个检查点（`10` §10.7）计算相对上一个检查点的变更路径集合；命中 `protected` 时记录该检查点的同一事务使 S0 授权失效（§11.2 失效条件 (ii)，ADR-182）。**运行中只做这一件事**（唯一定义，ADR-201）：不暂停 Run、不生成 Needs-You，也不记哨兵命中——停止条件只在工具执行之前求值（`07` §7.7.1），不适用于已经发生的写入。命中 `protected` 或围栏外的改动由验证时的 `scope_breach`（`07` §7.6.1，推导来源为 pin）判定：`protected_path` 为 severity 3，阻止进入 `in_review`，按 `07` §7.10.1 的路由生成 Needs-You `sentinel`；卡片按 pin 中的改动列出这些路径，写明改动已发生、在待验证的内容中。

---

## 11.5 自适应自主度（Earned Autonomy）

theory §C6、idea #27（Hedwig）：信任按 **项目 × 模型 × 动作类** 计算，晋升需人批准，降级自动。

证据计数（每个 `(projectId, model, class)`，滑动 90 天）：

| 计数 | 来源 |
|---|---|
| `asked`、`approved_unmodified`、`denied` | 审批记录 |
| `distinct_goals` | 批准分布在多少个 Goal |
| `incidents` | 归因到该类的：高严重度哨兵、检查点回退中被人撤销的该类动作、评审中以“该动作不该发生”标记的 `request_changes`、审计中的事后撤销（revert） |

**晋升建议**（只建议一级：`ask → notify`，或 `notify → silent`）条件全部满足：

- 批准率的 Wilson 95% 置信下界 ≥ 0.90，其中分子只计 `confirmatory` 批准（`08`），分母为全部审批——实际约需 ≥ 30 次确认式批准且至多 1 次拒绝；
- `distinct_goals ≥ 5`；
- 近 30 天 `incidents = 0`；
- 该类不是单向门（单向门最高只能到 `ask`，不能形成授权，§11.2、§11.3.5，ADR-182）。

与 `08` 的衔接：`08` 把审批结果分为 `reflexive`（未看证据且 < 3 s 即批准）与 `confirmatory`，并把某类 `reflexiveRate ≥ 0.95` 作为提升候选信号。本文的处理是：反射批准率高说明该类 `ask` 是滋扰告警，**触发**晋升评估；但晋升的**安全证据**只统计 `confirmatory` 批准与 incident 记录（反射批准不能证明动作安全）。若 confirmatory 样本不足而反射率很高，建议卡片改为“这类审批你几乎从不看证据——是收紧沙箱后放开，还是继续逐次确认？”。

建议以 Needs-You `ratify`（severity 1，攒批进简报）出现：“过去 41 次 `config.change`（项目 web、模型 X）你全部批准，是否改为 do-and-notify？”。人批准后生效，产生 `HumanDecision`；面板“已获得的自主度”列出每一项及其证据，以及本项目仍有效的运行时授权（类、匹配器、来源决定、到期时间），任何时候可撤销：`autonomy.revoke{projectId, class, goalId?, level?}`——带 `level` 时把该类改回该级别，省略 `level` 与 `goalId` 时撤销本项目该类此前产生的全部授权，都记 `human.decision{approve_autonomy_change}`，编译时按 §11.3.5 排除 (b)（作用范围以该处为准，ADR-182/184）。M1 没有本面板（本节属 M3）；M1 只有带 `goalId` 的形式，入口是 Goal 页自主度区块中的“本 Goal 内同类”授权列表，只撤销该 Goal 的运行时授权（§11.2，ADR-183/184）。

**降级**：发生 1 次 incident → 立即降一级并通知（severity 2）；30 天内 2 次 → 重置为预设默认值。降级不需要人批准（自动化应当在出错时收缩，而不是扩张）；降级同时使该项目该类此前产生的授权（运行时 `Grant` 与合同 `autonomy.grants`）不再编入 `policy.json`（§11.3.5 排除 (b)，ADR-182/184），授权不能抵消降级。

**与合同级别的合并（M3，ADR-183）**：项目级的自主度级别（晋升、`autonomy.grant{level}`、`revoke{level}` 与降级）不写进合同（合同不可变，I3）；`decide` 对每个类取合同级别与项目级别中**较严者**，再经 `applyGrants`（§11.3.5）。因此降级给出的 `forbid` 与合同给出的 `forbid` 一样不被任何授权越过，晋升也不能放宽合同收紧过的类。

这也是告警纪律的闭环：某类 `ask` 的批准率持续 > 97% 本身就是滋扰告警信号（ADR-010），晋升机制把它转化为可审计的人类决定，而不是悄悄放宽。

---

## 11.6 沙箱与隔离

### 11.6.1 选项

| 层级 | 机制 | 隔离对象 | 平台 | Tower 用法 |
|---|---|---|---|---|
| S0 | 仅策略层 + worktree | — | 全部 | Windows 在 M3 前（ADR-018，UI 标注“沙箱 S0”）；或用户关闭沙箱 |
| S1 | **工具级路径分类** | 文件工具的路径（§11.3.1）；只决定审批分级，S2 下访问由 S2 强制（ADR-220） | 全部 | 始终开启 |
| S2 | **OS 沙箱包裹 bash 子进程与文件工具的文件操作** | bash 及其全部子进程的文件写入、敏感路径读取、网络出口；文件工具（`read`/`edit`/`write`）的每次读写（§11.3.1 使用时强制，ADR-220） | macOS：Seatbelt（`sandbox-exec`）；Linux：bubblewrap（+ seccomp）/ Landlock | **M1 起默认（macOS）**，M2 Linux |
| S3 | 微型 VM 承载工具 | 内置工具全部进入 VM，worktree 挂载为 `/workspace` | Gondolin（QEMU，Node ≥ 23.6） | 可选（M3） |
| S4 | 整个 Pi 进程进容器/沙箱 | Pi、扩展、工具 | Docker、Docker Sandboxes、OpenShell | 可选（M3），配合 RPC 适配器 |

对照 Pi 源码与文档的事实：

- Pi 示例 `examples/extensions/sandbox/` 用 `@anthropic-ai/sandbox-runtime` 的 `SandboxManager.wrapWithSandbox(command)` 包裹 bash，“macOS 用 sandbox-exec，Linux 用 bubblewrap”，Linux 另需 `bubblewrap`、`socat`、`ripgrep`；配置项为 `network.allowedDomains/deniedDomains`、`filesystem.denyRead/allowWrite/denyWrite`；默认 `denyRead: ["~/.ssh","~/.aws","~/.gnupg"]`、`allowWrite: [".", "/tmp"]`、`denyWrite: [".env", ".env.*", "*.pem", "*.key"]`。它通过注册同名 `bash` 工具并传入自定义 `BashOperations` 实现。
- `docs/containerization.md`：Gondolin 覆盖 `read/write/edit/bash/grep/find/ls`，worktree 写入会穿透到宿主；**VM 内命令继承宿主进程环境变量**，因此“不要把它当作凭据边界，除非移除敏感变量”；其他扩展工具仍在宿主运行。整进程容器方案中扩展也在容器内运行。
- `docs/security.md`：工作目录只决定资源发现与工具默认路径，**并不阻止命令访问其他路径**。

### 11.6.2 Tower 的 S2 配置

沙箱 bash = `createBashToolDefinition(worktree, { operations: sandboxedOps, spawnHook: envScrub })`（返回 `ToolDefinition`；`customTools` 与 `registerTool` 都接受 `ToolDefinition`，`createBashTool` 返回的是 `AgentTool`，不可用于此处）（`tools/bash.ts` 的 `BashOperations` / `spawnHook` 接口）。**SDK 下以 `customTools` 注入**（不是 tower-goal `registerTool`），RPC 下由 tower-goal 注册并经启动自检确认生效（ADR-041）。文件工具的辅助进程使用同一档位（§11.3.1 使用时强制，ADR-220）。沙箱策略按 Goal 生成：

| 维度 | 规则 |
|---|---|
| 写允许 | 本 Goal 卫星的**工作区**（多仓库时为全部 binding）与**整个卫星 gitdir** `<wtRoot>/_gitdirs/<goalId>`（ADR-089：取消 ADR-081 第 3 点的白名单——它拦住了 `revert`/`cherry-pick`/`rebase`/`stash`/`bisect`/`gc` 的正常写入，R6-D13-01）；`$TMPDIR/tower-<goalId>/`（同时设为 `TMPDIR`）；本 Goal 的 **Tower 私有依赖存储** `<wtRoot>/_stores/<goalId>/`（ADR-021；环境变量、各角色读写与用户配置继承以 `16` §16.8 为唯一来源）。**不允许写用户的全局缓存**（`~/.pnpm-store`、`~/.npm`、`~/.cache/uv`、`~/.cargo`、`~/go/pkg/mod`） |
| 只读（读允许、写拒绝） | **读是允许列表（ADR-082）**：共享缓存 `$SH`（含 Tower 工具缓存 `$SH/tools`）；Tower 镜像库的 `objects/`（alternates 需要，只此子目录）；系统路径（Seatbelt 基础档中的 OS 目录、`/dev`、Tower 显式提供的工具链目录）；Tower git 垫片目录与垫片 exec-path `<wtRoot>/_stores/_shim/`（ADR-088/097，`16` §16.8）；本 Goal 的 `goals/<goalId>/runs/` 中 Tower 明确提供给 Agent 的文件（如 `contract.md`）；**Pi 资源目录与上下文文件**（ADR-091/100，R6-D2-01、R7-D2-01；本格的 `~/.pi/agent` 指用户 agentDir，取值唯一定义在 `05` §5.3.6，ADR-210）：`~/.pi/agent/{skills,prompts}/**`、Pi 包内的技能与提示（`~/.pi/agent/{npm,git}/**`、临时包 `~/.pi/agent/tmp/**`；按约定目录或 `package.json#pi.skills`/`pi.prompts` 声明的子路径）、`~/.agents/skills/**`、卫星工作目录各祖先目录中的上下文文件（只放行名字集合，比较规则见 `16` §16.1.12“上下文文件名与受保护名字”，规则写为大小写类）；另加**每个 Run 启动时从用户级 Pi settings 解析出的 `skills` 与 `prompts` 路径**（M1 中项目设置从不读取，ADR-202）（含任意自定义路径，以及 Host 实际枚举到的已启用技能 `baseDir`），取 `realpath` 后只读加入——若某个路径 是 `$HOME` 本身、或包含 `~/.tower`、`~/.ssh`、`~/.pi/agent/auth.json`、密钥路径表中的任何路径，则不加入，该技能在 Tower 中标为“不可用（路径过宽）”并登记于 `00` §0.5.1。`~/.pi/agent/extensions/**` 不在其中（ADR-100）——技能脚本因此可在沙箱中执行（仍受动作类与 S2 写/网络规则约束）；`read` 工具读这些路径为 `read.pi_resources`（silent）。用户主目录中的其他配置不直接可读：Agent 需要的用户级配置由 Tower 生成净化副本放在 `$GS`（`~/.npmrc` → `$GS/npmrc`，`~/.gitconfig` → `$GS/gitconfig`（经 `GIT_CONFIG_GLOBAL`）；两者都按**白名单**只保留列明的键，保留的值再经 `10` §10.1.2 的凭据判定剔除命中者，键表唯一定义在 `16` §16.8，ADR-176）；日常工具遗漏的配置由 SP6a A3 补录。用户检出中未跟踪的 `AGENTS.md` 不是卫星的祖先，Agent 看不到——需要时由人先把它加入 `.git/info/exclude`、再加入“本地文件”清单（清单只接受被 git 忽略的路径，`16` 的 `ProjectLocalFile` 行，ADR-205；`00` §0.5.1）；Tower 在添加项目时不另给建议，卫星不在默认位置时由“生效上下文”面板给出同一提示（`09` §9.11，ADR-206）；卫星回退到 `worktreeRoot` 时 `contract.md` 的 `## Imported context` 也只导入用户检出**之外**的祖先目录中的上下文文件，不导入用户检出内的未跟踪文件（`09` §9.11，ADR-178） |
| 写拒绝（优先于允许） | **在卫星工作目录任意深度创建名字在 ASCII 大小写折叠下等于 `.git` 的文件或目录**（ADR-089/123/131）。**按平台分列**：macOS 以 Seatbelt 按名字拒绝（`regex` 写为逐字符的大小写类 `^<卫星 realpath>/(.*/)?\.[Gg][Ii][Tt](/|$)`），其余等价变体（默认可忽略码位、NFKC 等价，比较规则唯一定义在 `10` §10.1.2）不在沙箱规则内；Linux S2（M2）的 Landlock 没有按名字拒绝的手段，**全部** `.git` 名字都只由 watcher 兜底，Linux 上的强制手段列为 M2 决定点（T29）。不在沙箱规则内的名字由沙箱外的卫星 watcher（新建目录先加监视、再扫描）在 ≤ 2 s 内发现：`running` 中命中即以 abort 方式 drain 并暂停 Run（`nested_repo_live`，severity 3，不可覆盖，ADR-131）；影子与 GitRunner 以 `core.protectHFS=true`、`core.protectNTFS=true` 拒绝把它们加入索引，被拒绝的路径以排除方式重试并记入检查点 `excludedPaths`，只要仍存在就以不可覆盖的 `nested_repo` 阻断 Verified（`10` §10.1.2，R13-D11-01、R14-D11-01）；卫星工作区内任意层级的 `.pi/**`、`.agents/**`、`**/AGENTS*.md`、`**/CLAUDE.md`（Seatbelt 以 `regex` 规则匹配任意子目录，四个名字都与 `.git` 一样写为逐字符的大小写类；名字集合与比较规则见 `16` §16.1.12“上下文文件名与受保护名字”，ADR-203；§11.3.3 的 `protected` 按同一比较规则识别这四个名字，形成双保险，非 ASCII 等价变体只由后者与 §11.8.1 的上下文文件复核识别，ADR-204。S2 下 bash 与文件工具（§11.3.1 使用时强制，ADR-220）因此不能写任意深度、折叠后形如 `agents*.md`、`claude.md` 的文件，包括正当用作文档的 `docs/agents.md`，见 `00` §0.5.1）；`<checkoutParent>/.tower-wt.noindex/` 中本 Goal 卫星、gitdir 与存储之外的一切 |
| 读拒绝 | 上一行允许列表之外的一切；显式列出（防止允许规则误放宽，ADR-082、R5-D8-02）：**用户主检出及其 `commonDir`**；其他 Goal 的卫星与 gitdir；`<wtRoot>/_verify/**`、`_inspect/**`、`_human/**`、`_stores/_verifier`（`$VS`）与其他 Goal 的 `_stores/<id>`；`~/.tower/**` 中除镜像 `objects/`、上述 runs 文件与下述回退位置例外以外的一切——含影子 git 目录、安装器私有目录 `$TI` 与各 Host 的临时目录 `~/.tower/tmp/<hostId>/`（`05` §5.3.6，ADR-224）。**回退位置的例外**（唯一定义，ADR-197/198；`10` §10.4.3、§11.3.2 命令分类器、§11.6.3 与 §11.7 可读者规则引用）：`<wtRoot>` 回退到 `~/.tower/worktrees/…` 时，三种沙箱对 `~/.tower/**` 的拒绝各只为**自己在默认位置下的允许项**中、回退后落在 `~/.tower` 之下的那些逐路径除外，权限与默认位置相同：<br>• **Agent**：本 Goal 卫星的工作区、`_gitdirs/<goalId>`、`_stores/<goalId>/`（读写，与写允许一行相同），`$SH` 与 `_stores/_shim/`（只读）；<br>• **验证器**（§11.6.3）：本槽位（回退时在 `~/.tower/verify/<projectId>/`，读写），`$VS` 与 `$SH`（只读）——即 `16` §16.8 V 列引用的、位于 `~/.tower` 之下的路径；<br>• **检验检出的脚本与服务**（验证器档位，`10` §10.8.3）：本 Goal 的检验目录 `_inspect/<goalId>`（读写，与其写允许相同），`$VS` 与 `$SH`（只读）。<br>此外不除外：其他 Goal 的卫星与 gitdir、其他 Goal 的 `_human`、`_inspect` 与 `_stores/<id>`，Agent 对 `_human/**`、`_inspect/**`、`_verify/**`、`$VS`，验证器对其他槽位与 `~/.tower/goals/` 照常拒绝；命令分类器“写 `~/.tower/**`”的硬底线同样只为 Agent 的读写项除外。例外不含任何沙箱写允许之外的可写路径；**“本地文件”清单中每条含密钥条目的具体路径**（用户检出中的原件按路径逐条加入；M1 中这类条目不复制到验证槽位与检验检出，ADR-165）；密钥路径表（§11.3.1；无锚定模式按该表的作用范围只在 Agent 写允许范围之外编入、CA 证书包允许清单除外，写允许之内只作分类，ADR-224；**卫星中被跟踪的 env 文件除外**，ADR-078）；用户 agentDir 中的 `auth.json`（默认 `~/.pi/agent/auth.json`；Pi 资源目录的允许不含它）。S0 下无法强制，残余风险高（ADR-082） |
| 硬链接（唯一定义，ADR-223，R95-D11-02） | 与下方钥匙串一行同一范围的沙箱（该行列举的四种：Agent 的 S2——含文件辅助进程——、验证器 §11.6.3、检验检出的服务与生命周期脚本、安装器的安装阶段，ADR-224）**拒绝创建硬链接**，不论源与目标在哪里：本表的读写规则都以路径表达，而卫星、验证槽位与用户主检出、主目录通常同卷（ADR-008），指向被拒绝文件的另一个名字会让路径规则失效。macOS 以 Seatbelt 的硬链接操作（`file-link`）或等价规则写入档位，确切写法以 SP6a A3 的探测为准；Linux S2（M2）的手段与写拒绝一行的 `.git` 名字同列为 M2 决定点。卫星中原有的文件由 Tower 检出、复制或以写时复制物化，从不硬链接（ADR-021），所以 §11.3.1 的“经链接原地写”只能经符号链接到达，由 S2 在打开时按真实路径判定。**影响**：pnpm 在 Tower 中对 Agent 与安装器都配置 `package-import-method=clone-or-copy`（`16` §16.8），从不硬链接，不受这条影响；npm 的缓存不使用硬链接；可选的硬链接安装模式（如 yarn 的 `nmMode: hardlinks-*`）、调用 `link()` 的测试与显式 `--local` 的本地克隆失败（`00` §0.5.1）；git 写对象时链接失败即改用改名（git 自身的回退）。**验证与回退**：SP6a A3 的硬链接一组（`14` §14.2）；Tower 启动时的自检（`06` §6.7：三种档位模板各一次；时限、结果的缓存、等待的落点与失败的去向只在该处）在后台做一次同样的探测，有结果之前不启动使用这些沙箱的活动（`06` §6.2.4 单一启动点）。创建未被拒绝、探测出错或超时（未能确认拒绝即按未被拒绝处理，ADR-224）时，本机不使用 S2：各 Goal 按没有可用的 OS 沙箱处理，走 S0 与 ADR-022 的授权路径（`04` §4.8.5 原因一行：`本机的沙箱未通过启动自检（硬链接）`；本机根本没有 OS 沙箱时才是 `本机没有可用的 OS 写入沙箱`，ADR-226），验证结果带“S0 环境”限定——不以路径规则不完整的 S2 运行 |
| 钥匙串服务查找（ADR-162/163，R37-D11-02） | **所有**运行 Agent 可影响内容的沙箱（本行的列举是这一范围的唯一清单，硬链接一行引用，ADR-224）——Agent 的 S2（含文件辅助进程）、验证器（§11.6.3）、检验检出的服务与生命周期脚本、安装器的安装阶段（`07` §7.4.3 阶段 3：运行 `.pnpmfile.cjs` 与依赖的构建脚本，断网挡不住本机的进程间通信；预取阶段只运行 Tower 内置预取器、不执行项目或依赖代码，不在此列）——都拒绝对钥匙串服务（Security 框架、`securityd` 的 mach 服务）的查找；`security find-generic-password`、`gh auth token`（keyring 存储时）等在这些沙箱中读不到钥匙串。Tower 写入的条目另以访问控制列表限定为 Tower 的代码签名身份（§11.7.1）。SP6a A8 测量两点：拒绝是否生效、是否破坏常用工具。**回退**（ADR-164）：若 A8 显示该拒绝会破坏常用工具，则**取消该拒绝**，只依赖钥匙串条目的访问控制列表（其他进程读取会触发系统授权提示）。M1 中验证器与安装阶段都不接触机密，这两种沙箱不受这一取舍影响 |
| 观察其他进程（R28-D11-01，ADR-157/158） | **macOS 上无法在沙箱层面阻止**（ADR-158，R32-D11-01，评审在 macOS 27 上实测）：Seatbelt 挡不住沙箱内进程读取同一用户其他进程的命令行，非 Apple 二进制的环境也可读。Apple 平台二进制的环境对普通进程不可读，读取成功返回但为空。`/bin/ps` 是 setuid，任何 Seatbelt 沙箱内都无法运行，所以 Agent 自己的 `ps` 不作为要求，`04`/`05` 的简报如实告诉 Agent。M1 因此**按“闸门失败”设计**：<br>• **SP6a A12(a) 是测量，不是闸门**：记录在支持的 macOS 版本上能否阻止观察。M0 退出条件是“已运行并记录结论”。若将来某个版本能阻止，再以 ADR 放宽下列规则。<br>• **Tower 不把机密放进长生命周期进程的参数或环境**：各类机密的投递与暴露窗口以 §11.7.0 的投递表为唯一定义（ADR-159）。<br>&nbsp;&nbsp;– macOS 上，URL 或 git 配置中带凭据的远端不执行网络命令（判定规则与 Fact `remote_credential_blocked` 见 `10` §10.1.2）；<br>&nbsp;&nbsp;– **M1 中 Tower 不会自动把机密交给 Agent 可影响的进程**（ADR-164/166/167，唯一的例外是人发起的 `inspect_with_secrets`）：验证标准不能声明机密，需要机密的检查写为 human 标准；`secrets.access` 归 M2。<br>• **Linux S2（M2）**：bwrap 使用独立的 PID 命名空间（`--unshare-pid`），其他进程不可见。<br>• **M2 决定点**：以专用系统用户运行 Agent（ADR-158），这会关闭同用户观察这条通道。<br>残余评级见 T33 与 T33b |
| 网络 | 仅经沙箱代理（`sandbox-runtime`，**版本固定**，随 Tower 发布，ADR-079）。**企业代理（ADR-067/079）**：用户配置了上游代理时，以 `network.parentProxy = <静态上游 URL>` 链式转发；Agent bash 环境中只出现沙箱代理地址，用户代理变量**不**透传给 bash；`NO_PROXY` 只在沙箱代理内部生效；安装器沙箱同理。**PAC**：Goal 启动时 Tower 用 PAC 解析模型端点、包注册表、git 托管与 LFS 端点，全部得到同一个上游才采用；否则 S2 网络明确失败并提示“PAC 规则过于复杂：请设置显式上游，或对该项目使用 S0”。**上游认证**：M1 只支持 Basic（URL userinfo）；NTLM/Negotiate 不支持，建议用本机认证代理（如 px、cntlm）作为上游。经 parentProxy 的请求跳过沙箱代理对已解析地址（回环、链路本地、本机 IP）的检查，这项防护交给企业代理（T30）。Engine Host（调用模型）与 Supervisor（`git push`、`gh pr create`——M2 起，M1 不推送，ADR-133）是 Tower 自身的可信进程，直接使用用户的代理设置。允许域 = 预设注册表表（npmjs、yarnpkg、pypi/files.pythonhosted.org、crates.io/static.crates.io/index.crates.io、proxy.golang.org/sum.golang.org、rubygems.org、github.com/codeload.github.com/objects.githubusercontent.com）+ 合同追加；`localhost` 允许（测试服务器）；模型提供方域名**不在**列表中。**安装器各阶段（ADR-085/092/093，`07` §7.4.3）**：拉取 = 只连注册表（带令牌）；预取 = 只连已登记下载域名（`playwright.azureedge.net` 等 Playwright CDN、`binaries.prisma.sh`、`download.cypress.io`、`storage.googleapis.com` 上的 Chrome for Testing、`nodejs.org`，以及人在 `VerifyProfile.prefetch` 中批准的 URL），不带令牌、只运行 Tower 内置预取器；安装 = 断网；Agent 侧需要这些下载时同样经此列表（作为 `net.registry` 同级的默认允许域） |
| 本地文件（ADR-078/082/165） | Project 级、由人批准的“本地文件”清单，即被 git 忽略、但运行所需的文件。清单分两类（ADR-165，R39-D11-01），以 `16` `ProjectLocalFile` 行的派生谓词 `isSecret` / `seeded` 为唯一判定（ADR-169）：<br>• **普通本地文件**（不满足 `isSecret`，含已取消标记的文件）：经人批准（`ProjectLocalFile.approved`，`HumanDecision{approve_local_file}`，ADR-167/168）后即满足 `seeded`，照常播种到卫星（Agent 可读）、验证槽位与检验检出；未经批准的不播种。<br>• **含机密的本地文件**（满足 `isSecret`）：在 M1 中**不播种**到验证槽位、检验检出或卫星。判定条件满足任一即算：文件名匹配 `.env*`、`*.pem`、`*.key`、`*credentials*`、`*.p12` 等模式；用户把它标记为机密；内容匹配 §11.7.1 的机密模式（不只看文件名）。`add` 时判定，每次复制前按名字与当前内容重新判定，见 `16`（ADR-170/171；作用范围是任何把本地文件复制出用户检出的地方，判定与复制用同一次读入的内容）：普通条目内容命中即写入 `secretBy = content`、这次不播种并通知；文件不可读或不存在时这次不复制、不改写分类；其中本应复制的条目由执行复制的服务发出“无法读取”的 L1 通知（进程内状态，按条目去重，不写账本，重启后不保留，ADR-172/173）。<br>**取消标记**（ADR-165 补记、ADR-166）：按文件名模式判定的不可取消（保守）；按内容或用户标记判定的可以取消，命令 `project.local_files.unmark_secret`，记 `HumanDecision{unmark_secret_file}`（仅本机），取消时确认“该文件将被复制到 Agent 可读的工作目录”。取消标记绑定当时的内容哈希；每次复制前重新判定，内容变化且再次匹配机密模式时自动恢复为机密并通知（事件 `project.local_file_unmark_reverted`，ADR-172）。<br>**检验检出的例外**（ADR-166）：人打开检验时可显式选择带上这些文件，见 §11.6.3。<br>依赖这些文件才能运行的检查写为 human 标准（ADR-164）。本地文件设置页对这类文件显示“M1 中不提供给验证与检验（需要它的检查请写为 human 标准）”。扫描命中的**值**（含播种前重新判定的命中）仍加入脱敏器的精确匹配集（§11.7.1）。这样 §11.7.0 的不变式（Tower 不会自动把机密交给 Agent 可影响的进程，ADR-166/168）对本地文件同样成立 |
| 进程 | 进程组超时（bash `timeout` 参数上限）；每 Goal 进程树内存预算（`13`） |

**为什么卫星 gitdir 移出工作目录、又整体交给 Agent**（ADR-060/072/081/089）：任何会被 git 当作仓库元数据读取的文件——可执行配置（`core.hooksPath`、`core.fsmonitor`、`core.sshCommand`、`filter.<x>.clean`、`hooks/*`）与重定向文件（`commondir`、`worktrees/*/{commondir,gitdir}`、`.git` 指针、`objects/info/alternates`）——只要 Agent 能写、**且有沙箱外的进程读取它**，就会让该进程以用户身份执行任意代码（R3-D11-01、R4-D11-02；R5-D11-01 以 `commondir` 重定向复现）。ADR-081 先消除“沙箱外读取”：(1) 工作目录中没有 `.git`，gitdir 在 `<wtRoot>/_gitdirs/<goalId>`；(2) Engine Host 及其派生进程设 `GIT_CEILING_DIRECTORIES=<全部 wtRoot>`、不含 `GIT_DIR`，在卫星中运行 git 只会得到“不是 git 仓库”（`10` §10.1）；(3) 人不在卫星中工作，而是用 Tower 新建元数据的人工编辑检出（`10` §10.8.4）。在此之后，gitdir 中的文件只会被**沙箱内**的 git 读取，写入白名单不再保护任何东西，反而拦住了正常的 git 操作——ADR-089 因此把 gitdir 整体交给 Agent，边界只剩两条不变式：**工作目录任意深度不可创建 `.git`**（不可能出现可被发现的仓库或嵌套仓库），以及**沙箱外发现失效**。第三条防线针对 Tower 自己：Tower 对卫星与 gitdir 的原始文件操作只有创建、整体删除、整体重建与**只读解析**（卫星 HEAD 与提交对象由 Tower 自行解析普通文件，不在卫星 gitdir 上运行 git，因而不读取其中 Agent 可控的配置、`include` 与 `alternates`，ADR-100），逐级 `O_NOFOLLOW`、只接受普通文件、带大小上限与超时、旁路构造后 `rename` 替换（`10` §10.1.3，R6-D11-01：符号链接 ref 与 FIFO `HEAD` 已复现）。**仓库形态目录（ADR-096/101/102，R7-D11-01、R8-D11-01、R8-D13-01）**：git 还把其他形态的目录识别为仓库——含 `HEAD`（普通文件或符号链接）、且能经 `objects/`/`refs/` 或 `commondir` 找到对象与 ref 的目录；`GIT_CEILING_DIRECTORIES` 只限制向上搜索，禁止 `.git` 挡不住它们。因此：(1) Tower 构造的所有沙箱外 git 环境（Host 及其派生进程、MCP 基础环境、GitRunner、两种检出的终端）都经 `GIT_CONFIG_*` 注入 `safe.bareRepository=explicit`——“沙箱外的 git 发现不到卫星中的仓库”**只对这些环境成立**；(2) **唯一的权威检查 `pinSafetyCheck(baseTree, pinTree)`**（ADR-109/111/112，R10-D13-01、R11-D11-01..04）：在影子中只看两个 tree 对象。**仓库形态候选目录** = 在 base 或 pin 中直接含有名字（按 `10` §10.1.2 的名字比较规则（ADR-120））为 `head`/`commondir`/`gitdir` 的文件或符号链接的目录；base→pin 中**位于候选目录之内或就是它的任何增、删、改** → `nested_repo{dir}`（覆盖只改 `config`/`hooks`/alternates、增删 `objects/`、删 `commondir` 等全部变体）。pin 中**全部**符号链接在 **pin tree 内按 POSIX 语义解析整条链**（深度 ≤ 40；成环、经过 tree 中不存在的分量、经过名字等价于 `.git` 的分量，均视为逃逸），终点为绝对路径或越出仓库根 → `symlink_escape`；仓库根本身也是候选目录（ADR-116）。两者都是 severity 3、阻止 Verified 与集成；**不排除、只阻断**，pin 原样保留；覆盖**绑定 `(detector, 路径, 对象哈希)`**，之后任何变化使覆盖失效（seal trailer 记 `Tower-Override: <detector> <路径>@<哈希>`）；“删除这些条目”即预填评论的 `goal.request_changes`。它是 `verify()` 的第一步（在一切提前返回之前），验收与 seal 时对同一 tree 再执行。卫星侧的名字粗筛与 git 确认只是运行中的早期预警，不影响检查点、pin 或检出；(3) 两种检出由影子树物化，`pinSafetyCheck` 命中的候选目录与链接不写出——**包括被改动的 base 夹具，直到命中被覆盖**；覆盖之后，pin/seal 保留 Agent 的版本，两种检出中该目录**按白名单写出**（ADR-124，唯一定义 `10` §10.1.2）：只有纯数据条目（`objects/**` 不含 `objects/info/**`、`refs/**`、`packed-refs`）写出 pin 版本，其余一律写出 **base 版本**（base 中没有则不写出），覆盖对话框以 Fact 列出被改动的元数据文件与其中可执行或重定向的配置键（ADR-116）；未改动的 base 夹具照常写出（与用户主检出中已有内容一致）；物化后的依赖目录做同样的名字扫描，命中的目录不写出；信任提示列出未写出项与原因（`10` §10.1.2，ADR-111 第 3 点）。名字比较按 `10` §10.1.2 的名字比较规则（ADR-120），覆盖 HFS+ 忽略的码位。已知差异：未来的 git 若以 `HEAD` 之外的条件识别仓库，规则需随之扩展（SP6b G34 在每个支持的 git 版本上回归）。

**扩展目录内的技能（R8-D2-01）**：扩展经 `resources_discover` 返回的 `skillPaths` 与 Pi 包 `package.json#pi.skills`/`pi.prompts` 声明的任意子路径，同样由 Host 在 Run 启动时枚举、取 realpath 后**只加入该技能的 `baseDir` 本身**；扩展目录中的其余文件（扩展源码、配置、密钥）保持读拒绝；若 `baseDir` 就是扩展根目录，该技能不可用，并在 `00` §0.5.1 与设置页登记。临时包 `~/.pi/agent/tmp/**` 中的技能按同一规则处理。

Agent 的沙箱 bash 不导出 `GIT_DIR`，PATH 首位的 Tower git 垫片只对在卫星内运行的 git 注入 `GIT_DIR`/`GIT_WORK_TREE`，并剥离继承到卫星外或 `init`/`clone` 的同名变量（ADR-088/090，`10` §10.6.1）；Agent 环境另设 `GIT_CEILING_DIRECTORIES=<wtRoot>`。用户仓库对 Agent 读写均拒绝（ADR-082）。嵌套 `.git` 每次扫描并排除（ADR-071），GitRunner 运行在只允许执行 git 的 OS 沙箱中；ADR-072 的模板配置（作为便利默认值）与 Host 侧 `GIT_CONFIG_*` 注入保留，控制文件写拒绝与哈希校验取消，`git_control_tampered` 退役。

**策略路径必须规范化（ADR-089 第 4 点）**：Seatbelt 按真实路径匹配规则，策略中写 `/tmp/...` 而实际路径是 `/private/tmp/...` 时，拒绝规则**静默失效**（第 6 轮实验中三条拒绝规则因此全部失效）。Tower 生成 Seatbelt 与 bwrap 策略时，所有路径（卫星、gitdir、存储、用户检出、`$TI`、`$VS`、本地密钥文件副本、`regex` 中的前缀）先取 `realpath`，`regex` 中的路径另做正则转义；策略生成器的单元测试覆盖 `/tmp`、`/var`、用户自建的符号链接目录与含正则元字符的路径，并对每条拒绝规则做一次真实的“应被拒绝”探测（SP6a A10，`14` §14.2）。

沙箱违规（Seatbelt 拒绝日志、代理拒绝的连接）作为 Fact `sandbox_violation {op, path|host, toolCallId}` 写入审计，并在被拒工具结果中附上一行解释，供模型改用 `ask_user`。它**不阻止 Verified**（ADR-110，R10-D7-01）：一次拒绝说明边界起了作用，被拒的动作没有发生、也不在 diff 中。但按目标分两级（ADR-113，R11-D11-05）：目标属于 **severity 2 的受保护类别**——`credential`（读、写）、`tower_data`、`user_checkout`、`other_satellite`、`user_config`（仅写）（类别的含义：凭据与密钥路径表 §11.3.1、Tower 数据与镜像及 `$VS`（含 Tower 在 `<wtRoot>` 中为 Goal 或为人创建的目录与 `$TMPDIR/tower-*`，不随 `<wtRoot>` 的位置变化，ADR-201）、用户主检出与 `commonDir`、其他 Goal 的卫星、用户级配置；唯一定义在 `16` §16.1.6，ADR-125。`user_config` 的判定规则同样只在 `16` 定义（ADR-131/136）：主目录下的顶层点文件，以及顶层点目录之内的全部内容（包含式读法），再加登录自启动的配置位置，减去 `credential` 与 `tower_data`——shell 启动文件因此属于 `user_config`；`~/.ssh/**` 整体属于 `credential`（读与写），默认良性条目因此是 `(credential, write, ~/.ssh/known_hosts)`；E7 统计其误报）——提升为 **severity 2**，生成 Needs-You（`kind:"sentinel"`，L2，`costOfDelay:"none"`）并在评审“运行异常”区块置顶，同一 Goal 内按 `(category, op, target)` 去重（键见 `08` §8.4，ADR-125）；这类拒绝**可能表明**提示注入或越权意图，但也有常见的良性来源（如写 `~/.ssh/known_hosts`、云 SDK 读取凭据配置），措辞因此不写“证据”（ADR-117）。**经批准的目标**（唯一定义，ADR-221/222；`07` §7.10.1、`16` §16.1.6、`14` G46 引用）：被拒绝的访问来自经人批准的工具调用（该 `toolCallId` 的 `ask` 以批准结束），且目标与该次批准所列的某一路径相等时，不论类别都记为 severity 1 的 chip、不生成 Needs-You——人刚刚亲手批准了这次访问，S2 照常拒绝，不再以“可能表明提示注入”告警。**匹配口径**（ADR-222）：所列路径取批准时求出的字面与 `realpath` 两种形式（与 §11.3.1 比较的规范形式相同），与 `target` 按 `16` §16.1.6 的同一规范化写法比较，任一形式相等即算；只按相等、不按包含——所列为目录时只覆盖对该目录本身的拒绝，其下文件的拒绝照常按类别分级，所以一次所列范围很宽的批准不会压低其中的凭据信号；不相等的照常按类别分级。文件工具中出审批卡的读写里，S2 必然拒绝的只有读取凭据（§11.3.1）；判定误为允许或分类之后被改向时，其他文件工具调用同样可能批准后被拒绝，同样适用本条。出口：“知悉”（`HumanDecision{kind:"acknowledge_signal"}`，`outcomeClass:"informative"`）；“这是良性的”（`{kind:"mark_benign"}`，`false_positive`，可一键把该 `(category, op, target)` 加入**项目良性清单**，之后同一目标同一操作的拒绝为 severity 1；凭据读取不提供此选项；默认良性清单见 `16`）；“收紧策略”（打开自主度矩阵）；“放弃 Goal”。去重键 `sv:{goalId}:{category}:{op}:{target}`（`08` §8.4，ADR-125）；良性清单与降级的单位都是 `(category, op, target)`。远程边界（`16` §16.5）：“这是良性的”仅本机；“知悉”与“再次终止”允许远程。**降级规则（规则 F，与 `08` §8.9.2、`07`、`16` 一致）**：**从 M2 起**，E7 中某个 `(category, op, target)` 在 2 周内样本数 n ≥ 20 且 `false_positive` 比例 > 30% → 默认降为 severity 1（通知用户，可撤销）。**凭据读取**（`category:"credential"`、`op:"read"`）永不降级，也不能加入良性清单（ADR-125）。字段 `category ∈ {credential, tower_data, user_checkout, other_satellite, user_config, system}`、`op ∈ {read, write, exec, net}`、`target`（精确到文件的规范化路径，主目录下写作 `~/…`，或网络主机）的唯一定义在 `16`。其余拒绝（`system` 类，如写 `~/Library/Caches/**` 等系统路径、遥测、更新检查；点目录中的缓存如 `~/.cache/**` 属 `user_config`，写入为 severity 2，判定只按 `16` 的唯一定义，ADR-194）为 severity 1 的 chip。M2 起同类拒绝反复出现时计入 S7 `policy_wall`（M1 中没有 S7，R11-D11-05）。E7 记录其频率与类别（`(category, op, target)`、工具），用于调整沙箱规则与预设（`14` §14.5）。

**Run 令牌（ADR-142）**：沙箱 bash 的环境中另有 `TOWER_RUN_TOKEN`（每个 Run 一个 128 位随机值），只用于 Tower 识别并终止本 Run 的后台进程（`10` §10.3.1）。macOS 上 Apple 平台二进制的环境读取成功但为空，令牌对它们无效。Tower 因此以进程树与令牌的并集识别，并把“读到空环境”视为无法确认；脱离进程树的平台二进制属于登记的窗口，其后的写入按来源不明处理（ADR-158，`10` §10.3.1）。它是**识别标记，不是凭据**：不授予任何能力，Agent 可见；Agent 清空它只会让自己的后台进程脱离识别（已登记窗口，按已知误判 (b) 处理）；把它复制给其他进程只会让那些进程在 settle 时被 Tower 终止。Tower 只对同一用户、同一开机会话中、发信号前再次确认带有该令牌的进程发信号，因此不会波及其他用户或其他 Run 的进程。

**读取其他进程环境的约束（不变式，ADR-144，R18-D11-01）**：令牌识别需要读取同一用户全部进程的环境，而这些环境中常有云凭据、令牌与密码。设计约束为：
- 扫描只在内存中判断“是否含本 Run 的令牌”，对外只返回进程标识与布尔结果；M2 的 `TOWER_ORIGIN` 可以被 Agent 设置，因此只作诊断、**不作归因依据**——归因为人的只有 Tower 自己知道的 `user_bash` 调用窗口内的写入（ADR-145，`10` §10.3.1 第 2′ 行）；环境内容不离开扫描函数，读完即丢弃；
- 任何其他环境内容都**不**记录、**不**持久化、**不**传输——不进入日志、Trace、事件、诊断包（`06` §6.1.7）与崩溃报告；扫描模块不调用日志，识别失败的排查只记录计数与进程标识；
- 匹配逻辑**不对其他用户的进程运行**（按进程的属主过滤在读取环境之前完成）；
- Linux 以 cgroup 成员为主，只在必要时读取本 Run cgroup 内进程的环境。
这条约束与 §11.7 的密钥脱敏同级；`14` 的用例以“注入一个带假凭据的无关进程、检查诊断导出与日志中不出现其值”验证。

### 11.6.3 验证器

验证器（`07`）在验证 worktree 中运行 `exec` 标准，同样使用 S2，**网络默认关闭**（执行阶段允许的主机只来自 `VerifyProfile.env.network`，默认 `["localhost"]`，只能在本机修改；合同不能为验证器放行网络，ADR-178），写允许仅限验证 worktree 与临时目录。**M1 中 Tower 不会自动把任何机密交给验证器**（ADR-164/167）：标准不能声明机密，含机密的本地文件不播种（§11.7.0）。**读拒绝**：验证器沙箱拒绝读取 `~/.tower/**`（回退位置下本槽位、`$VS` 与 `$SH` 除外，检验检出另见同处；唯一定义见 §11.6.2 读拒绝一行，ADR-197/198）；对投递文件的逐路径放行属于 M2（§11.7.0a）。依赖目录只从验证器存储以 CoW 物化，安装由 Supervisor 的安装器在独立沙箱中完成（ADR-021）；docker socket 默认不可访问，服务以 ADR-037 分配的端口段运行（`10` §10.19）。S0 下验证器运行 Agent 代码同样需要 ADR-022 的 Goal 授权。

**检验检出（ADR-082，`10` §10.8.3）**与验证槽位同一信任边界：Tower 在其中执行的生命周期脚本与服务使用验证器的 S2 档位（写允许只有检验目录、临时目录与服务数据目录，后两者的位置见 `10` §10.8.3 第 3 步，网络按 `VerifyProfile.env.network`），S0 下没有该 Goal 的 S0 授权则只复制文件、不执行任何脚本与服务；打开前显示信任提示：人在外部终端中自己运行的命令不受沙箱限制；编辑器可能执行目录中的配置；含机密的本地文件**默认不带上**，人可打开开关“带上本地机密文件（由我自己运行 Agent 的代码）”，打开即记 `HumanDecision{inspect_with_secrets}`（仅本机），提示写明“运行期间 Agent 写的代码会读到这些文件；同一用户的其他进程也可能读到”（ADR-166）；外部终端从 `env -i` 起步，只含白名单环境——`VerifyProfile.env.vars`（以检验专用端口段渲染）、Tower 构造的 `PATH`、`HOME`/`USER`/`SHELL`/`TERM`/`LANG`/`LC_*`/`TMPDIR`、经 `GIT_CONFIG_*` 注入的 `safe.bareRepository=explicit`（ADR-096：检出可能含 Agent 写出的裸仓库布局）——**不含**用户 shell 的其余环境（云凭据等 Host 凭据）、Agent 的任何环境、`$TI` 与模型凭据（R6-D8-01c）。**人工编辑检出**（`10` §10.8.4，ADR-094）的 git 元数据全部来自 Tower 模板，Agent 对 `_human/**` 读写均拒绝；但它是卫星工作目录的副本，含 Agent 安装和修改过的依赖与配置——IDE 打开即可能执行其中的代码（工作区任务 `runOn: folderOpen`、ESLint/Prettier/Tailwind/Vitest 扩展加载的配置与 `node_modules`、direnv/mise）。Tower 无法沙箱化 IDE：打开前的信任提示写明这一点，建议以受限模式打开（如 VS Code Workspace Trust），并说明父目录已被信任时受限模式不会自动生效；同时列出指向工作目录之外的符号链接（编辑器沿链接写入会改到外部文件）。残余风险登记为 T31。

### 11.6.4 凭据不在 Agent 可达范围（“推送是被代理的能力”）

即使分类器漏判一条 `git push`，它也应当失败：

- Agent 的 bash 环境中删除 `SSH_AUTH_SOCK`、`GH_TOKEN`、`GITHUB_TOKEN`、`GIT_ASKPASS` 等；通过 `GIT_CONFIG_COUNT/KEY/VALUE` 注入 `credential.helper=`（空，禁用凭据助手）；设置 `GIT_TERMINAL_PROMPT=0`。
- 读拒绝 `~/.ssh`、`~/.config/gh`、`~/.netrc`。
- 推送、开 PR、合并由 **Tower 自身**（Supervisor 进程，用用户凭据）在人批准后执行（`10` §10.12）。
- **可能含凭据的值不进入长生命周期进程的命令行与环境**（设计规则，ADR-154，ADR-159 限定）：Tower 以用户身份执行的命令（推送、远端 fetch、LFS 获取）不把可能含凭据的值——带 userinfo 的 URL、令牌、认证头、含这些内容的配置键值——由 Tower 放进命令行参数或环境变量（同一用户的其他进程可经 `ps` 与进程信息读到它们；Tower 自己的进程从用户环境继承的变量照常继承，不在此列）；需要传入时写入 `~/.tower/tmp/` 下权限 `0600` 的临时文件（目录 `0700`，不进系统备份，Tower 每次启动时清空其中不属于存活 Host 的内容——存活 Host 的临时目录 `<hostId>/` 保留，`05` §5.3.6，ADR-155/224），命令行与环境只出现文件路径，命令结束（含失败、超时）即删除。**git 自身的行为**：git 会把远端 URL 放进传输辅助进程的参数。Tower 不改写 URL 或凭据（ADR-157 撤回 ADR-155/156 的改写）。macOS 上无法阻止其他进程观察这些参数，所以 URL 带凭据的远端一律不执行网络命令（ADR-158，`10` §10.1.2）。**例外**（M2）：`pre-push` 钩子的参数中的远端 URL 与 git 自己调用钩子时相同。macOS 上带凭据的远端不会走到推送，所以这里不会出现凭据（R32-D15-01）。**其他机密**按 §11.7.0 的投递表处理（ADR-159）：模型密钥不进入任何环境；M1 中 Tower 不会自动把机密交给 Agent 可影响的进程——验证标准不能声明机密（ADR-164），`secrets.access` 归 M2（ADR-161）。Tower 数据目录对 Agent 沙箱整体读拒绝（§11.6.2 读拒绝行的 `~/.tower/**`），因此任何 Goal 的 Agent 都读不到这些文件。M1 中这条规则**没有例外**（ADR-164）：验证器标准的 `env` 机密是 M2 的设计（§11.7.0a），在那里它只在机密阶段的调度互斥下存在于环境中。
- **LFS 对象补齐**（ADR-150/151，`10` §10.3.1 步骤 2a）：缺失的 LFS 对象由 Tower 以**用户身份、在 Agent 沙箱之外**执行一条 `git lfs fetch` 获取，作用对象只有 Tower 的镜像——它不在 GitRunner 的 git-only 沙箱中，也不适用 `10` §10.1.2 的加固清单（清单中写明这一例外）。设计约束：使用用户的全局与系统 git 配置（credential helper、ssh）；LFS 配置由 Tower 显式算出，写入上一条规则所述的临时配置文件（`[include]` 用户的全局配置，加上白名单键的有效值），以 `GIT_CONFIG_GLOBAL=<该文件路径>` 运行——命令行与环境中不出现任何 URL 或键值（ADR-154，取代 ADR-152/153 的 `-c` 传参）；同一文件中还写入所选远端原样的 `remote.<name>.url`（ADR-157）与**在用户主检出的上下文中**求出的网络认证有效配置（含仓库级，但只取认证类键，ADR-156；`credential.*`、`http.*`——含不带 URL 的全局代理与 CA 及 `http.<url>.*`、`url.<base>.insteadOf`、`core.sshCommand`，ADR-154 补记与补记 2），使按目录生效的 credential helper、代理与 SSH 密钥照常工作。`core.sshCommand` 是执行类键：它在这里可接受，是因为它取自用户自己的配置、与用户在主检出中执行 `git lfs pull` 时执行的命令相同；`.lfsconfig` 中的同名键仍按白名单忽略。**这些值的来源**：只来自用户自己的配置——系统、全局（含其中按目录生效的 include）与用户主检出的仓库配置；不来自任何仓库内容（base 的 `.lfsconfig` 只经上述五个白名单键进入），Agent 也无法写入这些来源（用户主检出对 Agent 读写拒绝，§11.6.2）。其中可能含凭据的值（例如 `http.<url>.extraHeader`）按上一条规则只出现在该临时文件中；不读镜像中的任何配置（`HEAD` 指向占位引用；镜像自己的 `config` 只含 Tower 写入的项）。**键白名单的理由**：从 base 的 `.lfsconfig` 只取 `lfs.url`、`remote.<name>.lfsurl`、`lfs.<url>.access`、`lfs.fetchinclude`、`lfs.fetchexclude`，URL 只接受 https 与 ssh，不合规的值忽略——写入临时配置文件的内容因此不超出 git-lfs 自己允许 `.lfsconfig` 设置的范围（不能借它设置执行命令的键、凭据相关的键或本地路径），base 虽是用户的内容，白名单仍把它的影响面限制在“从哪里下载、下载哪些”；各键按 git-lfs 的规则与用户主检出的 git 配置合并；网络不限主机（LFS batch API 可能把下载重定向到对象存储，与用户自己执行 `git lfs pull` 相同）；这条命令的输入只来自用户主检出的配置与 base 提交，**Agent 在卫星中的写入不参与**（ADR-154），因此放宽网络不扩大 Agent 的能力；凭据在 git、git-lfs 与 credential helper 之间传递，**Tower 不截取它们**（ADR-152，撤回 ADR-151 中“参与精确匹配”的一句）；Tower 也不改写它们：用户 URL 中自带的凭据随原样的 `remote.<name>.url` 只出现在 `0600` 的临时配置文件中，命令结束即删除（ADR-157 撤回 ADR-155/156 的 store 文件与按主机改写）；这条命令的标准输出与错误输出**只进入 Tower 的诊断日志**（写入前按模式脱敏 URL 中的 userinfo 与认证头，含 §11.7 的通用模式；URL 自带的凭据只在临时配置文件中，不进入日志与卡片，ADR-157），**从不进入 Agent 的开场或任何 Agent 可读的位置**；补齐失败时 Goal 进入 `paused(prepare_failed)`，卡片只显示 Tower 生成的摘要（缺失对象数、HTTP 状态类别；由白名单校验导致时写“LFS 配置被拒绝：<键>（不支持的协议）”，ADR-154；被拒绝的值另记 Fact `lfs_config_ignored{keys, reasons}`（来源恒为 base 的 `.lfsconfig`，用户自己的 git 配置不做校验），在卡片或成功后的提示中可见，ADR-154 补记、ADR-155），不让 Agent 在指针文件上工作。SSH 远端同理。
- 残余风险：macOS 钥匙串中的令牌（`gh` 可用 keyring 存储）通过 `security` 命令或 Security 框架读取；§11.6.2 的“钥匙串服务查找”行在所有运行 Agent 可影响内容的沙箱中拒绝相关 mach 服务（ADR-163）；SP6a A8 测量拒绝是否生效、是否破坏常用工具，并记录结论。策略层另把 `security`、`gh auth token` 分类为 `secrets.access`。

---

### 11.6.5 Scratch 的隔离（R1-D11-05）

ADR-012 要求 Scratch 不写真实检出。macOS 没有用户态只读 bind mount，因此不靠“挂载”，而靠“副本 + 策略”：

| 项 | 规则 |
|---|---|
| cwd | `~/.tower/scratch/<id>/cwd/`：Scratch 绑定项目时，以 `git -C <checkout> ls-files -z --cached` 的文件集合做 CoW 克隆（同卷 `cp -c`；跨卷则 `git archive HEAD` + 已跟踪文件中未提交改动的复制）：**只复制已跟踪文件**，未跟踪文件（即使未被忽略）与被忽略的文件一律不复制（ADR-178：这份副本是 Tower 放到 Agent 可读位置的内容，不对未跟踪文件做名字与内容判定，因此不复制它们）；需要的本地文件按“本地文件”清单的规则处理 |
| S2 | 写允许：仅 Scratch cwd 与其临时目录；**真实检出路径写拒绝、读允许**（Agent 可以对照阅读；Scratch 没有卫星与 Goal，不适用 ADR-082 的检出读拒绝），但“本地文件”清单中含密钥条目的具体路径、密钥路径表与 `~/.tower/**` 照常读拒绝；另读拒绝**仓库元数据中的配置文件**（ADR-176，口径与 Goal 的检出读拒绝一致：远端 URL 与认证头都在其中）——真实检出的 gitdir 与 `commonDir` 中的 `config`、`config.worktree`、`worktrees/*/config.worktree`、`modules/**/config`，以及检出内 `.git` 为指针文件时其指向的 gitdir 中的同名文件。读拒绝**按路径模式**生成（ADR-176）：`isSecret` 的文件名模式（`.env*`、`*.pem`、`*.key`、`*credentials*`、`*.p12` 等，作用于整个真实检出，不论是否在清单中）与上述元数据配置文件模式直接成为读拒绝规则，不随条目移出清单而解除；按内容或用户标记判定的条目按其具体路径读拒绝，移出这类条目（`project.local_files.remove`）只能在本机（`16` §16.5）；网络规则同标准预设 |
| S0 | 文件工具：写路径不在 Scratch cwd 内即硬底线 forbid；bash：每条命令按 §11.3.2 分类，凡无法证明写目标全部位于 Scratch cwd（含 `opaque`）→ ask；检出路径在每轮结束时由 `git status --porcelain` 比对，出现变化 → severity 3 哨兵（事后检测；Scratch 不在 M1，该哨兵的检测器 id 与 Needs-You 去向在 M2 设计时登记，ADR-194） |
| 升级为 Goal | 副本中的改动不会自动带入：升级时 Goal 从 baseCommit 新建 worktree，Scratch 的 diff 作为合同上下文附件（`02` §2.12） |

## 11.7 密钥处理

原则：**密钥永不进入模型上下文；按下面的投递表交给需要它的进程；所有展示面都做脱敏。**

### 11.7.0 机密投递（唯一定义，ADR-159；M1 规则以 ADR-164 为准）

本节以一张表给出**全部**机密的存放、投递与可读者；其他文档只引用本节。

**M1 规则**（ADR-164，ADR-166 修订表述）：**Tower 不会自动把机密交给 Agent 可影响的进程**，即 Agent、验证器与检验检出中的进程。唯一的例外由人发起：打开检验检出时显式选择“带上本地机密文件”（`HumanDecision{inspect_with_secrets}`，仅本机），等同于人在自己机器上运行该分支（`10` §10.8.3，T31）。
- **验证标准不能声明机密**：`exec` 标准的 `env` 字段在 M1 中不可用，合同编辑器拒绝并提示。Agent 的工具调用也不获得机密（ADR-161）。
- **需要机密才能运行的检查**，在 M1 中写为 **human 标准**：由人在自己的环境中确认并勾选。按诚实语法，这是 Human，不是 Fact。人试图给 `exec` 标准加机密时，合同编辑器提供“改为 human 标准”的一键转换。
- **钥匙串在 M1 中只存两类**（ADR-166，取代 ADR-165 的三类）：
  - 模型提供商密钥，进程内存交给 Pi；
  - 云 SDK 凭据，即时投递文件，只交给 Engine Host。
  
  这两类从不进入 Agent、验证器或检验检出的进程。
- **注册表令牌 Tower 不保存**（ADR-166）：安装器第 1 阶段（拉取）每次运行时，**只从用户级** `~/.npmrc` 读取认证行（`//<registry>/:_authToken` 等，按注册表对应；`${VAR}` 以用户登录环境展开），写入即时投递文件，阶段结束即删除，因此没有刷新问题。这一阶段只运行包管理器自身，**不执行任何项目代码**（禁用 pnpmfile 与生命周期脚本）；第 2、3 阶段不含令牌（第 2 阶段只运行 Tower 内置预取器、只连已登记的下载域名；第 3 阶段断网，运行 `.pnpmfile.cjs` 与第三方依赖的构建脚本，`16` §16.8，ADR-182），读取与验证器同一份按 `16` §16.8 规则 5 生成的 `$VS/npmrc`（白名单、URL userinfo 剥除、凭据判定），不另生成副本（ADR-180）；`dep.add` 的代理安装同样走第 1 阶段（`10` §10.4，`07` §7.4.3）。
- **项目变量不能放机密**（ADR-166）：`VerifyProfile.env.vars` 的值在编辑时经过机密检查；命中时在 M1 中拒绝保存，提示“项目变量会进入 Agent 与验证器的环境，M1 中不能放机密；需要机密的检查请写为 human 标准”。
- **M1 中不做的事**（ADR-165）：
  - 工具令牌（ADR-033，如 GitHub 令牌）不导入，移到 M2；
  - ADR-063 中“合同把注册表令牌授予 Agent 可读的 npmrc”撤回，没有对应字段、命令与界面，移到 M2，与 `secrets.access` 一并设计。
- **含机密的本地文件**（ADR-165/166）：默认不播种到验证槽位、检验检出或卫星；判定条件、取消标记与设置页文案见 §11.6.2“本地文件”行。依赖它们的检查写为 human 标准，人可以在带机密的检验检出中确认后勾选。
- **缺少机密本地文件时的失败：不做自动归类，如实提示**（ADR-168，取代 ADR-166/167 的 `secret_file_unseeded` 归类，唯一定义在 `07` §7.4.1）：
  - 标准失败**一律按普通失败处理**，包括自动返工与返工上限。
  - **理由**（评审实测）：未播种的机密文件恰好不存在，沙箱对不存在路径的拒绝规则不会触发，读取直接返回 ENOENT；而宽松的加载器（dotenv、Vite、Next 的 env 加载）每次运行都会尝试读取 `.env.local`，读取尝试只是共现，不是因果。所以任何基于“读取尝试”或“输出文本”的自动归类，都会把普通失败误判为环境故障。
  - **项目存在未播种的机密本地文件时**（`isSecret` 的条目，`16`；提示只列这些条目，ADR-169）：
    - 失败卡片附一行提示，用 Claim 语法，不是 Fact：“本项目有 M1 中不提供给验证的本地机密文件（`<路径>`）；若该失败源于此，请改为 human 标准”。同时提供“改为 human 标准”，即 `contract.amend`；修订生效后界面自动发出 `retry_verify{pin:"same"}`（`03` §3.4.5，ADR-169）。
    - 返工证据中附同样一行，让 Agent 知道这些文件在验证环境中不存在；Agent 可以让测试不依赖它们，或在 `submit` 中说明。
    - 试运行的红灯徽标旁附同一提示：“若失败源于缺少本地机密文件，这不是有效红灯”。
- **npmrc 的信任边界**（ADR-167）：安装器第 1 阶段只读取**用户级** `~/.npmrc` 的认证行，**不读取项目 `.npmrc` 中的认证行**。设计理由：项目 `.npmrc` 由仓库控制，其中的凭据或 `${VAR}` 引用可能由 Agent 写入，或来自不可信的分支；把它交给带网络、能访问私有注册表的阶段，等于让仓库决定 Tower 用哪个凭据、发往哪个主机。用户级 `~/.npmrc` 是用户自己的配置，其中的 `${VAR}` 以用户登录环境展开。这与 pnpm 自身对项目级认证的处理一致。项目 `.npmrc` 中的非认证配置（scope registry、`node-linker` 等）照常读取。


**静态存放**：Tower 持有的机密存放在**系统钥匙串**中，即密钥库；`~/.tower/secrets.enc` 只是钥匙串不可用时的加密回退（§11.7.1“Tower 密钥库”行，ADR-161）。`~/.tower` 下**没有**长期存放的明文机密。

**即时投递文件**：需要以文件交给子进程时，Tower **即时**在 `~/.tower/run/<deliveryId>/` 创建（目录 `0700`、文件 `0600`），消费进程结束即删除。该目录设置备份排除与 Spotlight 排除标记（xattr），Supervisor 每次启动时清空其中不属于存活 Host 的投递（交给 Engine Host 的投递为 `run/<hostId>/`，启动清理的唯一定义在 `06` §6.1.6，ADR-226）。M1 中只有两个使用者：交给 Engine Host 的云 SDK 凭据，以及交给安装器第 1 阶段、每次只从用户级 `~/.npmrc` 读取的注册表认证（ADR-166/167）。人选择带上机密文件的检验检出直接复制这些文件，不经即时投递目录。

**可读者规则**：Agent 沙箱、验证器沙箱与检验检出的沙箱都拒绝读取 `~/.tower/**`（§11.6.2、§11.6.3；回退位置下各自允许项的逐路径例外只按 §11.6.2，投递目录不在其中，ADR-198）。Engine Host 与 Supervisor 不在沙箱内。验证器对投递文件的逐路径放行属于 M2（§11.7.0a）。

**投递表**：

| 机密 | 投递方式 | 暴露窗口与保护 |
|---|---|---|
| 模型提供商密钥 | Host 内存（`setRuntimeApiKey` 的内存覆盖层，`05` D57） | 不进入任何参数、环境或文件 |
| 用户自己的 Pi 凭据文件（用户 agentDir 中的 `auth.json`，OAuth 登录；内置 MCP 扩展的 `mcp-auth.json` 同此，随 Host 环境的 `PI_CODING_AGENT_DIR` 落在同一目录；路径的取值见 `05` §5.3.6，ADR-208/209/211） | Tower 不持有、不复制：由 Host 进程内的 Pi 读写，刷新时在 Pi 的文件锁内落盘，与用户自己的 `pi` 是同一个文件 | Host 不在沙箱中，本来就读它；Agent、验证器与检验检出的沙箱都不可读（§11.3.1 密钥路径表、§11.6.2 读允许列表之外一律拒绝；验证器与检验检出的环境以 `env -i` 起步） |
| 云 SDK 凭据（ADR-049） | 指向文件的变量与非机密的配套变量；原始变量写入即时投递文件、带保留的 profile 名 `AWS_PROFILE=tower-<hostId>`，只交给 Engine Host（见 §11.7.1“云 SDK 凭据链”行，ADR-227/228） | Host 生命周期内文件存在；Agent、验证器与检验检出的沙箱都不可读 |
| 验证器标准的机密（`env: [NAME]`）——**M2**（ADR-164） | **M1 不提供**：标准不能声明机密，需要机密的检查写为 human 标准。M2 的设计起点见 §11.7.0a | — |
| `secrets.access`（人批准给 Agent 使用的机密）——**M2**（ADR-161） | **M1 不提供**：Agent 的工具调用从不获得密钥库中的机密。M2 中注入批准它的 Goal 的单次工具调用环境，注入点为 Tower 的 `exec` | M2 中重新设计（请求格式、允许范围、与机密阶段的关系与撤回） |
| 用户配置的 MCP 服务器环境（`mcp.json` 的 `env`） | 由用户配置，Tower 不改动 | **登记的残余**：macOS S2 下其他 Agent 可能读到（T33，中）。`mcp.json` 的 `env` 中出现符合机密模式的值时，设置页提示“建议改为由该服务器自己读取钥匙串或文件”。M2 决定点：专用系统用户 |
| 注册表认证（只限用户级 `~/.npmrc`；项目 `.npmrc` 的认证行不读取，ADR-167/176） | Tower 不保存；安装器第 1 阶段每次运行时读取，写入即时投递文件（ADR-166） | 只在第 1 阶段存在，该阶段不执行项目代码；阶段结束即删除；第 2、3 阶段与 Agent、验证器不可得 |
| 项目变量（`VerifyProfile.env.vars`） | 进入 Agent、验证器与检验终端的环境，因此 **M1 中不能放机密**：编辑时经过机密检查，命中即拒绝保存（ADR-166） | — |
| URL 或 git 配置中的凭据 | macOS 上不执行相关网络命令（ADR-158） | 判定范围见 `10` §10.1.2：远端 URL；含 `password=` 或 token 形态的内联 `credential.helper`（以 `!` 开头）；含 token 形态的 `core.sshCommand`、`http.extraHeader` |

**唯一启动点**（ADR-163/164）：Tower 中启动任何 Agent 活动，都经过同一个函数 `startAgentActivity(kind, goalId?)`（`06`）。M1 中它**没有冻结状态**，唯一的约束是启动闸门（本次启动的硬链接探测有结果之前不启动使用沙箱的活动，`06` §6.2.4，ADR-224/225）；M2 的机密阶段在同一处加入调度约束（§11.7.0a）。“Agent 活动”的定义见 §11.7.0a，M1 中只用于这一约定。

**人输入文本的机密检查**（协议层，ADR-163/164，R38-D11-03）：
- **范围**：**所有**携带人类自由文本、且会进入模型上下文的命令参数，都在协议层统一检查。包括回答与重新回答、转向、恢复与重试的附言、评论、交还说明、合同文本、人写的记忆。
- **匹配集合**：钥匙串中 Tower 持有值的精确匹配，加上 §11.7.1 的模式（URL 凭据、常见 token 前缀、私钥头）。
- **命中时**：命令返回 `E_CONFIRM`，界面提示“这看起来像机密，发送后会进入模型上下文”。人确认后以 `confirmSecret: true` 重发，或取消。
- **简报**：Agent 简报写明“M1 中不会向你提供任何密钥库中的机密；需要机密才能运行的检查由人作为 human 标准确认”。

#### 11.7.0a（M2）带机密标准的设计起点

> **以下全部属于 M2**（ADR-164）：带机密的验证标准、`secretsVia`、调度互斥与 `secretMutex.enabled`、机密阶段、整机冻结、`secret_wait` 与 `verify.secret_wait.*`、`accept_secret_exposure`、`not_run{blocked_by_sentinel}` 与 `secretPhaseOnly`、验证器沙箱对投递文件的逐路径放行、条目分类与授权（R38-D11-02 的期望形态作为 M2 的设计输入）。M1 中这些都不出现：标准不能声明机密，`not_run` 也不会出现。以下文字保留为 M2 的设计起点，不是 M1 的规则。

**调度互斥**（ADR-160，取代 ADR-159 的独占窗口及其补记 2、3）：它在**调度层**保证互斥，复用已有的准入与验证排程，不在任何 Run 内部拦截工具调用。它是对“macOS 上同一用户的进程可互相观察”的直接缓解：带机密的标准运行时，没有任何其他 Agent 进程在运行。
- **“Agent 活动”**（唯一定义，ADR-160/161/162）按原则定义：**Tower 启动的、运行 Agent 编写或可影响内容的任何进程**。**不属于** Agent 活动的只有 Tower 自身代码：Supervisor、Engine Host、只使用用户配置的 git 网络命令（`10` §10.1.2）。以下列举只是例子，不是完整清单：
  - Agent 的 Run（含 settle 序列）及其后台进程，以及 Goal 的准备阶段；
  - Scratch 会话；
  - 验证槽位的准备，包括安装器第 3 阶段（pnpmfile 与依赖构建脚本）、服务与测试清单的生成、预热；以及槽位中运行的任何标准（其他 Goal 的验证、同一 Goal 的其他标准）；
  - 检验检出的服务；
  - 未解决的 `bg_process_survived`（存活者仍在）。

  新增的组件若会运行 Agent 编写或可影响的内容，自动属于 Agent 活动，不必修改本定义。
- **机密阶段**（ADR-162/163，唯一定义在 `07` §7.4.11.2）：带机密的标准（`env: [...]`，默认以环境变量注入）是验证中独立的一个阶段，排在全部不带机密的标准之后。
  - **不运行的情形**（ADR-163）：记 `criterion_check{verdict: "not_run", reason}`，不计为通过、**也不计为失败**，验证缓存从不缓存 `not_run`；不等待、不冻结。原因有两种：
    - `other_criteria_failed`：不带机密的标准有失败，按失败路径处理；
    - `blocked_by_sentinel`：不带机密的标准全部通过但存在阻断哨兵，进入 `paused(sentinel_high)`。人 `override_sentinel` 后，继续目标改写为 `verify{pin, secretPhaseOnly: true}`，以同一 pin 只运行机密阶段，通过后才进入评审。
  - **等待**：否则**不持有槽位**地等待“没有 Agent 活动”。
  - **全局、原子、串行**（ADR-163 及补记）：“没有 Agent 活动”的判定与冻结都是**整机范围**，不分项目；槽位则取自**该 Goal 所属项目**的验证槽位池（准备配置与项目绑定）。判定成立时整机没有其他验证在运行，该池必有空闲槽位。“判定没有 Agent 活动 → 获取槽位 → 设置冻结”在 Supervisor 的单写者线程中**一次完成**。机密阶段**严格串行**，两个机密阶段不会同时运行，`run_now` 也不例外。
  - **冻结的单一闸口**（ADR-163）：经上文的唯一启动点 `startAgentActivity(kind, goalId?)`。M2 中冻结期间它让请求排队，界面显示“等待机密验证结束”；它也在单写者线程中检查冻结标志，所以不存在绕过它的启动路径，也没有竞态。本节不再列举冻结清单。已在 `paused` 的 Goal 不受影响。
  - **准备**：获取槽位时即冻结，在准备之前；然后在**注入任何机密之前**完成准备（物化依赖、启动服务）。
  - **运行与收尾**：逐个注入并运行带机密的标准。结束时依次：终止槽位的全部进程（进程树 ∪ 令牌，`10` §10.3.1）→ 执行该槽位的正常 teardown（服务、容器卷等，`07` §7.4.4）→ 释放槽位 → 解除冻结。机密随进程消失；脱离且无法识别的进程属于 ADR-158 已登记的窗口。
  - **崩溃恢复**（ADR-163）：重启时若发现冻结未解除（事件未闭合），先终止该槽位进程并 teardown，再解除冻结；机密阶段重新排队。
  - **不回写缓存**：该槽位的依赖物化只读使用依赖缓存；机密阶段中产生的任何构建产物都不回写共享缓存。
  - **冻结时长上限** = `verify.slotPrepareTimeoutMin`（`16` §16.2，默认 10 分钟）+ 各带机密标准的超时之和（`13`）。
  - **持有者自身**：机密阶段不参加机会式验证，因为机会式验证发生在持有者 `running` 时。它只在 `claimed`/`verifying` 时运行，这时持有者的 Run 已 settle，进程已按 ADR-115/158 终止。
- **等待过久**：等待超过 **10 分钟** → Needs-You（kind `verify_env`，去重键 `ve:{goalId}:secret_wait`）。Goal 在等待期间保持 `verifying`，不进入 `paused`。三个选项各有命令：
  - “继续等待” → `verify.secret_wait.keep{goalId}`：关闭条目，继续排队；
  - “现在运行（接受风险）” → `verify.secret_wait.run_now{goalId}`：记 `HumanDecision{accept_secret_exposure}`，只跳过“等待非机密的 Agent 活动结束”，**从不**与另一个正在进行的机密阶段并行（ADR-163）；其余步骤（准备后再注入、冻结、收尾）相同。界面写明“其他正在运行的 Agent 可能读到该机密”；
  - “以文件方式运行” → `verify.secret_wait.as_file{goalId}`：本次以 `secretsVia: "file"` 在普通槽位流程中运行，无需互斥，不冻结。
- **远程**（ADR-160 补记 2）：`verify.secret_wait.run_now` 只能在本机执行；`keep` 与 `as_file` 允许远程（`16` §16.5）。
- **项目设置** `secretMutex.enabled`（默认 `true`）：关闭时带机密的标准不等待，设置页与该项目的标准行标注“机密以环境变量注入时，运行期间同一用户的其他进程可能读到”。

**测试读取 `<NAME>` 的兼容性**（R33-D7-01）：默认 `env`，因此不会出现“测试读不到变量而跳过，却显示通过”。`secretsVia: "file"` 时，若该标准的测试在运行中“跳过”计数增加，按既有的 skip 哨兵处理，并在标准行提示“该标准以文件注入机密，请确认测试读取 `<NAME>_FILE`”。
- **投递文件的逐路径放行**（ADR-159）：验证器沙箱拒绝读取 `~/.tower/**`，只逐路径放行本次标准的投递文件（`secretsVia: "file"` 时）。

### 11.7.1 各环节措施

| 环节 | 措施 |
|---|---|
| Engine Host 环境 | Pi 的 bash 继承整个宿主进程环境（`utils/shell.ts` `getShellEnv()` 展开 `process.env`），因此 Engine Host 必须以**白名单环境**启动：变量的完整列表只在 `05` §5.3.6 “Host 环境的变量”一行（唯一定义，ADR-230；本行不复述；Host 自己的 `TMPDIR` 是 `~/.tower/tmp/<hostId>/`，不是你的 `TMPDIR`，ADR-224；按 Goal 或 Run 变化的端口与 Tower 标识不在 Host 环境中，只经每个 Run 的 `bashEnv` 传入）；**Host 环境不引用任何 Agent 可写的位置**——`16` §16.8 的角色 A 变量（如 `NPM_CONFIG_USERCONFIG=$GS/npmrc`）只进入 bash（唯一定义 `05` §5.3.6，ADR-213）；列表之外一律删除，包括 `*_TOKEN`、`*_KEY`、`*_SECRET`、`AWS_*`、`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等（例外：经用户确认的云 SDK 凭据链以**指向文件的变量**与非机密的配套变量（区域、项目与 location，以及 Azure、Cloudflare 一类 API Key provider 的端点、账号与 gateway id，ADR-228）传到 Host 进程、但不进入 bash，见下文“云 SDK 凭据链”行；凭据类型以 ADR-049 为准，传递方式以 ADR-158 补记 2 为准）。**工具令牌的导入**（ADR-033，如 GitHub 令牌）在 M1 中**不进行**：M1 没有推送与开 PR（ADR-133），Tower 不需要它们，导入移到 M2（ADR-165）。用户 shell 中的这类凭据在 UI 中标为“仅在你的终端可用” |
| 模型凭据 | **不进入任何环境**（ADR-158）：SDK 适配器以 `ModelRuntime.setRuntimeApiKey(provider, key)`（`model-runtime.ts` L621）在 Host **内存**中提供（依赖行登记于 `05`）。**与你的 Pi 配置中凭据的先后**（唯一定义，ADR-230/231；`05` §5.3.6、`04` §4.18.1 第 2 步引用）：Pi 的运行时覆盖先于存储的凭据（`RuntimeCredentials.read` 先返回覆盖，coding-agent `core/runtime-credentials.ts:24-28`），而终端中的 Pi 依次取存储的凭据、`models.json` 的 `apiKey`、环境变量（`ai/src/auth/resolve.ts:27-31, 70-92`；`core/provider-composer.ts:457-473`）。导入的密钥来自你 shell 的环境变量，是其中最后一层，所以 Tower 只在 **Pi 自己判定**该 provider 在你的 Pi 配置中没有凭据时注入它（ADR-231，取代按 `auth.json` 条目是否存在的检查）。**询问**：每次 `host.spawn` 与每个 Run 创建会话之前，Host 新建一个不带运行时覆盖的探查运行时 `ModelRuntime.create({authPath, modelsPath, refreshOnCreate: false})`（与 Host 的运行时同一份 `auth.json`、`models.json`；`core/model-runtime.ts:109-124, 217-218`，自包入口导出，`index.ts:232-236`），调用它的 `checkAuth(provider)`（`:485-487` → `ai/src/models.ts:657-692`，不刷新 OAuth），用后丢弃。Pi 按自己的规则判定：`auth.json` 的 OAuth（`models.ts:662-664`）；`auth.json` 的密钥，`$VAR` 引用与 `!` 命令在读取时解析（`core/auth-storage.ts:442-448`、`core/resolve-config-value.ts:145-151`），`$VAR` 只取条目自己的 `env` 与 Host 进程环境（`:88-89`）；`models.json` 的 `apiKey`（`core/provider-composer.ts:445-452`，只检查它引用的变量是否存在，以 `!` 开头的不执行）；最后是 provider 读取的环境（`:453-455`）。**判定**：结果的类型为 `oauth`，或 `source` 为 `stored credential`、`configured API key` 时，凭据来自你的 Pi 配置——Tower 不调用 `setRuntimeApiKey`、已注入的以 `removeRuntimeApiKey`（`core/model-runtime.ts:634-640`）移除，用哪份凭据、由谁计费与终端相同；结果为空或来自环境时注入（Host 环境中没有任何模型密钥，环境一类的结果只可能来自 Tower 按 `05` §5.3.6 ⑦ 传入的变量，如 Bedrock 的 `AWS_PROFILE`；注入之后与终端中环境变量一层的结果相同，`ANTHROPIC_AUTH_TOKEN` 的差别见下）。因此：`auth.json` 中 `key` 写为 `$VAR`、而 Host 环境中没有该变量的条目判为没有，Tower 照 ADR-049 类型表导入该变量并注入，与终端结果相同；写为 `!` 命令的条目在 Host 进程中以 Host 的白名单环境同步执行（10 s 时限：第一次检查时至多阻塞该 Host 的事件循环 10 s，低于 30 s 的挂死判定，打包模式下同一 Host 中其他 Goal 的心跳随之推迟；结果在该 Host 进程内缓存到退出，失败得到的空值同样缓存，`resolve-config-value.ts:9-10, 185-216`，所以你在终端中解锁密码管理器之后，已在运行的 Host 仍判为没有，ADR-232），依赖其他会话变量（如密码管理器的会话变量）的命令在 Tower 中得到空值、判为没有，这时有导入的密钥就注入（终端中命令失败时同样回落到环境变量；命令在你的终端中成功时，两边可能用不同的账户，见下文的标注），没有就按 `06` §6.8 F7 失败；`models.json` 中为该 provider 配了 `apiKey` 时 Pi 判为已配置、不注入，但写为 `$VAR` 而 Host 环境中没有该变量时判为没有（`core/provider-composer.ts:447-449`），Tower 照 ADR-049 类型表导入该变量并注入，与终端结果相同（ADR-232）；以 `!` 开头的在每次请求时以 Host 的白名单环境同步执行、不缓存（`:467`；`execSync`，10 s 时限，`resolve-config-value.ts:185-196, 221-227`），每次请求至多阻塞该 Host 的事件循环 10 s，同样低于 30 s 的挂死判定，打包模式下同一 Host 中其他 Goal 随之推迟（ADR-233，与终端中相同，如实登记），失败时请求以 Pi 的错误 `Failed to resolve API key for provider …` 失败（`core/resolve-config-value.ts:229-238`；与终端中同一命令失败时相同，如实登记）。**扩展注册的 provider**（ADR-232）：探查运行时只装内置 provider 与 `models.json`（`core/model-runtime.ts:217-268`），看不到用户扩展在会话创建时写进 Host 运行时的 provider（`core/agent-session-services.ts:158-181`：`registerProvider`、`registerNativeProvider` 写入传入的 `modelRuntime`，保留到 `unregisterProvider`，`core/model-runtime.ts:891-957`；扩展新建的 provider 在探查中为未知，`ai/src/models.ts:688`）。所以对 Host 运行时 `getRegisteredProviderIds()`（`core/model-runtime.ts:526-528`）列出的 provider——扩展新建的，或以同名覆盖内置 provider 的——Tower 不注入导入的密钥、已注入的移除，认证由该扩展自己处理，每次检查都跳过它们。**何时读取这一列表**（ADR-233）：Pi 没有 provider 注册的事件可订阅（`registerProvider`、`registerNativeProvider` 只更新运行时的快照，`core/model-runtime.ts:891-949`），而初次加载之后的注册立即生效、可以在命令处理器或事件回调中发生（`core/extensions/types.ts:1814-1817`；会话把它直接绑到 Host 的运行时，`core/agent-session.ts:3496-3502`）。所以 Host 在每个 Run 的会话创建之后（初次加载时排队的注册此时写入）、第一次请求之前、适配器每次调用 `prompt`、`steer`、`followUp`、`inject` 之前（`05` §5.2，Tower 控制的投递边界），以及每次模型调用之前（SDK 中 tower-goal 的 `turn_start` 处理器，Pi 等待它，重试与续跑同样经过，`05` §5.6.5，ADR-234）读一次 `getRegisteredProviderIds()`（内存读取）；某个 provider id 在一个 Host 中被列出过一次，Tower 在该 Host 进程退出之前不再为它注入，扩展随后 `unregisterProvider` 也不恢复；同一 Host 中对同一 provider 的注入与这些读取、移除串行执行，注入之前再查一次已列出的集合（打包模式下另一个 Goal 的 Run 开始时的检查因此不会在 `turn_start` 的移除之后重新注入，ADR-235）。剩下的窗口（如实登记，ADR-234 缩到一次模型调用）：扩展在一次模型调用的 `turn_start` 之后的回调中新注册的覆盖，作用于这一次调用，以及此后 Pi 发出、不经 `turn_start` 的压缩、摘要与缓存预热请求——压缩与摘要止于下一次 `turn_start`；缓存预热在默认的 `streaming` 模式下止于该 Run settle（`core/cache-warmer.ts:245-250`），你把 `cacheWarming` 设为 `idle` 时 settle 之后继续定时，至多到启动它的请求之后 30 min 或会话 `dispose`（`:16-18, 251-257, 286-297`；Tower 只在 drain 或 Host 退出时 `dispose`，ADR-236）（缓存预热：只读你的全局设置，在每次会话请求发出之前 `cacheWarmer.start`，按缓存的有效期定时以 `maxTokens: 1` 重放该请求，直接调用运行时、不经 `turn_start`，`core/sdk.ts:427-430`、`core/settings-defaults.ts:60`、`core/settings-manager.ts:913-917`、`core/cache-warmer.ts:296, 330-339`，ADR-235），它们仍可能带已注入的导入密钥，发往扩展配置的端点、计入导入的那份密钥的账户；扩展在事件回调中自己发出的请求（如 `session_start` 中）同此。它不扩大机密的去向：同一 Host 中的用户扩展本就能经 `ctx.modelRegistry` 读取已注入的密钥（`core/model-registry.ts:194-204`），在密钥的信任边界之内，Agent 可影响的进程不因此得到它。代价（如实登记，`00` §0.5.1 凭据一行）：以内置 provider 的 id 注册的任何扩展——`registerProvider` 只给 `baseUrl`、`models` 或 `headers` 的也算（同名注册合并配置，`core/model-runtime.ts:928-949`），`registerNativeProvider` 同样——都使 Tower 不为该 provider 注入导入的密钥；扩展与你的 Pi 配置都不提供该 provider 的密钥、密钥只在 shell 的环境变量中时，它在 Tower 中判为未配置，按 `06` §6.8 F7 处理；请把密钥写进 `pi /login` 或 `models.json`。**标注取自 Host 的检查**（ADR-232）：判定只在 Host 中求出——`$VAR` 取的是所在进程的环境，`!` 命令的结果按进程缓存（`resolve-config-value.ts:10, 88-89`）——`auth.json` 中的 `!` 命令也只在 Host 中执行，Tower 的其他进程不求值、不执行它们（`provider_unavailable` 的探测同样只在 Host 中运行，且只用已存活的 Host、不为探测另起，`06` §6.1.4 第 5 项，ADR-234/235）。Host 把每次检查的结论（每个有导入密钥的 provider 一项，三种之一：凭据来自你的 Pi 配置、由扩展处理认证——上述列出的 provider、用导入的密钥）交给 Supervisor，Supervisor 按 Host 只在内存中保留该 Host 最近一次的结论，Host 退出时丢弃；Host 在一次读取改变了某个结论时，以及只重启 Supervisor 后重新接上时（`06` §6.1.3）重报（ADR-234；ADR-233：不取各 Host 中最后报告的一次——打包的分组下，加载扩展与不加载扩展的 Host 对同一 provider 的结论可以不同）。**模型选择器**（ADR-233：设置 › 引擎的默认模型，`04` §4.15；为目标切换模型，`04` §4.18.3 模型服务不可用一行）中，某个目标的标注取服务该目标的 Host（正在运行它的，或上一次运行它而仍存活的）的结论，写 `已有你的 pi 配置中的凭据，Tower 用它`、`由扩展处理认证`（只说明 Tower 不为该 provider 注入导入的密钥，不说明认证成功；扩展只加头部而请求按 `06` §6.8 F7 失败时以 F7 的条目为准，ADR-234）或 `Tower 用导入的密钥`（后者包括 `!` 命令在 Tower 中得到空值、而在你的终端中成功的情形，这时两边可能是不同的账户）；还没有这样的结论时（首次运行在任何 Host 之前，该目标在 Tower 启动之后还没有运行过，或服务它的 Host 已退出），以及设置中不属于某个目标的默认模型，首次运行与模型选择器写 `第一次运行时由 Pi 判定：你的 pi 配置中已有凭据时 Tower 用它，导入的密钥只在没有时使用`。**可见范围**（如实登记，ADR-234）：设置中的默认模型恒写这一条件句；按目标的标注只出现在 `为受影响目标切换模型`（`04` §4.18.3 模型服务不可用一行），而 Host 在 Goal 进入 `in_review` 或暂停超过 5 分钟时退出（`06` §6.1.8），所以三种标注只在该目标的模型服务不可用、且服务它的 Host 尚未退出时可见；“两边可能是不同的账户”的告知因此主要靠首次运行的条件句，`14` G46 (d) 第八至十组在这一位置与时机断言标注。探查以 Pi 的文件锁读取 `auth.json`（`core/auth-storage.ts:393-399, 402-440`），不会读到写了一半的文件；读取失败时它抛出（`ai/src/models.ts:649-655`），Tower 按“没有”处理并注入，到下一次检查为止（如实登记）。探查的构造在文件修订变化时于锁内同步重读，至多忙等约 200 ms（`core/auth-storage.ts:81-115`），`auth.json` 不存在时建出 `{}`（`:75-79`），与 Host 自己的运行时、终端中的 `pi` 相同；它不联网、不刷新 OAuth、不加载扩展。**范围**：每个 Host 一个 `ModelRuntime`，运行时覆盖是它的一张表（`core/runtime-credentials.ts:6`），Pi 每次请求都重新求凭据（`core/model-runtime.ts:658-697`）；所以检查、注入与移除按 Host 进行，在 Host 启动与该 Host 上每个 Run 开始时生效，已在传输中的请求保留发出时的凭据。正在进行的 Run 用该 Host 当前求出的凭据：Run 中途你在终端 `/login` 时，这次 Run 仍用已注入的密钥，该 Host 上下一个 Run 开始时起改用你的登录；打包模式下（`06` §6.1.1）同一 Host 上另一个 Goal 的 Run 开始时的检查同样改变它，从下一次请求起生效；同一 Host 中的会话总加载同一扩展集合（`06` §6.1.1 打包的分组，ADR-232），扩展注册的 provider 因此不作用于不加载扩展的会话。Run 中途你 `/logout`、而这次没有注入时，下一次请求由 Pi 判为未配置（`Provider is not configured`），按 `06` §6.8 F7 处理；该 Host 上下一个 Run 开始时的检查注入导入的密钥。Host 进程环境中不含任何模型密钥，Agent 启动的进程也不继承。**以头部发送的令牌**（已知限制，ADR-229）：Pi 的 Anthropic provider 只从进程环境读取 `ANTHROPIC_AUTH_TOKEN`，并以 `Authorization: Bearer` 发送（`ai/src/providers/anthropic.ts:34-40`；环境取自 `process.env`，`ai/src/auth/context.ts:23-28`），运行时注入的密钥则以 API Key 发送（`anthropic.ts:30-31`；coding-agent `core/model-runtime.ts:621-629`）。令牌不能放进 Host 环境（同一用户的进程能读到非 Apple 二进制的环境，§11.6.2、T33），所以 M1 不提供这一类：首次运行检测到它时不导入，模型选择器显示“该凭据只在你的终端中可用，Tower 中不可用”，并提示改用 `ANTHROPIC_API_KEY` 或 `pi /login`（`05` §5.3.6）。与其他来源并存时（ADR-230）：凭据来自你的 Pi 配置时两边都用它，不标注；没有、而 shell 中另有 `ANTHROPIC_API_KEY` 时，终端中的 Pi 先用令牌（`anthropic.ts:34-46`），Tower 用导入的密钥，确认卡片与模型选择器写明 `你的终端用 ANTHROPIC_AUTH_TOKEN，Tower 用 ANTHROPIC_API_KEY`。不经进程环境提供令牌的唯一途径是以 `registerNativeProvider`（coding-agent `core/model-runtime.ts:891`）替换整个 Anthropic provider、在其 `resolve` 中返回头部；M1 不采用：Tower 要随 Pi 的每个版本维护这份 provider 的副本。Anthropic 的工作负载身份联合（`ANTHROPIC_IDENTITY_TOKEN_FILE` 与配套的 id，`anthropic.ts:49-69`）在 M1 中也不提供，这是范围选择而不是做不到：它由指向文件的变量与非机密的 id 组成，与 Vertex 同类，可以按“云 SDK 凭据链”一行的规则传入；M1 只提供首次运行检测、确认并有 G46 (d) 覆盖的几类，它推迟到 M2（ADR-230）。RPC 适配器（M2）以 `0600` 的 `auth.json` 提供。`auth.json` 在沙箱中读拒绝 |
| 云 SDK 凭据链（ADR-049，ADR-158 补记 2，ADR-159） | 经首次运行检测与用户确认后，Tower 只把**指向文件的变量与非机密的配套变量**传到 Engine Host 进程环境（唯一定义，ADR-227 补齐；Pi 的 provider 在 Host 内判定与读取：`packages/ai/src/models.ts:757` 经 `resolveProviderAuth` 调用各 provider 的 `resolve`，判为未配置时 coding agent 的请求路径在 `core/model-runtime.ts:676` 抛出 `Provider is not configured: <provider>`，`models.ts:865-866` 是 pi-ai 自己的请求路径上的同一消息）：指向文件的变量——`AWS_PROFILE`/`AWS_SHARED_CREDENTIALS_FILE`/`AWS_CONFIG_FILE`、`GOOGLE_APPLICATION_CREDENTIALS`（只有这几个，ADR-231；Pi v1.2.0 的 `packages/ai/src` 中没有读取 `AZURE_CONFIG_DIR` 的代码）；**非机密的配套变量**原样传入——`AWS_REGION`、`AWS_DEFAULT_REGION`、`GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION`（Vertex 缺 project 或 location 即判为未配置，`ai/src/providers/google-vertex.ts:78-81`），以及 API Key 类 provider 的**非机密配置变量**（ADR-228；密钥本身仍只经运行时注入，§11.7.0）——Azure OpenAI 的 `AZURE_OPENAI_BASE_URL`、`AZURE_OPENAI_RESOURCE_NAME`、`AZURE_OPENAI_API_VERSION`、`AZURE_OPENAI_DEPLOYMENT_NAME_MAP`（`ai/src/api/azure-openai-config.ts:32, 74-75, 104`；前两者都没有、模型也没有 `baseUrl` 时 `:87-91` 抛出），Cloudflare 的 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_GATEWAY_ID`（`ai/src/providers/cloudflare-auth.ts:37-42`：缺账号，或 AI Gateway 缺 gateway id，判为未配置）；Pi 先读调用方给出的 `env`、再读进程环境（`ai/src/utils/provider-env.ts:45-51`），所以原样放在 Host 环境中即可。“变量 → provider”的对应以各 provider 的 `resolve` 及其读取的配置变量为准（D62）。**AWS 的 profile**（ADR-227/228）：Pi 的 Bedrock 判定只认存储的凭据、`AWS_BEARER_TOKEN_BEDROCK`、`AWS_PROFILE`、原始密钥对、容器凭据 URI 与 Web Identity 令牌文件（`ai/src/providers/amazon-bedrock.ts:54-79`），只有 `AWS_SHARED_CREDENTIALS_FILE` 时判为未配置；所以凡以凭据文件提供 AWS 凭据，Host 环境中总带 `AWS_PROFILE`：只有 profile 或文件变量时，你设了的取你的值，没设的取 SDK 的默认值 `default`；**两者并存**（你的环境中同时有 `AWS_PROFILE` 与原始密钥对）时与终端中的 Pi 相同、用原始密钥——Pi 只让经 `options` 或存储凭据的 `env` 给出的 profile 优先，环境中的 `AWS_PROFILE` 不阻止 SDK 配置取原始密钥（`ai/src/api/bedrock-converse-stream.ts:162-164, 215-217`）——所以 Tower 写投递文件、不传你的 `AWS_PROFILE`。**投递文件的 profile 名**是 Tower 保留的 `tower-<hostId>`，不与你配置中的任何段同名（Host 保留真实的 `HOME`，SDK 会并入 `~/.aws/config` 中的同名段）。**区域**在每次 `host.spawn` 时判定，不在首次运行时固定：① 记录的 `AWS_REGION`、`AWS_DEFAULT_REGION` 原样传入；② 都没有，而你设了 `AWS_PROFILE`（含两者并存）或 Tower 传的是 `default` 时，读该 profile 在配置文件（记录的 `AWS_CONFIG_FILE`，没有时 `~/.aws/config`）中的 `region`，写为 `AWS_REGION`；③ 仍没有、而 Host 环境中带 `AWS_PROFILE`（凡以凭据文件提供，见上）时补 `AWS_REGION=us-east-1`；不带时（只有 `AWS_BEARER_TOKEN_BEDROCK`，它按 API Key 运行时注入，Pi 以它为 bearer 令牌，`:184-189`、coding-agent `core/model-runtime.ts:692`）不补，由 Pi 按模型端点取区域，与终端相同（`bedrock-converse-stream.ts:168-173, 199-205`）。有 profile 时 Pi 交给 SDK 从该 profile 读区域（`:203`）；Tower 改传保留的 profile 名时 SDK 读不到你那个 profile 的区域，所以由 ② 写出；你在 profile 中之后改的区域在下一次 Host 启动时生效。**与终端中的 Pi 不同的两处**（如实登记，ADR-229）：只有 profile 而它没有区域时，终端中的请求因缺区域失败，Tower 按 ③ 补 `us-east-1`；**只有原始密钥、没有区域**时，终端中的 Pi 对标准 Bedrock 端点的模型取模型端点的区域（`:201`；内置 `eu.*` 推理配置的端点是 `eu-central-1`，`ai/test/bedrock-endpoint-resolution.test.ts:113-120`），而 Tower 只能经投递文件与 `AWS_PROFILE` 提供原始密钥——Pi 的判定只认环境或存储凭据中的 `AWS_PROFILE`、或环境中的原始密钥对（`amazon-bedrock.ts:65-73`），原始密钥从不进入 Host 环境；存储凭据的 `env` 一支可以不经进程环境给出 profile（`:65-70` 返回它，coding-agent `core/model-runtime.ts:682-685` 并入请求），但 `ModelRuntime` 只接受一个凭据存储（`:109-112, 218`），它同时承担你的 `auth.json` 中 OAuth 令牌的刷新与落盘，而文件型 `AuthStorage` 不从包入口导出（`index.ts:26` 只导出 `readStoredCredential`），走这一支 Tower 要自己实现 `auth.json` 的读写与跨进程锁，正是 D57 不采用的内存凭据存储一类（`05` §5.11.1，ADR-230）——环境中的 `AWS_PROFILE` 又使 Pi 不固定端点（`bedrock-converse-stream.ts:167`、`:1239-1249`），所以请求按 ③ 发往 `us-east-1`，`eu.*` 这类端点在别处的模型在 Tower 中失败。用这类模型请在环境或 profile 中设区域；首次运行检测到只有原始密钥而没有区域时，确认卡片写明 `只有原始密钥、没有区域：Tower 中的请求发往 us-east-1；使用 eu.* 等模型请设区域`（`05` §5.3.6）。**少见配置**（登记，ADR-229）：你经 `pi /login` 存储了 Bedrock 的凭据时，Pi 以存储的凭据为准（`ai/src/auth/resolve.ts:70-85`、`amazon-bedrock.ts:61-71`），Tower 也不注入 `AWS_BEARER_TOKEN_BEDROCK`（模型凭据一行的先后，ADR-230），所以用哪份凭据与终端相同；本行 ①–③ 的区域变量照常传入，区域可能与终端不同（同上两处差别）；`AWS_BEARER_TOKEN_BEDROCK` 与原始密钥对并存时，终端中的 Pi 用令牌（`amazon-bedrock.ts:64` 先于 profile 与原始密钥），Tower 同样只注入令牌、不导入原始密钥、不写投递文件，Host 环境中不带 `AWS_PROFILE`，区域照上文不补，与终端相同（ADR-230）；你之后删去原始密钥、改用 profile 时，密钥库中旧的原始密钥仍按“两者并存”优先，请在设置的凭据中移除该条目（`04` §4.15）再“重新读取”；Web Identity（`AWS_WEB_IDENTITY_TOKEN_FILE` 与 `AWS_ROLE_ARN`）、`AWS_BEDROCK_SKIP_AUTH`、`AWS_BEDROCK_FORCE_HTTP1`、`PI_CACHE_RETENTION` 等不在本行的变量表中，按白名单删除，只在你的终端中生效；`auth.json` 中手工写的、没有 `key` 只带配置的条目（如 Bedrock 只带 `env.AWS_PROFILE`，`/login amazon-bedrock` 存下的条目不带 `env`，`amazon-bedrock.ts:48-52`）判为 `stored credential`、不注入，而终端中的 Pi 先看 shell 中的 `AWS_BEARER_TOKEN_BEDROCK`（`:64` 先于 `:65-70`），所以 shell 中有令牌时终端用令牌、Tower 用该 profile；Vertex 的存储 ADC 配置与 shell 中的 `GOOGLE_CLOUD_API_KEY` 同理（`google-vertex.ts:71-72, 85`）（登记，ADR-232）。**原始密钥变量**（如 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`）**从不传入**；用户的配置提供原始变量时（只有原始变量，或与 `AWS_PROFILE` 并存），Tower 把它们写入即时投递文件 `~/.tower/run/<hostId>/`（§11.7.0；Host 生命周期内存在，退出即删除，启动时只清除不属于存活 Host 的，`06` §6.1.6，ADR-226），以 `AWS_SHARED_CREDENTIALS_FILE` 传路径、以 `AWS_PROFILE=tower-<hostId>` 传保留的 profile 名（Agent 与验证器沙箱对 `~/.tower/**` 读拒绝）。**记录的值**（ADR-228）：本行所列的非机密变量（配套变量、配置变量与指向文件的变量）的值在首次运行时经你确认后记入 Tower 的密钥库，随所属条目存放（`16` 钥匙串条目一行），每次 `host.spawn` 从这里取；设置页“重新读取”替换它们（`05` §5.3.6），下一次 Host 启动生效。因此 Host 进程环境中只有路径与非机密的配置，没有密钥。**刷新**（已知限制，ADR-227）：原始值只在首次运行时导入一次，“重新读取”不重新提示凭据类变量（`05` §5.3.6）；带有效期的值（如 `AWS_SESSION_TOKEN`）过期后，用它的 Host 的模型请求以 Pi 的 provider 错误失败（F7 不识别这一类，`06` §6.8），新起的 Host 仍从钥匙串取同一旧值。M1 不提供重新导入的入口：有效期短的凭据请改用 profile（如 SSO 一类），由 SDK 自己读取与刷新，Tower 只传它的名字与文件路径。这些变量**不进入** Agent 的 bash 环境：工具路径上的白名单过滤由 `spawnHook` 完成；Tower 的 `exec` 在调用方未给出 `env` 时回落到同一白名单，并加入 Run 令牌（`05` §5.3，R36-D15-01）。**连带后果**：Host 派生的其他子进程——MCP 服务器、用户扩展自己启动的子进程——默认继承 Host 的完整环境，因而也拿到这些凭据文件的路径；它们不在 Agent 沙箱中，可以读取这些文件。缓解（R5-D5-02）：**SDK 适配器**下 Tower 调用 `createMcpExtension()` 时传入自己的 `createTransport`，以 `inheritEnv:false` 启动每个 stdio 服务器，环境 = `mcpBaseEnv`（变量只按 `05` §5.3.5 一处列出，本行不复述，ADR-231；其中的 `GIT_CEILING_DIRECTORIES` 与 `GIT_CONFIG_*` 注入 ADR-072 的两项与 ADR-096 的 `safe.bareRepository=explicit`，否则这些 git 防护随之丢失）+ 该服务器在 `mcp.json` 中 `env` 字段显式声明的变量 ；**不含云凭据**。“对该服务器的显式授予”在 M1 中删除（ADR-166）：MCP 服务器的环境只由用户在 `mcp.json` 中配置，属于已登记的残余（T33）（`05` §5.3.5，契约测试 C21）。**RPC 适配器**下 MCP stdio 服务器由 `pi` 进程启动、继承 Host 的完整环境（含透传的云凭据）；用户扩展自行启动的子进程在两种适配器下都继承 Host 环境——均登记为残余风险（T28），并在清单确认卡片上写明“此服务器将能读取：AWS_* …” |
| Tower 密钥库 | 机密的静态存放处是**系统钥匙串**（macOS Keychain，ADR-159/161）。**M1 中只存放 Tower 自己使用的两类凭据**（ADR-164/166）：模型提供商密钥与云 SDK 凭据；注册表令牌不保存，每次从用户级 `~/.npmrc` 读取（ADR-167）；条目分类与按 Goal/标准的授权属于 M2。**访问控制**（ADR-162）：Tower 写入的条目以访问控制列表限定为 Tower 自己的代码签名身份；其他进程读取会触发 macOS 的授权提示，用户应拒绝；所有运行 Agent 可影响内容的沙箱（Agent、验证器、检验检出）另外拒绝钥匙串服务的查找（§11.6.2，ADR-163）。因此凭据读取类命令（`secrets.access` 分类，如 `security find-generic-password`）读不到 Tower 的条目。SP6a A8 测量这两点并记录。钥匙串不可用时，以 `~/.tower/secrets.enc` 作为**加密回退**：用 Electron `safeStorage` 加密，密钥在钥匙串中，不是明文 |
| 验证器注入 | **M2**（ADR-164）：M1 中验证标准不能声明机密，`exec` 标准的 `env` 字段不可用，合同编辑器拒绝并提供“改为 human 标准”。M2 的设计起点（默认 `env` 注入、可选 `file`、调度互斥与机密阶段）见 §11.7.0a |
| Agent 需要密钥 | **M2**（ADR-161）：M1 中 Agent 的工具调用从不获得密钥库中的机密；需要机密的检查写为 human 标准（ADR-164）。M2 的 `secrets.access` 审批、注入（Tower 的 `exec`）与暴露控制重新设计 |
| 脱敏（tool_result） | tower-goal 的 `tool_result` 处理器在结果进入模型与会话之前改写 `content`、`structuredContent` 与 `details` 中的全部字符串值（`details` 逐层递归：Pi 的工具在截断时把截断后的原始输出放在 `details.truncation.content`，`edit` 把 `diff` 与 `patch` 放在 `details`；`details` 不进入模型请求，但随结果写入会话文件并进入 `tool.end`，所以同样脱敏，ADR-239）（`agent-session.ts` `_afterToolCall` 在持久化前应用改写；处理器自身出错时不放行原文，而以隐去原文的结果代替——Pi 对这个事件吞掉异常、照常放行原结果，所以 fail-closed 由处理器自己保证，唯一定义 `05` §5.6.5 第 6 项，ADR-238）：① 精确匹配——**Tower 知道的全部机密**（ADR-151）：密钥库中所有值 + 模型提供商密钥 + 被删除环境变量的值 + “本地文件”清单中扫描命中的值（`add` 时与每次复制前的判定，见 `16`；ADR-082/170）+ 安装器第 1 阶段从用户级 `~/.npmrc` 读到的注册表令牌（ADR-166/167）（M2 另加验证器为标准注入的密钥值）（git 网络命令的凭据 Tower 不截取，不在此集合中；macOS 上 URL 自带凭据的远端不执行网络命令（ADR-158）；Linux S2（M2）上该凭据只写入 `~/.tower/tmp/` 下用后即删的 0600 临时配置文件，其他进程不可见；这些命令的输出只进入诊断日志并按模式脱敏，不进入 Agent 可读的位置，ADR-152/154/157）（Aho-Corasick；每个值同时匹配其 base64 与 URL 编码形式）；② 模式：`AKIA[0-9A-Z]{16}`、`ghp_[A-Za-z0-9]{36}`、`github_pat_[A-Za-z0-9_]{82}`、`xox[baprs]-[A-Za-z0-9-]+`、`sk-[A-Za-z0-9_-]{20,}`、`-----BEGIN [A-Z ]*PRIVATE KEY-----`、JWT `eyJ[\w-]+\.[\w-]+\.[\w-]+`；**通用 URL userinfo**（ADR-155）`<scheme>://<user>:<secret>@`——任何 scheme 的 URL 中 `:` 与 `@` 之间的 `<secret>` 一律替换（覆盖 `oauth2:glpat-…@`、应用口令等没有固定前缀的内嵌凭据，也兜住 Tower 进程继承用户环境与非 Tower 进程这两类残余）；③ 熵：紧邻 `key|token|secret|password` 的长度 ≥ 20、Shannon 熵 ≥ 4.0 bit/字符的字符串。替换为 `«redacted:<名称或类型>»`。按 ADR-004 的约束，改写 bash 结果的 `content` 时必须同时返回脱敏后的 `structuredContent`，否则退出码丢失、`command_result` Fact 退化；Tower 在运行时检测用户扩展违反此约束并告警 |
| 脱敏（安装器日志尾部 → 模型，ADR-150） | 依赖物化失败时（`10` §10.3.1 步骤 5），注入 Agent 开场简报的安装器失败日志尾部在注入之前经同一脱敏器（精确匹配与模式）处理——安装器以 I 身份运行，日志中可能出现私有 registry 令牌等值；脱敏发生在 Supervisor 中 |
| 脱敏（验证输出 → 模型，R5-D8-02） | 验证器的标准输出在写入验证日志与重放包（`07` §7.4.1）之前、以及返工提示把“输出末尾若干行”经 `prompt` 送给模型（`05`）之前，经同一脱敏器（同一精确匹配集）处理；脱敏发生在 Supervisor 中，不依赖 tower-goal 的 `tool_result` 处理器顺序 |
| 脱敏（UI/Trace） | `tool_execution_update` 的流式部分输出**在改写之前**发出，Tower 在 Engine Host 转发前对其做同样脱敏；Trace 导出、`serve` 模式、通知文本全部经过同一脱敏器 |
| 残余 | Pi 写出的输出文件含原文：bash 截断输出的全文（`pi-bash-*.log`，Pi 在截断时给出它的路径，`core/tools/bash.ts:343`）、MCP 截断结果的全文（模型可见文本超过 20 KB 时写出 `pi-mcp-*.txt`，`extensions/mcp/tools.ts:51, 183-199`）与 MCP 二进制资源（`:70-71`）、codemode 的文本输出溢出文件与图像（`extensions/codemode/execute.ts:340` 为文本 `pi-codemode-*.txt`，`:369` 为图像）。Pi 把它们都写在 `os.tmpdir()`（权限 0600，`utils/output-files.ts:17-27`），即本 Host 的临时目录 `~/.tower/tmp/<hostId>/`（唯一定义 `05` §5.3.6，ADR-224）：三种沙箱都拒绝读写，S2 下 Agent 读不到（第 3 条硬底线，`read` 与 bash 中路径能求出的读取直接 forbid、不出读取凭据卡，其余 bash 读取被 S2 拒绝，§11.3.3 分类的先后，ADR-225）；该目录随 Host 进程退出删除、启动恢复时清理不属于存活 Host 的残留（与本 Host 的 stdio MCP 空目录同一生命周期，§11.3.4 (a)），所以这些文件最迟在 Host 退出时删除，不再留给系统清理；在此之前，观察器把 bash 的全文复制为证据后即删除该文件（`07` §7.2.2，ADR-221/222/224），其余文件在 Host 存活期间留在该目录中；已提交进仓库的密钥会被 Agent 读到（脱敏后进入模型，但文件本身仍在） |
| Diff 中的密钥 | `git.push`/`git.pr`/`git.merge` 前对 Goal diff 运行密钥扫描（规则同上 + gitleaks 规则集）；命中 → 高严重度哨兵，阻止集成 |

---

## 11.8 提示注入威胁模型

**不可信输入来源**：仓库文件（README、注释、测试数据）；`AGENTS.md`/`CLAUDE.md`（Pi 不论信任与否都会加载，`docs/security.md`）；合同上下文中粘贴的 issue/PR 文本；网页与 API 响应；工具输出（测试日志、包安装脚本输出）；依赖源码；MCP 工具结果；base 分支上他人的提交信息；被批准的记忆（若其来源曾接触不可信内容）。

**攻击者目标**：外泄密钥或代码；在用户机器上持久化；对外部系统写入；欺骗人批准（社会工程）；让错误改动通过验收（伪造成功）；毒化后续 Run（写 Agent 配置、提议恶意记忆）。

**设计取向：限制能力，而不是检测注入。** 注入检测器的召回率不足以作为安全边界；Tower 依赖：

1. **能力最小化**：矩阵 + S2 沙箱 + 凭据代理，使被注入的 Agent 能做的事有限。
2. **“致命三要素”警告**（Willison：私有数据 × 不可信内容 × 对外通信；`01` §1.4 #9 规定由 GUI 负责）。合同编辑器在批准前计算三个布尔值，三者同时为真时在“批准”按钮上方显示琥珀色警告，并给出一键收紧选项：

   | 要素 | 判定（全部由 Harness 从合同与项目推导） |
   |---|---|
   | 私有数据 | **实际可读**才算：S2 下，密钥路径表（写允许范围之外的部分；之内名字形如凭据的文件由 Agent 与它运行的程序写入，不计为私有数据，§11.3.1 密钥路径表的作用范围 (ii)，ADR-224；**沙箱外工具不改变这一项**（ADR-226，收窄 ADR-225）：用户扩展与 MCP 服务器以你的权限运行，可能读取本地文件或把真实凭据写进卫星（§11.3.4 路径检查的残余），但 Tower 无法判定它们是否这样做——不按注解分类（§11.3.4），静态清单只有路径、哈希与命令行，没有可核实的能力声明（`05` §5.10）——所以记为“未知”，不计入私有数据，改为显示表下的沙箱外工具风险说明；只有可核实地标明能读取本地文件或用户数据的沙箱外工具才计为真，M1 中没有这样的来源，是否由静态清单提供列为 M2 决定点）、用户主检出与含密钥本地文件的各个副本已被沙箱读拒绝（ADR-082）；**被跟踪的 env 文件**可读，若密钥扫描命中则为真；Project“本地文件”清单中含密钥的条目在 M1 中不播种到验证槽位、检验检出或卫星（ADR-165），因此不再因“Agent 写的测试在槽位中带着这些值运行”计为真；M2 若恢复播种，再按 ADR-078/082 计为真；`secrets.access ∈ {notify, silent}`、或合同为 Agent 声明了可注入的密钥，为真（后一种属于 M2：M1 中 Agent 的工具调用不获得密钥库中的机密，ADR-161）。S0 下，按密钥路径表的显式条目（`~/.ssh/**`、`~/.aws/**` 等绝对条目）判定是否存在且当前用户可读（S0 无法阻止读取，存在即为真；无锚定模式在写允许范围之外处处匹配、无法逐路径扫描，不参与判定，所以实际上几乎恒为真，ADR-225） |
   | 不可信内容 | 合同 `context` 含外部链接/粘贴的 issue 文本；`net.other ∈ {notify, silent}`（`ask` 意味着每次抓取都经人批准，不计入）；用户 Pi 配置了 MCP 服务器（ADR-032）；项目 `untrusted` |
   | 对外通信 | `net.other`、`git.push`、`git.pr`、`external.side_effect` 任一为 `notify`/`silent`（`ask` 不计入：每次都经人批准）；或配置了 MCP 服务器（ADR-032）；或 S2 不可用（出口不受限） |

   **触发率测算**（按判定规则推算，SP7 语料与 E3 现场日志回填实际值）：

   | 场景 | 私有数据 | 不可信内容 | 对外通信 | 警告 |
   |---|---|---|---|---|
   | 标准预设 · S2 · 无 MCP · 无外部上下文（加载用户扩展与否都同此，只多一行风险说明） | 仅当被跟踪的 env 文件密钥扫描命中 | 否 | 否 | **不触发** |
   | 标准预设 · S2 · 合同粘贴了 issue 文本 | 同上 | 是 | 否 | 不触发 |
   | 标准预设 · S2 · 用户配置了 MCP | 同上（MCP 服务器不计入，只显示风险说明） | 是 | 是 | 仅当被跟踪的 env 文件密钥扫描命中 |
   | spike 预设（`net.other = notify`）· S2 | 同上 | 是 | 是 | 仅当被跟踪的 env 文件密钥扫描命中 |
   | 任意预设 · S0（Windows / SP6 失败） | 通常为真（`~/.ssh` 等存在） | 视上 | 是 | 有不可信内容时触发——这是真实风险，警告附带“启用沙箱”而非“忽略” |

   **沙箱外工具风险说明**（唯一定义，ADR-226）：按静态清单（`05` §5.10），本 Goal 会加载任何用户扩展（不论是否注册工具：只注册钩子的扩展同样以你的权限在 Host 中运行）或 MCP 服务器时，合同编辑器在“批准”按钮上方显示一行中性说明（不用琥珀色）`沙箱外工具：<名字>——以你的权限运行，可能读取本地文件或把凭据写进工作目录，Tower 无法判定`。它不是致命三要素警告：不使“批准”不可用、不需要理由、不提供收紧选项、不影响远程 `quick_ratify`（`16` §16.5），也不计入 E3 的触发率与采纳率；清单确认之前与 `riskTier=high` 时这些工具不加载，也就不显示。审批卡上 `tool.external` 的“本 Goal 内同类”选项上方显示同一行，加半句 `授权后该工具的调用不再逐次询问`（只在 §11.3.4 的条件不成立、这一选项提供时，ADR-227）。远程 `quick_ratify` 的卡片是否列出这一行，随 M2 的手机卡片设计决定（`serve` 属 M2）；文案的视觉规格在 `12` §12.12。

   目标：S2 下触发率 ≤ 10% 的合同（E3 记录实际触发率与用户采取收紧选项的比例；若采纳率 < 20% 且触发率 > 10%，判定为滋扰告警并复审规则）。

   收紧选项：把 `net.other` 改为 `forbid`（最常用）、或把 `secrets.access` 改为 `forbid`、或移除外部上下文。人坚持批准时记录 `HumanDecision{kind:"ratify_contract", note:"trifecta acknowledged"}`。**任何合同修订后重算**（唯一定义，ADR-180）：修订（本机或远程）在生效前重算三个布尔值；由不全为真变为同时为真时，本机在“保存修订”上方显示与批准时相同的警告与收紧选项，人坚持保存时 `HumanDecision{kind:"amend_contract"}` 的 `note` 记 “trifecta acknowledged”；远程返回 `E_FORBIDDEN`（“请在桌面上修订”，`16` §16.5）。**运行中因授权凑齐**（ADR-201）：运行时 `Grant` 只能由人在本机的审批卡片上选择“本 Goal 内同类”产生（§11.2），所以在授权生效之前判定——卡片对该选项重算三个布尔值，由不全为真变为同时为真时，在该选项上方显示与批准合同时相同的警告与收紧选项；人坚持时 `HumanDecision{kind:"approve_action"}` 的 `note` 记 “trifecta acknowledged”。不另生成 Needs-You：这条警告就是该 `approval` 条目的一部分，去重与出口定类按 `approval`（`08` §8.4、§8.8）。授权生效后 Goal 能力清单（§11.10）标红，Goal 卡片第 5 行显示 `■ 致命三要素`。**合同之外的重算**（ADR-227）：启动自检由 S2 转为 S0 时（`06` §6.7 结果翻转）重算各 Goal；已批准或运行中的 Goal 由此变为同时为真时同样标红并显示 `■ 致命三要素`，不暂停、不另生成 Needs-You（S0 下首次运行测试与构建另有 ADR-022 的授权卡）。清单确认不是重算时机：不可信内容与对外通信两项按 MCP 服务器是否配置判定，不按是否已确认。
3. **事实来自 Harness（R1）**：Agent 无法写 Fact，因而无法伪造“测试通过”“范围内”。验证器在干净 worktree 重跑（`07`）。
4. **审批卡片的描述由解析器生成**；Agent 的理由显示为 Claim。
5. **跨 Run 持久化路径受保护**：§11.3.3 的 protected 默认值 + §11.8.1 的不变式（M1 不执行项目代码）与信任复核 + 记忆需批准（ADR-011），且记忆提议默认带污染标记（`taint.level`，反向白名单，`09` §9.2.1），批准时显示来源。
6. **Tower 注入的内容在 Trace 中可见**（`00` §0.5），便于事后追查。

### 11.8.1 扩展信任与 Pi 的项目信任

Pi 的项目信任只控制是否加载 `.pi/` 下的设置、扩展、技能、MCP、SYSTEM.md 等，**不限制工具能力**（`docs/security.md`）。信任决策顺序：`--approve/--no-approve` → 扩展 `project_trust` → `~/.pi/agent/trust.json`（按规范化路径）→ `defaultProjectTrust`（RPC/非交互下 `ask` 解析为不信任）。

Tower 的策略：

- **不变式：M1 中 Tower 从不让 Pi 在 Engine Host 中或作为其子进程执行来自项目的代码**（唯一定义，ADR-202；`05` §5.4.1 引用）。做法：Pi 的项目信任在 M1 中**恒为假**，项目的声明性资源由 Tower 以显式入口另行传入（`SYSTEM.md`/`APPEND_SYSTEM.md` 传内容，见下文“传入什么”）。
  - **恒为假的结果**（v1.2.0，`packages/coding-agent/src/`）：
    - SDK 以 `projectTrusted:false` 构造设置管理器，不传 `resolveProjectTrust`（`core/settings-manager.ts:323-335`；不传回调时 Pi 沿用设置管理器的信任状态，`core/resource-loader.ts:520-528`）。M2 的 RPC 恒传 `--no-approve`（`cli/args.ts:243-244`）。
    - Pi 因此不读项目 `settings.json`（`settings-manager.ts:364-366`），其中的 `extensions`、`packages` 与资源路径一概不生效。
    - 不收集项目扩展、技能、提示、主题与祖先 `.agents/skills`（`core/package-manager.ts:2465-2468`、`:2484-2502`、`:2520-2535`）。
    - 拒绝访问项目包的安装位置（`package-manager.ts:1781-1785`），项目包不会被安装或加载。
    - 内置 MCP 扩展只读用户级 `mcp.json`，不读 `.pi/mcp.json`（`extensions/mcp/config.ts:145-149`；信任状态来自 `extensions/mcp/index.ts:1344` → `core/agent-session.ts:3465`）。
    - 不读项目 `SYSTEM.md`、`APPEND_SYSTEM.md`，改读用户级的（`resource-loader.ts:1213-1239`）。
  - **照常加载的**：
    - 用户级扩展与 MCP 按 §11.8.2 加载：不信任时 Pi 照常加载用户与 CLI 扩展（`resource-loader.ts:505-511`），照读用户级 `mcp.json`（`config.ts:147`）。
    - 上下文文件不受信任控制（`resource-loader.ts:232-274`、`:646-653`；名字集合与比较规则见 `16` §16.1.12“上下文文件名与受保护名字”），按下文“上下文文件复核”提示差异。
  - **Pi 的信任不能部分授予，显式入口可以**：
    - 信任是一个布尔值，一次决定全部项目资源（`settings-manager.ts:469-481`，`resource-loader.ts:520-524`）。
    - `extensionsOverride` 在扩展**加载之后**才过滤（`:596`）；`noExtensions` 与 `disabledBuiltinExtensions:["mcp"]` 连用户级扩展与 MCP 一并去掉（`:577-583`）。
    - 不受信任控制的显式入口是 `additionalSkillPaths`、`additionalPromptTemplatePaths`、`additionalThemePaths`、`systemPrompt`、`appendSystemPrompt`，以及 `systemPromptOverride`、`appendSystemPromptOverride`（`resource-loader.ts:276-313`、`:599-676`，`core/skills.ts:482-503`）。RPC 的对应参数为 `--skill`、`--prompt-template`、`--theme`、`--system-prompt`、`--append-system-prompt`（`cli/args.ts:121-125`、`:193-201`）。
    - 经这些入口加载只读取并解析 Markdown 与 JSON（主题见 `modes/interactive/theme/theme.ts:551-555`），不执行代码。技能目录中的脚本只能由 Agent 在沙箱中运行（`00` §0.5.1）。
  - **项目扩展、项目包与项目 MCP 服务器推迟到 M2**：M2 另做显式的批准设计，届时须覆盖它们引用的 `.pi` 之外的代码。在此之前不论 `Project.trust` 与 base 如何，都不加载。
- **信任属于 Project（仓库身份），不属于路径。** 添加项目时，Tower 列出 baseCommit 中发现的受信任保护资源，信任提示分两组显示：
  - **“信任后加载（与 base 相同时）”**：`.pi/skills/`、`.pi/prompts/`、`.pi/themes/`、`.pi/SYSTEM.md`、`.pi/APPEND_SYSTEM.md`、`.agents/skills`。
  - **“M1 中不加载，不论是否信任”**：`.pi/settings.json`（含其中的 `extensions`、`packages`）、`.pi/extensions/`、`.pi/mcp.json`。附一句：“它们会在 Tower 中、沙箱之外以你的权限运行代码”。

  由人决定 `Project.trust = trusted | untrusted`。
- **每个 Run 启动时复核**（决定是否传入上述第一组）：`trusted` 当且仅当 `Project.trust == trusted` **且** Goal worktree 中上述路径相对 baseCommit 无变化（影子上下文中以全新临时索引（初值见 `10` §10.1.2；排除什么按 `10` §10.7.1 第 1 步，含本地文件排除集，ADR-207）快照卫星工作区后取 `git diff --name-status --no-renames <baseCommit> <快照>`，再按 `16` §16.1.12“上下文文件名与受保护名字”的比较规则筛出首个分量为 `.pi`、`.agents` 的路径，结果为空，ADR-204；不用区分大小写的 pathspec；`10` §10.1.2；从不在卫星 `.git` 上运行 git），否则以不信任启动。**`.agents/skills` 的范围与用户在自己的检出中运行 Pi 时相同**（ADR-204）：Pi 从 cwd 向上收集各级 `.agents/skills`，止于最近的含 `.git` 的目录，并排除用户级 `~/.agents/skills`（`core/package-manager.ts:459-491`、`:2464-2468`；用户级目录由 Pi 自己作为用户资源加载，`:2556-2567`；`trust-manager.ts:185-207` 只判定是否需要询问信任）。Run 的 cwd 是主 binding 的卫星根（`05` RunSpec），对应用户检出的仓库根，正是这一范围的终点，所以第一组只含卫星根自己的 `.agents/skills`，它在 base 树中、由上面的差异覆盖。仓库根以上的 `.agents/skills` 不传入：用户自己运行 Pi 时也不加载它们（卫星中没有 `.git`，不能照搬 Pi 在卫星中的收集）。比较范围是整个 `.pi`、`.agents`，含永不加载的第二组：只改了 `.pi/settings.json`、`.pi/extensions/` 或 `.pi/mcp.json` 时第一组也不传入，`◇` 提示列出的是本来就不会加载的文件。这是有意的保守取舍（ADR-203）：比较范围与 `protected`、S2 写拒绝的路径相同，不随 Pi 的发现规则变化，代价只是少传一次声明性资源。
  - **复核为信任时传入什么**（唯一定义，ADR-202；`05` §5.4.1 引用）：Tower 按 Pi 的发现规则（`package-manager.ts:377-567`）从 baseCommit 的树中枚举第一组的文件（`.agents/skills` 的范围见上）。其中的普通文件以上述显式入口传入，符号链接不传入。被忽略的文件不在 base 的树中，因此也不会传入（S0 下同样成立）。
    - `SYSTEM.md`/`APPEND_SYSTEM.md` 传**内容**，不传路径（ADR-203）：Supervisor 从 base 树中读出文件内容，Host 经 `systemPromptOverride`/`appendSystemPromptOverride` 交给 Pi（`resource-loader.ts:311-312`；返回值直接作为系统提示，`:659`、`:671-673`）。没有用 `systemPrompt`/`appendSystemPrompt`：Pi 对它们调用 `resolvePromptInput`，路径存在则读文件，不存在则把字符串本身当作提示文字（`:167-182`）。传路径时文件若在复核与加载之间消失，系统提示会变成路径字符串；传内容时内容若恰好是某个存在的路径，Pi 会读那个文件。
    - 技能只在 `resources.skills` 打开时传入（`05` §5.10）。
    - 项目 `settings.json` 对技能、提示、主题路径的增删与过滤在 M1 中不生效。
  - **不信任启动加载什么**（唯一定义，ADR-201，ADR-202 修订）：第一组一概不传入，也不传入它们在 baseCommit 中的版本。第二组本来就不加载。其余照常（见上文不变式）。
  - **M1 不提供“加载被改动的配置”的选项**：项目 Pi 配置相对 baseCommit 有改动时（不论改动来自 Agent 还是人工编辑检出），M1 的任何 Run 都不传入第一组。能力摘要与 Goal 卡片第 5 行显示 `◇ 项目 Pi 配置已被修改，本 Run 未加载`（列出文件），不生成 Needs-You。
  - **重新加载只有两条途径**：
    - 把这些路径改回 baseCommit 的内容（例如在“我来改”中），下一个 Run 的复核即为信任；
    - 或改动经验收并入 base，之后的 Goal 以新的 baseCommit 照常复核。这些路径默认受保护，验证时按 `07` §7.6.1 `protected_path` 列出，人在验收前可见。
  - 人在 Run 之间确认加载、并把确认绑定到所列文件内容哈希的做法推迟到 M2（ADR-201）。
  - **理由**：Agent 写下的代码不能在下一个 Run 中于宿主进程以用户权限运行、绕过 S2 沙箱。代码可以写在 `.pi/extensions/` 中，也可以写在仓库中被项目设置、`mcp.json` 或项目扩展引用的任何路径中，这些路径 Agent 在 S2 下可写、默认也不受保护。所以 M1 不按“哪些配置文件被改动”去拦，直接不执行项目代码。
- **传递方式**：SDK 适配器以 `SettingsManager.fromStorage(storage, {projectTrusted:false})` 构造设置管理器，不传 `resolveProjectTrust`；第一组经 `createAgentSessionServices` 的 `resourceLoaderOptions` 传入（`core/agent-session-services.ts:44`、`:148-154`）。注意 SDK 默认信任项目文件，必须显式覆盖（ADR-004 决策第 5 点）。M2 的 RPC 适配器恒传 `--no-approve`，第一组用对应的命令行参数传入。M2 须另外处理两点（ADR-203）：`--system-prompt`/`--append-system-prompt` 同样经 `resolvePromptInput`，须传 Tower 自有、Agent 不可写的文件路径；CLI 启动时 `runMigrations(cwd)` 不看信任，会把项目 `.pi/commands` 迁移为 `.pi/prompts`（`main.ts:668`，`migrations.ts:257-263`），即在沙箱外改写卫星的 `.pi`，使下一个 Run 的复核为不信任。SDK 路径不经过它，M1 不受影响。
- **从不写 `~/.pi/agent/trust.json`**：它按规范化路径记录，Tower worktree 路径写进去会让用户自己运行的 `pi` 也信任这些目录。
- **上下文文件复核（R1-D11-06）。** 上下文文件不受 Pi 信任控制、总会加载。每个 Run 启动时在影子上下文中对卫星工作区快照执行 `git diff --name-status --no-renames <baseCommit> <快照>`（快照含未跟踪文件，与上一条复核相同按 `10` §10.7.1 第 1 步排除，本地文件排除集中的上下文文件因此不列出，ADR-207；`--no-renames` 使被改名为上下文文件的文件以新增出现，与 `pinSafetyCheck` 相同），再按 `16` §16.1.12“上下文文件名与受保护名字”的两个模式从结果中筛出上下文文件（ADR-203：不用区分大小写的 pathspec，大小写变体与非 ASCII 等价变体同样筛出）；有差异时，简报中以 Tower 注入的一行（Trace 可见，计入 ADR-009 事件性注入）列出“以下上下文文件相对 base 已被本 Goal 修改：…”，Goal 页显示同样的 Fact；差异来自 Agent（而非人的就地编辑）时另生成 severity 2 哨兵。

### 11.8.2 沙箱外代码：用户扩展与 MCP 服务器（R1-D11-03）

用户级扩展（`~/.pi/agent/extensions`）与 MCP 服务器在 Engine Host 中或作为其子进程，以用户权限、在 S2 之外运行（ADR-004 第 5 点、ADR-032）。决定：

| 措施 | 规则 |
|---|---|
| **首次加载清单确认（静态，不执行扩展或包的代码）** | Engine Host 启动前，Supervisor **只读文件**地计算（唯一的子进程是包管理器的只读全局根查询，与 Pi 自己运行的同一查询，在不引用 Agent 可写位置的同一 Host 包管理器环境中运行，以 60 s 为限、到时终止，出错或超时时不启动 Host，`05` §5.3.6、§5.10，ADR-212/213/215）将要加载的“沙箱外代码”静态清单：按 Pi 的发现规则（用户 agentDir 下的 `extensions/`——与传给 Pi 的 `agentDir` 是同一个值，`05` §5.3.6，ADR-210——用户级 `settings.json` 的 `extensions`/`packages`、命令行 `-e`；M1 中没有项目级的，§11.8.1）解析出的每个扩展入口（包只取已安装且版本与设置相符的，查找顺序同 Pi、含包管理器的全局根，`05` §5.10；列出而未安装或版本不符的单列为“未安装”，Tower 不安装、不加载——Pi 的包自动安装由 Host 环境的 `PI_OFFLINE=1` 关闭，`05` §5.3.6、§5.10，ADR-211）与其目录下全部文件的 SHA-256、`package.json` 的名称与版本；每个 MCP 服务器（`mcp.json` 中的命令行 + 可执行文件哈希；stdio 服务器以 `mcp.json` 中的绝对 `cwd` 或本 Host 的空目录 `~/.tower/mcp-cwd/<hostId>/` 为工作目录启动，工作目录落在 Agent 可写位置或 Tower 的数据目录之下的不启动，`05` §5.3.5，ADR-214/215；可能注册 `/mcp` 命令、取代 Pi 内置 MCP 的扩展单独标出，启用期间 Tower 不能启动运行，ADR-215）。**不加载或探测任何扩展**——加载扩展本身就会执行模块顶层代码与 factory 函数（R2-D11-01）；上述包管理器全局根查询不触及扩展或包的代码。确认后首次真实加载时，Host 记录实际注册的工具、命令与钩子名称，写入审计并在设置页展示（“首次加载后发现的能力”）；之后的加载若注册集合变化，生成 severity 2 提示。清单与上次确认的不同（新增或哈希变化）时，生成一条 Needs-You `approval`（severity 2，用户级、不属于某个 Goal，ADR-034 `owner:global`）：“以下代码将在 Tower 中、沙箱之外、以你的权限运行”；卡片同时写明这些扩展注册的工具与 MCP 工具在 Tower 中每次调用都需要你批准，并标出文本扫描发现的与 Pi 内置工具或 Tower 工具同名的工具（`05` §5.10，`00` §0.5.1，ADR-187）。确认前，相关 Goal 以 `noExtensions:true` 启动，不加载任何扩展与 MCP（不阻塞工作；agentDir 仍是用户 agentDir，`05` §5.10，ADR-212） |
| **高风险 Goal 默认不加载扩展** | `riskTier = high` 的 Goal 默认以 `noExtensions:true` 启动，不加载用户扩展与 MCP（`05` §5.10）；agentDir、凭据与模型配置都是用户 agentDir 中的（唯一定义在 `05` §5.3.6，ADR-208/212；独立的隔离 agentDir 推迟到 M2）；M1 中没有按条目加回的机制（推迟到 M2，ADR-213），要用扩展只能降低 `riskTier`（仅本机，`16` §16.5） |
| 标准 / 低风险 Goal | 加载已确认清单中的扩展与 MCP（保持 Pi “适应你的工作流”的体验，ADR-004 第 5 点） |

残余风险：人确认的是“哪些代码（哈希）”，不是“这些代码会做什么”——与用户自己安装扩展时的信任相同。Host 存活期间新建会话时 Pi 会重新解析包目录；因为 Host 环境不引用 Agent 可写的位置，这时的变化只可能来自你自己的改动（S2 下；S0 见 T23），在下一次 Host 启动前的清单计算中列出并要求确认（`05` §5.10，ADR-213）。用户级扩展或 MCP 服务器若自己执行卫星中的文件（例如运行项目脚本或测试），或已确认的扩展在 Host 进程内改写 `process.env` 或工作目录（例如载入项目的环境文件），Agent 写的代码或配置会经它在沙箱外起作用；静态清单看不出这一点，它属于用户确认的那段代码的行为，不属于 §11.8.1 的项目代码（ADR-202/214）。启动 stdio MCP 服务器的工作目录则由 Tower 选定，不是卫星（`05` §5.3.5，ADR-214），所以包运行器不会在服务器的代码运行之前按卫星中的配置与依赖选择程序；这一点以内置 MCP 生效为前提，注册 `/mcp` 取代它的扩展启用期间 Run 不开始（`05` §5.3.5“内置 MCP 的来源自检”，ADR-215），而扩展不经 `/mcp`、自己启动的子进程（含它自己连接的 MCP 服务器）属于上文“用户确认的那段代码的行为”。RPC 模式下静态解析由 Tower 自己实现 Pi 的发现规则，与用户安装的 `pi` 版本可能不一致；Tower 记录 `pi --version`，不一致时在清单中标注“按 Tower 固定版本的规则解析”。

理由：(1) 用户扩展是用户自己安装、平时在自己的 `pi` 中以同样权限运行的代码，Tower 并未提升其权限；新增的风险是 Tower **无人值守、并行**地运行它们，且提示注入可以驱动它们注册的工具——首次确认把“这些代码会在 Tower 中跑”变成一次显式的人的决定。(2) 在高风险 Goal 上，可用性的代价（少了个人扩展）明显小于沙箱外代码被注入驱动的后果，符合 ADR-019 的风险不对称准则。(3) 每个 Run 实际加载的清单与哈希写入审计（§11.11），事后可追查。需要 `05` §5.10 的 `userExtensions` 开关随之改为“按 riskTier 与清单确认”。

---

## 11.9 `serve` 模式

ADR-013：远程访问需令牌，默认仅回环。监听、令牌存储（`~/.tower/serve/tokens.json`，0600，可逐个吊销）、传递方式（WebSocket 子协议，不放 URL 查询串）、作用域（`read` / `decide` / `full`）、禁止远程的命令、Origin/Host 校验与限流的**机制以 `06` §6.4.7 为准**。本文只规定安全要求：

| 项 | 要求 |
|---|---|
| 绑定 | 默认只监听回环；非回环必须有 TLS，或用户显式确认使用网络层保护（SSH 隧道 / Tailscale）——两者都没有则拒绝启动 |
| 令牌 | ≥ 256 bit 随机；常数时间比较；配对二维码默认签发 `decide` 作用域 |
| TLS | 自签证书时，二维码携带证书指纹供客户端钉扎；推荐覆盖网络而非公网暴露 |
| 浏览器防护 | Host 白名单（防 DNS 重绑定）、Origin 白名单（防跨站 WebSocket 劫持）、CSP 同 §11.10、`X-Frame-Options: DENY` |
| 远程决策约束 | 即使 `full` 作用域，远程端也**不能批准单向门**（只能“拒绝 / 暂停 / 延后到桌面”）、不能验收 `riskTier=high` 的 Goal（theory §C10）；低 / 标准风险的远程验收还须满足 `06` §6.4.7 的全部条件（所有评审单元已在桌面或 Web 上有效评审、无既未 `addressed`（只认 ⚙️ 来源：锚定的 hunk 已变）也未被人关闭的 `requiresChange` 评论（Agent 的引用不算，ADR-176）、`human` 标准已勾选、已验证结果对当前指纹新鲜）；改变安全边界或验收依据的命令（项目信任、自主度授权、设置、导入导出、覆盖哨兵、越过积压上限、降低 `riskTier`、`engine.set_prefs` 的 `adapter`/`checkpoints` 字段、移除 `isSecret` 本地文件，ADR-176；隔离不稳定测试 `test.quarantine`，ADR-178）只能在本机执行；`contract.amend` 与 `project.verify_profile.update` 按字段判定，哪些字段、按什么方向可以远程修改只以 `16` §16.5 的两张逐字段封闭表及其判别原则为准（以缺省值下的判定为基准，可能使失败变通过的都算放宽，ADR-180），未列出的字段一律只能在本机（ADR-178）；修订使致命三要素凑齐时远程返回 `E_FORBIDDEN`（§11.8）；门禁不能关闭（任何入口）；**远程授权的统一有效期（唯一定义，ADR-176/180）**：远程审批只提供“仅这一次”（“本 Goal 内同类”与 M3 的项目级授权只能在本机选择，§11.2，ADR-180/183），因此本规则只适用于经远程连接批准的 S0 执行授权（`grant_s0_exec`）——有效至本 Goal 当前 Run 结束（启动恢复把未结束的 Run 判为结束时同样失效，`06` §6.1.6）；在没有 Run 的阶段（如验证阶段的 `paused(s0_grant_pending)`）批准的，有效至该 Goal 下一个 Run 开始；与 §11.2 的其余失效条件（合同修订、检查点命中 `scope.protected`，ADR-182）取先到者，失效后需要时重新申请（事件型失效记在 `Goal.s0GrantExpiresOn`，取值 `run_end` · `next_run_start`，`02` §2.4，ADR-179/180）——因此 Run 中经远程批准的 S0 授权覆盖不到该 Run 提交后的验证：验证进入 `paused(s0_grant_pending)`，再次批准（本机或远程）后以同一 pin 验证，远程的 S0 授权卡片如实说明这一后果（`04` §4.8.5，ADR-178）；本机批准不受此限；合同批准远程只允许 `quick_ratify`（ADR-051 的四个条件），其余 `contract.ratify` 只在本机。逐命令、逐客户端的矩阵以 `16` §16.5 为准 |
| 审计 | 每个远程连接与命令记入事件日志（`actor = token:<名称>`），见 §11.11 |

---

## 11.10 Electron 加固

| 项 | 设置 |
|---|---|
| 渲染进程 | `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`webSecurity: true`、`allowRunningInsecureContent: false`；启动时 `app.enableSandbox()` |
| preload | 仅通过 `contextBridge` 暴露极小 API：接收 Supervisor 的 `MessagePort`、窗口控制；不暴露 `ipcRenderer` 本身 |
| 协议 | 自定义 `app://` 协议（`protocol.registerSchemesAsPrivileged` standard + secure）加载应用；不用 `file://` |
| CSP | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` |
| 导航 | `will-navigate` 一律阻止；`setWindowOpenHandler` 返回 `deny`，http(s) 链接经确认后 `shell.openExternal`；阻止 `will-attach-webview`；不使用 `<webview>` |
| 权限 | `session.setPermissionRequestHandler` 默认拒绝（摄像头、麦克风、地理位置、MIDI、HID…），仅允许 `notifications`、`clipboard-sanitized-write` |
| 内容 | Agent 输出的 Markdown 不允许原始 HTML、`javascript:` 链接；streamdown 配合 sanitize；静态 HTML 产物只在 `sandbox` 属性的 `<iframe srcdoc>` 中渲染（`gui.md` §4.8） |
| 预览 | dev-server 预览用 `WebContentsView`：独立 partition、`sandbox: true`、无 preload、禁止导航到 `file://` 与 `app://` |
| Fuses（`@electron/fuses`） | `RunAsNode=false`、`EnableNodeOptionsEnvironmentVariable=false`、`EnableNodeCliInspectArguments=false`、`EnableEmbeddedAsarIntegrityValidation=true`、`OnlyLoadAppFromAsar=true`、`EnableCookieEncryption=true`、`GrantFileProtocolExtraPrivileges=false`、`LoadBrowserProcessSpecificV8Snapshot=true`（`gui.md` §2.3） |
| 分发 | macOS 代码签名 + 公证 + hardened runtime；Windows Authenticode；electron-updater 仅 HTTPS 并校验签名 |
| 无远程代码 | 主窗口从不加载远程 URL；不从网络下载并执行 JS（Shiki 语法、主题全部打包） |
| 深链接 | `tower://` 处理器只做导航，任何改变状态的动作都需在应用内确认 |
| utilityProcess | Supervisor 与 Engine Host 拥有完整 Node 能力，是 Pi 扩展代码运行的地方——它们**不在**渲染沙箱内。缓解：每 Goal 一个 Host（崩溃与挂起隔离，ADR-004）、扩展信任策略（§11.8.1）、可选“加固模式”：RPC 适配器以 `sandbox-exec -f <profile> pi --mode rpc …` 启动整个 Pi 进程（S4 的轻量版本，M3） |

**Goal 能力清单**（theory §C15）：Goal 卡片与合同页显示一行由矩阵与沙箱状态推导的能力摘要，例如 `写 src/checkout/** · 网络 注册表 · 推送 需批准 · 密钥 无 · 沙箱 S2`，三要素同时具备时标红。

---

## 11.11 审计日志

审计事件写入 Supervisor 事件日志（`02` §2.13，`source: "harness"|"human"`，类型前缀 `audit.`），因此与 Goal 生命周期同库、同序号。

| 记录内容 | 字段 |
|---|---|
| 每次策略判定 | `toolCallId`、`parentToolCallId`、工具名、规范化输入摘要（脱敏）、`Classification`、级别、依据（矩阵/授权/自适应/硬底线） |
| 审批与授权 | 请求、决定、决定者、耗时、授权匹配器与过期时间 |
| 自主度变化 | 预设选择、矩阵修订（合同版本）、晋升建议、晋升/降级及证据 |
| 沙箱 | 生效策略哈希、违规事件 |
| 密钥 | 访问请求、注入（只记名称与目标进程），扫描命中 |
| 信任与扩展 | 每个 Run 加载的扩展列表（路径 + 内容 SHA-256）、项目信任复核的结果及原因与传入的项目资源文件（§11.8.1） |
| 集成与外部动作 | push/PR/merge 的命令、远端、提交哈希、结果 |
| `serve` | 登录、命令、失败认证 |

**防篡改**（M2，ADR-038；M1 只记录不成链）：每条审计事件携带 `prev_hash = sha256(prev_hash ‖ canonicalJSON(元数据 + payload_hash))`（唯一定义 `06` §6.3 `events` 表，对载荷取哈希，隐私清除后仍可校验，ADR-194），形成哈希链；启动时与每日校验，断链 → 高严重度系统通知。日志不加密（本地单用户），但从不包含密钥值。保留期只按 `16` §16.2.8“审计保留”（永久，隐私清除只删载荷，ADR-195）；可按 Goal 导出 JSONL。UI 中“审计”视图按 Goal 过滤，每条可跳转到 Trace（`piEntryId`）。

---

## 11.12 威胁表

| # | 威胁 | 缓解 | 残余风险 |
|---|---|---|---|
| T1 | 仓库/网页中的提示注入使 Agent 读取密钥并用 `curl` 外泄 | 宿主环境白名单；密钥路径读拒绝；S2 网络出口白名单；`net.other` 默认 ask；tool_result 脱敏 | **中**：通过允许域外泄（如向 github.com 创建 gist 需要凭据，已被代理；但对允许域的匿名 POST 仍可能）；DNS 外泄。可将注册表域限制为只读代理（M3） |
| T2 | Agent 修改测试使其通过 | `allowTestEdits` + protected 快照；测试完整性哨兵（`07`）；Verified 在干净 worktree 重跑 | **中低**：在非测试的辅助文件中削弱断言、修改 fixture；依赖人评审高风险单元 |
| T3 | Agent 写 worktree 外（`~/.zshrc`、`file://` 地址、其他仓库） | S2 写允许列表在访问时强制：bash 在 S2 中运行，文件工具的每次文件操作也在 S2 中执行（§11.3.1 使用时强制，ADR-220），分类之后被换掉的符号链接与路径分量不能把写入带出允许范围；硬底线；S1 的路径分类（求法同 Pi，ADR-219）只决定审批分级 | **低**（S2；以路径表达的读写拒绝依赖 S2 拒绝创建硬链接，§11.6.2 硬链接一行，SP6a A3 与启动自检探测，平台不能保证时本机不使用 S2；沙箱之外建立的硬链接——T16 一类的沙箱外代码或人自己——不在这一条之内，ADR-223）；**高**（S0，含 Windows v1：只有策略层，ADR-018；文件工具的分类与访问之间的窗口——同一批并行调用中的 bash 或后台进程改变路径分量——不被封闭，ADR-220） |
| T4 | Agent 为后续 Run 植入指令或代码（`AGENTS.md`、`.pi/extensions/*`、`.agents/skills/*`，或项目设置、`mcp.json`、项目扩展引用的仓库中任意路径） | **代码**：M1 中 Pi 的项目信任恒为假，项目扩展、项目包与项目 MCP 服务器不论 base 如何都不加载（§11.8.1，ADR-202），Agent 写下的代码不会在后续 Run 中于宿主内或沙箱外执行（S0 下 Agent 的代码本来就以用户权限运行，见 T23）：用户级 stdio MCP 服务器不以卫星为工作目录启动（`mcp.json` 中的绝对 `cwd`，或每个 Host 进程一个空目录 `~/.tower/mcp-cwd/<hostId>/`，Host 启动前新建为空、退出后删除，§11.3.4，ADR-216），包运行器不读卫星中的项目配置与本地依赖（`05` §5.3.5，ADR-214；内置 MCP 被扩展取代时 Run 不开始，ADR-215）。**指令**：技能、提示、主题、`SYSTEM.md` 只在与 baseCommit 相同时由 Tower 以显式入口传入，只取 base 树中的普通文件；默认 protected；S2 写拒绝；上下文文件复核（后三者对上下文文件都按 `16` §16.1.12 的名字集合与比较规则识别，大小写变体同样命中，ADR-203） | **低**：上下文文件被改动或新建后仍会加载，只有简报提示与哨兵（§11.8.1）；S0 下 Agent 新建的、被 git 忽略的上下文文件（如被忽略的 `AGENTS.override.md`）不进入两种复核、`protected_path` 与指令文件标记（快照遵守忽略规则，`10` §10.1.2），归 T23（ADR-205）；本地文件清单中的上下文文件按路径排除，同样不进入两种复核与 `protected_path`（`10` §10.7.1 第 1 步），S2 下 Agent 对它的修改由写拒绝与 `edit.protected` 询问覆盖，S0 归 T23（ADR-207）；base 中未改动的技能可以指示 Agent 运行仓库中已被改动的脚本，但只在沙箱内运行。经用户级扩展或 MCP 服务器执行卫星文件的路径归 T16 |
| T5 | 通过 git 配置或 hooks 持久化，在用户主检出中执行代码；或 Agent 向用户仓库推送 | ADR-060/073/074：用户仓库与 `commonDir` 对 Agent 读写均拒绝（ADR-082）；卫星没有远端、Agent 侧 push/PR 一律 forbid（§11.2）；卫星 gitdir 在工作目录之外、沙箱外不可发现（ADR-081/089），人用人工编辑检出而不打开卫星；Tower 写进用户仓库的只有集成时从影子取来的 seal 分支（先对象后 ref，快进以 CAS；M1 不签名、不生成撤销分支）与按条件的 CAS 删除（`10` §10.6、§10.3.2，ADR-193） | **低**（S2）；**高**（S0：Agent 进程可直接写用户仓库，例如 `git push <用户仓库路径>`；门禁按路径识别此命令为写硬底线并 forbid，但混淆命令只能事后发现） |
| T6 | 新依赖为 typosquat / 恶意 `postinstall` | `dep.add` 默认 ask；审批卡片显示包元数据（发布时间、周下载、维护者数、是否有安装脚本、与热门包名的编辑距离 ≤ 2 警告）；锁文件哨兵（新包、完整性哈希变化、`resolved` 指向非注册表主机）；Agent 侧安装在 S2 中运行；验证器侧安装器的拉取阶段不执行任何代码（git 托管依赖在 M1 按“生态未支持”处理），第三方构建脚本只在**不带令牌、断网、只写暂存目录**的安装阶段运行（ADR-085/092，`07` §7.4.3） | **中**：人批准了恶意包后，其代码在测试时于沙箱内运行，仍可读 worktree 并经允许域外泄；不再能在安装器中读到注册表令牌 |
| T7 | 缓存或验证器存储投毒，影响其他 Goal、验证器或用户自己的构建；Agent 改项目生命周期脚本、`.pnpmfile.cjs`、补丁或 overrides 以篡改槽位中的测试运行器或预写他人的 depcache 条目（R6-D7-01/02） | ADR-021：Tower 私有存储，用户全局缓存不可写；每个 Goal 的 Agent 存储独立；验证器存储对 Agent 读写均拒绝；**安装器的安装阶段只写本次运行的新暂存目录**，`$VS` 其余只读、`$TI` 读写拒绝，由 Supervisor 在沙箱外校验后原子发布，depcache 来源记在 Tower 数据库（ADR-092）；共享的安装输入（`$VS/pnpm-store`、npm 缓存、`$VS/xdg`、`$SH` 中的浏览器与 node-gyp 头文件）在安装阶段**只读**，pnpm 的副作用缓存关闭（`side-effects-cache=false`），构建产物只写进暂存目录——一次安装中运行的第三方脚本无法影响其他 `depsKey` 的安装（R7-D7-02，`16` §16.8.1 按阶段逐行列出）；内容哈希复核不符或无来源记录 → `anomaly{detector:"verifier_store_tampered"}`（`07` §7.4.3）；项目生命周期脚本、`.pnpmfile.cjs`、补丁与 overrides 类键默认 protected（§11.3.3），修改 → `lifecycle_script_changed`；运行器完整性以注册表 tarball 为基准（`runner_tampered`），被补丁或改向 → `runner_patched`（ADR-092）；验证槽位只用 CoW 物化、禁止硬链接；安装阶段的沙箱同样拒绝创建硬链接与钥匙串查找（§11.6.2 钥匙串一行的清单，ADR-224），只读的共享输入不能经另一个名字被改写；不共享 sccache | **低**（S2 且未加载沙箱外工具）；**中**（S2 但加载了用户扩展或 MCP 服务器——是否写文件系统 Tower 无法判定，按能写计，ADR-226；§11.3.4 只能拦截参数中显式出现的路径）；**高**（S0：此时“已验证”带“S0 环境”限定标记，ADR-021） |
| T8 | 混淆命令绕过分类器（`base64 -d \| sh`） | 解析为 `opaque` → 无沙箱时 ask；有沙箱时边界兜底；检查点 diff 事后检测 | **中低**：沙箱内、允许域内的副作用 |
| T9 | Agent 社会工程审批（误导性的 `ask_user` 文本或理由） | 审批描述由解析器生成（Fact），理由显示为 Claim；单向门双确认；默认超时拒绝 | **中**：人的自满（E1 度量）；审批疲劳 |
| T10 | 审批疲劳导致“盲批” | ADR-010；沙箱降低 ask 数；授权；自适应晋升；度量批准率与响应时间——授权与自适应晋升对加载了 MCP 的 Goal 上的 `tool.external` 都不可用，这一类单独度量并有复审线（§11.3.4 代价，`14` E3，ADR-228） | **中**：作为产品指标持续监控（`14`） |
| T11 | 密钥随 diff 推送到远端 | 集成前密钥扫描阻止；`git.push` 由 Tower 代理执行 | **低**：新格式密钥漏检 |
| T12 | 密钥出现在 Trace、UI、导出、通知中 | tool_result 改写（`content`、`structuredContent` 与 `details`，ADR-239）+ 流式部分输出脱敏 + 导出/通知统一脱敏 | **低中**：截断全文件、Pi JSONL 中改写之前不存在的路径（若某扩展绕过 tool_result） |
| T13 | `serve` 被远程攻击 | 默认回环；令牌；非回环须 TLS 或用户显式确认网络层保护（§11.9，ADR-194）；作用域；远程不能批准单向门 | **中**：配对设备被盗 |
| T14 | 本机网页对 `serve` 发起 DNS 重绑定 / 跨站 WebSocket | Host 与 Origin 校验；令牌不在 URL | **低** |
| T15 | 渲染 Agent 输出导致 XSS / 远程代码执行 | 渲染沙箱、CSP、Markdown 净化、无 nodeIntegration | **低** |
| T16 | 恶意或被注入驱动的沙箱外代码与沙箱外执行路径（ADR-066）：用户扩展及其 `pi.exec`、MCP 服务器、用户 bash（`!cmd`、RPC 的 `bash` 命令）；项目扩展、项目包与项目 MCP 服务器在 M1 中不加载（§11.8.1，ADR-202），不在此列 | **用户 bash**：tower-goal 注册 `user_bash` 处理器，S2 下返回与 Agent bash 相同的沙箱化 `operations`（Pi 的现成钩子，`types.ts` L1465–1475；RPC 的 `bash` 命令同样遵守，R4-D2-03）——人通过 Pi 输入的命令也在沙箱内运行；人在自己的终端中运行的命令不受影响。**扩展与 MCP 子进程**：环境中 `GIT_CEILING_DIRECTORIES=<全部 wtRoot>`、不含 `GIT_DIR`，卫星工作目录中又没有 `.git`，它们对卫星运行 `git status` 只得到“不是 git 仓库”，不读取任何 Agent 可控的 git 元数据（ADR-081）；`GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n`（`core.fsmonitor=false`、`core.hooksPath=<Tower 空目录>`）保留为纵深防御（ADR-072）；SDK 下 MCP 按服务器构建环境（T28），stdio 服务器的工作目录不是卫星（`mcp.json` 中的绝对 `cwd`，或本 Host 的空目录 `~/.tower/mcp-cwd/<hostId>/`），工作目录落在 Agent 可写位置或 Tower 的数据目录之下的不启动（`05` §5.3.5，ADR-214；RPC（M2）随 M2 复审）；以上都以内置 MCP 生效为前提，注册 `/mcp` 取代它的扩展启用期间 Run 不开始（`05` §5.3.5，ADR-215）。项目资源：Pi 的项目信任恒为假，只有声明性资源按 Project + 每 Run 复核后以显式路径传入；用户扩展与 MCP 首次加载清单确认、哈希变化再确认；Pi 不在 Tower 中安装或更新包（Host 环境 `PI_OFFLINE=1`），MCP 配置与凭据取用户 agentDir（`PI_CODING_AGENT_DIR`），二者都在 `05` §5.3.6 唯一定义（ADR-211/212）；高风险 Goal 默认不加载扩展与 MCP（`noExtensions:true`）；每 Goal 独立 Host；清单入审计（§11.8.2）；沙箱外工具的调用按来源一律归 `tool.external`，每次 ask 或经按工具名的 Goal 级授权放行——它不是单向门，取舍与已知限制见 §11.3.4（ADR-186）；不可信内容与对外通信都为真时不提供这一授权（§11.3.4，ADR-227），所以致命三要素警告不覆盖的“由沙箱外工具提供的私有数据”一面，由逐次 ask 承担（`01` §1.4 #9） | **中**（标准 Goal：已确认的扩展仍以用户权限运行，这是 Pi 的设计，`docs/security.md`；它们若自己执行卫星中的文件，例如运行项目脚本或测试，Agent 写的代码会经它们在沙箱外运行，静态清单看不出来，§11.8.2 残余）；**低**（高风险 Goal 默认隔离）；S0 下 Agent 能在卫星中放置 `.git`，扩展的 git 进程可能在下一次扫描前发现它（T29） |
| T17 | Tower 更新通道被劫持 | 签名、公证、更新签名校验、ASAR 完整性 fuse | **低** |
| T18 | Agent 破坏性 git 操作（强推、删远端分支） | 卫星没有远端（ADR-074）；Agent 侧 `git.push`/`git.pr` 在所有预设下 forbid（§11.2）；凭据不可达（§11.6.4）；Agent 在卫星内的任何 ref 操作只影响卫星，检查点在影子中 | **低**；钥匙串令牌路径待 SP6a 验证 |
| T19 | Agent 把密钥写进发给模型的消息 | 密钥永不进上下文；读取结果脱敏 | **低**：仓库内已提交的、不符合任何模式的密钥 |
| T20 | 资源耗尽（fork 炸弹、写满磁盘、超大内存） | bash 超时、进程树内存预算、磁盘预算（`10` §10.4.4、`13`） | **中**：在预算触发前机器已变慢 |
| T21 | 跨 Goal 干扰（Goal A 写 Goal B 的 worktree） | S2 写允许只含本 Goal worktree；路径守卫 | **低** |
| T22 | 记忆投毒 | 记忆需人批准（ADR-011）；按 `09` 修订，记忆提议**默认带污染**（`taint.level ∈ {standard, high}`；反向白名单：只有完全来自人类原话与 Harness 事实的提议才是 `none`，`09` §9.2.1），`standard` 须逐条确认、`high` 须编辑或逐字确认，只有 `none` 可批量批准；注入内容在 Trace 可见；仓库约定优先于个人记忆（ADR-035） | **中**：人的批准是唯一屏障，而批准疲劳是已知问题（ADR-010，`09` §9.2.1）；残余来自人确认了一条看似无害、实为指令的记忆 |
| T23 | S0 下运行测试/构建即执行 Agent 写的任意代码（R1-D11-01） | ADR-022：S0 下每个 Goal 首次运行需人授权，授权在合同或测试配置变化时失效；能力摘要显示“S0”；验证器同样受此授权约束 | **高**（授权后代码以用户权限运行，无边界）；S2 下不适用 |
| T24 | 本地明文数据暴露（`~/.tower` 中的 Pi JSONL、事件库、日志，`.tower-wt.noindex` 中的 worktree）：笔记本丢失、备份泄露、云同步 | 目录权限 0700 / 文件 0600（`06`）；已知模式密钥脱敏（§11.7）；`.tower-wt.noindex` 与 `~/.tower` 中可重建的目录排除系统备份（人工编辑检出与检验检出随 `<wtRoot>` 一并排除，其中人的改动不一定可重建：被保留的这两类目录在清除结果中注明，`09` §9.12.4，ADR-197），worktree 根目录名带 `.noindex` 而不被 Spotlight 索引（`06` §6.6.1“备份排除”、`10` §10.4.3）；**事件库、Goal 数据（含 Pi 会话与影子中的代码）与数据库备份默认保留在系统备份中**（它们是恢复所需的数据），设置项“从系统备份中排除对话数据”可把会话排除；云同步目录强制回退（`10` §10.4.3）；依赖 FileVault 等全盘加密（设置页检测并提示未开启）；v1 不做应用层静态加密 | **中**：未开启全盘加密的机器；系统备份未加密时，备份中含完整对话与代码，且隐私清除不触及已有的系统备份（`09` §9.12.4，ADR-195）；不符合任何模式的敏感内容 |
| T25 | Scratch 写入用户真实检出（ADR-012 约束被绕过） | Scratch 的 cwd 是检出的临时副本；S2 策略对真实检出路径读允许、写拒绝；S0 下文件工具对检出路径为硬底线、bash 无法证明不写检出时一律 ask（§11.6.5） | **低**（S2）；**中**（S0：bash 混淆写入只能事后发现）。**读取的残余**（ADR-178）：S2 下真实检出读允许，其中被忽略的文件与未跟踪且未被忽略的文件（副本只复制已跟踪文件，§11.6.5，但真实检出中这两类都在原处），只要未列入“本地文件”清单、名字也不匹配 `isSecret` 模式（例如命名不规则的凭据文件），Agent 仍能读到（ADR-181 补全）；缓解只有添加项目时的本地文件扫描与 §11.6.5 的名字模式，有意保留 |
| T26 | Agent 破坏或篡改用户仓库、镜像或影子中的对象与 refs，造成用户数据丢失、用户 git 命令报错，或影响验证器读到的 pin | ADR-060/073：用户仓库对 Agent 只读（S2；文件工具的访问同样在 S2 中执行，§11.3.1，ADR-220）；镜像与影子对 Agent 不可读写；用户仓库只在集成时接收从影子取来的 seal（先对象后 ref，快进以 CAS），删除只有按条件的 CAS 删除（`10` §10.3.2）；验证槽位从影子检出 pin（`slot-<k>.git`，alternates → 影子与镜像，`07` §7.4.2），检出前 `fsck --connectivity-only`；沙箱外工具的路径检查（§11.3.4） | **低**（S2 且未加载沙箱外工具）；**中**（加载了用户扩展或 MCP 服务器——是否写文件系统 Tower 无法判定，按能写计，ADR-226）；**高**（S0） |
| T27 | RPC 适配器下门禁可被后续扩展处理器绕过：修改已批准输入、block 后泄漏批准记录、整体替换 `tool_result` 的内容与 `details`（抹掉脱敏）、同名 `bash` 覆盖沙箱（R2-D5-03） | ADR-065（取代 ADR-046 的冻结）：不冻结输入；`tool_result` 哈希比对（事后发现）；Supervisor 在转发前再脱敏；RPC 只在用户扩展集合不含 `tool_call`/`tool_result` 处理器、也不覆盖 `bash` 时可用（静态清单 + 启动自检，每次 `tool_call` 用 `getAllTools()` 复核 bash 来源），否则必须用 SDK（§11.4） | **中**：适用范围排除了拦截型扩展，但扩展仍可在自己的工具中执行任意动作（同 T16） |
| T28 | 透传到 Engine Host 的云 SDK 凭据（ADR-049）被 Host 派生的 MCP 服务器或用户扩展子进程继承，经提示注入驱动的工具外泄或滥用 | **SDK 适配器**：Tower 向 `createMcpExtension()` 传入自己的 `createTransport`，`inheritEnv:false`，环境 = `mcpBaseEnv`（只按 `05` §5.3.5）+ `mcp.json` 的 `env` 声明，不含云凭据（M1 中没有显式授予，ADR-166）（§11.7，`05` §5.3.5，C21）；凭据透传需用户在首次运行时逐项确认；清单确认卡片列出每个服务器可读取的凭据；高风险 Goal 默认不加载 MCP 与用户扩展（`noExtensions:true`，§11.8.2） | **中**（SDK）：用户扩展自行启动的子进程仍继承全部 Host 环境。**中高**（RPC，R5-D5-02）：MCP stdio 服务器由 `pi` 进程以 `inheritEnv` 启动，继承 Host 全量环境（含透传的云凭据），Tower 无法按服务器裁剪——RPC（M2）下建议不透传云凭据或对使用 MCP 的 Goal 关闭扩展。被透传的长期云凭据权限往往很大（建议用户改用短期、最小权限的 profile） |
| T29 | git 元数据逃逸与 Tower 文件操作劫持：Agent 在卫星或**嵌套仓库/子模块**中植入 `core.fsmonitor`、`filter.<x>.clean`、`core.sshCommand`、hooks，写入**重定向文件**（`commondir`、`worktrees/*/{commondir,gitdir}`、`.git` 指针、alternates）或伪造 index，诱使 Tower、扩展的 `pi.exec`、MCP git 服务器或用户的 IDE 在沙箱外执行命令，或得到与磁盘不符的树；或把 gitdir / 工作区中的路径换成符号链接、FIFO，使 Tower 的原始文件操作写到别处或阻塞（R3-D11-01、R4-D11-01/02、R5-D11-01、R6-D11-01） | **沙箱外不可发现**：卫星工作目录中没有 `.git`，S2 拒绝在其中任意深度创建 `.git`（ADR-081/089），Host 及其派生进程 `GIT_CEILING_DIRECTORIES=<全部 wtRoot>`（realpath，`10` §10.1.2）；**所有沙箱外 git 环境注入 `safe.bareRepository=explicit`**，**`pinSafetyCheck(baseTree, pinTree)`**（ADR-109/111/112）：只看 tree 对象；候选目录（base 或 pin 中直接含名字（按 `10` §10.1.2 的名字比较规则（ADR-120））为 `head`/`commondir`/`gitdir` 的条目的目录）之内或本身的任何增删改记 `nested_repo`（ADR-111），仓库根本身也是候选目录；pin 中**全部**符号链接在 pin tree 内整链解析，终点为绝对路径或越出仓库根、经过 tree 中不存在的分量或 `.git` 分量、成环，均记 `symlink_escape`（ADR-112/116），均为 severity 3、不排除只阻断、`verify()` 第一步并在验收与 seal 时复核，覆盖绑定 `(detector, 路径, 对象哈希)`、seal 写 `Tower-Override: <detector> <路径>@<哈希>`；两种检出不写出未覆盖的命中目录（含被改动的 base 夹具）与依赖目录中经名字扫描命中的仓库形态目录，已覆盖的目录按白名单写出（只有 `objects/**`、`refs/**`、`packed-refs` 为 pin 版本，其余为 base 版本，ADR-124，`10` §10.1.2），未改动的 base 夹具照常写出；名字比较按 `10` §10.1.2 的名字比较规则（ADR-120），覆盖 HFS+ 忽略的码位；集成前评审单列“修改了仓库形态目录中的文件”——gitdir 因此只被沙箱内的 git 读取，**整体归 Agent**（ADR-089 取消写入白名单与控制文件校验，`git_control_tampered` 退役）；人工交接用 Tower 新建元数据的人工编辑检出（`10` §10.8.4）；**Tower 文件操作防劫持**：对卫星与 gitdir 只做创建、整体删除、整体重建，逐级 `openat`+`O_NOFOLLOW`、只接受普通文件与目录、带大小上限与超时、旁路构造后 `rename` 替换；读取 gitdir（卫星 HEAD、提交信息）由 Tower 自行只读解析普通文件，不在卫星 gitdir 上运行 git（ADR-100）；回退与 rebase 中卫星的 git 状态由 Agent 档位内的 git 调整（`10` §10.1.3、§10.8.1）；Tower 只在影子上下文中操作工作区（`10` §10.1.2）；**gitlink 永不进入影子索引**（ADR-071）；仓库形态条目与逃出仓库的符号链接由 `pinSafetyCheck` 判定、不排除只阻断（ADR-109），卫星侧两步识别只作运行中提示；子模块在 M1 排除；**GitRunner 运行在只允许执行 git（及 LFS 项目的 git-lfs）的 OS 沙箱中，写范围限定为本次操作所需目录**；策略路径 realpath 规范化（§11.6.2）；Host 侧 `GIT_CONFIG_*` 注入保留（ADR-072）；决定性指纹用 Tower 自有索引 + ctime/inode stat 检查（ADR-075）；SP6b G1–G37 在每个支持的 git 版本上回归（G10 重定向 + 沙箱外 git；G21–G23 符号链接 ref、FIFO `HEAD`、交还路径符号链接；G24 常用 git 操作全集；G26 任意深度 `.git` 创建被拒（按平台分列：G26 macOS、G26L Linux M2）；G26c 运行中出现 `.git` 等价条目（`nested_repo_live`）与 git 拒绝收录（`excludedPaths`）；G27 裸仓库布局；G28 提交对象自行解析） | **低**（S2）：残余为 (a) **`.git` 名字的 watcher 发现窗口，按平台分级（ADR-131）**——**macOS（M1）低**：S2 按名字拒绝 ASCII 大小写变体，残余只是非 ASCII 等价变体（默认可忽略码位、NFKC 等价）的窗口；**Linux（M2）中**：S2 无法按名字拒绝，残余是全部 `.git` 名字的窗口。两者都由沙箱外 watcher（新建目录先加监视、再扫描）在 ≤ 2 s 内发现（监视降级时改为每个检查点前的名字全量，窗口变为至多一个回合，`13` §13.11.1），`running` 中命中即 abort 并暂停 Run（`nested_repo_live`，不可覆盖）；窗口内沙箱外进程仍有 `GIT_CEILING_DIRECTORIES` 与 `safe.bareRepository=explicit`，影子与 GitRunner 拒绝收录它们（被拒路径记 `excludedPaths`，存在即阻断 Verified）。**M2 决定点**：Linux 上是否引入按名字的强制手段（例如文件访问预检或挂载命名空间约束），在 Linux S2 立项时依据 G26L 的结果决定，未决定前 Linux 评级保持“中”；(b) git 自身解析 Agent 构造的对象或属性文件时的未知缺陷；(c) 策略生成器的路径规范化缺陷（由 A10 的真实拒绝探测兜底）。**高**（S0，ADR-089 第 2 点）：`.git` 创建禁令无法强制；Agent 可在工作目录中放置 `.git`（含 `commondir` 重定向）——沙箱外的扩展 git 在 watcher 发现之前可能使用它；发现即暂停 Run（`nested_repo_live`），随后 pin 的 `pinSafetyCheck` 阻断，该路径不写出到两种检出；GitRunner 也没有 OS 沙箱层（ADR-071）。Tower 文件操作防劫持在 S0 下同样有效 |
| T30 | 经企业上游代理（`parentProxy`）的请求跳过沙箱代理对已解析地址的检查，Agent 可借此访问回环、链路本地或本机 IP 上的服务（ADR-079） | 只在配置了上游代理时出现；允许域列表仍在沙箱代理中执行；回环等地址的防护交给企业代理；`localhost` 测试服务只在 Goal 端口段内（`10` §10.19） | **中** |
| T31 | 人工检验与交接路径上在沙箱外执行 Agent 代码（R5-D8-01、R6-D8-01）：检验检出中 Agent 写的生命周期脚本与服务；人在外部终端中运行 Agent 写的应用并带着真实本地密钥；人在人工编辑检出中自行运行 Agent 可能改过的准备脚本（M1 不提供沙箱内的准备命令，`10` §10.8.4 第 2 步，ADR-210）；**人选择带上本地机密文件的检验检出**（ADR-166：Tower 启动的脚本与服务也会读到这些文件）；**IDE 打开检验检出或人工编辑检出即执行其中 Agent 可控的配置与依赖**；符号链接使编辑器写到目录之外；检验服务与 Agent 的端口相撞 | 检验检出由 Tower 执行的部分使用验证器 S2 档位与 `VerifyProfile.env.network`；S0 未授权时只复制文件（ADR-082）；两种检出打开前都有信任提示（含机密的本地文件默认不带上，带上需人显式打开开关并记 `HumanDecision{inspect_with_secrets}`，仅本机，ADR-166；IDE 自动执行与受限模式建议、外部符号链接列表、“以下目录未复制：可被 git 识别为仓库”，ADR-094/101）；两种检出由影子树物化（被跟踪与未被忽略的内容，依赖由 depcache 物化或安装器在后台重建），`pinSafetyCheck` 命中的目录与符号链接不写入，未改动的 base 夹具照常写出（ADR-109）；两种检出的终端注入 `safe.bareRepository=explicit`，但 IDE 自带的 git 不受 Tower 环境控制（提示建议在全局配置中启用同一设置）；外部终端为白名单环境，不含 Host 凭据、Agent 环境、`$TI` 与模型凭据；检验专用端口段；人工编辑检出的 git 元数据全部来自 Tower；交还写回不跟随符号链接（`10` §10.1.3、§10.8.3–10.8.4，§11.6.3） | **中**：带上机密文件的检验检出是**人发起的**例外，运行期间 Agent 写的代码与同一用户的其他进程可能读到这些文件，等同于人在自己机器上运行该分支（ADR-166）。IDE 与人在自己终端中运行的命令按设计不受沙箱限制，用户常已信任父目录使受限模式不生效——这与人在自己机器上打开任何 PR 分支相同，Tower 只能提示（ADR-094）。另：两种检出中的依赖目录来自 depcache 或安装器，物化后做与 `pinSafetyCheck` 相同的名字扫描，命中的仓库形态目录不写出并在信任提示中列出（ADR-116，取代此前的“不处理”）；名字比较按 `10` §10.1.2 的名字比较规则（ADR-120），覆盖 HFS+ 忽略的码位。覆盖过的 `nested_repo` 目录在检出中**按白名单写出**——只有 `objects/**`（不含 `objects/info/**`）、`refs/**`、`packed-refs` 写出 pin 版本，其余一律写出 base 版本或不写出（ADR-124），因此覆盖不会把 Agent 改过的 git 配置带进人的 IDE；base 中原本就不安全、解析未变的符号链接按 base 豁免照常写出并在提示中列出（ADR-124）；残余：覆盖对话框中人仍可能误读 Fact，pin/seal 中的 Agent 版本在集成后进入用户主检出——这是人的显式决定，seal 以 `Tower-Override` 记录 |
| T32 | 含密钥本地文件的值经 Agent 写的测试输出回流到模型（R5-D8-02） | **M1**（ADR-165）：含机密的本地文件不播种到验证槽位、检验检出或卫星，Agent 写的测试接触不到这些值；依赖它们的检查写为 human 标准；`mark_secret` 之前已播种的副本按 `16` `ProjectLocalFile` 行删除（ADR-176）。另外，文件对 Agent 读拒绝（逐路径，ADR-082）；值进入脱敏器精确匹配集（含 base64/URL 编码形式）。**M2** 若恢复播种：脱敏覆盖 `tool_result`、返工提示、验证日志与重放包，三要素按“私有数据为真”计 | **M1：低**（没有自动播种路径；普通文件在被人标记为机密之前已播种的副本，标记时从活跃卫星与人工编辑检出中删除、当前内容加入精确匹配集，但 Agent 在标记前可能已经读到过，确认文案如实说明，ADR-176）。M2 恢复播种时为**中**：测试可以变形后输出（截断、逐字符、哈希前缀），精确匹配无法覆盖。S0 下用户检出中的原件本身可读（高） |
| T33 | 同一用户的进程信息（命令行参数、环境）被并行的 Agent 观察（R29-D11-01）：Agent 列出进程是普通动作；git 会把远端 URL（含用户写在其中的凭据）放进传输辅助进程的参数；macOS 上 Seatbelt 无法阻止这种观察（ADR-158） | **按 §11.7.0 的投递表**（ADR-159）：Tower 不把机密放进**长生命周期**进程的参数或环境。<br>• 模型密钥只在 Host 内存中；<br>• 云 SDK 的机密只以文件路径传入 Host（原始变量写入即时投递文件；非机密的配套与配置变量原样传入，§11.7.1，ADR-228）；<br>• macOS 上，URL 或 git 配置中带凭据的远端不执行网络命令（`10` §10.1.2）。<br>• 残余（ADR-177 登记）：用户代理变量（`HTTPS_PROXY` 等）中若写有 Basic 凭据，会随继承进入 Host（Tower 自身进程）的环境，同一用户的进程可以观察到；Tower 不改写它，设置页检测到这种形态时提示改用不带凭据的代理配置。<br>M1 中 Tower 不会自动向 Agent 可影响的进程投递机密（ADR-164/167），唯一的例外由人发起（`inspect_with_secrets`，T31）：验证标准不能声明机密，`secrets.access` 归 M2；T33b 只适用于 M2。Linux S2（M2）以 `--unshare-pid` 隔离；M2 决定点：以专用系统用户运行 Agent。§11.7 的通用 URL userinfo 模式与精确匹配继续脱敏工具结果与日志。SP6a A12(a) 测量各 macOS 版本的行为 | **macOS S2：中**——残余是：<br>• 用户配置的 MCP 服务器环境（`mcp.json` 的 `env`，Tower 不改动；设置页对符合机密模式的值给出提示）；<br>• 用户自己的其他进程。<br>M1 中 Tower 不会自动向 Agent 可影响的进程投递机密（ADR-164/167）；人发起的 `inspect_with_secrets` 按 T31 登记。脱敏挡不住经允许域外传或改变编码后的值。**Linux S2（M2）：低**。**S0：高** |
| T33b | **M1 不适用**（ADR-164/167）：M1 中 Tower 不会自动向 Agent 可影响的进程投递机密——验证标准不能声明机密，`secrets.access` 归 M2。**M2**：验证器标准的 `env` 机密在机密阶段运行期间位于验证进程的环境中，同一用户的其他进程可能读到 | M2 的设计起点见 §11.7.0a：“Agent 活动”按原则定义；机密阶段只在没有 Agent 活动时开始，独占验证器、冻结准入、先准备后注入、结束时终止槽位进程；可选 `secretsVia: "file"`；精确匹配脱敏 | **M1：不适用**。M2（macOS S2）：互斥开启时为低，关闭或“接受风险”时为中；Linux S2：低；S0：高 |
| T34 | 链接检查器在沙箱外、以本机网络身份请求 Agent 写进文档的 URL（R53 观察）：缺少目标地址约束时，一份文档就能让 Tower 代为访问本机或内网上不对外的服务（服务端请求伪造一类：探测或触发本机、内网与云元数据服务，可达性结论回流给 Agent） | `07` §7.4.9 的目标地址规则（ADR-181）：先解析后检查，拒绝回环、链路本地、私网、唯一本地与元数据地址，连接使用检查过的地址，重定向逐跳检查（允许范围外的重定向目标、超过 3 跳、首跳主机不在 `network` 中与超过 50 条的链接都按被拒绝计，结论为有保留而非通过，ADR-182/183）；只发 HEAD 或 GET 前 1 KB，不带 cookie 与凭据；每次正式验证执行且需要合同声明 `network`；`links_reachable` 属 M2，M1 没有链接检查器（ADR-183） | **低**：允许范围内的公网地址仍会被请求（只读方法、不带凭据）；若出网经企业上游代理，由代理解析的地址不在本规则覆盖范围内（与 T30 同类） |

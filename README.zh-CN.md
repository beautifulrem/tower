# Tower

[English](README.md) · 简体中文

Tower 是一个用来监督编程 Agent 的 macOS 桌面应用。你给 Agent 一个带验收标准的 Goal，Agent 在沙箱里干活；它说做完了，Tower 会在一份干净检出里自己检查一遍；最后由你审阅改动并接受。

![Tower 概览，深色主题](assets/screenshots/overview.png)

聊天式的 Agent 工具给你看的是一段对话记录。几个 Agent 同时跑上几个小时，对话记录就说明不了多少事：消息里一句“测试全过了”，和真的跑了一遍测试，看起来没有区别。Tower 换了几个问题来组织界面。每个 Goal 都显示：要 Agent 做什么、它现在在做什么、哪些已经真正证明了、改了什么。

> **现状**：还没有签名的公开发布版，请从源码构建（见下文）。支持的平台是 macOS 13 及以上，CI 也只在 macOS 上跑。

## 一个 Goal 怎么走完

Goal 就是一份**合同**，里面写明：

- 意图；
- 验收标准：要跑的命令、要比对的截图（`look`）、只有你能做的检查；
- Agent 可以改哪些文件；
- 花费和时间预算；
- Agent 不问你能自己做到哪一步。

一个 Goal 有三种完成状态：

1. **已声称（Claimed）**：Agent 说做完了。
2. **已验证（Verified）**：Tower 自己跑了验收标准，并且通过。
3. **已接受（Accepted）**：你审阅了改动，盖章接受。

界面把四种陈述分开显示，靠形状区分，不只靠颜色：

| 类别 | 是什么 | 能不能显示绿色 |
|---|---|---|
| **事实** | Tower 自己测到的，比如验证结果 | 只有新鲜、未被篡改的验证通过才能 |
| **观察** | 在 Agent 自己的沙箱里看到的输出 | 不能 |
| **声称** | Agent 写的一切：日志、总结、“受阻”报告 | 不能 |
| **人** | 你的合同、批准和接受 | — |

## 验证

Agent 声称完成时，Tower 先把这份工作固定成快照，然后在一份新的干净检出里检查。检查时不带任何凭据，包缓存用完即弃：

1. **基线运行**。先在基础提交上跑验收标准。在那里已经通过的标准，证明不了 Goal 完成了。
2. **可见标准**。在快照上、按 Goal 的沙箱规则运行。合同不允许联网时，安装依赖也离线进行。
3. **保留测试**。这些测试从不进入 Agent 的工作区或提示词，等可见标准通过后才运行。Tower 会核对每个测试文件确实运行了。
4. **只留源码重跑**。Tower 撤销所有非源码改动（测试、fixture、配置、脚本），再跑一遍。Rust 写在源文件里的测试用 Tree-sitter 解析后还原。
5. **防篡改检查**。Tower 插入一个必须失败的测试，并改动期望值；如果标准仍然通过，这次通过不算数。断言库在项目代码加载之前就被看住，结果只能追加写入。
6. **扰动与不稳定检查**。Tower 改动数字输入，用来抓一部分写死的答案。新失败的标准会再跑一次，不稳定的测试会被标成不稳定。

这些检查提高了作弊的成本，但不能杜绝。真实模型的防作弊回归还没有通过，[`docs/17-implementation.md`](docs/17-implementation.md) §17.7 列出了目前还漏过的作弊类型。

对 `look` 标准，Tower 用无头浏览器分别在桌面和手机尺寸下截取改动前后的截图，并把页面的控制台错误记在截图旁边。

细节见 [`docs/07-verification-and-honesty.md`](docs/07-verification-and-honesty.md)。

## 沙箱

每个 Goal 都有自己的默认拒绝沙箱。macOS 上用的是 Seatbelt：

- **读**：只能读系统路径、工具链和 Goal 的工作区。你的主目录、其他项目和凭据目录（`~/.ssh`、`~/.aws`、`~/.config/gh`）都读不到，`*_API_KEY` 变量也不会传进去。
- **写**：只能写 Goal 的工作区、它的临时目录和一份写时复制的包缓存。你自己的缓存不会被改动。
- **Agent 指令文件**：任何深度的 `AGENTS*.md`、`CLAUDE*.md`、`.pi/`、`.agents/` 都不能写，硬链接也不能建。
- **网络**：合同不打开就是关的。每个 Goal 有自己的一组 10 个回环端口。其他 Unix socket，比如 `docker.sock` 和 ssh-agent，一直是关的。
- **清理**：一次运行结束时，Tower 会结束内核认定在这个 Goal 沙箱里的所有进程，不会碰你自己的进程。

另外还有一个 Linux 后端（`bubblewrap`、Landlock、cgroups v2），以及一个可选的 MicroVM 档位（macOS 26+、Apple Silicon 上的 Apple Containerization）。CI 只在 macOS 上跑，这两者都没有在真实环境下测过。

[`SECURITY.md`](SECURITY.md) 写了威胁模型，以及 CI 每次推送都会跑的 118 个安全测试，也写了已知的局限。

## 引擎

| 引擎 | 连接方式 | 信任档位 | Agent 能用的工具 |
|---|---|---|---|
| [Pi](https://github.com/earendil-works/pi)（默认） | 原生 JSONL RPC | 完整 | 固定 7 个：`read`、`bash`、`edit`、`write`、`ask_user`、`log`、`submit`。MCP 和仓库里的 Pi 资源都关掉。 |
| Claude Code | ACP | 完整 | 只有 Tower 在沙箱里提供的 MCP 工具。内置工具、hooks 和其他 MCP 服务都去掉。 |
| Codex CLI、Gemini CLI、OpenCode | ACP | 受限 | 申请使用 Tower 以外工具的请求一律拒绝并记录。 |
| 其他 ACP 适配器 | ACP | 实验 | 出现的地方都标明是实验性的。 |

Agent 的 `bash` 命令运行前先经过一个 POSIX shell 解析器。无法撤回的命令，以及谨慎模式下隐藏的写入，都会停下来等你回答。

Agent 做不下去时，可以用 `submit(outcome: "blocked")` 说出来：Goal 会暂停，Agent 给的理由显示为“声称”。如果 Agent 反复碰沙箱在工作区以外的边界，又没有进展，Goal 也会暂停。

## 审阅与接受

- **审阅顺序**：改动切成每份最多 300 行，风险高的排在前面。只是挪了位置的代码和只改格式的部分会折叠起来。
- **快照**：可以看全部改动、上次审阅以来的改动、最后一轮，或者任意两次运行之间的对比。
- **评论**：行评论合成一条引导消息发回给 Agent（`⌘↩`）。也可以单独接受或撤回某一块改动。
- **接受（`⌘⇧↩`）**：先检查快照是新鲜的、没有高严重度哨兵、你自己的检查都做完了、合并预测没有冲突，然后以你为作者写一个提交，放在新的本地分支 `tower/<goal>-<slug>` 上。

推送分支和开 PR 始终由你来做。

## 其他功能

- **概览（`⌘1`）**：每个 Goal 一行，等你回答的问题钉在最上面。按 `Space` 快速查看。在 Goal 页按 `W` 打开完整的时间线记录，包括 Tower 发给 Agent 的每一条消息。
- **收件箱（`⌘2`）**：所有在等你的事。
- **学习（`⌘3`）**：从你的审阅评论和验证失败里提炼出的规则。每条都要你批准，来自外部来源的文字会被拦下。还有按模型统计的数据：首次验证通过率、返工轮数、每个被接受 Goal 的花费。
- **运维（`⌘4`）**：
  - 定时 Goal，cron 按 UTC 计算。
  - 每个项目一条合并队列，带冲突预测；Goal 之间可以用 `depends_on` 排先后。
  - 每个 Goal 的磁盘占用，以及安全的清理。
- **离开桌面时**：下面两项默认都关闭。
  - 手机页面：只通过 Tailscale 提供（局域网要另外打开），用 token 配对。会放宽权限的决定不能在手机上做。
  - [ntfy](https://ntfy.sh) 推送：只带 Goal 编号、标题和事项类型。
- **语言**：英文和简体中文。设置里选的语言同时作用于界面、菜单、通知和 Agent。

| 快速查看 | Goal 页 |
|---|---|
| ![快速查看](assets/screenshots/peek.png) | ![Goal 页](assets/screenshots/goal.png) |

| 审阅 | 合同 |
|---|---|
| ![审阅](assets/screenshots/review.png) | ![合同](assets/screenshots/contract.png) |

| 学习 | 运维 |
|---|---|
| ![学习](assets/screenshots/learning.png) | ![运维](assets/screenshots/operations.png) |

## 开始使用

### 构建

需要：

- macOS 13+；
- Rust（版本固定在 [`rust-toolchain.toml`](rust-toolchain.toml)）；
- Node 22+（CI 用 24）；
- `pnpm` 和 `git`。

```sh
pnpm install
pnpm dev        # 开发构建，带热更新
pnpm build      # .app 和 .dmg 在 target/release/bundle
pnpm check      # 类型检查、单元测试、clippy、cargo test、扩展测试
```

### 试一下演示

在欢迎页选择 **试一个演示目标**。Tower 会建一个小的示例仓库，用一个脚本化的引擎走完一个完整的 Goal：一个问题、一次声称、验证、哨兵和审阅。不需要模型，也不需要 API key；运行演示的测试需要 Node.js。

### 接入引擎

安装 Pi 并登录：

```sh
npm i -g @earendil-works/pi-coding-agent
pi            # 然后 /login
```

想用别的引擎，在设置里选，或者在单个 Goal 的合同里选。如果你的模型来自某个 Pi 扩展包，在 **设置 → 额外加载的 Pi 扩展** 里加上它的入口文件，并在登录 shell 里 export 它的 key。Tower 会把 `*_API_KEY` 变量传给 Pi，但绝不传给 Agent 的 shell。

### 发布

推送 `v*` 标签会构建通用的 `.dmg` 安装包，并更新 Homebrew cask（[`packaging/homebrew/tower.rb`](packaging/homebrew/tower.rb)），见 [`RELEASING.md`](RELEASING.md)。配置好 Apple 开发者凭据之后，构建才会签名和公证；在那之前，第一次打开应用要右键 → **打开**。

没有配置签名密钥时，更新器是关闭的。它只在你要求时检查，只在你确认后安装。

## 开发

```sh
# 一个演示工作区，与 ~/.tower 分开
tools/demo-engine/make_demo_repo.sh /tmp/tower-demo/shop
TOWER_HOME=/tmp/tower-demo/home cargo run -p tower-supervisor --example seed_demo -- /tmp/tower-demo/shop
TOWER_HOME=/tmp/tower-demo/home pnpm dev

# 不开界面，用真实的 Pi 引擎跑一个 Goal
TOWER_HOME=/tmp/tower-live cargo run -p tower-supervisor --example run_goal -- \
  <repo> "<intent>" "<acceptance command>" [provider/model] [extension…]

# 推送前跑一遍检查（CONTRIBUTING.md 写了怎么把它设成 git pre-push hook）
tools/pre-push.sh </dev/null
tools/adversarial.sh            # 可选：用真实模型跑防作弊回归
```

你可以设置下面这些环境变量。其他 `TOWER_*` 变量由 Tower 自己为它启动的进程设置。

| 变量 | 作用 |
|---|---|
| `TOWER_HOME` | Tower 的数据目录。默认 `~/.tower`，设成空值也是默认；相对路径在启动时会被拒绝。 |
| `TOWER_OPEN` | 启动时打开的视图：`goal/G-0001`、`review/G-0001`、`inbox`…… |
| `TOWER_LANG` | 设置里选定语言之前，监督进程写字用的语言：`zh…` 为中文，其他为英文。 |
| `TOWER_FLAKY_RERUN` | `1`/`true`/`on`/`yes` 或 `0`/`false`/`off`/`no` 会覆盖设置里“失败的测试重跑一次”的选项；其他值仍以设置为准。 |
| `TOWER_ACP_COMMAND_<ENGINE>` | 启动某个 ACP 引擎的命令，例如 `TOWER_ACP_COMMAND_CODEX`，用它代替在 `PATH` 里找可执行文件。 |
| `TOWER_CDP_DEBUG` | 设成任意值，就会记录截图浏览器的 DevTools 通信。 |

## 架构

```text
apps/desktop/            Tauri 2 外壳和 SolidJS 界面
  src-tauri/             与监督进程方法一一对应的命令；合并后的更新流
  src/                   视图、设计令牌、语言包
crates/
  tower-core/            领域模型：生命周期、合同、出处、哨兵、审阅单元
  tower-ast/             Tree-sitter 分析（Rust、JS/TS、Python、Bash）
  tower-store/           SQLite WAL 事件日志：一个写者、一组读者
  tower-pi/              Pi JSONL RPC 适配器
  tower-git/             卫星克隆、快照、盖章、合并队列
  tower-verify/          标准运行器：进程组、超时、脱敏输出
  tower-supervisor/      唯一的写者：生命周期、验证、沙箱后端、
                         端口池、学习、定时、存储、手机页面
extensions/tower-goal/   Pi 与 ACP 桥：工具策略、shell 解析器、沙箱内的文件访问
tools/                   演示引擎、CI 门禁、端到端与对抗测试的运行脚本
docs/                    设计规格（中文）
```

所有状态都由监督进程持有，界面拿的是只读副本。启动时的 JavaScript 约 53 KB（gzip 后）。大部分视图在第一次打开时才加载。CI 用 [`tools/bundle-budget.sh`](tools/bundle-budget.sh) 卡住三项体积预算：

- 启动：64 KB；
- Goal 页：12 KB；
- 全部界面 JavaScript：160 KB，目前合计 159 KB。

## 文档

设计规格在 [`docs/`](docs/) 里，用中文写成，涵盖领域模型、生命周期、验证、隔离、安全、视觉系统等。[`docs/15-decision-log.md`](docs/15-decision-log.md) 里有 240 条决策记录，[`docs/reviews/`](docs/reviews/) 里有 112 轮设计评审。

建议从这几篇读起：

- [`docs/17-implementation.md`](docs/17-implementation.md)：代码如何对应规格，以及哪里不同
- [`docs/19-anti-chat-console-design.md`](docs/19-anti-chat-console-design.md)：界面设计
- [`ROADMAP.md`](ROADMAP.md) 与 [`docs/18-evolution-roadmap.md`](docs/18-evolution-roadmap.md)：已经做了什么、接下来做什么
- [`SECURITY.md`](SECURITY.md)：威胁模型及其测试

## 参与与许可

见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。安全问题请按 [`SECURITY.md`](SECURITY.md) 的说明私下报告。

MIT 许可证，见 [`LICENSE`](LICENSE)。

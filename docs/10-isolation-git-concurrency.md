# 10 · 隔离、Git 与并发

本文定义 Tower 如何让多个 Goal 在同一台机器上并行修改同一（或多个）仓库而互不干扰，以及如何把“代码状态”与 Pi 的会话树对齐，从而支持检查点、回退、分叉、冲突预测、rebase 与合并队列。

依据：ADR-008（每 Goal 每仓库一个独立工作目录及其位置规则）、ADR-060（卫星克隆 + Tower 影子 git 目录，取代 ADR-044）、ADR-073/083（镜像库及其保留）、ADR-081/089（卫星分离 gitdir；gitdir 归 Agent、不可创建 `.git`、原始文件操作防劫持）、ADR-090（git 垫片）、ADR-094（人工编辑检出）、ADR-082（检验检出的信任边界）、ADR-015（同一 Goal 的多次尝试 = Pi 会话树分支；检查点 ref 与 Pi entry id 一一映射）、`03` I2（Verified 会过期）/ I7（单活跃 Run）、`02` §2.4 `WorkspaceBinding`、theory §C13/C14、`research/pi.md` §8.1（会话 cwd 缺失即退出）、§11（Pi 不提供 worktree）。与 `07` 的分工：工作区指纹算法、验证槽位池、依赖缓存 `depcache` 以 `07` §7.3–7.4 为准，本文只引用。

设计基调：

- **Git 是事实来源（R1）。** Changes、Validation、新鲜度全部从 git 对象推导，而不是从工具事件拼凑（`research/pi.md` §13.7：`write` 没有 diff，bash 可以改任何东西）。
- **绝不碰用户的工作现场。** Tower 不 stash、不 reset、不 checkout 用户主检出（main checkout），不写用户的全局包缓存（ADR-021）；Agent 对用户仓库**完全只读**（ADR-060）；所有写操作都发生在卫星克隆、Tower 影子目录与 Tower 私有存储中，Tower 写进用户仓库的只有集成时的 Goal 分支（以及开启“保留审计地标”时的地标 ref，§10.6.2），另有与 Goal 无关的多机租约 `refs/tower/_owner` 及其 blob（§10.6.2，ADR-194），且都是对象已到齐的完整 ref；删除只有 §10.3.2 / §10.6.2 按删除条件的 CAS 删除（隐私清除不写用户仓库，`09` §9.12.4，ADR-195）。**M1 限制**（ADR-193）：Tower 不调用用户的签名程序，写入的 seal 不签名；撤销合入时不在用户仓库中生成 revert 分支（二者在 M2，§10.6、§10.12）；任一工作树中有进行中的 git 操作时，这一次不写也不删分支（§10.6 进行中操作守卫；范围以该处为准，租约与地标 ref 不受影响）。**显式例外只有两个**，且都需要人在 UI 中逐次确认：(1) base 分支正被用户主检出检出时的“本地合并”（M2，§10.12）——它会修改用户检出中的文件并触发 IDE/构建工具的文件监听；(2) 用户选择“包含我的未提交改动作为起点”时**读取**（不修改）用户检出（§10.5）。
- **一切可重建。** 卫星是缓存：影子目录中的检查点（加上备份 bundle）足以在任何时候重建它（§10.16）。

---

## 10.1 仓库模型：镜像库 + 卫星克隆 + Tower 影子 git 目录（ADR-060、ADR-073）

ADR-060 取代了初版的“linked worktree 附着到用户仓库”与第 2 轮的“私有对象目录”（ADR-044）：两者都让 Agent 能写到与用户仓库共享的 git 元数据（R3-D11-01、R3-D13-01）。ADR-073 又把卫星与影子的对象来源从**用户的活动对象库**改为 **Tower 自己的镜像库**：借用用户对象库时，用户的正常维护（删分支、`gc --prune`）会删掉检查点所依赖的对象（R4-D13-01，已实验）。ADR-081 再把卫星的 gitdir 移出工作目录（R5-D11-01，阻断）：只要沙箱外有进程以“发现”方式在卫星中运行 git，任何 Agent 可写、又被 git 当作仓库元数据读取的文件（`commondir`、`worktrees/*`、`config`、`info/*`…）都是逃逸点，按文件名逐个拒绝永远补不全；第 6 轮的 ADR-089 又取消了 gitdir 写入白名单（R6-D13-01、R6-D11-01）：白名单拦住了 `revert`、`cherry-pick`、`rebase`、`stash`、`bisect`、`gc` 的正常写入，而在“沙箱外无人发现卫星仓库”的前提下它其实不保护任何东西。现在的边界是三条：**工作目录任意深度不可创建 `.git`** + **沙箱外发现失效** + **Tower 对 Agent 可写路径的原始文件操作防劫持**（§10.1.3）。现模型由四个 git 目录组成：

| 部分 | 位置 | 谁可写 | 内容 |
|---|---|---|---|
| **用户仓库** | 用户主检出及其 `commonDir` | 只有用户，以及 Tower 的“用户仓库操作”（只在集成时把 seal fetch 为 Goal 分支、推送，§10.1.2）；**Agent 完全只读** | 用户自己的历史。Tower **不在其中保存任何 `refs/tower/*`**（R4-D13-08）：检查点、pin、基线快照都只在影子或镜像中 |
| **镜像库** | `~/.tower/projects/<projectId>/mirror.git`（裸库） | 只有 Tower | 首次以 CoW 复制用户对象库建立（APFS `clonefile` / reflink；不支持 CoW 的卷上一次性完整复制），之后在需要新 base 时以镜像为上下文 `git fetch <userCheckout>`（读用户仓库，用户的配置可信）。**只回收不被任何 ref 可达的对象**：活跃 Goal 的 `refs/tower-live/<goalId>/*`、证据保留 ref `refs/tower-retain/<goalId>/<verifyId>` 可达的对象永不删除（ADR-083，§10.17.1）；用户的任何维护都不影响它 |
| **卫星克隆** | 工作目录 `<wtRoot>/<goalId>`（`<wtRoot>` 默认 `<checkoutParent>/.tower-wt.noindex/<repoName>`，ADR-008）；gitdir `<wtRoot>/_gitdirs/<goalId>`（分离 gitdir，ADR-081）。**工作目录中没有 `.git`** | Agent：工作区与**整个 gitdir**（ADR-089 取消 ADR-081 第 3 点的白名单与 ADR-072 的控制文件保护）。S2 拒绝在工作目录**任意深度**创建名为 `.git` 的条目（正则 `^<卫星>/(.*/)?\.git(/|$)`，`11` §11.6.2）。Tower 不读取 gitdir 中的配置、索引或 ref 作为任何判定依据；对卫星与 gitdir 的原始文件操作只有创建、整体删除、整体重建（§10.1.3） | `git clone --shared --no-checkout --separate-git-dir=<gitdir> <mirror> <工作目录>`，随后删除工作目录中的 `.git` 指针文件；alternates → 镜像；写入 Tower 模板配置（Agent 的便利默认值，不是安全边界）、删除 `origin`（**卫星没有任何远端**，ADR-074）。Agent 的 bash 经 PATH 首位的 Tower git 垫片使用它：垫片只对在卫星内运行的 git 注入 `GIT_DIR`/`GIT_WORK_TREE`，并剥离继承到卫星外的同名变量（ADR-088/090，§10.6.1） |
| **影子 git 目录** | `~/.tower/goals/<goalId>/git/<projectId>.git`（裸库） | 只有 Tower（S2 下 Agent 不可写也不可读） | alternates → 镜像；Tower 自己的索引；检查点、pin、seal、安全快照的对象与 ref |

后果：

- Agent 在卫星里可以做任何 git 操作——提交、merge、rebase（含 `-i`/`-x`）、cherry-pick、revert、stash、bisect、gc——影响只落在卫星 gitdir（ADR-089，第 6 轮 Seatbelt 实验）。它可以改写 gitdir 中的 `config`、`hooks`、`commondir`，但这些文件只会被沙箱内的 git 读取。它不能在工作目录任何深度放置 `.git`；但 git 还会把其他形态的目录识别为仓库——含 `HEAD`（普通文件或符号链接）且能经 `objects/`/`refs/` 或 `commondir` 找到对象与 ref 的目录（R7-D11-01、R8-D3-01，已在 git 2.56 上核对），而 `GIT_CEILING_DIRECTORIES` 只限制向上搜索。因此：**Tower 构造的所有沙箱外 git 环境都注入 `safe.bareRepository=explicit`**（ADR-096），在这些环境中，沙箱外的 git 在卫星的任何子目录中都发现不到仓库——这一结论**只对 Tower 构造的环境成立**；用户自己的 shell、IDE 与集成后的主检出不在 Tower 控制之下，由 `pinSafetyCheck` 对 pin 的阻断（§10.1.2，ADR-109）与集成前的确认项兜底。
- **沙箱外的发现失效（ADR-081 第 2 点）**：Engine Host 及其派生进程（扩展的 `pi.exec`、MCP stdio 服务器）的环境设 `GIT_CEILING_DIRECTORIES=<全部 wtRoot>`、不含 `GIT_DIR`；工作目录中又没有 `.git`，它们在卫星中运行 git 得到“不是 git 仓库”，不读取任何 Agent 可控的元数据（`research/git-isolation-experiment.md` 附录已验证）。人的 IDE 与终端不打开卫星，而是打开人工编辑检出（§10.8.4）；Tower 的任何入口（含键位，`16` §16.3）都不在外部程序中打开卫星；在外部程序中打开的只有经影子物化、过滤并有信任提示的人工编辑检出与检验检出（§10.8.3、§10.8.4，ADR-197）。代价（登记于 `00` §0.5.1）：依赖 git 的用户扩展在 Tower 中看不到仓库。
- Tower **从不**通过发现读取卫星仓库，不以 gitdir 中的任何内容作为判定依据（§10.1.2）；唯一读取 gitdir 的两处（检查点 trailer 中的卫星 HEAD、seal 说明中的 Agent 提交信息）由 Tower 在隔离的解析 worker 中**自行只读解析普通文件**，不在卫星 gitdir 上运行 git，带上限与超时、失败即省略（§10.1.3，ADR-100，R8-D15-01 #4）；影子配置不定义任何 filter/diff/merge 驱动（LFS 例外见 §10.14），嵌套仓库在每次影子操作前被识别并按 §10.1.2 处置（ADR-071/101/102）。
- 镜像中被任何 ref 可达的对象不会被删除（ADR-083），卫星新对象在卫星 gitdir 中，影子写入的对象若已存在于镜像则复用（镜像 gc 前把影子 ref 同步为 `refs/tower-live/*`，使这些被复用的对象在镜像中可达，§10.17.1）——用户在自己的仓库中做任何维护都不影响检查点、pin 与卫星（R4-D13-01）。用户仓库中不再需要 base 保活 ref（ADR-073）。
- Goal 分支只在**集成时**出现在用户仓库：`refs/heads/<prefix>/<goalId>-<slug>`（`prefix` 默认 `tower`，可在项目设置中修改，§10.2）。运行期间用户在自己的 `git branch` 与 `git log --all` 中看不到任何 Tower 的 ref。

### 10.1.1 多个本机检出时的附着点（R1-D13-05、R4-D12-03）

同一 Project（`ProjectId` 规则见 ADR-028/058/069/080）在本机可能有多个检出：同一仓库的多个 linked worktree（共享一个 `commonDir`），或彼此独立的多个克隆。

- **卫星永远不是检出**（R4-D12-03）：卫星工作目录中没有 `.git`，本身就不会被识别为仓库；Tower 另在卫星 gitdir 写入标记文件 `<wtRoot>/_gitdirs/<goalId>/tower-satellite`（内容为 goalId；Agent 可改写，因此只作提示——判定以 Tower 数据库中的 `WorktreeRecord` 与下述路径规则为准，ADR-089）。`_human/`、`_inspect/`、`_verify/` 同在 `<wtRoot>` 下，一并适用下述规则。添加项目、从某目录打开 Tower、或人迁移到另一个检出时（按 `Project.identity` 的自动搜索已删除，ADR-235），凡是路径位于任一 `.tower-wt.noindex/` 或 `Project.worktreeRoot` 之下、或带此标记的仓库，一律拒绝登记为 `Project.checkouts`，也不能被选为附着点（提示“这是 Tower 为 Goal G-xxxx 创建的工作目录”）。这避免“卫星的卫星”及其对象随 Goal 归档消失。
- **附着点** = 一个用户检出（`checkoutPath`）及其 `commonDir`，在 Goal 创建时为每个 binding 选定并记录（`02` §2.4 `WorkspaceBinding.attach`）。附着点的作用变为：(1) 镜像从哪里 fetch 新 base；(2) `<wtRoot>` 取 `checkoutPath` 的父目录（祖先上下文与用户日常使用的检出一致）；(3) 集成时 seal 写进哪个用户仓库。
- **选择顺序**：(1) 用户发起 Goal 时所在的检出；(2) Project 设置中的“默认检出”（`Project.settings.defaultCheckout`，可访问时，ADR-237）；(3) 最近使用、`commonDir` 存在、不在同步/网络位置（§10.4.3）的检出。
- **跨附着点的比较**：冲突雷达在镜像中进行，同一 Project 的所有 Goal 都可比较（镜像包含各检出 fetch 来的 base）。
- **迁移**（命令 `project.relocate`，`06` §6.4.3，ADR-236；由人选择“迁移到另一个检出”；附着检出被删除或移动时附着在它上的 Goal 不可达，同样由人发起，Tower 不自动查找，`06` §6.1.6，ADR-235；要求 Run 空闲）：镜像与影子不受影响（它们不依赖用户对象库）；只需更新 `attach`、让镜像改从新检出 fetch；若 `<wtRoot>` 随之变化，按 §10.16.2 情形 F 在新位置重建卫星（重建来源与步骤按情形 E），Pi 会话经 `SessionManager.forkFrom` 迁移；事件 `binding.reattached {from, to}`；`<wtRoot>` 确实改变时旧位置记入 `Project.settings.relocatedFrom`（写入的条件、去重与迁回时的移除只按 `06` §6.4.3 `project.relocate` 行“旧位置的记录”，ADR-237/238），之后的列出、删除与清除照常找到它；新的 `<wtRoot>` 须可访问或可由 Tower 建立（`06` §6.1.6 “Tower 不重新建立根”，ADR-239）。

### 10.1.2 Tower 执行 git 的上下文与唯一加固清单

本节是 Tower 执行 git 的**唯一加固清单**；`07` §7.3.2 的指纹与 §7.4.2 的槽位检出只引用本节（R4-D13-06）。

| 上下文 | 用于 | 调用形式 |
|---|---|---|
| **影子上下文**（面对 Agent 可控的工作区） | 指纹、检查点、验证 pin、seal、diff、评审单元、恢复、冲突雷达、bundle、槽位检出（`slot-<k>.git`，alternates → 影子与镜像） | 见下方代码块 |
| **镜像上下文**（只面对 Tower 自己的镜像与用户仓库的只读 fetch） | 建立镜像、fetch 新 base、基线快照（§10.5）；**Tower 的全部 git 网络命令**（base 的远端 fetch 与轮询、LFS 获取、M2 推送，ADR-155 补记 2，环境见下文“Tower 的 git 网络命令”） | `GIT_DIR=<mirror>`，同下方的环境与 `-c`；`git fetch <userCheckout>` 读用户仓库 |
| **用户仓库上下文**（只面对用户自己的仓库与配置） | 集成时 fetch seal 为 Goal 分支、开 PR、本地合并（M2）；推送成功后写入 `branch.<seal 分支>.remote/.merge`；**读取**网络命令所需的有效配置。不在此上下文运行任何网络命令（ADR-155 补记 2） | `git -C <userCheckout> -c gc.auto=0 -c maintenance.auto=false -c core.hooksPath=/dev/null …`（集成类操作按项目设置可运行用户 hooks）；用户的配置是可信输入 |
| **已脱离副本的求值**（ADR-229/230；只读，只为 `goal.delete_kept` 的确认框（§10.2 “人的工作现场不自动删除”）与交还对话框中被忽略的提交数（`ignoredCommits`；交还时 H 仍在使用中，§10.8.4 第 5 步、`04` §4.6.7）） | 已脱离的人工编辑检出与检验目录中与检查点不同的文件、被 git 忽略的条目；H/.git 中 Tower 没有记录的提交数（交还对话框只用这一项） | 文件与忽略条目：影子上下文，`GIT_WORK_TREE=<该目录>`、临时索引从检查点的树起 `add -A`，目录自带的 `.git` 排除（与 §10.8.4 第 5 步同一取法；不写影子 ref，不在该目录自带的 gitdir 上运行 git）；被排除的 `.git` 与嵌套的仓库（人自建的 `.git`、H 中的嵌套克隆）在确认框中另列一行 `<路径>/.git（嵌套仓库，随之删除）`，ADR-231。提交数：不运行 git，由 Tower 按 §10.1.3 “读取 gitdir”的同一规则在隔离 worker 中自行只读解析 H/.git（不读 `config`、`include`、`alternates`），遍历与停止（ADR-230）：从 `HEAD`、`worktrees/*/HEAD`、全部 loose ref 与 `packed-refs`（含人新建的分支与 `refs/stash`；指向附注标签的 ref 取它所指的提交，指向其他对象的跳过）沿全部父提交数提交（合并提交的每个父都走，每个 stash 因此计为 2 或 3 个），遇到 Supervisor 交给 worker 的本 Goal 已知提交 id（数据库中记录的检查点、pin、seal 与 base 的提交）或 H/.git 自己对象库中没有的对象即停——按提交 id 判定，所以人照 §10.2 自行 `repack` 之后，对 H 起点之后的提交结果不变（以镜像中的提交为起点的 ref，如人从 base 的祖先新建的分支，`repack` 之前在对象缺失处停止、之后会数入上游历史，偏保守，ADR-231）；只在 reflog 中的提交（如较早的 stash 条目）不计入，所以确认框写 `至少 N 个提交` 并列出它们所在的 ref 名；达到 §10.1.3 解析器 200 个提交的上限时写 `200+ 个提交`；交还对话框用同一写法（`至少 N 个提交`、`200+ 个提交`，求值失败时写 `无法计算`），`ignoredCommits` 取数字（达到上限时为 200）或 `null`（求值失败），ADR-231；没有已知 id 时（Goal 已清除或没有 Goal 行）只以对象缺失为界，自含对象的 H 会把历史一并数入，偏保守。卫星的 `.kept-*` 与 `_gitdirs/<goalId>.kept-*` 由 Agent 写过，不求任何 git 信息 |

**本节加固清单的唯一例外：Tower 的 git 网络命令**（ADR-151/155/157）。它们都在镜像中执行，使用下段的临时网络配置，而不是最小配置；base 的远端 fetch、轮询与 M2 推送的规则见下段。以下先说 LFS 对象获取。§10.3.1 步骤 2a 的那一条 `git lfs fetch` 由 Tower 以用户身份、在 Agent 沙箱之外执行，作用对象只有 Tower 的镜像；它使用用户的全局与系统 git 配置（credential helper、ssh），LFS 配置由 Tower 从 base 的 `.lfsconfig` 按**键白名单**取值（`lfs.url`、`remote.<name>.lfsurl`、`lfs.<url>.access`、`lfs.fetchinclude`、`lfs.fetchexclude`；URL 只接受 https 与 ssh），与用户主检出的 git 配置**按键**合并后，连同在用户主检出上下文中求出的网络认证配置（`credential.*`、`http.*`、`url.<base>.insteadOf`、`core.sshCommand`，ADR-154 补记与补记 2）写入 `~/.tower/tmp/` 下权限 `0600` 的临时配置文件（另含所选远端原样的 `remote.<name>.url`，ADR-157），以 `GIT_CONFIG_GLOBAL=<该文件路径>` 运行——命令行与环境中只出现文件路径，不出现任何 URL 或键值（ADR-152/153/154；规则见下段）；镜像的 `HEAD` 指向占位引用 `refs/tower/none`，git-lfs 读不到镜像中的任何配置；网络不限主机。本节的加固清单**不适用于这条命令**：这条命令的输入只来自用户主检出的配置与 base 提交，Agent 在卫星中的写入不参与（ADR-154 的措辞）。

**Tower 的 git 网络命令（唯一定义，ADR-154/155/157/158）**：Tower 以用户身份运行的全部 git 网络命令遵守同一组规则，并且**全部在镜像中执行**（ADR-155 补记 2）。M1 有两类：远端引用 base 的 fetch（时机见下文“远端 base 的获取时机”），以及 §10.3.1 步骤 2a 的 LFS 获取。M2 另有四类：自动 rebase 前对新 base 的 LFS 补齐（§10.10）、推送前的 `ls-remote`、推送（§10.12），以及 pre-push 钩子（在用户检出中运行，不联网）。

**与用户自己的 `git fetch` 相同**（ADR-157，撤回 ADR-155/156 的凭据改写）：Tower 不改写用户的凭据或 URL。网络命令**原样**使用用户主检出中配置的远端 URL，并照常读取用户的全局与系统配置。**macOS 上的前提如实写明**（ADR-158，R32-D11-01）：Seatbelt 无法阻止 Agent 读取同一用户其他进程的参数（`11` §11.6.2）。git 又会把远端 URL 放进传输辅助进程的参数，所以 macOS 上 **URL 中带凭据的远端一律不执行网络命令**（见下文“带凭据的远端”）。其余远端的 URL 中没有凭据，原样使用不暴露任何秘密。以下机制全部撤回，登记在 `16` 废弃表：
- userinfo 剥离；
- store 文件；
- 写出完整有效配置；
- `GIT_CONFIG_NOSYSTEM`；
- 按主机改写凭据；
- `insteadOf` 改写。
- **远端名**：base 是远端引用 `refs/remotes/<r>/<b>` 时取 `<r>`；否则依次取 `branch.<base>.remote` → `remote.lfsdefault` → 唯一的远端 → `origin`（与 git-lfs 一致，ADR-154 补记）。为 base 获取远端提交的命令一律用这条规则，不硬编码 `origin`（ADR-155）。
- **临时配置文件**：位于 `~/.tower/tmp/`（目录 `0700`，文件 `0600`），以 `GIT_CONFIG_GLOBAL=<路径>` 传入。命令行与环境中只出现路径，因为 Tower 自己不把可能含凭据的值放进命令行与环境（`11` §11.6.4）。命令结束即删除，含失败与超时；Supervisor 每次启动时清空其中不属于存活 Host 的内容（存活 Host 的临时目录 `<hostId>/` 保留，`06` §6.1.6，ADR-224）。`06` 的系统备份排除 `tmp/`，Agent 沙箱对 `~/.tower/**` 读拒绝。内容依次为：
  - `[include]` 用户的全局配置（系统配置照常由 git 读取）。
  - **用户主检出上下文中的认证类配置**（ADR-154 补记与补记 2，ADR-156）：`credential.*`、`http.*`、`url.<base>.insteadOf`/`pushInsteadOf`、`core.sshCommand`。Tower 只追加 `[include]` 在镜像中带不进来的那部分值——仓库级的值，以及按目录的 `includeIf` 在主检出路径上才生效的值——按 `--show-origin` 求差集，**原样**写出。这样结果与用户在主检出中执行 `git fetch` 时的有效配置一致，按目录选择的 helper、代理与 SSH 密钥照常工作；用户的 helper 列表不清空、不重复。
  - 所选远端的 `remote.<name>.url`（以及 `pushurl`），取自用户主检出，**原样**写入。命令以远端名寻址，并写明 refspec。
  - LFS 获取另加 `.lfsconfig` 白名单键的有效值，见步骤 2a。这些键来自 base 的内容，所以仍经白名单与按键解析。
  - M2 推送另在最后写 `core.hooksPath=/dev/null`。
- **执行位置**（ADR-155 补记 2）：全部以 `GIT_DIR=<mirror>` 执行。镜像没有远端，它的 `config` 只含 Tower 写入的内容。用户主检出只作为**读取**有效配置的上下文，不在其中运行任何网络命令，也不更新它的 `refs/remotes/*`。
  - **LFS 获取**：`git lfs fetch <远端名> <base 提交>`。
  - **远端 base 的 fetch**：`GIT_DIR=<mirror> git fetch --no-tags <r> +refs/heads/<b>:refs/tower-remote/<r>/<b>`，并记录这次获取的时间。
  - **M2 推送**：先在镜像上下文以本地 fetch 把影子 ref 同步进镜像（与 §10.17.1 的 `refs/tower-live/*` 同步相同，没有网络）。然后执行 `GIT_DIR=<mirror> git push <远端名> <seal 提交>:refs/heads/<seal 分支>`。镜像中的推送不运行 hooks；推送只传输对象，不按 seal 中 Agent 写入的内容执行任何东西。
- **带凭据的远端**（macOS 默认，ADR-157 预案，ADR-158 定为 M1 的常态）：对“URL 中带凭据的远端”，Tower 不执行任何网络命令。判断看所选远端 URL 及适用的 `insteadOf` 替换目标。
  - **凭据判定**（唯一定义，ADR-158；ADR-159 扩展判定范围）：
    - **判定对象**：
      - 所选远端 URL 及适用的 `insteadOf` 替换目标；
      - 用户主检出上下文中、作用于该远端的认证类配置（ADR-159，R33-D11-03）：以 `!` 开头的内联 `credential.helper` 中含 `password=` 或 token 形态的值；含 token 形态的 `core.sshCommand`、`http.extraHeader`（包括 `http.<url>.extraHeader`）。
      
      git 同样会把这些值放进子进程的命令行。带 URL 限定的键只作用于匹配的远端，不带 URL 限定的键作用于该项目的全部远端。
    - userinfo 含 `:`（`user:secret`）时一律视为凭据；
    - 只有用户名时，若匹配已知的 token 形态，也视为凭据：前缀 `ghp_`、`gho_`、`ghu_`、`ghs_`、`github_pat_`、`glpat-`，用户名 `x-access-token`，或长度 ≥ 20 的高熵串（判据与 `11` §11.7 的熵规则相同）；
    - 否则视为用户名，例如 Bitbucket 与 Azure DevOps 的默认克隆 URL。
    - 配置键中的 token 形态用同一组前缀与熵规则判断。
  - **命中时**：
    - 记项目级 Fact `remote_credential_blocked{remote}`。它的 `goalId` 为空、带 `projectId`（ADR-159：`Fact.goalId` 可空）。卡片写明命中的是 URL 还是哪一个配置键，不显示值；
    - 显示卡片“请把该远端的凭据移到 credential helper”，Tower 不改写用户的配置；
    - 卡片是项目级的 Needs-You `integration`（owner 为 project，去重键 `int:{projectId}:credential_url`，ADR-157 补记），其“重试”为命令 `project.remote.recheck`：立即重新判定 URL，不再命中时执行一次获取；
    - 用户改用 helper 后，条目以 `actionable` 关闭。
  - **对这类 Goal**：
    - 远端 base 只用用户检出中的值；
    - 缺失的 LFS 对象无法获取，进入 `prepare_failed`，卡片给出同一句说明。
  - **Linux S2（M2）**：PID 命名空间使其他进程不可见，带凭据的远端照常执行。
  - 不带凭据的远端（包括只带用户名的 URL）不受影响。
- **远端 base 的获取时机**（M1，ADR-157，R31-D13-02）：M1 不轮询。远端引用 base 在以下四个时机各执行一次上面的 fetch：
  - Goal 准备（§10.3.1 步骤 1）；
  - Goal 进入 `in_review` 之前；
  - 用户在卡片上点“检查 base”；
  - 打开 Goal 详情时，距上次获取超过 10 分钟。
  
  后两个时机都发出命令 `goal.base.check{goalId}`（ADR-158，R32-D8-01）。打开详情的那一次由客户端在距上次获取超过 10 分钟时自动发出，远程客户端同样计入。**合并与时限**（ADR-159，R33-D13-02）：
  - 获取按（项目镜像，远端，分支）合并，即同一个 `refs/tower-remote/<r>/<b>`。进行中再收到同一引用的请求（任何 Goal、任何时机），都等待同一次获取，结果分发给所有等待者。同一引用不会并发获取，因此不会出现 git 引用锁冲突；万一冲突，重试一次。
  - 非准备时机的获取不取项目锁，**总时限 60 s**：超时即终止该 git 进程，记 `base_fetch_failed`。准备时机仍受 `prepare.repoTimeoutMin` 约束，并在项目锁内进行；它与其他时机的请求同样合并。
  - 进入 `in_review` 之前的获取**不阻塞**转移（ADR-158，R32-D13-01）：转移只等待前 10 s，其余在后台继续，在 60 s 总时限内完成并记录结果。这 10 s 只是等待上限，不是获取的时限。
  - 获取失败或超出总时限都记 Fact `base_fetch_failed{remote, error}`（ADR-158 补记 2），卡片据此显示“无法获取远端 base”，并在“上次获取时间”旁标注。这条提示**保留到下一次成功获取**（ADR-159）。

  同时，镜像照常从用户检出取 `refs/user/remotes/*`（本地，无网络）。每次这样的获取之后，依次执行 base 前进检测（见下文 `baseTip`）与 `integrated` 观测（§10.12）。获取失败时记 `base_fetch_failed`，并仍按 `baseTip` 取值，可能取到上一次获取的值。M2 另有定期轮询（§10.9.3）。

  **提示的生命周期**：卡片第 5 行只显示该 Goal 最新的一条 base 类 Fact（`base_advanced`、`base_unchanged_nonancestor`、`base_diverged`）；Goal 进入 `integrated`、`archived` 或 `abandoned` 后不再显示。
- **M2 推送的目标远端**（ADR-155 补记）：依次取 `branch.<seal 分支>.pushRemote` → `remote.pushDefault` → 上面的远端名规则。推送在镜像中以显式 refspec 进行，不能用 `-u`。推送成功后，Tower 在用户仓库配置中显式写入 `branch.<seal 分支>.remote = <远端名>` 与 `branch.<seal 分支>.merge = refs/heads/<seal 分支>`。
- **`pre-push` 钩子**（ADR-155 补记 3、ADR-156、ADR-157，M2）：从镜像推送不会触发用户检出中的钩子。项目设置允许集成步骤运行用户钩子时，Tower 在推送**之前**于用户检出中执行一条不需要网络的命令：`git hook run --ignore-missing --to-stdin=<~/.tower/tmp/ 下的 0600 文件> pre-push -- <远端名> <远端 URL>`。
  - **版本**：`--to-stdin` 自 git 2.40 起可用，即 Tower 支持的最低版本，所以没有版本回退。
  - **标准输入**：文件内容是 git 规范的一行 `<本地引用> <seal 提交> <远端引用> <远端当前提交>`。“远端当前提交”取自推送前在镜像中对该远端分支执行的 `ls-remote`（同样按本节规则），分支不存在时为全零。送给 `git hook run` 进程本身的标准输入不会到达钩子，所以必须用 `--to-stdin`。文件用后即删。
  - **参数中的 URL**：与 git 自己调用钩子时相同，即远端配置的 URL。这是 `11` §11.6.4 规则的一处例外（R32-D15-01 第 4 项）：在 macOS 上，带凭据的远端根本不执行推送（见上），参数中不会出现凭据；在 Linux S2（M2）上，其他进程不可见。
  - **没有钩子**：`--ignore-missing` 使之视为通过。
  - 钩子失败时记 Fact `push_hook_failed{exitCode, output}`，并按下一条处理。钩子通过后才执行镜像推送。项目设置不允许时不运行钩子。
- **推送失败的出口**（ADR-157/158，M2）：钩子拒绝、网络不可达与认证失败都按同一出口处理：
  - **不推送**，记 Fact `push_failed{stage: "hook" | "network" | "auth", exitCode?}`；
  - Goal 保持 `accepted`；合并队列条目进入状态 `awaiting_push`（ADR-158），它**不占用**该 base 的队列，后续条目照常推进；
  - 生成 Needs-You `integration`（severity 2，去重键 `int:{goalId}`）；
  - 卡片标题分别为“推送被 pre-push 钩子拒绝”“推送失败：网络不可达”“推送失败：认证失败”，显示经 `11` §11.7 脱敏并截断的输出；
  - 选项为“重试推送”与“只保留分支”。“重试推送”只对该条目重做推送，不重新排队；推送不改动 base，与其他条目互不阻挡。
- **输出**：标准输出与错误输出只进入 Tower 的诊断日志，写入前按 `11` §11.7 的模式脱敏，含通用模式 `<scheme>://<user>:<pass>@`。
- **残余**（`11` T33，ADR-158/159）：
  - macOS S2 为**中**：本节的部分已按投递表（`11` §11.7.0）处理，即带凭据的远端被拒绝。其余机密的残余见 T33：MCP 环境与用户自己的其他进程。M1 中 Tower 不会自动向 Agent 可影响的进程投递机密（ADR-164/165/167）：验证器机密与调度互斥属于 M2，含机密的本地文件不播种，`secrets.access` 归 M2；T33b 在 M1 不适用。
  - Linux S2（M2）为低。
  - S0 为高。

**base 的唯一取值函数 `baseTip(r, b)`**（ADR-156，ADR-157/158 修订）：远端引用 base `refs/remotes/<r>/<b>` 在镜像中可能有两个值：
- Tower 自己获取的 `refs/tower-remote/<r>/<b>`，获取时间（`towerFetchedAt`）由 Tower 记录；
- 从用户检出取来的 `refs/user/remotes/<r>/<b>`，其时间（`userObservedAt`）是镜像观察到该值变化的时间。这个时间偏新，**不**用来裁决。

取值规则如下：
- 只有一个存在时，取它；
- 二者有祖先关系时，取**后代**；
- 二者分叉时（例如上游被强制推送），**不自动选择**（ADR-158，R32-D13-01）：
  - Goal 的 `baseCommit` 不变。**尚未选择时，`baseTip()` 返回 `baseCommit` 本身**，即“不变”（ADR-160/161，R34-D13-01、R35-D13-01）：前进检测与 `integrated` 观测都以此为准，直到人选择；
  - 记 Fact `base_diverged{tower, user, towerFetchedAt, userObservedAt}`；
  - 卡片提示“远端与本地的 <分支> 已分叉，未自动采用任一版本”，提供“使用远端”“使用本地”两个动作，即命令 `goal.base.choose{side: "remote" | "local"}`（`remote` = Tower 获取的一侧，`local` = 用户检出一侧；记事件 `goal.base.chosen{side}`）。

**`goal.base.choose{side}`**（ADR-158 补记）：
- 它只决定此后以哪一侧作为该 base 的**观测基准**，用于 base 前进提示与 `integrated` 观测。
- **持久化**（ADR-159，R33-D13-01）：选择存为 `goals.base_choice{side, towerTip, userTip, at}`。同一对分叉提交（`towerTip`、`userTip`）仍然存在时，`baseTip()` 对该 Goal 返回所选一侧。任一侧变化即失效：清空 `base_choice`，按上面的规则重新判定；再次分叉时重新提示。
- 它**不改变** `baseCommit`，不触发 rebase 或重新验证。当前没有分叉时调用它，返回 `E_STATE`（“当前没有分叉，无需选择”）。确认文案写明“只影响提示与合入判断，不改动工作区”。
- M2 中若所选一侧是 `baseCommit` 的后代，按普通的 base 前进进入 rebase 流程（§10.10）。
- Goal 准备时还没有 `baseCommit`。此时若分叉，取用户一侧（即用户在自己检出中看到的 `<r>/<b>`），同样记 `base_diverged` 并显示两个动作（ADR-158 补记 2 确认）。

以下位置一律调用它：
- Goal 准备（§10.3.1 步骤 1）；
- base 前进的检测（上文的获取时机、§10.9.3、§10.10）；
- 合并队列 Q2 的 `newBase`（M2，§10.11）；
- `integrated` 的观测（§10.12）。

本地分支 base 直接取 `refs/user/heads/<b>`。
- **“base 前进”**：`baseTip` 的值不等于 `baseCommit`，并且 `baseCommit` 是它的祖先。此时记 Fact `base_advanced{from, to, count}`。
- **变化但不是前进**：值不等于 `baseCommit`，`baseCommit` 又不是它的祖先，且不属于上面的分叉情形（例如远端被强制推送）。此时记 Fact `base_unchanged_nonancestor{from, to}`（ADR-158），提示“base 已变化，但不是在原来的基础上前进”，同样不自动采用。

因此不会出现把 Goal 合并到更旧 base 上的倒退。

```
影子 / 镜像上下文：
env:  GIT_DIR=<影子或镜像>  GIT_WORK_TREE=<卫星>（影子上下文）  GIT_INDEX_FILE=<影子>/index 或临时索引
      GIT_CONFIG_NOSYSTEM=1  GIT_CONFIG_GLOBAL=<Tower 生成的最小配置>  GIT_ATTR_NOSYSTEM=1
      GIT_TERMINAL_PROMPT=0  GIT_OPTIONAL_LOCKS=0（只读命令）  LC_ALL=C
      unset GIT_CEILING_DIRECTORIES GIT_DISCOVERY_ACROSS_FILESYSTEM 等发现相关变量
      GIT_AUTHOR_*/GIT_COMMITTER_* = Tower 身份（检查点、pin）；seal 使用用户身份（§10.6）
git  -c core.fsmonitor=false -c core.untrackedCache=false -c core.hooksPath=/dev/null
     -c core.sshCommand=false -c core.askPass= -c credential.helper= -c protocol.allow=never
     -c core.attributesFile=/dev/null -c diff.external= -c gc.auto=0 -c maintenance.auto=false
     -c core.trustctime=true -c core.checkStat=default -c submodule.recurse=false
     -c core.protectHFS=true -c core.protectNTFS=true            # ADR-123/131/139：拒绝 .git 的等价变体；add 前一次列出并 :(exclude) 全部会被拒的路径，记 excludedPaths → nested_repo
     -c diff.ignoreSubmodules=all -c status.submoduleSummary=false
     <subcommand> … -- . <nestedRepoExcludes>
进程沙箱（ADR-071 第 4 点）：上述 git 进程运行在“只允许执行 git”的 OS 沙箱档位中——
     macOS Seatbelt：process-exec 只允许 git 可执行文件与 git-core 目录（LFS 仓库另加 git-lfs）；
     Linux：bwrap + seccomp 等价规则。即使某个配置漏网，filter/fsmonitor/hook 命令也无法启动。
     网络：GitRunner 档位没有网络。LFS 对象补齐（§10.3.1 步骤 2a）中的 `git lfs fetch` **不在** GitRunner 中运行，见下方“例外”。
```

- **最小全局配置**（`GIT_CONFIG_GLOBAL`）只含：`user.name/email`（Tower 身份）；从用户全局配置复制的 `core.excludesFile` **路径**；从用户仓库配置（优先）或全局配置复制的 `core.autocrlf`、`core.eol`、`core.safecrlf` **取值**，使换行处理与用户自己提交时一致（R4-D13-07）；LFS 项目额外复制用户全局配置中 `filter.lfs.*` 这一组驱动定义（ADR-074，§10.14）。不含任何其他 filter、diff、merge、credential、include 配置。
- **忽略规则**：影子创建时把用户仓库 `.git/info/exclude` 的模式（纯数据）复制到 `<影子>/info/exclude`。**刷新时机**（唯一定义，ADR-210）：每次卫星创建或重建、每次 Run 开始时重新复制，远端 base 与本地 base 相同；获取或检查 base、验证与 pin 都不刷新。这样只经 `info/exclude` 忽略的文件（如 `.env.local`）不会新进入检查点、pin 与 seal（R4-D13-07）；此前已收入影子索引的路径不因之后的忽略规则移出（忽略规则不追溯，§10.7.1 第 1 步，ADR-211）。本条只管不在本地文件清单中的文件；清单中的文件按下一条按路径排除（ADR-207）。
- **本地文件按路径排除**（规则与理由的唯一定义，ADR-206；`16` `ProjectLocalFile` 行、§10.5、§10.8.3、§10.8.4 引用。快照排除什么、何时求值与记录，唯一定义在 §10.7.1 第 1 步，本条是其中 (d) 类的规则，ADR-207）：该 Project 本地文件清单中的路径对 Tower 的每一次快照按路径排除，不论条目是否机密、是否批准、复制时的判定结果如何，与 `.gitignore`、`info/exclude`、`core.excludesFile` 的状态无关（上一条的忽略规则只决定其他未跟踪文件）。所以 Tower 复制进卫星或人工编辑检出的本地文件不进入检查点、pin、seal 或人的改动；指纹与外部写入的判定（§10.3.1）也不含这些路径；Agent 在这些路径上的写入同样不进入快照，与它们被 git 忽略时相同。**唯一的例外**：路径在该 Goal 的 base 树中被跟踪时，它对这个 Goal 是仓库文件，Tower 不复制它（`16` `ProjectLocalFile` 行），也不按本条排除，Agent 对它的改动照常进入快照。含机密的本地文件在交还时仍一律排除（§10.8.4 第 5 步，ADR-167），不受这一例外影响。**清单在 Goal 进行中变化**（ADR-207）：变化在该 Goal 的下一个检查点或 pin 生效，本身不产生 I2 或 `external_change`。加入清单后，Agent 此前写下的该文件从此后的检查点与 pin 中去掉；加入之前已进入某个 pin 的，仍在那个 pin 的差异中（评审时可见），随它的验收进入 seal。移出清单后，它是普通的未跟踪文件，按上一条的忽略规则处理；没有被忽略时，作为新文件出现在每个活跃 Goal 的下一个检查点或 pin 中（移出后首次收入它的检查点或 pin 按人的改动计，记入 `mixedPaths`，§10.7.1 第 1 步，ADR-208/209），`in_review`/`accepted` 中的 Goal 在下一次生成 pin 之前不受影响。人想让 Goal 提交这样一个文件时，先把它移出清单（`project.local_files.remove`），并让它在该 Goal 中不再被 git 忽略（只经 `info/exclude` 忽略的，在上一条的下一次刷新——该 Goal 下一次 Run 开始或卫星重建——后生效；`in_review`/`accepted` 中没有 Run，请求返工后才生效）。
- **嵌套仓库与逃出仓库的符号链接（ADR-071/101/109/111/112，R10-D13-01、R10-D3-01、R10-D7-02、R10-D11-01、R11-D11-01..04）**：**gitlink 永不进入影子索引**（若影子索引中已有 gitlink，先 `git update-index --force-remove`；从人工编辑检出计算 T1 时同样去除 gitlink），git 因此不会进入嵌套仓库启动子进程（R4-D11-01）。真正要防住的是：Agent 造出的仓库形态目录或逃出仓库的符号链接进入 pin/seal、落入用户仓库，被用户自己的 git（不受 Tower 注入的 `safe.bareRepository` 保护）发现。

  **(1) 唯一的权威检查 `pinSafetyCheck(baseTree, pinTree)`（ADR-109/111/112）——只看两个 tree 对象**：在影子上下文中以 `git ls-tree -r` 列出两棵树中的条目、以 `git diff-tree -r --no-renames <baseTree> <pinTree>` 取得增、删、改（含模式变化）的条目，必要时以 `cat-file` 读符号链接目标；**不物化、不依赖验证槽位、与执行时机无关**，同一对 tree 的结果永远相同。**名字比较规则（唯一定义，ADR-120）**：先去除 Unicode 默认可忽略码位（`Default_Ignorable_Code_Point`；HFS+ 忽略的码位是其子集），再做 NFKC 规范化，最后做大小写折叠；`00`、`04`、`05`、`06`、`07`、`11`、`13`、`16` 只引用本条。因此 HFS+ 卷上额外的文件名等价同样被覆盖，不再是已知限制（取代 R12-D15-01 #9 的登记）。规则：
  - (a) **仓库形态候选目录**（ADR-111/116）：在 base tree **或** pin tree 中——**包括仓库根目录本身**（根目录直接含 `HEAD` 类条目时同样是候选目录，伪代码显式处理根，R12-D11-01）——直接含有名字（按上述比较）为 `head`、`commondir` 或 `gitdir` 的**文件或符号链接**的目录。名为 `head` 的目录不算（git 只把非目录的 `HEAD` 当作仓库判定条件）。**对 base→pin 的每个增、删、改条目，若其路径位于某个候选目录之内或就是该目录 → `sentinel{detector:"nested_repo", dir}`**。由此覆盖：标记文件的增、删、只改内容；`config`、`hooks/`、`info/`、`objects/info/alternates` 的修改；`objects/` 或 `refs/` 的增删；`commondir` 的删除等全部变体。git 判定一个目录为仓库的必要条件是含非目录的 `HEAD`，因此“候选目录下的任何变化”覆盖了一切能让该目录**变成**仓库或**改变**其 git 行为的变化——这一陈述以“目录在 base 或 pin 中含 `HEAD` 类条目”为前提，对两棵树都不含此类条目的目录不适用（它们在用户的 git 看来也不是仓库，R11-D3-01a）。
  - (b) **符号链接逃逸**（ADR-112/116/124）：对 pin 中**全部**符号链接在 **pin tree 内**按 POSIX 语义解析整条链：路径中遇到 tree 中的符号链接（包括 base 中未改动的）就按其目标继续解析，深度上限 40。解析**不安全**指以下任一情形：最终路径为绝对路径或越出仓库根（包括指向 Agent 临时目录 `$TMPDIR/tower-<goalId>/`、Agent 存储与任何 S2 写允许根）；成环或超限；经过 tree 中不存在的路径分量（如被忽略的依赖目录，保守视为逃逸）；经过名字（按上文比较规则）等价于 `.git` 的分量。**命中 `sentinel{detector:"symlink_escape"}`** = 链接在 pin 中解析不安全，**并且**满足任一：它是新增或改变的链接；它在 base 中解析安全；它在 base 中的解析结果与 pin 中不同（例如路径中的目录被换成链接，R12-D11-01）。**base 豁免**（ADR-124，R13-D11-02）：base 中原本就不安全、解析结果也没变的链接（如指向依赖或构建产物目录的链接、本来就悬空的链接）不命中，只在信任提示中列出，并照常写出到两种检出——它本来就在用户的主检出中。不再使用词法折叠判断（R11-D11-03）。代价见 `13` §13.11.1。

  **处置：不排除，只阻断**。命中即 severity 3、pin 推导、阻止 Verified 与集成；**pin 不被修改**，因此无需重新生成。人的出路三选一：(i) `override_sentinel`（结构化原因）——覆盖**绑定 `(detector, 路径, 该路径在 pin 中的对象哈希)`**：`nested_repo` 绑定候选目录的 tree 哈希，`symlink_escape` 绑定链接的 blob 哈希；之后该目录或链接的任何变化都使覆盖失效、重新阻断（ADR-112，R11-D11-04）；覆盖后 pin 原样进入 seal，trailer 块写 `Tower-Override: <detector> <路径>@<哈希>`（§10.6）；(ii) 返工，让 Agent 删除或还原这些条目；(iii) **“删除这些条目”**（R11-D8-01）：验收面板与 Needs-You 中的一键动作，等于 `goal.request_changes`，并预填一条 `requiresChange` 评论——列出命中的路径，要求“删除本 Goal 在这些目录中新增的条目、把被改动的 base 条目还原为 base 版本、删除逃逸链接”（ADR-109 注）；人可在发出前编辑这条评论。人也可以改用“我来改”自行处理：命中路径不写入人工编辑检出，但交还对话框提供同样的“删除/还原这些条目”勾选项，由 Tower 在交还写回时按 §10.1.3 执行。**执行位置**：`verify()` 的**第一步**，在一切提前返回（缓存命中、仅 artifact、S0、子模块、生态不支持）之前（`07` §7.4.1）；验收与 seal 时对同一 pin tree 再执行一次（廉价、结果相同，作为防篡改复核）。属于“永不降级”（`13` §13.11.2）。

  **base 夹具**：git 工具类项目在 base 中跟踪的仓库形态测试夹具是候选目录。**目录下没有任何变化**时不命中，按普通内容进入 pin、seal 与评审，并照常写入两种检出（与用户主检出中已有的内容一致）；**目录下有任何变化**（含只改 `config`、`refs/**`）时按规则 (a) 命中——由人覆盖（绑定该目录的 tree 哈希）或删除/还原，而不再只是集成前的确认项（ADR-111 取代 ADR-109 第 5 点的放行，R11-D11-01、R11-D3-01b）。

  **(2) 卫星侧扫描（早期预警，ADR-101/106/109）**：名字粗筛（与规则 (a) 相同的名字比较，匹配非目录的 `head`、`commondir`、`gitdir` 与任何 `.git`，被忽略目录也扫描，§10.1.3 的不跟随方式）+ 在“只允许执行 git”的沙箱中以 `git rev-parse --absolute-git-dir` 确认（缓存键为候选目录中全部相关条目的 stat 汇总）。**只用于运行中尽早提示 Agent 与人**；它不影响检查点、pin 或两种检出的内容，也不作为 Verified 依据（R11-D13-01）。频率与预算见 §10.3.1 与 `13` §13.11.1。

  **两种检出**（§10.8.3–10.8.4）由影子树物化，写出规则（与 `07` §7.3.2 为同一规则：`07` 为概述，本节逐项展开；ADR-111/116/124）：
  - `pinSafetyCheck(baseTree, 该检出的树)` 中**尚未覆盖**的命中路径（目录含子树）与命中的符号链接**不写出**——这包括被改动的 base 夹具；未改动的 base 夹具照常写出。
  - **已覆盖**的 `nested_repo` 目录：pin/seal 中保留 Agent 的版本（人的显式决定）；两种检出中**按白名单写出**（ADR-124，R13-D11-04）：只有纯数据条目——`objects/**`（不含 `objects/info/**`）、`refs/**`、`packed-refs`——写出 pin 版本，**其余一律**（`config`、`config.worktree`、`hooks/**`、`info/**`、`objects/info/**`、`commondir`、`gitdir`、`HEAD`、`worktrees/**` 以及任何未列出的条目）写出 **base 版本**，base 中没有则不写出。覆盖对话框以 Fact 形式列出该目录相对 base 改动的**全部**配置键，命中 `16` 的“可执行或重定向配置键”清单（唯一定义）者高亮——清单不全只影响高亮，不影响写出。
  - **依赖目录**：被忽略的依赖目录来自 depcache 或安装器而非卫星，物化后对这些目录做同样的名字扫描（标记条目按上文的名字比较规则匹配），命中的目录不写出并在信任提示中列出（ADR-116，采用 `07` 的方案，取代此前“不处理、登记于 T31”，R12-D13-01）。
  - 信任提示列出全部未写出的路径及其原因，以及已覆盖、写出了 base 版 git 元数据的目录。
  **S2 的 `.git` 禁令与影子上下文（ADR-123/131，R13-D11-01、R14-D4-04、R14-D11-01）**：
  - **平台差异**：macOS S2 以 Seatbelt 按名字在卫星工作目录任意深度拒绝创建名字在 **ASCII 大小写折叠**下等于 `.git` 的条目（`11` §11.6.2；正则写为逐字符的大小写类），残余为“非 ASCII 等价变体（默认可忽略码位、NFKC 等价）的 watcher 窗口”。Linux S2（M2）的 Landlock 没有按名字拒绝的手段，残余为“**全部** `.git` 名字的 watcher 窗口”；Linux 上的强制手段（例如 fanotify 预检或挂载命名空间约束）列为 **M2 决定点**（`11` T29、`14` §14.4）。
  - **watcher 兜底（`nested_repo_live`，ADR-131）**：沙箱外的卫星 watcher 对每个新出现的名字按上文的比较规则判定。**新建目录先加监视、再扫描其内容**（关闭“目录创建后、监视生效前在其中建条目”的竞态）。`running` 中命中 → 以 abort 方式 drain，进入 `paused(sentinel_high)`，detector **`nested_repo_live`**（severity 3，run 类；交还时保留；**不可覆盖**——没有 pin 可绑定），条目不被 Tower 修改；出口只有 `goal.resume` 附必填转向（要求 Agent 删除该条目）、`goal.take_over`（人在交还对话框中选择删除，由 Tower 在 §10.8.4 第 7 步整体删除——该条目不在 T0 中，人无法经人工编辑检出删除它；交还时没有选择删除、本原因保留而写下 `pendingHandBack` 之后，`take_over` 返回 `E_STATE`，只剩另外两个出口，ADR-215）与 `goal.abandon`（`03` §3.2.1 为唯一来源）；条目从卫星中消失时命中解除，并且**无论是否唯一原因**，一律在剩余原因中加入 `human`（“条目已消失，确认后继续”，由人显式 `resume`）——条目被谁删除并不清楚，这一理由与是否唯一无关（ADR-137，取代 ADR-134 只在唯一原因时生效的例外；删除本身若来源不明，另按 §10.3.1 记入 `external_change`）。`running` 之外的状态中出现的同类条目同时是一次外部写入（§10.3.1），并在下一次影子 `add` 时按下一条处理。发现窗口（watcher 延迟，≤ 2 s）登记为 `11` T29 的残余——期间沙箱外进程仍有 `GIT_CEILING_DIRECTORIES` 与 `safe.bareRepository=explicit`。
  - **git 拒绝收录：一次列出、一次排除（唯一定义，ADR-131/136/139，R15-D13-01、R16-D13-01；`07` §7.3.2 只引用）**：所有影子上下文与 GitRunner 调用注入 `core.protectHFS=true`、`core.protectNTFS=true`。git 在第一个非法路径处即失败，因此 Tower **不靠失败来发现**这些路径，而是在每次影子 `add` 之前自行列出：
    1. **列出**：从工作区路径列表（与指纹同一次遍历，只看名字）中找出 git 在上述两项设置下会拒绝的**全部**路径——判定规则 = 上文的名字比较规则（`.git` 的大小写、默认可忽略码位与 NFKC 等价变体）∪ git 的 NTFS 路径规则（8.3 短名 `git~1`、末尾带点或空格的 `.git`、`.git::$INDEX_ALLOCATION` 一类备用数据流写法），作用于路径的**每一个分量**；
    2. **一次排除**：`git add -A -- . ':(exclude)<路径>'…`（路径数不设上限；排除整个分量所在的目录），被排除的路径记入该检查点的 **`excludedPaths`**（§10.7.1 第 1 步）；
    3. **兜底**：若 git 仍拒绝某条路径（Tower 的规则与该 git 版本有差异），把它加入排除集合重试，并在 Trace 与诊断日志中记录 `{path, gitVersion}` 供规则补齐（不是独立的检测器）（`14` G34 在每个支持的 git 版本上回归）；兜底重试超过 64 次时停止逐条重试，改为把全部已拒绝路径的**父目录**整体 `:(exclude)` 后再生成一次树（这一步总能完成），检查点或 pin 照常完成，被排除的目录列入 `excludedPaths`，以 `nested_repo` 阻断（ADR-139/144 第 19 轮更正）。
    **结果**：`excludedPaths` 非空 → 以 `nested_repo`（列出全部被排除的路径，按“路径 + 名字”绑定，severity 3）阻断 Verified，**不可覆盖**，唯一出口“删除这些条目”（`07` §7.10.1）；`running` 中新出现的这类路径（含只被 NTFS 规则命中、不在名字等价规则之内的名字）按 `nested_repo_live` 的路径以 abort 方式 drain 并进入 `paused(sentinel_high)`。任何情况下都**不**标为 `verify_env_error`——这是 Agent 可控的内容，不是环境故障（ADR-139）。
  - 因此“S2 下不存在可被发现的 `.git`”只在 watcher 窗口之外成立；其他仓库形态在 S2 下可以被写出（它们只是普通文件），Tower 构造的沙箱外环境中的 git 因 `safe.bareRepository=explicit` 不会使用它们，用户自己的环境靠 `pinSafetyCheck` 的阻断。**已知差异**：未来的 git 若以 `HEAD` 之外的条件识别仓库，标记规则需随之扩展——`14` G34 在每个支持的 git 版本上回归，git 升级时重新核对（R10-D15-01 #8）。
- **决定性指纹（ADR-075）**：影子自有索引（Agent 不可写）配合 `core.trustctime=true`、`core.checkStat=default` 的 stat 检查（含 ctime 与 inode，无特权进程无法伪造）即为决定性指纹；全新临时索引的完整重哈希只在两个闸口执行一次：验收（accept）与 seal（R4-D10-01）。`11` §11.8.1 两种复核的“全新临时索引”以 `read-tree <baseCommit>` 初始化、不带 stat 信息（所以全部重新哈希；被跟踪而匹配忽略规则的文件仍在快照中，不会显示为删除，ADR-205）；验收与 seal 的 `full` 闸口的全新临时索引以影子索引此刻收录的树初始化（唯一定义在 §10.7.1 第 1 步“忽略规则不追溯”，ADR-211）；各快照排除什么见 §10.7.1 第 1 步（ADR-207）。预算见 `13` §13.11、`16` §16.2.6。
- **沙箱外进程的 git 环境（ADR-081 第 2 点）**：Supervisor 启动 Engine Host 时设 `GIT_CEILING_DIRECTORIES=<本机全部 wtRoot，以 : 分隔>`，并删除 `GIT_DIR`、`GIT_WORK_TREE`、`GIT_COMMON_DIR`、`GIT_INDEX_FILE`；Host 派生的扩展子进程与 MCP 服务器继承此环境（SDK 下 MCP 由 Tower 的 `createTransport` 以白名单环境启动，白名单含 `GIT_CEILING_DIRECTORIES` 与 `GIT_CONFIG_*`，`05` §5.3.5；RPC 下继承 Host 全量环境，`11` T28）。所有这些环境都经 `GIT_CONFIG_COUNT/KEY/VALUE`（git 认可的受保护作用域）注入 **`safe.bareRepository=explicit`**（ADR-096，git ≥ 2.38；Tower 最低 2.40），与 ADR-072 第 4 点的 `core.fsmonitor=false`、`core.hooksPath=<空目录>` 一起；同一注入也用于 GitRunner、MCP 传输的基础环境（`05` §5.3.5）以及检验检出与人工编辑检出的终端白名单环境（§10.8.3–10.8.4）。代价（R8-D2-01d，登记于 `00` §0.5.1 与 `14` K22）：用户扩展与 MCP 服务器在**任何**裸仓库中（不只卫星中）以工作目录方式运行 git 都会失败，需以 `--git-dir`/`GIT_DIR` 显式指定。集成后的用户主检出不在 Tower 控制之下：添加项目时与设置页建议用户在全局配置中启用同一设置（`00` §0.5.1）。`GIT_CEILING_DIRECTORIES` 中的路径取 `realpath`（git 按规范化路径比较）。GitRunner 自己总是显式给出 `GIT_DIR`，不受该变量影响。

### 10.1.3 Tower 对 Agent 可写路径的原始文件操作（ADR-089 第 3 点，R6-D11-01）

卫星工作目录与 gitdir 都由 Agent 写过：其中任何路径分量都可能是指向别处的符号链接，任何文件都可能是 FIFO 或设备文件。第 6 轮评审已复现两种后果：把 `refs/heads/tower` 换成符号链接后，Tower 的“写 ref 文件”覆盖了沙箱外的任意文件；把 `HEAD` 换成 FIFO 后，检查点流水线在持有 `wtLock` 时阻塞。因此 Tower（沙箱外）对这些路径的原始文件操作一律遵守：

| 规则 | 做法 |
|---|---|
| 只有三类操作 | **创建**（交给 Agent 之前，§10.3.1）、**整体删除**（§10.3.2）、**整体重建**（情形 A/E/F）。Tower 不再向 Agent 可控路径的内部写单个 ref 或索引文件；回退与 rebase 中卫星的 git 状态改由沙箱内的 git 完成（§10.8.1 第 4 步） |
| 逐级不跟随 | 从 Tower 自己创建的根（`<wtRoot>` 的 realpath）开始，以 `openat(dirfd, 分量, O_NOFOLLOW \| O_DIRECTORY)` 逐级打开；任一分量是符号链接即拒绝 |
| 只接受普通文件与目录 | 以 `O_NOFOLLOW \| O_NONBLOCK` 打开后 `fstat`，非 `S_ISREG`/`S_ISDIR`（符号链接、FIFO、socket、设备）即拒绝；读取设大小上限（例如 1 MB）与超时（2 s） |
| 写入与删除 | 写入只发生在 Tower 自己的目录（人工编辑检出交还写回卫星时例外，见下行）；整体重建在旁路目录（`<wtRoot>/.rebuild-<goalId>-<nonce>`）中构造完毕后以 `renameat` 原子替换；删除用 `unlinkat`/递归 `unlinkat`，按 dirfd 逐级进行，不跟随符号链接 |
| 交还写回（§10.8.4 第 7 步） | 每个目标文件：父目录链按“逐级不跟随”打开；在父目录中以 `O_CREAT \| O_EXCL \| O_NOFOLLOW` 写临时文件，再 `renameat` 覆盖目标；目标已存在且不是普通文件 → 跳过并在交还结果中列出 |
| 通过 git 写工作区 | 回退、rebase 写回工作区文件时，影子上下文的 `checkout-index` 自带“前导路径含符号链接则不跟随”的保护；此外 GitRunner 沙箱的**写范围**限定为本次操作所需的目录（影子、临时索引、以及写回时的卫星工作目录），即使 git 有缺陷也写不到卫星之外 |
| 读取 gitdir（ADR-100，R7-D11-02、R8-D11-02） | **不在卫星 gitdir 上运行 git**（git 会读取其中 Agent 可控的本地配置、`include` 与 `objects/info/alternates`）。只有两处读取，都由 Tower **自行只读解析普通文件**（同一解析器另用于 `goal.delete_kept` 确认框与交还对话框数 H/.git 中 Tower 没有记录的提交，§10.1.2 “已脱离副本的求值”，ADR-229/230）：检查点 trailer 的卫星 HEAD（`HEAD` → loose ref 文件或 `packed-refs`）；seal 说明中的 Agent 提交信息（再沿父链读取提交对象：loose 对象 zlib 解压，或按 `objects/pack/*.idx` 在 pack 中定位并解出 commit/delta）。**解析在独立的 worker 进程中进行**：OS 沙箱读范围仅为该 gitdir、无写权限、无网络，内存上限 256 MB（`RLIMIT_DATA`），CPU 与墙钟超时 5 s，超时即杀。规则：逐级 `O_NOFOLLOW`、只接受普通文件；单对象解压后 ≤ 1 MB、总解压字节 ≤ 32 MB（防 zlib 炸弹与超大 delta 结果）；delta 链深度 ≤ 50（同时作为环检测）；总计 ≤ 200 个提交；不读 `config`、`include`、`alternates`；在 gitdir 中找不到的对象（含 REF_DELTA/OFS_DELTA 的基对象只在镜像中的情况）视为缺失，不去镜像查找。任何失败都省略该信息，不影响任何判定（§10.1.2 “已脱离副本的求值”除外：确认框与交还对话框写 `无法计算`，ADR-230/231）。至此 Tower 对卫星 gitdir 只有四种操作：创建、整体删除、整体重建、只读解析 |
| 路径规范化 | Seatbelt 与 bwrap 策略中的每条路径、`GIT_CEILING_DIRECTORIES`、上述根目录，都先取 `realpath`（`/tmp` → `/private/tmp`；否则规则静默失效，ADR-089 第 4 点，`11` §11.6） |

S0 下这些规则同样适用（它们保护的是 Tower 自己的进程，而不是依赖沙箱）。SP6b G21–G23 覆盖符号链接 ref、FIFO `HEAD` 与交还路径中的符号链接（`14` §14.2）。
- 启动时检查 `git --version ≥ 2.40`；SP6b 的攻击用例（G1–G37）在每个支持的 git 版本上回归（`14` §14.2）。

---

## 10.2 命名与位置

| 对象 | 命名 / 位置 | 说明 |
|---|---|---|
| 卫星克隆（Goal 工作目录） | 默认 `<checkoutParent>/.tower-wt.noindex/<repoName>/<goalId>`；回退 `Project.worktreeRoot` 下的 `<projectId>/<goalId>`，或 `~/.tower/worktrees/<projectId>.noindex/<goalId>`（§10.4.3） | ADR-008 位置规则；下文以 `<wtRoot>` 统称实际采用的根 |
| 卫星 gitdir（ADR-081/089） | `<wtRoot>/_gitdirs/<goalId>` | 分离 gitdir，整体归 Agent；工作目录中没有 `.git` |
| 人工编辑检出（ADR-081） | `<wtRoot>/_human/<goalId>` | “我来改”时给人用的副本，带 Tower 新建的 gitdir（§10.8.4）；交还、放弃改动与放弃 Goal 之后脱离、原样保留，Tower 不自动删除（§10.2 “人的工作现场不自动删除”，ADR-228） |
| 卫星中的工作分支 | `tower/<goalId>`（卫星内，Agent 可改） | 只是 Agent 的工作分支，不是 Goal 的事实来源 |
| 镜像库 | `~/.tower/projects/<projectId>/mirror.git` | 每个 Project 一个，Tower 独有；只回收不可达对象（ADR-073、ADR-083，§10.17.1） |
| 镜像中的保留 ref | `refs/tower-live/<goalId>/*`（活跃影子的 ref 副本）、`refs/tower-retain/<goalId>/<verifyId>`（重放证据） | §10.17.1 |
| 影子 git 目录 | `~/.tower/goals/<goalId>/git/<projectId>.git` | 每个 binding 一个；Agent 不可写不可读 |
| 检查点 / pin / seal / 安全快照 / 废弃尝试 / 未写完的交还 | 影子中的 `refs/tower/<goalId>/{cp,pin,seal,abandoned}/<n>`；安全快照是 landmark 为 `safety` 的检查点，与其他检查点一样写为 `cp/<n>`（ADR-210）；交还与带回在写回开始之前保存的 T1 为 `refs/tower/<goalId>/handback-t1`（每个 Goal 至多一个；写入与写回成功时的删除见 `06` §6.4.3 `inspect.bring_back` 行“T1 的保留”，保留见 §10.3.2，ADR-238/239） | 写在影子中。进入用户仓库的只有：集成时的 seal（作为 Goal 分支），以及开启“保留审计地标”时归档阶段的地标检查点（§10.6.2）；pin 从不进入用户仓库 |
| 基线快照 | 镜像中的 `refs/tower/<goalId>/base-snapshot` | §10.5；不写用户仓库，因此用户的 `push --mirror` 不会把未提交的改动推出去 |
| 用户仓库中的 Goal 分支 | `refs/heads/<prefix>/<goalId>-<slug>` | **只在集成时**由 seal 产生（§10.6）。`prefix` 默认 `tower`，项目设置可改；slug：标题中 ASCII 字母数字转小写 kebab，≤ 32 字符，无 ASCII 时省略 |
| 验证器槽位池 | 默认 `<wtRoot>/_verify/slot-<k>`；回退 `~/.tower/verify/<projectId>/slot-<k>` | `07` §7.4.2；槽位工作目录无 `.git`，由 Tower 自有的 `slot-<k>.git`（alternates → 影子与镜像）检出 pin |
| 检验检出（ADR-078、ADR-082） | `<wtRoot>/_inspect/<goalId>` | 人工检验用的 pin 内容副本（§10.8.3），不是卫星、没有 `.git`；关闭、带回与验收或放弃之后同样脱离保留（ADR-228） |
| 存储 | `<wtRoot>/_stores/<goalId>`（Agent 存储）、`<wtRoot>/_stores/_verifier`（验证器存储）、`<wtRoot>/_stores/_shared` | ADR-021、`16` §16.8 |
| Best-of-N 子卫星 | `<wtRoot>/<goalId>~b<n>` | I7 例外，`14` M3 |
| Goal 数据 | `~/.tower/goals/<goalId>/`（`sessions/`、`git/`、`logs/`、`artifacts/`） | 与卫星分离：删除卫星不丢 Trace、证据与检查点 |

**以 `<goalId>` 命名的目录只属于一个 Goal**（唯一定义，ADR-198）：`<wtRoot>` 下以 `<goalId>` 命名的目录（卫星、`_gitdirs/`、`_stores/`、`_human/`、`_inspect/` 之下的 `<goalId>`）只可能由该 Goal 创建：GoalId 在本机不复用，分配时跳过这些位置已有同名目录的编号（`02` §2.2）。“清除全部”保留下来的 `_human`、`_inspect`（`09` §9.12.4）因此不会被之后的新 Goal 认领，§10.3.2 “删除卫星时”、§10.8.3、§10.8.4 按名字删除、写出、改名或列出这些目录都以此为前提。另加一条守卫：`_human/<goalId>` 与 `_inspect/<goalId>` 只以独占方式新建，从不写入或覆盖已存在的路径。路径已存在时：若它**使用中**（唯一定义，ADR-229；下文“人的工作现场不自动删除”、§10.8.3 第 7 步与 `06` §6.4.3 `inspect.bring_back`、`inspect.close`、`goal.delete_kept` 引用：`humanCheckout.path`、检验打开中的检验目录（§10.8.3 第 7 步“检验打开期间”），或此前以 `keep` 关闭、仍待带回或不带回的检验目录；使用中而检验目录已不存在时——人在 Finder 或终端中删掉或移走了它——`inspect.close` 照常成功并结束检验（停止服务、回收端口段，不比较，结果写明 `检验目录已不存在，没有可带回的内容`），`inspect.bring_back` 返回 `E_STATE`（`检验目录已不存在`），ADR-230；打开检验同样按状态判定——检验仍使用中时，不论目录是否存在，`inspect.open` 都返回 `E_STATE`、不新建第二个检验目录，界面指向 `inspect.close`，ADR-231），“我来改”与打开检验返回 `E_STATE` 并列出该路径（检验仍打开时界面回到已打开的检验）；否则它是本 Goal 已脱离的副本（下文“人的工作现场不自动删除”），或中断的接管留下的目录（§10.8.4 第 2 步物化之后、写入 `humanCheckout` 的事务之前，外部编辑器尚未打开；从 `running` 接管时重启后按 `06` §6.1.6 drain 一行进入 `paused(human)`，ADR-200），Tower 不判断其中的内容，先按下文“Tower 自动改名保留”(a) 把它改名，再照常独占新建（ADR-228；取代 ADR-199 的 `E_STATE` 与由人点击的改名，此前的命令参数随之删除）。改名后的目录与“Tower 自动改名保留”所列的其余几处相同，编号分配同样跳过已有这类目录的编号（`02` §2.2，ADR-200）。不提供“沿用此目录”：H 的内容与 gitdir 必须由 Tower 从影子树写出（§10.8.4 第 2–3 步，ADR-094/106/109），已存在的目录无法据此核对。卫星的同类情形按 §10.3.1 步骤 2 的失败处理。

**Tower 自动改名保留**（唯一定义，ADR-221；`06` §6.1.6、§6.4.3 与 §10.8.3、§10.8.4 引用）：Tower 不经人点击而改名的只有五处——(a) 本 Goal 再次接管或打开检验需要原路径时，该路径上已脱离的人工编辑检出或检验目录，或中断的接管留下的目录（上一段，ADR-228；此前的 (a) 是交还与带回之后比较不同时的改名，已删除）；(b) 写回失败转入重建时仍在原位的卫星（`06` §6.4.3 ③）：卫星工作目录与 `_gitdirs/<goalId>` 各自改名，用改名之前取一次的同一时间；(c) 写回失败的 ① 物化完毕时原路径已存在（`06` §6.4.3 ①）：该旁路目录改名为 `<原名>.kept-<时间>`（ADR-222）；(d) 情形 E 重建之前仍在原位的另一半（§10.16.2 情形 E，ADR-224）：卫星工作目录或 `_gitdirs/<goalId>` 中仍存在的那一个；(e) 情形 F 在新路径上重建之前，该路径上已有的同名工作目录或 gitdir（一半或两者，§10.16.2 情形 F，ADR-238；ADR-239 补入本枚举）。做法：在同一父目录内以不覆盖的方式改名为 `<原名>.kept-<时间>`（目标名已存在时在时间后加 `-<序号>`），不复制、不删除。改名后的目录 Tower 从不自动删除，按下一段列出、由人删除，§10.3.2 删除卫星与 `09` §9.12.4 的清除都不删除它（清除结果按“人的工作现场”列出，ADR-222），该次结果（(a) 为接管或打开检验的结果，另提示 `仍打开着它的编辑器与终端请先关闭`——终端的工作目录随改名进入 `.kept-*`，按路径保存的编辑器写进新目录，ADR-229；(b)(c) 为 `write_back_failed` 条目，(d) 为重建的结果与 `satellite.recovered` 的告知，(e) 为 `project.relocate` 的结果与该 Goal 的重建告知）与 Goal 页（`04` §4.6.7）按 `<goalId>.kept-*` 列出其路径（列出 `_gitdirs/<goalId>.kept-*` 时注明其中是 Agent 写过的 git 元数据、不要以它为 gitdir 运行 git，与 `00` §0.5.1 中沙箱外 git 不读取 Agent 可控元数据一行同理，ADR-225），编号分配跳过已有这类目录的编号（`02` §2.2）；S2 与验证器沙箱对它们照常拒绝（它们不是任何 Goal 的卫星、gitdir 或检出）。代价：占用磁盘，直到人删除。

**人的工作现场不自动删除**（唯一定义，ADR-228；§10.3.2、§10.4.4、§10.8.3、§10.8.4，`06` §6.1.6、§6.4.3，`04` §4.6.6、§4.6.7、§4.15，`09` §9.12.4 与 `13` §13.11.3 引用）：Tower 从不自动删除人工编辑检出 `_human/<goalId>`、检验目录 `_inspect/<goalId>` 与各 `<goalId>.kept-*`。交还（含 `take_external`）、放弃改动、放弃 Goal、检验带回、`inspect.close`（不论有无修改、`modified` 取何值）以及验收或放弃触发的检验清理，都只结束 Tower 对它的使用——清除 `humanCheckout`，或结束检验——目录与其中的一切（被 git 忽略的文件、未交还的文件、H/.git 中人做的提交）原样留在原路径，成为**已脱离的副本**；同一 Goal 之后再次接管或打开检验需要这一路径时，按上文 (a) 改名。所以交还、带回、关闭与启动续写都不在删除之前比较目录，写回集合的排除（§10.8.4 第 5 步）只决定什么进入 T1，不再决定副本的去留。已脱离的副本与 `.kept-*` 在 Goal 页（`04` §4.6.7 `保留的目录`）与设置的存储面板（`04` §4.15）按 Goal 列出路径、大小（§10.4.4）与来源，各带 `删除`：命令 `goal.delete_kept{goalId, paths, handbackT1?, listedAt}`（仅本机，`06` §6.4.3）。**列出的来源**（ADR-229）：按每个已知 Project 的 `<wtRoot>`（默认与回退位置，以及 `Project.settings.relocatedFrom` 中的旧 `<wtRoot>`，`06` §6.4.3 `project.relocate`）与清除遗留清单中的根（`09` §9.12.4 “不可访问的根”）扫描名字属于本段所列形状的目录、按 `<goalId>` 归组（后两类位置是 ADR-237 补入的；其中 Tower 创建、已没有当前 `WorktreeRecord` 的卫星 `<goalId>`、`_gitdirs/<goalId>`、`_stores/<goalId>` 与 `_verify/slot-<k>` 同样列出，标 `迁移后遗留` 或 `清除时未删除（当时不可访问）`，只列大小、写明 `其中的一切随之删除`，由存储面板的“清理工作目录”一键删除，§10.3.2；Tower 从不自动删除它们；位置不可访问时注明 `不可访问`；同一根下不属于 Goal 形状的 Tower 目录——`_stores/_shared`、`_stores/_verifier`、`_stores/_shim` 与 `README`——不在列出之列：它们不含目标内容、只占磁盘，清除遗留清单的条目在 Goal 形状的目录删完后移除，此后它们不再被追踪，由你自行删除（如实登记，ADR-239）），不依赖 Goal 的其他记录，所以已清除的 Goal（墓碑行，`09` §9.12.4）的目录照常列出、标为 `（已清除）`；没有 Goal 行的（“清除全部”删去了数据库，再次添加同一项目且位置不变时按名字重新列出）标为 `来源未知（清除全部后遗留）`，删除流程相同（ADR-230）；但该 Project 因另一个 Tower 安装的仓库租约而只读时（`refs/tower/_owner` 属于另一个 `installId`、本机尚未接管，含租约已过期而人尚未确认接管的一段，`06` §6.1.9，ADR-232），其 `<wtRoot>` 中没有本机 Goal 行的这类目录标为 `另一台 Tower 正在使用`（`_owner` 的 `hostname` 与本机相同时写 `另一个 Tower 安装正在使用`，与该处的 Needs-You 文案一致），不提供 `删除`，`goal.delete_kept` 对它们返回 `E_STATE`；租约过期并由本机接管之后照上一句标注与删除（ADR-231）；Project 被清除之后它的 `<wtRoot>` 不再可知，其中的这些目录不再列出，直到再次添加同一项目且位置不变（`09` §9.12.4 的结果因此给出完整路径）——清除时不可访问而记入清除遗留清单的根除外，它们照上文列出，直到你把该条目从列表移除（`09` §9.12.4 “不可访问的根”，ADR-238）。确认框先列出将丢失的内容，求值的上下文只按 §10.1.2 “已脱离副本的求值”一行（ADR-229）：人工编辑检出与检验目录中与本 Goal 最近检查点的树不同的文件（不论是否被跟踪；早于最近检查点的副本会多列出其后的改动，偏保守）与被 git 忽略的条目（被忽略的整个目录写明其中的一切随之删除），H 另列 H/.git 中 Tower 没有记录的提交数（`至少 N 个提交`，取法只按 §10.1.2，ADR-230）；卫星的 `<goalId>.kept-*` 与 `_gitdirs/<goalId>.kept-*` 只列大小并写明 `其中的一切随之删除`，不求 git 信息。影子已删除（归档或放弃 180 天后，§10.3.2）或 Goal 已清除时没有检查点可比，确认框写 `无法与检查点比较：其中的一切随之删除` 并列出文件数与大小；提交数照 §10.1.2 求出。求值的任何一步失败（含磁盘满时临时索引写不出对象、解析超时）时，该部分写 `无法计算，删除前请自行检查`，其余照常列出（文件数与大小只需遍历目录），删除仍可用、确认按钮写 `仍然删除`（ADR-230）。确认后按 §10.1.3 逐级 `O_NOFOLLOW` 删除，中断时留下的残缺目录照常列出，可再次删除。命令只接受本段所列、按名字属于该 Goal 的路径（上文“只属于一个 Goal”；没有 Goal 行时只校验路径在上述列出的来源之下、名字为本段所列的形状，不要求 Goal 行存在，ADR-230；该 Project 因租约只读时返回 `E_STATE`，见上，ADR-231），使用中的路径（上文唯一定义）返回 `E_STATE`；该 Goal 的 `goal.take_over` 或 `inspect.open` 正在本进程中执行（从改名到写入 `humanCheckout` 或 `inspect.opened` 的事务）时返回 `E_BUSY`，反过来 `goal.delete_kept` 执行期间这两条命令同样返回 `E_BUSY`（ADR-229，与写回进行中并列，`06` §6.4.3）；从 `running` 接管时改名在 drain 之后才执行，这一续做同样先等进行中的 `goal.delete_kept` 结束。命令带确认框求值的时刻 `listedAt`（取求值开始、第一次读取这些目录之前的时刻，ADR-231）：所列路径上目录的建立时间晚于它（确认框打开期间经接管与交还换成了新的副本）时返回 `E_STATE`，界面重新求值（ADR-230）；卷不提供建立时间时（某些非 APFS 卷，`<wtRoot>` 的位置见 §10.4.3）改比较目录的状态变更时间 `ctime`——改名与其中顶层条目的增删都会更新它，偏保守，最多多一次重新求值（ADR-231）。没有自动、定时或磁盘压力下的删除（§10.3.2）。检验时带上的本地机密文件（`inspect_with_secrets`，§10.8.3 第 2 步）的副本同样留在已脱离的检验目录中：S2 与验证器沙箱对 `_inspect/**` 读写均拒绝（ADR-082），存储面板为这类目录注明“含本地机密文件的副本”。这一标注由目录本身求出，不依赖 `inspect_with_secrets` 的记录（ADR-231）：所属 Project 的机密本地文件清单（`04` §4.15.1）中任一路径存在于该目录中时注明，人工编辑检出、`.kept-*`、`（已清除）` 与 `来源未知` 的目录同样如此（你自己复制进去的也算）。**H/.git 的对象**（如实登记，ADR-229）：H/.git 经 alternates 取对象于影子与镜像（§10.8.4 第 3 步），影子删除之后（归档或放弃 180 天后，§10.3.2；隐私清除时立即，`09` §9.12.4）H 中的 git 命令因缺少对象而失败，文件本身完整；人做的提交对象仍在 H/.git 自己的对象库中，但不能完整读出。Goal 页与存储面板对这类 H 注明 `git 历史已不可用（文件完整）`；要保留其中的 git 历史，请在影子删除之前在 H 中自行执行 `git repack -a -d` 并删去 `.git/objects/info/alternates`，使它自含对象（磁盘约增加被跟踪内容的打包大小），Tower 不替你做这件事。代价：每次接管与每次检验都留下一个目录，直到人删除（量级见 `13` §13.11.3）；人的工作现场合计超过 10 GB 时提示（口径见 §10.4.4，呈现见 `08` §8.1 “存储提示”）；磁盘压力与磁盘满时，通知与清理建议把它们列在第一条（§10.3.2、`06` §6.8 F8），但从不删除它们。

**分支前缀冲突（R4-D13-05）**：git 不允许同时存在 `refs/heads/tower`（分支）与 `refs/heads/tower/…`（目录/文件冲突）。添加项目时在用户仓库上下文中检查 `git show-ref --verify --quiet refs/heads/<prefix>`；若存在同名分支，或任一远端存在 `refs/remotes/*/<prefix>`，提示改用其他前缀（默认建议 `tower-goals`），并记入 Project 设置。集成前再检查一次；不通过时与其他写分支失败相同，验收不完成，Goal 留在 `in_review`（`06` §6.4.3 `goal.accept`，ADR-189）。

---

## 10.3 卫星生命周期

```
            ensureSatellite()
 absent ──────────────► creating ──► preparing ──► ready ◄──Run 结束──┐
   ▲                        │ fail        │ fail      │ Run 开始       │
   │                        ▼             ▼           ▼                │
   │                     broken        (Fact)       in_use ────────────┘
   │                        │                         │ 检测到卫星丢失（任意非终态 Goal，ADR-076）
   │                        └─────► rebuilding ◄──────┘   （ready、sealed 同样适用）
   │                                      │ ok → 回到丢失前的状态
   │                         ready ──集成开始──► sealed（冻结待集成）
   └──── removed ◄── retiring ◄── Goal archived / abandoned + TTL / 磁盘压力
```

`WorktreeRecord`（Supervisor 持有，⚙️；名称沿用，内容为卫星）：

```ts
interface WorktreeRecord {
  goalId: GoalId; projectId: ProjectId; role: "goal" | "verify" | "integrate" | "inspect" | "human" | "best_of_n";
  path: string;                        // 卫星工作目录
  gitDir: string;                      // <wtRoot>/_gitdirs/<goalId>（ADR-081）
  shadowGitDir: string;                // 影子目录
  state: "creating" | "preparing" | "ready" | "in_use" | "sealed" | "rebuilding" | "broken" | "retiring" | "removed";
  createdFrom: Sha;                    // baseCommit 或 base-snapshot
  prepare?: { recipe: string; startedAt: Iso; endedAt?: Iso; ok?: boolean; logPath: string; physicalBytesEst?: number };
  lastCheckpoint?: number;
  sameVolumeAsCheckout: boolean;
}
```

### 10.3.0 添加项目时的检查（ADR-074）

| 检查 | 处理 |
|---|---|
| 浅克隆（`git rev-parse --is-shallow-repository` 为 true） | 身份暂为 provisional（ADR-028）；**M1 要求先一键 unshallow**（在用户仓库上下文 `git fetch --unshallow`）才能创建 Goal——`clone --shared` 从浅克隆执行会静默退化为完整复制，镜像也无法得到完整历史（R4-D10-02） |
| 部分克隆（`extensions.partialClone` 或任一 `remote.*.promisor=true`） | **M1 不支持**：提示在用户仓库执行 `git fetch --refetch`（转为完整克隆）后重试（R4-D13-03） |
| 子模块（base 中有 `.gitmodules` 注册的子模块） | 允许添加；M1 中子模块路径从影子与槽位排除，Goal 以“未经机器验证（子模块未支持）”进入评审（ADR-071，§10.14） |
| LFS（`.gitattributes` 中 `filter=lfs`） | 用户全局配置定义了 `filter.lfs.*` 时按只读支持处理（ADR-074，§10.14）；否则提示安装并配置 git-lfs |
| 分支前缀冲突 | §10.2 |
| 位置（同卷、同步目录、网络卷） | §10.4.3 |
| 端口能力试运行 | §10.19 |
| 该目录是卫星 | 拒绝（§10.1.1） |

### 10.3.1 创建（`ensureSatellite`，幂等）

```
1. 镜像（镜像上下文，Project 级互斥锁内）：
   不存在 → 以 CoW 复制用户对象库建立 mirror.git（clonefile / reflink；否则完整复制），写入 gc.pruneExpire=2.weeks.ago（只回收不可达对象，§10.17.1）；
       镜像的 HEAD 写为指向不存在提交的占位引用 refs/tower/none（ADR-153：git-lfs 因此读不到镜像中的任何 .lfsconfig）
   若 baseRef 是远端引用 refs/remotes/<r>/<b>：GIT_DIR=<mirror> git fetch --no-tags <r> +refs/heads/<b>:refs/tower-remote/<r>/<b>
     （镜像中执行，不在用户检出中运行；远端名与临时配置按 §10.1.2“Tower 的 git 网络命令”，ADR-155 补记 2、ADR-157；失败则按 baseTip 取值并记 Fact base_fetch_failed）
   GIT_DIR=<mirror> git fetch --no-tags --prune <userCheckout> '+refs/heads/*:refs/user/heads/*' '+refs/remotes/*:refs/user/remotes/*'
     （--prune 只作用于这两个目标命名空间：先删除用户已删除的分支的副本，再写入，因此分支名的目录 / 文件冲突不会使获取一直失败；
      镜像中 Tower 自己的 refs/tower/*、refs/tower-live/*、refs/tower-retain/*、refs/tower-remote/* 不在其中，不受影响，ADR-197）
   baseCommit = 远端引用 → baseTip(r, b)（§10.1.2，ADR-156/157；上面的 fetch 失败时仍按 baseTip 比较现有的两个值，可能取到上一次获取的值）；
                本地分支 → refs/user/heads/<b> → 冻结写入 WorkspaceBinding
2a. LFS 对象补齐（仅 LFS 项目；在步骤 2 的 clone 与检出之前；属于“仓库准备”，ADR-150/151）：
   先从用户主检出的 LFS 对象库以 CoW 复制 base 所需的对象到镜像的 LFS 库（clonefile / reflink；否则完整复制）；
   仍缺的对象：Tower 以**用户身份、在 Agent 沙箱之外**执行一条 git lfs fetch，作用对象只有镜像（不在 GitRunner 的 git-only 沙箱中）：
       用户的全局与系统 git 配置（含 credential helper、ssh 配置）照常生效，与网络认证相关的有效配置按用户主检出的上下文求出（见下文“传递方式”）；仓库级配置不读镜像中的任何配置（HEAD 指向占位引用；镜像自己的 config 只含 Tower 写入的项），
       LFS 配置由 Tower 显式算出（ADR-152/153）：Tower 以 git show <base>:.lfsconfig 读取该文件，**只取白名单中的键**——
         lfs.url、remote.<name>.lfsurl、lfs.<url>.access、lfs.fetchinclude、lfs.fetchexclude，其余一律忽略；
         URL 值只接受 https:// 与 ssh://（及 scp 式 ssh 写法），拒绝 file://、本地路径与其他协议；不合规的值记入诊断日志并忽略，
         并记 Fact lfs_config_ignored{keys, reasons}（ADR-154 补记、ADR-155；来源恒为 base 的 .lfsconfig——用户自己 git 配置中的值
         不做白名单与协议校验，例如内网的 http:// 端点照常使用）：获取成功时显示为提示“◇ 已忽略 LFS 配置：<键>”，
         prepare_failed 卡片在主因之外也列出“已忽略 <键>（不支持的协议）”；
       **按键解析，与 git-lfs 一致**：对每个键，用户主检出的 git 配置中的值覆盖 .lfsconfig 中的值；
         然后端点 = lfs.url ?? remote.<name>.lfsurl ?? 由远端 URL 推导（键优先，不是来源优先——.lfsconfig 的 lfs.url 优先于 git 配置的 remote.<name>.lfsurl）；
         远端名按 §10.1.2“Tower 的 git 网络命令”（ADR-154 补记、ADR-155：远端引用取其远端名，否则 branch.<base>.remote →
           remote.lfsdefault → 唯一的远端 → origin）；git lfs fetch 以该远端名与 base 提交为参数；
       **传递方式（ADR-154/155）**：Tower 按 §10.1.2“Tower 的 git 网络命令”在 ~/.tower/tmp/ 下写一个权限 0600 的临时配置文件——内容为 [include] path = <用户的全局配置>
         （GIT_CONFIG_GLOBAL 取代 git 的两个全局位置，因此按 git 自己的顺序 include 存在的 $XDG_CONFIG_HOME/git/config 与 ~/.gitconfig）
         加上白名单键的有效值，再加上**在用户主检出的上下文中**求出的网络认证有效配置（ADR-154 补记；含仓库级的认证类键，ADR-156）——credential.*、
         http.*（含不带 URL 的全局代理、CA 与 http.<url>.*）、url.<base>.insteadOf、core.sshCommand（SSH 远端按目录选择的密钥，
         ADR-154 补记 2：与用户在主检出中执行 git lfs pull 时使用的 SSH 密钥一致）；它们以 git -C <userCheckout> 读取，按目录生效的
         includeIf "gitdir:…" 因此按用户主检出的路径求值，再加上所选远端的 remote.<name>.url（取自用户主检出，原样写入，ADR-157；
         git-lfs 需要它才能按远端名获取并推导端点），镜像路径上的 includeIf 不再影响结果；只追加 [include] 在镜像中带不进来的值
         （仓库级与按目录生效的值，按 --show-origin 求差集，原样写出），从不清空用户的 credential helper 列表（§10.1.2）；这些值来自用户自己的配置，不来自仓库内容——
         以 GIT_CONFIG_GLOBAL=<该文件路径> 运行 git lfs fetch；命令行与环境中只出现文件路径，不出现任何 URL 或键值；
         命令结束（含失败、超时）即删除该文件；URL 中的凭据只在这个 0600 文件中（与用户自己的配置相同），不进入诊断日志与卡片；
         Agent 沙箱拒绝读取 Tower 数据目录（`11` §11.6.2），其他 Goal 的 Agent 也读不到该文件；Tower 放入的命令行与环境中只有文件路径，由 `05` C29(b) 覆盖。
         其他进程能否被观察，取决于 SP6a A12(a) 的测量结论；macOS 上带凭据的远端本来就不执行（§10.1.2）；
       镜像的 HEAD 指向不存在提交的占位引用 refs/tower/none，git-lfs 因此不会从镜像读到任何 .lfsconfig；
       fetchinclude / fetchexclude：“缺失对象”只针对过滤后需要的对象；被排除的文件在**所有检出**中保持指针——卫星（含 §10.16.2 情形 E 的重建）、验证槽位、人工编辑检出
         与检验检出都从同一个镜像 LFS 库、按同一组规则物化（与用户自己的检出一致，ADR-154）；
         记 Fact lfs_excluded{count, paths（至多 200 条）, patterns, source: "lfsconfig" | "gitconfig"} 并在 Agent 简报中说明，不导致 prepare_failed；
         验证可能因缺少这些文件而失败（与用户本机相同）：验证证据附 lfs_excluded Fact，失败卡片提示“项目配置排除了 N 个 LFS 文件”；
       网络不限主机（batch API 的下载地址可能在对象存储等其他主机，与用户自己执行 git lfs pull 相同）；
       这条命令的输入只来自用户主检出的配置与 base 提交，Agent 在卫星中的写入不参与（ADR-154），因此放宽网络不扩大 Agent 的能力；
       凭据在 git、git-lfs 与 credential helper 之间传递，Tower 不截取、不改写它们（ADR-152；ADR-157 撤回 ADR-155/156 的 store 文件）；
       命令的标准输出与错误输出只进入 Tower 的诊断日志（写入前按模式脱敏 URL 中的 userinfo 与认证头），
       从不进入 Agent 的开场或任何 Agent 可读的位置；prepare_failed 卡片只显示 Tower 生成的摘要（缺失对象数、HTTP 状态类别；
       若由白名单校验导致——端点被拒绝后没有可用端点——写“LFS 配置被拒绝：<键>（不支持的协议）”，不写 HTTP 状态类别，ADR-154；
       其他失败在主因之外列出 lfs_config_ignored 中的“已忽略 <键>（不支持的协议）”，ADR-154 补记）；SSH 远端同理；
   与安装器无关，非 Node 项目同样适用；补齐失败或超时 → paused(prepare_failed)（原因“LFS 对象缺失：<数量>”）——不允许 Agent 在指针文件上工作
2. 卫星（在交给 Agent 之前完成；之后 Tower 不再在卫星上下文中运行 git；以下 git 命令均按 §10.1.2 加固；`<wtRoot>` 此时已存在——只按 `06` §6.1.6 “Tower 不重新建立根”建立，不存在而不可建立时该 Goal 判为不可达、准备中止，所以 clone 不会替它建立缺失的上级目录，ADR-239）：
   G=<wtRoot>/_gitdirs/<goalId>；W=<wtRoot>/<goalId>
   git clone --shared --no-checkout --separate-git-dir=$G <mirror> $W   # alternates → mirror/objects（ADR-081）
   rm $W/.git                                                         # 删除 gitdir 指针文件：工作目录中没有 .git
   GIT_DIR=$G git remote remove origin                                # 卫星没有任何远端（ADR-074）
   写入模板配置 $G/config（纯文件写入）：user.name/email = Agent 身份；core.hooksPath = Tower 空目录；
       不写 core.worktree（工作树由 GIT_WORK_TREE 给出）；不定义任何驱动（LFS 项目复制用户全局的 filter.lfs.* 定义）；
       core.repositoryformatversion 等基础项
   清空 $G/hooks/；写入标记 $G/tower-satellite（以上都发生在交给 Agent 之前、在 Tower 刚创建的目录中；之后这些文件归 Agent，ADR-089）
   GIT_DIR=$G GIT_WORK_TREE=$W git checkout -b tower/<goalId> <baseCommit>
   LFS：GIT_LFS_SKIP_SMUDGE=1 检出后，由 Tower 从镜像的 LFS 存储 smudge 受跟踪文件（§10.14）
   写检出完成标记 ~/.tower/goals/<goalId>/checkout.done（Tower 数据目录，Agent 不可写；ADR-151）；此后 watcher 才开始监视该卫星（ADR-153）
       重试时卫星存在而标记缺失 → 删除工作目录后重新检出，gitdir 与影子保留；`take_over` 要求标记存在，否则 E_STATE（“工作区尚未建立”）
3. 影子：git init --bare ~/.tower/goals/<goalId>/git/<projectId>.git
         <影子>/objects/info/alternates = <mirror>/objects；复制 info/exclude（§10.1.2）
         影子索引：GIT_INDEX_FILE=<影子>/index git read-tree <baseCommit>（影子上下文）
4. 本地文件播种（ADR-078/165/166）：把 Project 已批准的“本地文件”清单中的**普通**条目复制进卫星。含机密的本地文件不播种到卫星、验证槽位或检验检出（判定与取消标记见 `11` §11.6.2，`16` 的 `ProjectLocalFile`；每次复制前按名字与当前内容重新判定，判定与复制用同一次读入的内容，见 `16`，ADR-170/171）；只有人在打开检验时显式选择“带上本地机密文件”，才复制进那一个检验检出（§10.8.3）
5. preparing：依赖物化与 Agent 存储预热（§10.4），日志写 ~/.tower/goals/<goalId>/logs/prepare.log
6. ready：时间线上以 baseCommit 作为“起点”（不建检查点 ref，它不对应任何 Pi entry）
```

`--shared` 使卫星不复制对象（秒级、几乎不占空间），它依赖的是 Tower 自己的、只回收不可达对象的镜像（§10.17.1），而不是用户的活动对象库。镜像的建立成本是一次 CoW 复制（APFS 上为元数据级）；不支持 CoW 的卷上为一次性完整复制，计入 §10.4.4 的磁盘预算。

失败处理（ADR-149）：步骤 2 失败（路径已存在且不属于本 Goal）→ 卫星记 `broken`，Goal 进入 `paused(prepare_failed)`（继续目标 `run`，`queuedRun` 保留；不在启动时自动解除，不 `autoResume`），Needs-You `stalled{prepare_failed}`（severity 2，去重键 `st:{goalId}:prepare`），出口为 `resume`（改名重建卫星后重试）与 `abandon`（卫星不可用时不提供 `take_over`）。**步骤 5（依赖物化）失败不阻止 Run**：安装器失败或超过 `prepare.depsTimeoutMin`（15 min，`16` §16.2.2）→ Goal 以 Fact `prepare{ok:false}` 照常进入 `running`，Agent 简报中附带失败日志尾部，Live Line 显示该 Fact——修复 lockfile 正可能是这个 Goal 的工作。验证器自己的安装器失败另按 `verify_env_error` 处理（`07` §7.4.3），与此无关。

**运行模式与准备阶段。** 卫星创建与依赖准备期间 Mode = `preparing`（`02` §2.4），Live Line 例如 `准备中 · 依赖 · pnpm install · 47s`（词表以 `12` §12.6.4 为准）。**准备阶段的步骤顺序与计时（唯一定义，ADR-149/150）**：准入通过时写 `goals.preparing_since`，在 `run.started`、中止或失败时清除（`06` §6.8 F8 的中止除外：保留，解除时据此启动恢复，ADR-233）；`queuedRun` 在 `run.started`、`abandon` 以及 Goal 进入 `ready`/`paused` 以外的任何状态时清除（ADR-151）；之后依次——① **仓库准备**：镜像首次建立（含跨卷的完整复制）→ 等待项目锁 → 远端 fetch → LFS 对象补齐 → `clone --shared` 与检出（含 LFS 内容写出；步骤 1、2a、2–4），时限 `prepare.repoTimeoutMin`（默认 15 min），**不计入 120 s**（ADR-151）；检出以完成标记判定，重试时卫星存在而标记缺失则删除工作目录后重新检出（gitdir 与影子保留）；② **依赖物化**（步骤 5），时限 `prepare.depsTimeoutMin`（15 min），超时或失败不阻止 Run（见上文“失败处理”）；③ **Host 握手与开场组装**（含 Host 启动之前的静态清单计算，其中全局根查询另有 60 s 时限，`05` §5.10，ADR-215）。**120 s 时限只计 ③**（ADR-151）。① 失败或超时、③ 失败或超过 120 s → `paused(prepare_failed)`（同上，路径冲突以外的失败在检出完成标记存在时也提供 `take_over`；因 `ENOSPC` 失败的归 `06` §6.8 F8，不写 `prepare_failed`，ADR-233）。**重试从已完成的步骤继续**：各步骤幂等，已存在且校验通过的镜像、LFS 对象与卫星直接复用。**启动恢复**只对 `state = ready`、`preparing_since` 非空且没有任何暂停原因的 Goal 生效（回到排队）；已暂停的 Goal（例如人在依赖物化期间暂停）不受影响（ADR-150）。**准备期间的命令**：仓库准备（①）与依赖物化（②）进行中 `pause` 允许并中止该步骤（→ `paused(human)`，继续目标 `run`，`queuedRun` 保留；已获取的镜像与 LFS 对象保留，重试时复用，ADR-150 补记），`take_over` 返回 `E_BUSY`；Host 握手与开场组装（③）进行中 `pause`/`take_over` 返回 `E_BUSY`；`take_over` 任何时候都要求检出完成标记存在，否则 `E_STATE`（ADR-151）；进度以事件 `prepare.progress{step, done, total, bytes?}` 报告（`16`）；`abandon` 始终允许并中止准备（清除 `queuedRun`）。**准备中途到达其他原因**（外部写入或任何系统暂停原因）→ 中止准备，Goal 以这些原因进入 `paused`，继续目标 `run`，`queuedRun` 保留（与 `drainingFor{target:"pause"}` 相同的合并规则）。安装器的预取步骤（ADR-093，浏览器与引擎常有数百 MB）同样显示为 `preparing` 的子状态，带进度，文字按 `12` §12.6.4 的步骤名（步骤名固定，预取显示在 `依赖` 一步中）与 `<对象> <总大小> <百分比>` 格式，例如 `准备中 · 依赖 · Playwright chromium 230 MB 40%`（R9-D9-01）；它位于首次验证的关键路径上，耗时预算见 `13` §13.11.1（R7-D10-01b）。

**嵌套仓库扫描——卫星侧早期预警（ADR-089 第 2 点、ADR-096/101/106；取代 ADR-072 的控制校验）**：按 §10.1.2 第 (2) 层进行（名字粗筛按 §10.1.2 的名字比较规则 + git 确认），粗筛以 §10.1.3 的不跟随方式遍历。**决定性的是 §10.1.2 第 (1) 层的 `pinSafetyCheck`（只看 tree 对象，ADR-109）**；本扫描不影响 pin 的内容，也不作为 Verified 依据。**监视的生命周期（R9-D13-01a）**：卫星存在的**所有非终态**都由 Supervisor 的文件系统监视（FSEvents/inotify，与 `07` §7.3.2 的 I2 监视为同一路，`running` 期间同样开启——它也是 `external_change` 的事件来源，归因规则见下）维护候选集：事件路径中出现或变化的、名字按 §10.1.2 的名字比较规则为 `.git`、`head`、`commondir`、`gitdir`、`objects`、`refs`、`config` 的条目，使其父目录成为（重新）确认的候选；事件按目录合并、每 1 s 至多处理一批，洪峰（单批 > 10 000 个事件或丢事件标志）时放弃增量、在下一个检查点前做一次全量粗筛（预算见 `13` §13.11.1）；git 确认在每个有变更回合的检查点时对新候选执行。**全量粗筛**：Run 开始前、任何人工交接之前（创建人工编辑检出、打开检验检出）、Tower 自己的写回（交还、检验带回）完成后、丢事件或监视降级时，以及 S0 下的每次 settle 与影子操作前（目标：10 万个条目 ≤ 1 s，被忽略的依赖目录同样遍历但只看名称）；git 确认每个候选约 5–10 ms，单次全量至多 200 个新候选（超出部分直接按“是仓库”处理并提示）。处置按 §10.1.2 的表：**不拒绝接管或检验**；Tower 不自动删除任何目录（可能含 Agent 的工作）。**不检查 gitdir 的内容**：gitdir 整体归 Agent，其中任何文件都只被沙箱内的 git 读取。`git_control_tampered` 检测器退役（`16` §16.1.13）。S0 下 Agent 能放置 `.git`，沙箱外的扩展 git 在下一次扫描之前可能发现它——这是 T29 的 S0 残余（高）。

**卫星写入的归因与 `external_change`（R10-D6-01、ADR-121/122，R13-D4-02/03、R13-D6-01、R13-D7-01）**：FSEvents/inotify 不提供写入者，Tower 以“谁可能在写”加“内容是否真的变了”判定。每批文件系统事件按序归因：

| 序 | 条件 | 归因 | 处理 |
|---|---|---|---|
| 1 | 事件路径落在 Tower 当前登记的**写回窗口**内（回退恢复、自动 rebase 写回、交还写回、检验带回、依赖物化、`mark_secret` 删除已播种的本地文件副本（ADR-176，`16` `ProjectLocalFile` 行）；准备期间的卫星检出与重试时删除未完成工作目录——检出完成标记出现之前 watcher 根本不监视该卫星，ADR-153；窗口登记路径集合与起止时间，写回期间该卫星的事件触发暂停，§10.6） | Tower | 窗口结束后一次性重算指纹，不判 `external_change` |
| 2 | `running` 中，有 Agent 工具调用正在执行，**或**本 Run 的进程中仍有存活者——Supervisor 以**进程树与 Run 令牌的并集**识别 Agent bash 派生的全部进程（含开发服务器、`--watch` 编译器与测试运行器等后台进程）：在 `exec` 记录的进程树中，或环境中含本 Run 的 `TOWER_RUN_TOKEN`，即属于该 Run。经 `setsid`、双重 fork 脱离进程树的后代只能靠令牌识别；macOS 上脱离进程树的 Apple 平台二进制识别不到，是登记的窗口（ADR-142/158，见下文“后台进程的识别”；Linux 以 cgroup 为主——**每个 Goal 一个父 cgroup、每个 Run 一个子 cgroup**，取值唯一定义在本处，`06` §6.1.10 只引用，ADR-145） | Agent | 照常；内容进入下一个检查点 |
| 2′ | **（M2）人的 `user_bash` 调用窗口**（先于第 2 行判定）：人通过 Pi 输入的 `!cmd` 使用 Tower 的另一个 `BashOperations` 实例，Tower 在调用时即知道是哪个实例、调用何时开始与结束；**只有该调用窗口内**（命令开始到返回）发生的写入 | 人（`author:"human"`）；与 Agent 工具调用窗口**重叠**、或窗口内有其他 Agent 进程存活时写入的路径记 `mixed` | 进入下一个检查点并按人的改动归因（计入 `03` §3.2.1 的归因窗口）。**并发**（ADR-146/147）：`user_bash` 调用窗口与某个 Agent 工具调用窗口重叠期间写入的路径，以及窗口内有**不属于该 `user_bash` 调用进程树**的 Agent 进程仍存活时写入的路径（Tower 以两个 `BashOperations` 实例各自已知的直接 pid 及其后代区分），一律记入该检查点的 `mixedPaths`，不记为纯 `human`；只有没有重叠、也没有其他 Agent 进程存活时，才按人的调用窗口归因。`user_bash` 启动的**后台进程**在调用返回后的写入不属于本行，按第 2 行（Run 进行中）或第 3 行（存活进程期间）记为 `agent`，它们同样在 settle 第 3 步被终止。环境中的 `TOWER_ORIGIN` 只用于诊断，**不作为归因依据**——它可以被 Agent 设置（ADR-145）。M1 中 `user_bash` 不单独区分 |
| 3 | settle 之后存在**未解决的 `bg_process_survived`**（下文第 3 步）期间的写入；以及 Engine Host 退出或挂死之后（冷启动与 Tower 运行中）、`06` §6.1.6 终止的一轮完成之前，该轮范围内令牌已确认的存活者所在 Goal 的写入（ADR-228） | Agent（附 `bg_process_survived` 注记：由该检测器条目打开期间（检出到解决）的 `anomaly{bg_process_survived}` Fact 推导显示，不存储在检查点上，ADR-213） | 不走 `external_change`，也不可能被采纳为人的改动；在 `claimed`/`verifying`/`in_review`/`accepted` 中这些写入使卫星树 ≠ pin → 按 I2 重新生成 pin 并验证，`verifyOrigin:"agent_bg"`（ADR-122） |
| 4 | 以上都不成立 | 外部候选 | 以影子索引 stat 检查（决定性指纹，ADR-075）比较当前工作区与下文的**归因基线**；内容确有变化的路径集合记为 **E**；内容未变（只有 mtime/元数据事件）→ 忽略。按所处状态处理，见下 |

**归因基线（唯一定义，`03`、`04`、`06`、`07` 只引用，ADR-114/122）**：检测到该外部改动之前、最近的**任意**检查点（含 `agent_bg_done`、`human_edit`、`external_change_kept`、`safety` 等非回合检查点）；Goal 处于 `claimed` 或之后的状态（`claimed`、`verifying`、`in_review`、`accepted`）时，归因基线就是**当前 pin 的检查点**：树与记录的 L 都等于当前 pin 的最近一个检查点（例如 settle 第 4 步的 `agent_bg_done` 检查点，或 §10.7.1 第 1 步在 pin 之前写的 `safety` 检查点）；没有这样的检查点时（例如加入清单后重新生成的 pin）取当前 pin 本身，按它记录的 L 比较（ADR-210）。`claimed` 之前没有任何检查点时为当前 pin，也没有 pin 时为 `baseCommit`。

**第 4 行（外部写入 E）按状态的处理（ADR-122/128/129/134）**——检测结果写入持久状态 **`Goal.externalChange`**（`02` §2.4，`06` JSON 列，事件 `goal.external_change.detected` / `.resolved`）：`paths`（E，重复检测时并入）、`mixedPaths`、`baselineCps`（归因基线，首次检测时确定、之后不变）、`detections`。检测时所处的状态**不**记在 `externalChange` 中：Goal 第一次进入 `paused` 时写入的**继续目标** `Goal.continuation`（`02`，唯一规则在 `03` §3.2.1“离开 `paused` 的唯一规则”）决定解除后去哪里；`detectedIn`、`resumeTo`、`pendingVerify` 已废弃（ADR-134，`16` §16.1.13）。

- **`running`**：检测时在**同一事务**中把 E 并入 `externalChange.paths` 并写 `Goal.drainingFor = {target:"pause", reasons:["external_change"], …}`（ADR-141；`06` 的 `CHECK`：`externalChange` 非空 ⇔ `pauseReason`/`alsoApplies`/`drainingFor.reasons` 任一含 `external_change`）——因此 drain 期间崩溃或退出时 E 不会丢失，也不会被恢复前的 `safety` 检查点归入 Agent（恢复的唯一规则在 `06` §6.1.6）；drain 期间到达的其他暂停请求只**并入** `drainingFor.reasons`。Run 以 abort 方式 drain 到回合边界，期间产生的回合检查点对 E 中的路径逐路径记为外部（`Checkpoint.externalPaths`），**同一路径上也有 Agent 工具写入时记为 mixed**（`externalChange.mixedPaths` 与该检查点的 `Checkpoint.mixedPaths`，ADR-128/135）；drain 结束时 `pauseReason` = `drainingFor.reasons` 中按 `16` §16.1.1 优先级最高者，其余进入 `alsoApplies`，继续目标 `{kind:"run"}`，清除 `drainingFor`。
- **settle 序列中**（`agent_settled` 之后、进入 `claimed` 之前，ADR-129/134/137）：只有在第 3 步的进程树**已清空之后**才可能检测到——清空之前本 Run 追踪的进程仍有存活者，写入按归因表第 2 行归为 Agent（已知误判 (a)）。有效提交保留；进入 `paused(external_change)`，继续目标 `{kind:"settle"}`。**settle 序列中由任何原因进入的暂停**（外部写入、人暂停、`app_quit` 等）继续目标都是 `settle`；全部原因解除后**从宽限确认起重新执行完整 settle 序列**，有效提交保留，不开新 Run（ADR-137）；Host 已不存在时（例如重启后）按 ADR-143：加载会话、不开 Run，引擎空闲即视为宽限满足，按令牌终止残留进程，然后 `agent_bg_done` → I4（以持久化的工具事件判定）→ pin 与 `claimed` 同一事务。
- **任何非 `running` 状态**（`ready`——检出完成标记存在时（ADR-153：标记出现之前 watcher 不监视该卫星）、`claimed`、`verifying`、`in_review`、`accepted`、`paused(*)`）：Goal 进入 `paused(external_change)`，继续目标按来源状态写入（`ready` → `run`，`queuedRun` 保留，ADR-147；`claimed`/`verifying` → `verify{pin}`（源状态取 `Goal.verifyFrom`；pin 与 `claimed` 在同一事务中产生，`claimed` 中总有 pin，ADR-137），`in_review`/`accepted` → `review{state, pin}`）；已处于 `paused(*)` 时只记入 `alsoApplies`，**不改变**当前 `pauseReason` 与继续目标；`verifying` 中检测到时取消当前验证（它验证的 pin 不受影响）。**来源不明的内容不会先被验证或评审，再等人决定。**
- **`integrated`（24 h 宽限期，唯一定义，ADR-194）**：不做第 4 行的检测、不进入 `external_change`——被合入的已是人验收的 seal，卫星只为撤销合入保留；宽限期结束归档时这些写入随删除卫星的前提进入 `safety` 检查点，不进入任何 seal。`goal.undo_integrate` 回到 `accepted` 后立即对卫星做一次影子索引 stat 检查（归因基线为当前 pin 的检查点），内容有变化的路径按上一条作为一次检测处理（→ `paused(external_change)`，继续目标 `review`），所以这些内容同样不会不经处置就进入之后的检查点或 seal。
- **人工编辑检出存在时**（`paused(human)`）：`external_change` 照常记入 `alsoApplies` 与 `externalChange`，由交还第 6 步一并处置（§10.8.4）——此期间 `goal.external_change.keep`/`revert` 返回 `E_STATE`（ADR-183：接管期间检查点链上不出现新的内容检查点，交还的比较基准因此只有接管时的检查点或重建树）；`external_change` 未解除时 `goal.take_over` 与 `run.rewind` 返回 `E_STATE`（须先 keep/revert，ADR-128/145）。

**I2 与 `external_change` 的分界（唯一定义，`03` I2、§3.1、`06` §6.2.3 只引用，ADR-128）**：`in_review`/`accepted` 中指纹变化时，若变化来自 Tower 自己的工作（rebase、合并队列写回）、人的显式采纳（`keep`、交还、检验带回；评审中的就地编辑属于 M2，保存后同样是一次外部写入，须在外部改动卡片上确认“采纳为我的改动”即 `keep`，ADR-122）或存活进程（归因表第 3 行，`agent_bg`）→ 按 I2 进入 `verifying`；来源不明（第 4 行）→ `paused(external_change)`。

**`external_change` 的出口**（命令 `goal.external_change.keep` / `goal.external_change.revert`，`06` §6.4.3；决定 `keep_external_change` / `revert_external_change`；Needs-You kind `external_change`，`16` §16.1.7）。两个命令都只做两件事：**解除 `external_change`**（清除 `externalChange`，事件 `.resolved`），以及在下文注明时**显式改写**继续目标；离开 `paused` 只经唯一转移函数 `onAllReasonsCleared()`（`03` §3.2.1，ADR-134）：

- **保留**：Tower 立即做一个非回合检查点，`author:"human"`、landmark `external_change_kept`；E 中路径改记为人的改动，`mixedPaths` 中的路径写入该检查点的 `Checkpoint.mixedPaths`（评审中显示为 `mixed`，不作为“你的改动”，ADR-135）。决定界面写明“将作为你的改动写入提交”，seal 因此写 `Tower-Human-Edit`。**改写继续目标**：为 `verify`/`review` 时改为 `verify_new`；其余目标不变（ADR-140：继续目标只表示去哪里）。本决定追加到 **`Goal.pendingOpenings`**：下一次任何 Run 开始时，开场含 `tower.external_resolved{kept, reverted, mixed}`（≤ 120 token），列出被采纳的路径并要求 Agent 不要回退它们。之后验证失败是否自动返工**由归因窗口决定**（唯一定义在 `03` §3.2.1，ADR-140/144）：本次 `external_change_kept` 检查点是 `author:"human"`，落在窗口内，因此失败不自动让 Agent 返工——`settle` 目标下同样如此，不需要另设标志；人之后明确把工作交给 Agent 时（哪些决定算数只按 `03` §3.2.1 的封闭列表）窗口起点前移，自动返工随之恢复。
- **撤销**：`restorePaths(归因基线, E)`（§10.8.1：只恢复 E 中的路径；恢复之前先做 safety 检查点，可再撤销，ADR-176；卡片注明“撤销会一并撤销 Agent 在 mixed 文件上的编辑”）；不改写继续目标；本决定同样追加到 `Goal.pendingOpenings`，下一次 Run 的 `tower.external_resolved` 列出被撤销的路径（含 `mixedPaths`——Agent 在这些文件上的编辑也被撤销，ADR-140）。**剩余差异只考察 E 中的路径**（ADR-134，R15-D4-02）：恢复之后，E 中仍与基线不同的路径（只可能来自恢复期间的并发写入）才按归因表分类——存活进程的写入 → `agent_bg`，其余 → 一次新的检测。**E 之外的路径不参与判定**，它们的归因由检查点链决定（drain 检查点中 Agent 工具写入为 `agent`，settle 序列中被追踪进程的刷写为 `agent`）；因此 `running` 中检测后 `revert`，Agent 在检测前后对其他文件的编辑原样保留，回到 `running` 不产生新的检测（G36b(h)）。
- **继续**：由 `onAllReasonsCleared()` 统一执行（`pendingHandBack` 优先，其次继续目标；目标为 `verify`/`review` 而当前树 ≠ 目标 pin 的树时由守卫改为 `verify_new`，`03` §3.2.1）；本节不另列按状态的去向。仍有其他原因时剩余最高者成为 `pauseReason`。
- `goal.resume` 对 `external_change` 返回 `E_STATE`（只能经上述两个命令解除）。
- **卡片**（ADR-128；接管期间只显示、不提供 keep / revert，由交还第 6 步处置，ADR-183；Needs-You kind `external_change`，severity 2，`costOfDelay` 在继续目标为 `run`/`settle` 时为 `agent_blocked`、否则 `none`；去重键 `ec:{goalId}`，重复检测时并入路径；keep → `actionable`，revert → `false_positive`）：“检测到 N 个文件在没有 Agent 工具调用、也没有被追踪的 Agent 进程时被写入——可能来自你的编辑器、其他程序，或未被追踪的 Agent 后台进程”；`external_change` 只在 `alsoApplies` 中时卡片照常出现，并标“当前暂停原因：…”。
- **观测到合并**（§10.12）：满足 §10.12 的 `integrated` 唯一条件时（M1 只观测本地 base），未解除的 `external_change` 以 `obsolete` 关闭（先对卫星做 safety 检查点，并在集成摘要中列出）；不满足时只记 `local_merged`，`external_change` 照常保留（ADR-137/143）。
- **`Tower-Human-Edit` 只对显式的人工决定写入**：交还（写回集合中 B→T1 的路径，§10.8.4 第 8 步）、检验带回（写回集合中 T_pin→T1 的路径，§10.8.3 第 7 步）、`keep_external_change`（M2 的就地编辑经同一 `keep` 确认）；写入条件唯一定义在 §10.6 seal 模板（ADR-183）；来源不明且未经处置的内容不会以人的名义进入 seal，也不会被验证或评审（ADR-114/122/128）。

**Agent 进程树的生命周期与 settle 顺序（ADR-115/121，R11-D6-01b、R12-D6-01、R13-D4-01、R13-D6-01）**：`running` 期间（含回合之间）保留，这是 G35 的前提。Run 结束时严格按以下顺序：

1. `agent_settled`（ADR-025）；
2. **2 s 宽限确认**（ADR-025/135：连续 2 s `isStreaming=false` 且 `isCompacting=false`，压缩结束后重新计时）——宽限失败的去向**只以 `05` §5.5 为唯一定义**（ADR-129：不记异常，回到等待下一次 `agent_settled`，有效性在下一次 settle 时重新判定；进程此时尚未被终止）。Tower 不开任何提醒回合，也不以 user 角色注入消息（ADR-121 中的提醒回合已作废）；
3. **终止本 Run 的全部进程并等待清空**：Linux 以 cgroup 整体终止；macOS 按**进程树与令牌的并集**枚举（见下文“后台进程的识别”，ADR-158），每个进程发信号前再确认一次（防 pid 复用）：令牌识别的进程重读环境，进程树识别的进程重新遍历进程树。SIGTERM 后最多 10 s（给进程刷写输出的时间），随后 SIGKILL；仍有存活者记 `anomaly{detector:"bg_process_survived", pids}`（severity 2，不阻断），生成 Needs-You（kind 见 `16` §16.1.7，去重键 `an:{goalId}:bg_process_survived`，选项“再次终止”/“知悉”，ADR-126），其后的写入按归因表第 3 行处理；Trace 记 `agent_processes_terminated {count, names, survived}`；等待期间实况行为 `已停 · 收尾 · 等待后台进程 <剩余>/<总数>`（唯一定义 `12` §12.6.4）；
4. 补做 `agent_bg_done` 检查点（§10.7.1 的非回合入口）——它的树就是 pin 的树；
5. I4 判定；有效时**在同一事务中生成 pin 并进入 `claimed`**（写 `Goal.verifyFrom = claimed`，ADR-137），因此 `claimed` 中总有 pin；无效时按 `05` §5.5 的 settle 判定表（或 `paused`/`in_review`）。`03` I4 的有效提交按 ADR-121 以工具事件判定（最后一次 `submit` 之后没有变更类工具调用——唯一定义在 `16` §16.1，ADR-130）；`submit` 之后**仅由后台进程**产生的变化不使提交作废，它们进入 `agent_bg_done` 检查点，随 pin 一起被验证与评审。

撤回到 `running`（`claimed` 中因 `agent_start` 撤回，ADR-025；同一事务把 `runs.phase` 写回 `running`，ADR-146）或 `app_quit`/`engine_crash` 后自动恢复时，若有进程曾被 Tower 终止，以 `tower.processes_terminated` 列出被终止的命令与原因：恢复时作为第一条消息；run 已在进行时以 `sendCustomMessage(…, {triggerTurn:false})` 投递（RPC 下由 tower-goal 执行 `pi.sendMessage`，契约测试 C32，ADR-129）。**settle 序列中检测到外部写入**（只在进程树清空之后）按上文进入 `paused(external_change)`，继续目标 `settle`，解除后从宽限确认起重新执行 settle 序列（ADR-137）。

**后台进程的识别（唯一定义，ADR-142，取代 ADR-115/121/128/135/138 中以 pid、启动时间与进程组识别进程的全部规则）**：每个 Run 生成 128 位随机令牌 `TOWER_RUN_TOKEN`，由 Tower 提供的沙箱 `BashOperations` 的 `exec` 实现**自身**加入每条命令的环境（`05` §5.3 `createSandboxedBashOperations`，ADR-144）——不依赖 `spawnHook`：Pi v1.2.0 中 `user_bash`（人通过 Pi 输入的 `!cmd`）调用 `operations.exec` 时不带 env、不经 `spawnHook`，但 `operations` 是 Tower 的实现，Agent 的 bash 工具与 `user_bash` 两条路径都经过它；子孙进程继承令牌。**持久化的只有令牌**（每 Run 一行，`06` `runs.process_token`），不随进程出现或退出写任何事件或行。识别：同一用户、同一开机会话中，环境里含该令牌的进程即属于该 Run——macOS 以 `sysctl(KERN_PROCARGS2)` 读取进程环境，Linux 以 cgroup 为主、令牌为辅。**macOS 的平台事实**（ADR-158，R32-D6-01，评审在 macOS 27 上实测）：非 root 进程读取 Apple 平台二进制（`/bin/bash`、`/bin/sleep` 等）的环境时，读取**成功返回，但环境为空**，令牌识别对它们失效。因此：
- **进程树与令牌取并集**：Tower 的 `exec` 为每条命令记录直接子进程，这份记录只在 Host 内存中。① settle 终止、③ 文件事件批次的判断与 ④ 存活者复查，都从这些直接子进程出发，以 `proc_listchildpids` 递归取**进程树**，再与**令牌**命中的进程取并集。
- **② 重启清理只按令牌**（ADR-159，R33-D6-01）：进程树不持久化，崩溃后已不可得；Engine Host 退出之后的一轮同此，挂死的 Host 在被终止之前以它的 pid 为根取后代树并入（`06` §6.1.3，ADR-226）。重启时只终止**令牌已确认**的进程；脱离进程树的平台二进制在重启后同样属于登记的窗口。
- **“无法确认”**：“环境读取成功但为空”与“读取失败”同样视为**无法确认**，不当作“没有令牌”。在全量扫描中，“无法确认”的进程**一律不发信号、不生成提示**；只有进程树中的成员才参与终止与存活判定。重启时也是如此，用户自己的 `/bin/bash`、`/bin/sleep` 等不会产生任何提示（`06` §6.1 的恢复表由 05/06 的作者同步）。
- **被停止的进程**：settle 第 3 步终止进程时，若某个进程处于停止状态（例如 Agent 自己对它执行了 `kill -STOP`），先发 `SIGCONT` 再发 `SIGTERM`，否则信号不会被处理。这一步与机密无关，是通用的保险（ADR-160 撤回了 ADR-159 补记 2 的机密窗口暂停）。
- **验证槽位的进程**（M2）：带机密的标准属于 M2（ADR-164）；M2 中它们结束时，按同一并集终止验证槽位的全部进程，机密随进程消失（ADR-160，`11` §11.7.0a）。
- **登记的窗口**：脱离进程树（shell 退出后被 `launchd` 收养、`nohup`、`setsid`）且环境无法读取的进程识别不到。它们不被终止，也不产生 `bg_process_survived`。它们在 settle 之后的写入按**来源不明的写入**处理，即 `paused(external_change)`，由人决定；不会被记为 Agent 或人的改动（已知误判 (d)，`14` G35 的 ADR-158 组）。

**扫描时机**（ADR-144/146：**周期性的**全进程扫描最多每 60 s 一次，且只在 Run 活跃时——见第 ⑤ 项；其余扫描都由事件触发，存活者复查每 30 s 一次）：只在 ① settle 第 3 步的终止；② 重启后的清理，以及 Engine Host 退出或挂死之后的一轮（范围的唯一定义在 `06` §6.1.6 “Agent 后台进程”一行，本节不复述，ADR-201/226）；③ 文件事件批次到达而当时没有 Agent 工具调用在执行时（用于归因表第 2 行判断本 Run 是否仍有存活进程；2 s 内的批次复用同一次结果）；④ **存活者未全部退出期间**每 30 s 一次——人在卡片上选“知悉”只结束打扰（`informative`，`08` §8.8），**不**结束存活期间：扫描与归因表第 3 行照常持续；存活者全部退出时条目以 `obsolete` 自动关闭（若仍打开），存活期间随之结束（ADR-145）。⑤ **macOS 每 Goal 内存上限**（ADR-145/146）：每 5 s 从 Tower `exec` 已知的直接进程出发，以 `proc_listchildpids` 递归遍历其**后代树**并以 `proc_pidinfo` 求内存之和（不是全进程扫描）；脱离进程树的后台进程（`setsid`、双重 fork、`nohup … &`）由**令牌全扫描**覆盖——仅当 Run 活跃且该 Goal 设有内存上限时，最多每 60 s 一次。超过上限时终止 RSS 最大的、带本 Run 令牌的进程（`13` §13.8.3）。Linux 上 ①–⑤ 读 cgroup 成员与 cgroup 内存统计，不做全进程扫描。对每个进程发信号前再读一次环境确认（防 pid 复用；pid 被复用给无关进程时环境中没有该令牌，不发信号）。**环境内容的处理**：扫描只在内存中判断“是否含该令牌”，其他环境内容不记录、不持久化、不传输，扫描不对其他用户的进程运行（设计约束唯一定义在 `11` §11.6.2，ADR-144）。**第 ③ 种扫描的归因**：扫描找到本 Run 的进程 → 该批按第 2 行归为 Agent（M2 中只有落在 `user_bash` 调用窗口内的写入按第 2′ 行归为人），并把这些路径与当时的内容哈希记入内存中的“后台写入表”（下一个检查点后清空）；之后若某批被判为第 4 行，计算 E 时排除内容仍等于后台写入表中哈希的路径——后台进程写完 `dist/` 后退出、人再保存一个无关文件时，只有人的文件进入 E（`14` G35b）。`sh -c 'x &'` 一类“shell 放到后台后立即退出”、`setsid`、双重 fork 都不影响识别，因为令牌随环境继承；这只对环境可读的进程成立，Apple 平台二进制见上文的登记窗口。**已登记窗口**（如实列出，不与此前的进程组方案比较大小）：**不继承环境派生的进程**识别不到——显式构造环境对象派生的子进程（不少测试运行器与构建工具会这样启动 worker）、`env -i`、经 `launchd`/`systemd` 等服务管理器启动的进程；它们在 Run 空闲时写卫星按已知误判 (b) 处理（`14` G35c(j″)(q)）。以进程组作为辅助识别（同组即属于该 Run）可以覆盖其中未脱组的部分，但会重新引入第 15–17 轮删除的进程组持久化与组长身份问题，记为权衡、M1 不采用。**drain 结束与崩溃恢复**（唯一定义在 `06` §6.1.6，ADR-141/144）：`drainingFor.target = pause` 时以 `drainingFor.reasons` 进入 `paused`（其中的 `app_quit`/`engine_crash` 在启动时自动解除；集合中只有 `app_quit` 时等同正常退出，按 `autoResume` 设置）。`target ∈ {take_over, rewind, dependency}` 时：drain 期间**没有**并入任何暂停原因 → 按原目标执行（崩溃时 `take_over`/`rewind` 进入 `paused(human)`，`dependency` 进入 `ready{waitReason:"dependency"}`）；**并入了**任何原因 → **放弃原目标**，进入 `paused(reasons ∪ {human})`，正常结束与崩溃恢复同一规则——人在原因处理后重做接管或回退，依赖回退在离开暂停时重新判定（`onAllReasonsCleared()` 执行 `run` 时若依赖未满足或无执行槽位，进入 `ready{waitReason}`，`pendingOpenings` 保留，ADR-145）。**drain 期间只有暂停原因可以并入**；再请求另一个目标（接管、回退）返回 `E_BUSY`（“等待当前步骤结束后重试”，ADR-145）。`run.rewind` 与 `goal.take_over` 一样，在 `external_change` 未解除时返回 `E_STATE`。因此回退不会覆盖未处置的外部写入，人的暂停也不会被依赖回退的 `ready` 丢掉（`14` G35e(h)–(j)）。**settle 序列中崩溃**（没有 drain）：settle 序列开始时在同一事务中写 `runs.phase = 'settling'`；settle 序列中**撤回**（宽限内，或 `claimed`/`verifying` 中出现 `agent_start`）时在同一事务中写回 `running`（ADR-146）。恢复时据此与“Run 中崩溃”区分（ADR-145）——`phase = settling` → 继续目标 `settle`，重启后按 ADR-143 的“Host 不存在”规则执行（加载会话、不开 Run）；若此时 I4(a) 判定没有有效提交 → 按 `05` §5.5 的 settle 判定表（非 draining、`outcome = completed`）进入 `paused(idle_without_submit)` 或 nudge（ADR-146）；`phase = running` → 按 Run 中崩溃 → 继续目标 `run`（`14` G35c(o)(o′)(o″)(v)）。恢复前的 `safety` 检查点对 `externalChange.paths` 中的路径同样逐路径记为外部，不归入 Agent（`14` G35e）。Supervisor 重启后，以及 Engine Host 退出或挂死之后（`06` §6.1.3、§6.1.6）：开机会话已变化 → 上一会话的进程已不存在，不发信号；否则按 `06` §6.1.6 “Agent 后台进程”一行所列 Run 的令牌（范围只在该行，含 Host 退出时尚未结束、因而以 `crashed` 结束的 Run，ADR-226）枚举并终止残留进程，然后补做 `agent_bg_done`。**由此**：`claimed`/`verifying`/`in_review` 中，除未解决的 `bg_process_survived` 存活者（归因表第 3 行）之外，不会有 Agent 进程写卫星（R13-D15-01 #1）。

已知的误判与漏判（登记，`14` G35/G35b/G35c/G36 测量）：(a) Agent 活动期间人在外部编辑器中保存 → 归因为 Agent（漏判；改动仍进入下一个检查点并在 Trace 中出现）；(b) 主动清空环境（因而不带 Run 令牌）的 Agent 后台进程在 Run 空闲时写文件 → 误判为外部写入（ADR-142 的已登记窗口），卡片措辞已包含“或未被追踪的 Agent 后台进程”，出路仍是 keep 或 revert（R13-D8-01：删除此前无法实现的“停止 Agent 的后台进程后继续”）；(d) **脱离进程树的 Apple 平台二进制**（ADR-158）：例如 shell 放到后台的循环、`nohup sleep`。它们的环境读不到，脱离进程树后识别不到，settle 不终止它们；其后的写入按来源不明的写入进入 `paused(external_change)`，卡片措辞与 (b) 相同（“或未被追踪的 Agent 后台进程”），出路是 keep 或 revert；(c) **存活进程期间的误归因**（ADR-128）：`bg_process_survived` 未解决期间，人在外部编辑器中的保存也会被记为 `author:"agent"`（归因表第 3 行），Trace 中注明“已知误判 (c)”；`paused(*)` 中同样适用——继续目标为 `verify`/`review` 时，离开 `paused` 时由守卫改为 `verify_new` 重新验证（ADR-134/140；`14` G36b(i)）。(e) **终止一轮完成之前的窗口**（ADR-228 归因表第 3 行的新窗口，登记于 ADR-229）：这一轮里存活者的 `anomaly{bg_process_survived}` Fact 可能尚未生成，此时第 3 行的写入没有注记；范围内没有确认存活者的 Goal 在一轮结束时照常补 `agent_bg_done`（`06` §6.1.6），这期间来源不明的外部写入并入一个作者为 `agent` 的检查点（漏判；窗口很短，卫星上的外部写入罕见）。

### 10.3.2 归档后的清理

| 触发 | 动作 | 时间 |
|---|---|---|
| `integrated` → `archived`（24h 宽限后） | 生成最终备份 bundle（§10.16.3）→ 删除卫星目录 → 删除用户仓库中本 Goal 写过的分支（`integration.performed.branch` 的各个取值，含改前缀之前的名字）。**删除条件**（唯一定义，§10.6.2 的清理引用；ADR-192）：顶端是 Tower 自己的 seal（§10.6 识别规则），且顶端已在 base 中（`merge-base --is-ancestor`；squash 合并时顶端须是被判定合入的那个 seal，以 patch-id 确认，M2 另以 `gh pr view`），且未被检出（§10.6 检出守卫），且仓库中没有进行中的 git 操作（§10.6 进行中操作守卫）；以 `git update-ref -d <分支> <顶端>` 删除（CAS）。**顺序与中断**（ADR-201）：`archived` 转移先提交，三步在其后按序执行，每步幂等（bundle 已含最新检查点则跳过，卫星已不在则跳过，分支删除按 CAS）；中断后重启时，对卫星仍在或仍有待删分支的 `archived` Goal（已清除的 Goal 除外，ADR-204）按本行续做未完成的步骤。按删除条件保留的分支也算待删分支，每次重启都重新判定一次，这是有意的：保留的原因（正被检出、进行中的操作、尚未合入）可能已经消失。判定是只读检查，删除以 CAS 守卫，条件仍不满足时照旧保留（ADR-202）。其余一律保留，Goal 页列出“分支 <B> 未删除：<原因>”（顶端不是 Tower 的汇总提交，可能含你的提交（只在影子仍在、识别规则可判定时给出，ADR-194） · 未合入 · 正被检出 · 你的仓库有进行中的 <操作> · 无法核对：影子已删除或已过保留期（识别规则无从判定，ADR-193/195）） | 归档时 |
| `accepted` → `archived`（验收但不合并：`goal.accept{integrate:"none"}`，`06` §6.4.3） | 删除卫星；**保留**用户仓库中已写的 Goal 分支（用户拥有；从 `in_review` 直接选它时先照常 seal 并写分支，再归档，ADR-188；从 `accepted` 归档前核对该分支仍在，不在时以最近一次 seal 重写，失败、正被检出或仓库有进行中的 git 操作时不归档，ADR-189/192/193） | 归档时 |
| `abandoned` | 保留影子与地标；卫星在 7 天无访问后删除（可从影子检查点重建）；用户仓库中已写的 Goal 分支一律保留，清理也不删（`03`，ADR-192） | 7 天 |
| 删除卫星的前提（唯一定义，`06` §6.6.4 引用） | ① 若工作区与最新检查点不同，先做一次检查点（landmark `safety`）；② 该检查点在影子中 `fsck --connectivity-only` 通过；③ 已进入最近一次 bundle。不满足则先补做 | 删除前检查 |
| 删除卫星时 | 一并删除 `<wtRoot>/_gitdirs/<goalId>/`、`<wtRoot>/_stores/<goalId>/`、Agent 临时目录 `$TMPDIR/tower-<goalId>/`（R10-D11-01c），`<wtRoot>/_inspect/<goalId>/`、`<wtRoot>/_human/<goalId>/` 与各 `<goalId>.kept-*` 不删除，按 §10.2 “人的工作现场不自动删除”保留并列出（ADR-228；此前删除卫星时先比较或询问、再删除这两种检出，已取代）；按名字认领这些目录以 §10.2 “只属于一个 Goal” 为前提（ADR-198）。Go 模块缓存文件默认只读，删除前 `chmod -R u+w`（Agent 存储已设 `GOFLAGS=-modcacherw` 时可省略，`16` §16.8.2） | 随卫星 |
| 磁盘压力（可用空间 < 10 GB 或 Tower 占用超预算） | 依次：删除 `abandoned`/`archived` 的残留卫星 → 删除非永久重放包与完整验证日志（`07` §7.4.1，ADR-095；不设排除，ADR-186 删去 ADR-185 的两类排除——被删的重放包之后重放时报告“不可重放：<原因>”）→ 删除 `paused` > 3 天的 Goal 的依赖目录（保留源码）→ depcache 按 LRU 淘汰。永久重放包与镜像保留 ref 从不自动删除；人的工作现场（§10.2）不在此顺序之内、从不删除，压力主要来自它们时上述回收解决不了，所以通知把它们的合计列在第一行并附存储面板的 `删除`（由人逐行或多选，ADR-229/230） | 立即，通知 severity 1（呈现按 `08` §8.1 “存储提示”） |
| 镜像维护（ADR-083） | 只回收不被任何 ref 可达的对象，步骤与宽限见 §10.17.1；Project 下所有 Goal 都归档后也**不**删除保留 ref 可达的对象（取代此前“归档 30 天后 `gc --prune=now`”，R5-D13-01） | 每周空闲时；磁盘压力时提前 |
| 删除 Project | 即 `privacy.purge{scope:"project"}`：状态前提、删除范围与列出的副本只按 `09` §9.12.4“清除一个 Project”一行（ADR-196） | 人发起 |

清理是产品要求而不是可选优化：worktree 文件夹蔓延是 Conductor 类工具与 Vibe Kanban 的常见抱怨（`research/landscape.md` §C.1）。设置页“存储”面板（数据一节，`04` §4.15）列出每个卫星、镜像、所属 Goal 状态、逻辑/独占大小，并提供“清理工作目录”（删除已归档 Goal 的残留卫星，即此前的“清理全部已归档”；以及 §10.2 “列出的来源”所列、由你确认的 Tower 遗留目录，确认框先逐条列出路径与大小，ADR-237；清除遗留清单中不可访问的条目可 `从列表移除`，只删该条目、不触碰磁盘，`09` §9.12.4，ADR-238）与“清理 Tower 引用”（§10.6.2）；名称与 `04` §4.15 设置树一致（ADR-193）。按时间删除重放包属 M2（§10.17.1，ADR-196）。

检查点保留（影子中，`06` §6.6.4 引用本表）：

- Goal 活跃期：全部保留。
- 归档或放弃 30 天后压缩为“地标”（`submit`/`verify` 对应的检查点、每个 Run 的首末检查点），其余检查点 ref 删除；**pin 与 seal ref（`refs/tower/<goalId>/{pin,seal}/<n>`）保留到影子删除**（ADR-194）：它们很小，而 §10.6 的识别规则与上表的删除条件、§10.6.2 的清理都依赖 seal ref，所以影子删除之前清理总能认出 Tower 写过的分支。**未写完的交还 `refs/tower/<goalId>/handback-t1` 不按时间删除**（保留与删除的唯一定义，ADR-239；写入与“写回成功时删除”的唯一定义在 `06` §6.4.3 `inspect.bring_back` 行“T1 的保留”，`06` §6.6.4、`09` §9.12.1、`16` §16.2.6 引用）：30 天的压缩与 180 天的影子删除都不删除它；除写回成功时由 Tower 删除之外，它只在两种情形下删除——你在存储面板中删除它（“人的工作现场”中按目标列出 `未写完的交还（保存在 Tower 中）`，带 `删除`：`goal.delete_kept{handbackT1: true}`，`06` §6.4.3），或你清除该 Goal（清除确认框列出它，`09` §9.12.4）——与人的工作现场同一取向（§10.2，ADR-228）。
- 归档或放弃 180 天后删除影子目录（影子中仍有 `handback-t1` 时推迟到你删除它，见上一条，ADR-239；之后该 Goal 已脱离的人工编辑检出中 git 命令因缺少对象而失败、文件完整，§10.2，ADR-229；审计日志保留提交哈希，`16` §16.2.8 审计保留；备份 bundle 按 §10.16.3：归档完成后删除，放弃后保留 30 天）。
- 用户“彻底清除 Goal”时立即删除（范围以 `09` §9.12.4 为准，用户仓库中的分支与地标、人工编辑与检验检出不在其内）。

---

## 10.4 依赖安装与磁盘成本

一个新卫星只有源码；`node_modules`、`target/`、`.venv` 需要重建。这是并行 Goal 的主要成本：一个中型 Node monorepo 的 `node_modules` 0.5–2 GB、`npm ci` 30–120 s；一个 Rust 项目的 `target/` 2–20 GB、冷编译数分钟。下表数值为量级估计，M0 实验 SP5（`14`）实测后回填。

### 10.4.1 策略

依赖准备受 ADR-021 约束：**不使用用户的全局包缓存**；每个 Goal 有自己的 Agent 存储 `<wtRoot>/_stores/<goalId>/`（Agent 可写，污染只影响本 Goal）；验证器存储 `<wtRoot>/_stores/_verifier/`（含 depcache，只由 Supervisor 的安装器写入，对 Agent 与被测代码只读）。包管理器的缓存、状态与用户配置的环境变量、各角色（Agent / 安装器 / 验证器）的读写权限、以及是否继承用户配置（`~/.npmrc` 等），**以 `16` §16.8 为唯一来源**（ADR-045），本文不再列出。**M1 只完整支持 Node.js + pnpm / npm**（ADR-043）；下表与 §10.4.2 中其他生态的安装器/验证器条目是 M2+ 草案（`16` §16.8.3）。M1 遇到非 Node 项目时（ADR-064）：添加项目时提示“M1 不支持该生态的机器验证”；Agent 侧在 S2 下使用 `16` §16.8.2 的私有目录、依赖按 Goal 下载；验证器不运行，exec 标准只计入观测轨，Goal 以“未经机器验证（生态未支持）”进入评审。

**Agent 存储预热（有验证器存储的生态——M1 为 Node——ADR-045、R2-D10-02）**：`<wtRoot>/_stores/<goalId>/` 首次创建时，从验证器存储中与当前 `depsKey` 对应的部分以 CoW 复制（不可 CoW 的卷上完整复制，禁止硬链接）。因此 Agent 的首次 `pnpm install` 是增量的，不重新下载全部依赖；成本是一次元数据级复制（APFS 上通常 < 2 s），计入 `13` §13.11 的后台预算。

| 策略 | 原理 | 适用 | 风险 |
|---|---|---|---|
| **depcache + 写时复制物化（主路径）** | Supervisor 安装器按锁文件在独立沙箱中冻结安装一次，产物存入只读 depcache（键 `depsKey`）；卫星与验证槽位都以 APFS `clonefile(2)`（`cp -c -R`）/ Linux reflink（`cp --reflink=always -a`）物化 | M1：pnpm / npm 项目；M2+：其他生态（`16` §16.8.2 草案） | 只在同一卷内有效（§10.4.3）；不支持 CoW 的卷上做完整复制，**禁止硬链接**（共享 inode 会让被测代码改到缓存，ADR-021） |
| **从用户检出克隆（次路径）** | 用户检出中已安装的 `node_modules`/`target/`，锁文件哈希与 baseCommit 一致时 CoW 克隆（只读用户检出，复制不回写） | depcache 未命中且安装器较慢时的首个 Goal | 用户本地可能装过非锁定版本——仅当 `node_modules/.package-lock.json` 等清单与锁文件一致才用；克隆结果不进入验证器 depcache |
| **懒安装** | 不在创建时安装，而在首次需要时安装 | 调研类 Goal、docs Goal | 首个测试命令时延迟突增，需在 Live Line 中显示 |
| **Goal 内增量安装** | Agent 运行中新增依赖（`dep.add` 审批后）安装到本 Goal 的 Agent 存储 | 所有生态 | 跨 Goal 不共享，重复下载；换来的是隔离 |
| **共享编译缓存（sccache）** | 编译单元级缓存 | **不默认**：无内容校验，被投毒会跨 Goal 传播（`11` T7） | 用户可在项目设置中为低风险 Goal 开启 |
| **共享构建目录** | 多 worktree 指向同一 `CARGO_TARGET_DIR` | **不支持** | 构建目录锁使并行 Goal 串行化，且不同分支互相使增量失效 |

### 10.4.2 准备配方（Prepare Recipe）

Supervisor 在卫星根目录检测锁文件，按下表选择配方。项目可在 `VerifyProfile.prepare`（`07`）中用自定义命令覆盖。**stage 的内容、安装命令、依赖完整性复核、生命周期脚本的网络与超时规则以 `07` §7.4.3 为唯一来源**（stage 只安装第三方依赖；项目自身的生命周期脚本在槽位中针对 pin 执行，ADR-062）；本节摘要列出，并规定卫星侧的物化。

**stage 与 depsKey 的输入**（R4-D7-05）：锁文件；`package.json` 中**所有影响解析与构建的字段**——`dependencies`、`devDependencies`、`optionalDependencies`、`peerDependencies`、`bundledDependencies`、`overrides`、`resolutions`、`workspaces`、`packageManager`、`engines`、`devEngines`、`pnpm.*`（含 `overrides`、`patchedDependencies`、`onlyBuiltDependencies`、`neverBuiltDependencies`、`allowBuilds`、`packageExtensions`）；`pnpm-workspace.yaml`；`.pnpmfile.cjs`（lockfile 的 `pnpmfileChecksum` 要求它在场；它是项目代码，protected，变更触发 `lifecycle_script_changed`，只在不带令牌、断网的安装阶段运行，ADR-085）；补丁文件（路径取自 `patchedDependencies` 的**值**，不假定在 `patches/` 下）；`file:`/`link:` 本地路径依赖的源目录（其自身构建脚本按项目生命周期在槽位中执行）；**项目 `.npmrc`**（scope registry、`node-linker`、`shamefully-hoist` 等）；包管理器与 Node 的确切版本、平台。`scripts` 字段不进入 stage（项目自身脚本在槽位中执行，ADR-062）。权威清单见 `07` §7.4.3 的 `depsKey` 定义（R5-D7-02）。

**安装器的阶段与 depcache 发布**（ADR-085/092/093，以 `07` §7.4.3 为准）：拉取（带令牌、不执行代码）→ **预取**（不带令牌、只允许已登记下载域名、只运行 Tower 内置预取器，把浏览器、引擎、Node 头文件放入 `$SH`；项目自定义下载须在 `VerifyProfile.prefetch` 中由人批准）→ 安装（不带令牌、断网，**只写本次运行的新暂存目录** `$VS/staging/<installRunId>/`，`$VS` 其余部分只读、`$TI` 读写拒绝）→ **发布**（Supervisor 在沙箱外校验后以原子 `rename` 发布为 `depcache[depsKey]`，之后只读；depcache 的来源——depsKey、安装运行、输入哈希——记在 Tower 数据库中，不在 `$VS` 内）。安装阶段运行的第三方构建脚本与 `.pnpmfile.cjs` 因此无法预先写入其他 `depsKey` 的条目（R6-D7-02）。

**包管理器版本与 Tower 工具缓存**（R4-D7-02，以 `07` §7.4.3 为准）：识别顺序为 `package.json#packageManager` → `devEngines.packageManager` → 都没有时 Tower 在用户检出中以用户 PATH 运行 `pnpm --version`，结果写入 `VerifyProfile.packageManager` 并在添加项目时请人确认（确认前该项目的 pnpm exec 标准按“生态未支持”处理）。安装器按注册表 `dist.integrity` 校验后把这个**确切版本**取进 `$SH/tools/pnpm@x.y.z/`，放在 A、I、V 三个角色 PATH 的首位，并设 `manage-package-manager-versions=false`（关闭自切换，避免向用户全局目录下载）。不依赖 Corepack（Node ≥ 25 不再随附）。

**Node 运行时**（ADR-085，以 `07` §7.4.3 为准）：`.nvmrc` → `.node-version` → `package.json#volta.node` → `engines.node`（满足范围的最新 LTS）→ Tower 默认 LTS，人确认后记入 `VerifyProfile.node`；经同一工具缓存取到 `$SH/tools/node@x.y.z/`。A、I、V 的 `PATH` 由 Tower 显式构造（工具缓存、`node_modules/.bin`、系统基础路径），不继承 GUI 进程的 `PATH`；Node 版本进入 `depsKey`，安装器构建原生模块与 A/V 运行所用的 Node 一致。

| 检测 | 安装器（**命令以 `07` §7.4.3 为唯一来源**，本表不重复；环境变量按 `16` §16.8.1 的 I 列） | M1 |
|---|---|---|
| `pnpm-lock.yaml` | 拉取 / 预取 / 安装 / 发布（ADR-085/092/093）：**拉取**（安装器第 1 阶段，ADR-165：只运行包管理器自身、**不执行任何项目代码**——`--ignore-pnpmfile`、禁用生命周期脚本；注册表认证每次运行时**只从用户级** `~/.npmrc` 读取（只取 `//<registry>/:_authToken` 等认证行，按注册表对应；其中的 `${VAR}` 以用户登录环境展开），**不读取项目 `.npmrc` 中的认证行**——仓库控制的凭据不可信，与 pnpm 自身的行为一致（ADR-167）；写入即时投递文件 `~/.tower/run/<deliveryId>/`，`0600`，阶段结束即删除；**Tower 不保存注册表令牌**，`$TI` 下也没有明文 npmrc（ADR-166）；`dep.add` 的代理安装同样走这一阶段；只连注册表；git 托管的依赖按 `07` §7.4.3 处理）→ **预取** → **安装**（第 2、3 阶段不含令牌、断网、只写暂存目录；`.pnpmfile.cjs` 只在此运行；之后执行挂起的第三方构建——`pnpm rebuild --pending` 实测也会执行根包 `postinstall`，因 stage 版 `package.json` 已删除 `scripts` 而无项目脚本可执行，R5-D14-01c）；`package-import-method=clone-or-copy`，禁用 hardlink | 支持 |
| `package-lock.json` | 同样的阶段；第三方构建用 `07` 中的 `npm rebuild <names>`（只列 lockfile 中 `hasInstallScript` 且非 workspace / `file:` 链接的包，不执行根包脚本，R5-D7-02d）；depcache 未就绪时可用“从用户检出克隆”次路径 | 支持 |
| `yarn.lock`（Classic 或 Berry）、`bun.lock` | — | **M1 不支持**（R4-D7-03）：按“生态未支持”处理——验证器不运行涉及安装的 exec 标准，Goal 以“未经机器验证（生态未支持）”进入评审；Agent 侧可用（`16` §16.8.2）。M2 草案见 `16` §16.8.3 |
| `Cargo.lock`、`uv.lock`、`poetry.lock`、`requirements*.txt`、`go.sum` | M2 草案（`16` §16.8.3） | M1 只有 Agent 侧（ADR-064） |
| 均未命中 | 不准备 | — |

逐条标准的“生态是否支持”判定（例如 Node 加 Python 的混合仓库、只有 artifact 标准的文档类 Goal）以 `07` §7.4.1 为准：先看有没有 exec 标准，再按每条标准实际调用的工具链判定（R4-D7-03）。

**卫星侧的物化**（R4-D7-04）：卫星的 `node_modules` 从 depcache 以 CoW 物化后，Tower 立即把其中 `node_modules/.modules.yaml` 的 store 路径改写为 Agent 存储 `$GS/pnpm-store`（该 store 已从 `$VS` 预热，内容一致），并删除 `.pnpm-workspace-state-v1.json`；同时为 A 设 `confirm-modules-purge=false` 作为兜底。否则 Agent 在无 TTY 的 bash 中第一次 `pnpm install` 会以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 失败。SP6c P16 覆盖此用例。

注意：

- **虚拟环境不可克隆。** `.venv` 内含绝对路径，Python 一律在卫星内新建 venv（M2）。
- **`node_modules` 从用户检出克隆的前提**是锁文件哈希一致；否则会制造“在我这能过”的假事实。
- 安装器只为**第三方依赖**安装并运行其构建脚本；**项目自身**（根与 workspace 包）的生命周期脚本与 `VerifyProfile.prepare` 在物化之后、在槽位中针对 pin 执行（ADR-062；网络与超时规则见 `07` §7.4.3）。Agent 在运行中新增的依赖走 `11` 的 `dep.add` 审批，并安装到 Goal 自己的存储。
- 准备结果计入 Fact：`prepare {recipe, pmVersion, durationMs, ok, cacheHit: "clone"|"store"|"cold"}`，供 `13` 统计与项目级优化建议。

### 10.4.3 位置选择、同卷与祖先上下文

`clonefile`/reflink 与硬链接都不能跨卷；Pi 又从文件系统根到 cwd 逐级加载上下文文件（名字与求值规则见 `16` §16.1.12“上下文文件名与受保护名字”，`resource-loader.ts:232-274`）。ADR-008（修订）因此把默认位置定为主检出的**同级隐藏目录** `<checkoutParent>/.tower-wt.noindex/<repoName>/<goalId>`：与仓库同卷（APFS clonefile / reflink 有效；ADR-021 禁止硬链接），祖先链与用户检出在仓库根以上完全相同，且不嵌套在仓库内（不会被用户的测试/构建/类型检查扫描到）。

位置选择算法（按附着检出计算——每个附着检出各有自己的 `<wtRoot>`，§10.1.1——添加项目时对默认检出算一次，此后为另一个附着检出首次建立卫星时再算；结果随卫星记入 `WorktreeRecord`（`path` 与 `sameVolumeAsCheckout`），ADR-236）：

```
1. 若 Project.worktreeRoot 已由人设置 → 用它（不是默认位置，祖先上下文差异同 3b）
2. 否则 candidate = <checkoutParent>/.tower-wt.noindex/<repoName>
   若可按 06 §6.1.6 “Tower 不重新建立根”建立（checkoutParent 已存在且可访问，Tower 只建立 .tower-wt.noindex/<repoName>；ADR-239）且可写，且 checkoutParent 不在同步/网络位置（见下表）→ 采用
   （首次创建时写入 .tower-wt.noindex/README 说明其用途；不修改任何仓库的 .gitignore）
3. 否则（不可写，或命中同步/网络位置 → 强制回退）回退 ~/.tower/worktrees/<projectId>.noindex（目录名带 .noindex 后缀，见下方 Spotlight 一条），并：
   a. stat(checkout).dev ≠ stat(~/.tower).dev → Fact “跨卷：依赖克隆不可用”，项目设置页建议改 worktreeRoot
   b. 祖先上下文差异按 09 §9.11 计算与处理（唯一定义：每个 Run 开始前计算、比较什么、缺失文件的内容去向，ADR-205）
```

**同步目录与网络卷的检测（R1-D13-01）。** worktree 加上依赖目录动辄数 GB，落入云同步目录会产生同步流量与费用、把代码与密钥上传到第三方，并与同步客户端争用文件。命中下列任一条件即**强制回退**（不可由默认规则选择；用户在项目设置中显式设置 `worktreeRoot` 指向同步目录时，需二次确认并记入审计）：

| 类别 | 检测（对 `realpath(checkoutParent)` 及其祖先） |
|---|---|
| iCloud Drive | 路径位于 `~/Library/Mobile Documents/` 下 |
| iCloud “桌面与文稿” | 路径位于 `~/Desktop` 或 `~/Documents` 下，且 `~/Library/Mobile Documents/com~apple~CloudDocs/Desktop`（或 `Documents`）存在（开启该功能时系统会创建这两个目录） |
| File Provider 类同步（Dropbox、OneDrive、Google Drive、Box 新版客户端） | 路径位于 `~/Library/CloudStorage/` 下；或任一祖先目录带 `com.apple.fileprovider.*` 扩展属性 |
| 旧版同步客户端 | 任一祖先含 `.dropbox`、`.dropbox.cache`、`.sync`（Resilio）、`desktop.ini` 中的 OneDrive 标记，或路径前缀为 `~/Dropbox`、`~/OneDrive*`、`~/Google Drive` |
| 网络卷 | `statfs(...).f_fstypename ∈ {smbfs, nfs, afpfs, webdav, macfuse, osxfuse}`；Linux 读 `/proc/self/mountinfo`，类型为 `nfs*`、`cifs`、`smb3`、`fuse.*`、`9p` |
| 无 CoW 的本地文件系统（exFAT、FAT、HFS+） | 不强制回退，但 Fact 提示“依赖物化将完整复制”。HFS+ 的文件名等价（忽略部分 Unicode 码位）已由 `pinSafetyCheck` 的名字比较规则覆盖（先去除默认可忽略码位，§10.1.2，ADR-120），不是已知限制 |

检测规则在 M0 SP5 中对 iCloud、Dropbox、OneDrive、SMB 四种环境实测。

**回退位置在 `~/.tower` 之内**（ADR-197/198）：回退的 `<wtRoot>`（`~/.tower/worktrees/<projectId>.noindex`，见下方 Spotlight 一条；`~/.tower/worktrees/…` 均指它）与验证槽位（`~/.tower/verify/<projectId>/`）位于 `~/.tower` 之下。把 `~/.tower` 当作整体处理的规则对它们的例外只在三处定义：
- 隐私清除的“清除全部”不删除其中的 `_human/`、`_inspect/`（`09` §9.12.4）；
- 沙箱的逐路径例外（`11` §11.6.2 读拒绝一行）：Agent、验证器与检验检出三种沙箱各一组，各为自己在默认位置下的允许项；
- 密钥路径表的 `~/.tower/**` 一项不含本 Goal 的卫星工作区，对本 Goal 的一切工具（文件工具与 bash 的分类、沙箱外工具的路径检查），只对本 Goal 的调用（`11` §11.3.1 密钥路径表，ADR-218/224）。

其余规则引用第二处、不另定义：`11` §11.3.2 命令分类器的“写 `~/.tower/**`”硬底线，§11.6.3 验证器与检验检出，§11.7 可读者规则与 `16` 即时投递目录一行。`sandbox_violation` 的分类先判 `user_checkout`、`other_satellite`，再判 `tower_data`（`16` §16.1.6），因此回退位置下其他 Goal 的卫星归 `other_satellite`。

**备份与索引排除。** Tower 创建 `.tower-wt.noindex/`、`~/.tower/worktrees/`、`<wtRoot>/_stores/`、验证槽位与 `~/.tower/tmp/` 时：

- **Time Machine**：对每个根执行 `tmutil addexclusion <path>`（“粘性”排除，写入扩展属性，随目录移动，不需要管理员权限）；设置页显示排除状态。Tower 的事件库与 Goal 数据（`~/.tower/goals/`）**不**排除——它们是需要备份的数据（`06` §6.6.1“备份排除”；`11` T24 的残余风险与 `09` §9.12.4 清除的局限由此而来，ADR-195）。
- **Spotlight**：macOS 不为以 `.noindex` 结尾的目录建立索引，也没有不经系统设置界面的逐目录排除 API。因此 worktree 根目录名带 `.noindex` 后缀（ADR-008：`.tower-wt.noindex`），Spotlight 自动跳过；`~/.tower/worktrees` 回退位置同样以带 `.noindex` 后缀的子目录 `~/.tower/worktrees/<projectId>.noindex` 作为 `<wtRoot>`。
- Linux 无统一机制：在根目录写 `CACHEDIR.TAG`（被 `tar --exclude-caches`、borg、restic 等识别）。

注意：若 `checkoutParent` 本身位于另一个 git 仓库内（例如整个 `~/code` 是 dotfiles 仓库），`.tower-wt.noindex/` 会在那个外层仓库中显示为未跟踪目录；Tower 在添加项目时检测（`git -C <checkoutParent> rev-parse --show-toplevel` 成功）并提示用户自行忽略。`.tower-wt.noindex/` 位于用户目录树中，因此 `11` 的沙箱写允许列表按实际 `<wtRoot>/<goalId>` 精确授权，不放开整个 `.tower-wt.noindex/`。

### 10.4.4 磁盘计量与预算

- `du` 会对 APFS 克隆块重复计数，不能用来计量。Tower 记录两个数字：**逻辑大小**（`du -sk`，仅用于显示）与**估计独占大小**：准备完成时记录卷可用空间 `statfs` 差值（单 Goal 准备串行执行时有效），运行中按 `mtime > preparedAt` 的文件累计大小近似增量。
- **镜像**：每个 Project 一个。同卷时以 CoW 建立，独占大小只随之后 fetch 的新对象增长（通常为用户仓库对象库的几个百分点/月）；跨卷或不支持 CoW 时为一次性完整复制，等于用户 `.git/objects` 的大小（中型仓库 0.2–2 GB），计入下行预算。此外随证据保留增长（ADR-083）：每个 Goal 的保留增量约 1–5 MB，被强制更新掉的用户分支对象在 2 周宽限后回收；增长上限与提示见 §10.17.1。
- **非 Node 项目的依赖按 Goal 下载**（ADR-064，R4-D10-02）：M1 中 Rust/Python/Go 项目没有验证器存储可预热，每个 Goal 的 Agent 存储独立下载。量级估计（SP5 回填）：Rust crates 源码 0.2–1 GB/Goal（另加 `target/` 2–20 GB）；Python 0.1–0.5 GB/Goal；Go 模块 0.1–0.5 GB/Goal。下载走沙箱代理与注册表允许域，网络与时间成本计入 `13` §13.11；磁盘计入下行预算，Goal 卡片显示。
- 默认预算：Tower 总占用（卫星 + 存储 + 镜像 + 验证池 + 影子）≤ 30 GB 或卷可用空间的 20%，取小者；超出时按 §10.3.2 “磁盘压力”顺序回收，并以 severity 1 通知（呈现按 `08` §8.1 “存储提示”）。
- **人的工作现场**（§10.2 “人的工作现场不自动删除”，ADR-228）：已脱离的人工编辑检出、检验目录与 `.kept-*` 不在上述预算与回收顺序之内（Tower 不删除它们），按同样的两个数字单独计量，在 Goal 页与存储面板显示。阈值按**估计独占大小**判定（ADR-229；逻辑大小会把依赖目录的 CoW 块重复计入，仍只用于显示）：人工编辑检出与检验目录取物化完成时卷可用空间的 `statfs` 差值，加上此后 `mtime` 新于物化时刻的文件大小；改名保留的卫星沿用它作为卫星时的记录。每个目录的估计限定在 0 与它的逻辑大小之间（其他 Goal 同时写同一卷时 `statfs` 差值有噪声），没有记录时（如 Goal 已清除）取逻辑大小；合计在每次产生或删除这类目录之后、以及打开存储面板时重新求值（`mtime` 一项为一次目录扫描，不常驻监视，ADR-230；产生或删除之后只重扫那一个目录、其余沿用上次的值，打开存储面板时才重扫全部，扫描在后台 worker 中进行，界面先显示上次的值，成本见 `13` §13.11.3，ADR-231）。合计超过 10 GB 时以 severity 1 提示，附存储面板的入口；呈现与“一次”的范围只按 `08` §8.1 “存储提示”。量级见 `13` §13.11.3，每周的累积按 `14` E6 记录。
- 每个 Goal 卡片的 Fact 中显示 “磁盘 1.2 GB（独占约 140 MB）”。

---

## 10.5 用户主检出中的未提交改动

Goal 从 `baseCommit` 开始，**默认不包含**用户主检出中的未提交改动。创建 Goal 时 Supervisor 运行 `git -C <checkout> status --porcelain=v2 -z`：

| 情形 | 行为 |
|---|---|
| 干净 | 无提示 |
| 有改动，且 baseRef ≠ 当前检出分支 | 仅提示“你的检出有 N 个未提交改动，与此 Goal 无关” |
| 有改动，且 baseRef = 当前检出分支（或其上游） | 合同编辑器中显示选择：**不包含（默认）** / **包含我的改动作为起点** |

“包含我的改动作为起点”的实现（**不修改用户检出**，不用 `git stash`——它会改动用户工作区，且 `git stash create` 不包含未跟踪文件）：

```
镜像上下文（GIT_DIR=<mirror>，GIT_WORK_TREE=<用户检出>，只读用户的工作区文件）：
tmpidx=$(mktemp); GIT_INDEX_FILE=$tmpidx git read-tree <用户 HEAD>     # 用户 HEAD 已由镜像 fetch
GIT_INDEX_FILE=$tmpidx git add -A                                     # 含未跟踪；忽略规则含用户的 info/exclude（§10.1.2）；排除按 §10.7.1 第 1 步，(d) 的“在 base 中被跟踪”以用户 HEAD 求值，之后以 $snap 求值结果相同（$snap 中被跟踪的清单路径就是用户 HEAD 中的那些，ADR-207）
tree=$(GIT_INDEX_FILE=$tmpidx git write-tree)
snap=$(git commit-tree $tree -p <用户 HEAD> -m "tower: base snapshot for <goalId>")
git update-ref refs/tower/<goalId>/base-snapshot $snap                # 写在镜像中，不写用户仓库（R4-D13-08）
→ 卫星从 $snap 检出；WorkspaceBinding.baseCommit = $snap，另记 realBase = 用户 HEAD
```

对象写进镜像而不是用户对象库：用户的未提交改动不会以任何 ref 出现在用户仓库里，也就不会被用户的 `git push --mirror` 推送出去。

集成时快照提交**不得**进入 base：seal 的父提交取真实 base，树取“pin 树相对 `$snap` 的改动应用到真实 base 上”的结果（影子中 `git merge-tree --write-tree --merge-base=<snap> <realBase> <pin>`）。若 Goal 的改动依赖用户那些未提交的改动（合并冲突），以 Needs-You 提示“请先提交你的改动，再重试集成”。评审 diff 以 `$snap` 为基线，因此用户自己的改动不会出现在评审单元中。

---

## 10.6 提交约定：Agent 提交、验证 pin 与 Seal 提交

- **Agent 的提交只在卫星中。** Agent 可以在卫星的 `tower/<goalId>` 上 `git commit`（`11`：`git.local` 默认 do-and-notify）。这些提交不是 Goal 的事实来源，也不直接进入用户仓库；Tower 的一切判定都基于影子目录对**工作区内容**的快照。
- **验证 pin**（`07` §7.4.1 `pinCommit`）：影子上下文中，以影子自有索引（stat 检查含 ctime/inode，ADR-075）对卫星工作区 `add -A`（树的定义与排除什么都以 §10.7.1 第 1 步为唯一来源，含本地文件排除集，ADR-207） → `write-tree` → `commit-tree T -p <baseCommit>`（提交信息以 `Tower-Local-Exclude` trailer 记本次所用的本地文件排除集，同处），写入影子 `refs/tower/<goalId>/pin/<n>`；验证槽位直接从影子检出 pin（`07` §7.4.2，`slot-<k>.git` 的 alternates → 影子与镜像）。pin **从不**进入用户仓库（§10.6.2）；人工检验用检验检出（§10.8.3）。Fact 的 `atCommit` 指向 pin，指纹为 `wt1:<tree>`。
- **Seal 提交只在集成时发生**（M1 的“仅保留分支”、M2 的“推送并开 PR”与合并队列 Q1 相同；ADR-133）：

  ```
  影子上下文：S = git commit-tree <已验证 pin 的 tree> -p <当前 baseCommit> -F <msg>
             msg = 按下方“seal 提交说明的结构”生成（ADR-105）
             git update-ref refs/tower/<goalId>/seal/<n> S
  用户仓库：  git fetch <影子> refs/tower/<goalId>/seal/<n>:refs/heads/<prefix>/<goalId>-<slug>   # 首次 seal；前缀冲突检查见 §10.2
  # 首次 seal 同样先按下方重新 seal 表确定 B 再判定（ADR-191）：只有 B = B₀ 且 B₀ 不存在时才是本行；B₀ 已存在而顶端不是 Tower 自己的 seal 时，按同表写入 B₀-v<k>
  # M1 不签名：写进用户分支的就是 S（见下方“签名”，ADR-193）；写入前先过检出守卫与进行中操作守卫（见重新 seal 表后）
  ```

  **重新 seal（ADR-136，R15-D13-01）**：Goal 离开 `accepted` 后再次验收（`keep`、交还、I2 等）会重做 seal。M1 中用户自己推送分支、也可能在其上追加提交，因此 Tower **从不改写用户已改动的分支**：

  ```
  B₀ = 原始分支名 refs/heads/<prefix>/<goalId>-<slug>（只用于命名，从不改变）
  Tower 自己的 seal（ADR-191/193，唯一的识别规则）：sha 是影子中本 Goal 的某个 refs/tower/<goalId>/seal/<n> 的提交
      （M1 不签名，写进用户分支的就是 seal 本身，见下方“签名”）。
      这些提交都带 Tower-Goal: <goalId> trailer，但只带 trailer 不算：用户 amend 或 cherry-pick 后的提交仍带它，按用户的提交处理
  B = 用户仓库 refs/heads/* 中（不含远端跟踪引用）名字最后一段为 <goalId> 或以 <goalId>- 开头（Tower 为本 Goal 生成的名字，任何前缀与标题）、
      顶端是 Tower 自己的 seal 的分支，有多条时取 seal 编号 n 最大的一条（同一个 seal 时优先最近一条 integration.performed 的 branch）；
      没有时取最近一条 integration.performed 的 branch；仍没有（首次）时为 B₀。
      按 sha 识别、不按现算的完整名字，所以写入后未记账（06 §6.4.3 goal.accept 写后窗口）、其间再次失败、
      两次验收之间改了前缀或标题，都认得出 Tower 写过的分支。B 只用于快进判定（ADR-181）
  新分支一律命名为 B₀-v<k>：k 从 2 起取第一个在用户仓库中不存在、也不在本 Goal 的 integration.performed.branch 中出现过的编号
      （B 为 B₀-v2 时新分支是 B₀-v3，不是 B₀-v2-v2；同样做前缀冲突检查，ADR-182）
  被撤销的 seal 曾写入 B（integrationRevertedSeal 出现在 B 的写入记录中；撤销合入后再次验收，ADR-178）
                                   → 不以 B 的顶端 P 为父：S 以当前 baseCommit 为父（同首次 seal），写入新分支 B₀-v<k>（命名见上；
                                      B 上被撤销的 seal 已在 base 的历史中，不改写 B）。以 P 为父时人合并 S 只带入 P..S 的差异，
                                      被 revert 撤掉的内容不会回来，而 S 仍是 base 的祖先、会被判为 integrated（§10.12）。
                                      本行按写入记录判定，不按 git 祖先关系：撤销后 base 本身就以被撤销的 seal 为祖先，
                                      按祖先判定会使之后每次重新 seal 都命中本行。写入 B₀-v<k> 后它成为新的 B，
                                      其上没有被撤销的 seal，之后的重新 seal 按下面三行在它上快进或另开分支
  B 不存在（用户已删除）           → 以当前 baseCommit 为父写入同名分支 B（同首次 seal）
  B 的顶端是 Tower 自己的 seal（记为 P）
                                   → P 的树与说明都与本次要生成的 seal 相同（同一 pin、同一结论：写后窗口的重试、同一 pin 的验收延续）
                                      → 复用 P：不新建 seal、不写入用户仓库，事务记 branch = B、sha = P
                                   → 否则（新 pin，或结论变了）：影子：S = commit-tree <新 pin 的 tree> -p P -F <msg>（对 B 是快进）
                                      用户仓库：git fetch --no-write-fetch-head <影子> refs/tower/<goalId>/seal/<n>（只取对象）
                                      git update-ref B S P                       # CAS
                                      CAS 失败时重读 B：仍等于 P（ref 锁等瞬时失败）→ 写入失败，E_INTERNAL，重试时按本表重新判定；
                                      已不等于 P（期间 B 被改动）→ 立即按本表重新判定一次
  B 的顶端不是 Tower 自己的 seal（用户推送后追加提交、rebase、amend 或改动过 B）
                                   → 不改写 B；S 以当前 baseCommit 为父（同首次 seal），写入新分支 B₀-v<k>（命名见上）；验收面板说明
                                      “你的分支 <B> 已有你的提交，Tower 未改动它；新版本写入 <B₀-v<k>>”。只在本行显示，所以这句话为真
                                      （唯一例外是灾难恢复的一种叠加情形，§10.16.3 登记）
  ```

  **检出守卫（ADR-192，唯一定义；§10.3.2、§10.6.2、§10.12 与 `06` §6.4.3 引用）**：Tower 在用户仓库中写入、快进或删除任何分支之前——首次 seal 与上表各行的写入（含验收延续）、从 `accepted` 归档前的重写、归档删除、“清理 Tower 引用”——先在用户仓库上下文读 `git worktree list --porcelain`（与 §10.12 本地合并的检查相同）。该分支是主检出或任一链接工作树的当前分支时，Tower **不动它**：`update-ref` 不检查检出，照写会在用户不知情时移动该检出的 HEAD，使工作树与索引看起来像在撤销 Tower 的新内容。各路径的去向：
  - `goal.accept`：不写入，返回 `E_INTERNAL`，`step = branch_checked_out`，不记决定；面板写“分支 <B> 正在 <路径> 中被检出，Tower 未改动它”，提供两条出路：在该检出中切换到其他分支后重试；或由人确认“写入新分支”（`goal.accept{newBranch:true}`），按上表最后一行的写法写入 `B₀-v<k>`。`newBranch` 只决定写入新分支、从不改动 B，服务端不要求上一次返回过 `branch_checked_out`；面板说明写“按你的选择写入新分支 <B₀-v<k>>，<B> 未改动”（确认时 B 可能已不再被检出，所以不重复“正被检出”），不显示“已有你的提交”（ADR-193）。
  - 验收延续：不延续，进入 `in_review`，面板写同一句（`06` §6.4.3）。
  - 从 `accepted` 归档前的重写：不归档，同 `goal.accept` 返回。
  - 删除（§10.3.2 归档删除、§10.6.2 清理）：跳过该分支，结果中列出“正被检出，未删除”。
  - 已知窗口：读取与随后的 CAS 之间，用户恰好检出该分支时拦不住（git 自己的 `branch -f` 有同样的窗口）；CAS 本身保证不覆盖用户移动过的分支。

  **进行中操作守卫（ADR-193，唯一定义；§10.3.2、§10.6.2 与 `06` §6.4.3、`04` §4.6.5 引用）**：同一组写入与删除之前（与检出守卫同一时机，在取对象之前；**先判本守卫，再判检出守卫**，两者都命中时返回 `repo_busy`，ADR-194），Tower 读每个工作树的 gitdir 中 git 的标准状态文件：`rebase-merge/`、`rebase-apply/`（含 `am`）、`MERGE_HEAD`、`CHERRY_PICK_HEAD`、`REVERT_HEAD`、`sequencer/`、`BISECT_START`。**gitdir 的取法**（ADR-194）：主工作树为 `commonDir`；链接工作树取 git 自己的管理目录，即直接枚举 `<commonDir>/worktrees/*/` 的全部条目（含移动过的），不从工作树路径推出目录名——管理目录名在重名时加数字、`worktree move` 后不变，与路径末段可以不同；面板中的 <路径> 取该目录中 `gitdir` 文件记录的工作树位置。**工作树已不存在的条目**（ADR-195；即 git 所说的 `prunable`：`gitdir` 记录的位置不存在，且该管理目录中没有 `locked` 文件）没有可保护的工作现场，git 自己的 `worktree prune` 与 `gc` 也会删除它，因此本守卫**不因它停写**；其中有状态文件时，面板与结果附一行“工作树 <路径> 已不存在，但仍记录着进行中的 <操作>；可在仓库中运行 `git worktree prune` 清除该记录”（检出守卫仍按它记录的分支判定，<路径> 已不存在时附同一行提示）。`locked` 而位置不存在（如所在卷未挂载）时照常停写，面板写“工作树 <路径> 已锁定且当前不可访问，其中有进行中的 <操作>；重新挂载并完成或中止后重试”。任一存在时，Tower **这一次不写入、快进或删除任何分支**（不论涉及哪条分支：进行中的 rebase 与 bisect 会在结束时更新或回到某条分支，而该工作树显示为分离 HEAD）。各路径的去向：`goal.accept`（含 `newBranch:true`）与从 `accepted` 归档前的重写不写入，返回 `E_INTERNAL`，`step = repo_busy`，不记决定，面板写“你的仓库在 <路径> 中有进行中的 <操作>，Tower 这次没有写入；完成或中止后重试”并给 `[重试]`；验收延续不延续，进入 `in_review`，面板写同一句；删除全部跳过，结果中列出“你的仓库有进行中的 <操作>，未删除”（影子删除之前可由“清理 Tower 引用”再删：§10.3.2 的 seal ref 保留到影子删除，ADR-194）。复用一行不写入，不受影响。只读状态文件，不运行用户仓库中的任何操作。

  `integrated` 的本地观测（§10.12）针对本 Goal 写入过的**全部分支**（`integration.performed.branch` 的全部取值）上的 seal（各条 `integration.performed` 的 `sha`），按 §10.12 的唯一条件判定。用例 `14` G40。

  **seal 提交说明的结构（ADR-105/108，R8-D7-03、R9-D15-01 #4；唯一定义——四段，其中第 2 段可选、第 3 段在解析失败或无 Agent 提交时省略；`04` 与 ADR-105 按此同步；`16` §16.2.6 登记 trailer 集合）**——事实与声明分离延伸到写进用户仓库的持久产物：

  ```
  第 1 段（Tower 生成）：Goal 标题；合同意图首段的摘要
  第 2 段（可选）“人的说明”：本 Goal 全部 HumanDecision{hand_back} 与 {bring_back_inspection} 中 sealNote 字段非空者，按时间顺序
      逐条列出（每条前缀“<日期> 交还：”）；sealNote 与给 Agent 的意图（note）是两个字段，交还对话框中“写入提交说明”默认勾选、可取消（R10-D4-01b）
  第 3 段（可选）“Agent 提交记录（Agent 的声明，未经验证）”：
      Agent 在卫星中的提交信息（Tower 在隔离 worker 中自行解析提交对象，§10.1.3；失败则省略本段），
      逐条以 “> ” 缩进引用；去除其中一切 trailer 形态的行（匹配 ^[A-Za-z][A-Za-z0-9-]*:[ \t]，含 Signed-off-by、
      Co-authored-by、Tower-*），并去除 diff 头、`---` 分隔线；每条 ≤ 20 行，合计 ≤ 200 行
  最后一段（Tower 独占生成的 trailer 块）：
      Tower-Goal: <goalId>
      Tower-Contract: v<n>
      Tower-Verified-At: <pin sha>          # 只在结论为“已验证”或“有保留的已验证”时（ADR-108，R9-D7-02）
      Tower-Not-Machine-Verified: <原因>     # 否则改写这一行；原因 ∈ human_only · ecosystem_unsupported ·
                                            #   submodules_unsupported · s0_denied（`07` §7.10.3）
      Tower-Human-Edit: <goalId>            # 仅当 base..pin 中有作者为 human 的 hunk（唯一条件，ADR-036/183）：作者按 §10.7.1 的推导；交还的
                                            #   human_edit 检查点只把写回集合中 B→T1 的路径归为人（§10.8.4 第 8 步），人没有改动的交还不写
      Tower-Override: <detector> <路径>@<哈希>[, …]   # 仅当 pin 上有被 override_sentinel 处置的阻断哨兵（ADR-109/112），绑定的对象哈希
      Co-authored-by: <Agent 身份>           # 按项目设置（默认开）
  ```

  Agent 文本无法伪造 trailer（引用与剔除双重保证）；用户项目要求 DCO 时，`Signed-off-by` 由 Tower 按用户身份在 trailer 块中添加（项目设置），绝不取自 Agent 文本。
  作者身份使用用户配置的 git 身份（工作归属于用户）。**签名**（ADR-193，唯一定义；取代 ADR-192 的签名一段）：**M1 中 Tower 从不调用用户的签名程序**，写进用户分支的就是影子中的 seal S（不签名）。**`integration.performed.sha` 记该 seal 的 sha**（复用时为 P），§10.12 的 `integrated` 观测、`goals.integration_reverted_seal` 与 M2 的推送、本地合并都用这个 sha。用户仓库上下文中 `commit.gpgSign` 为真时照常写入不签名的 seal，验收面板如实说明“Tower 写入的提交未签名；需要签名的提交请在合并前自行签名”（`04` §4.6.5）；用户自行签名（改写）该提交后，分支顶端就不再是 Tower 自己的 seal，之后的重新 seal 按上表最后一行另开 `B₀-v<k>`。这是 M1 的已知限制（`00` §0.5.1）；为 seal 签名属 M2。seal 的树就是已验证 pin 的树，因此 Verified 不会因 seal 失效（指纹不含 HEAD，`07` §7.3.2）。**默认把 seal 作为单个提交**；保留 Agent 逐个提交的选项推迟到 M2（ADR-060 第 7 点）。
- 检查点、pin、seal 都先写影子；进入用户仓库的只有集成时从影子取来的 Goal 分支（首次以 fetch 写入，快进先只取对象、再以 CAS `update-ref`；以及用户开启 §10.6.2“保留审计地标”时归档阶段 fetch 来的地标检查点）——一律先传对象、后更新 ref，**用户仓库中不会出现指向缺失对象的 ref**；删除只按本文设计基调的规则（§10.3.2 / §10.6.2 的 CAS 删除，ADR-195）。
- **workspaceFingerprint** 采用 `07` §7.3.2 的定义 `wt1:<tree>`，在影子上下文中计算。按 ADR-075：影子自有索引 + 含 ctime/inode 的 stat 检查即为决定性指纹；全新临时索引的完整重哈希只在验收与 seal 两个闸口各执行一次（验收面板以进度显示，不阻塞 UI）。
- `in_review`/`accepted` 期间卫星应无 Run。Supervisor（沙箱外）用 FSEvents / inotify（能暴露丢事件标志的实现，`13` §13.11.2；同一路监视在所有非终态都开启，但只在检出完成标记出现之后——准备期间的检出与重试删除是 Tower 自己的写入，ADR-153；用于 §10.3.1 的嵌套仓库预警与 `external_change`）监听卫星工作区（工作目录中没有 `.git`；gitdir 在其外），1 s 去抖（`07` §7.3.2）后做影子索引 stat 检查（ADR-075，取代 60 s 巡检）；内容变化按 §10.3.1 的归因表处理——来源不明的写入进入 `paused(external_change)`，人 keep 之后才按 I2 回到 `verifying`（ADR-122）；Tower 内“就地修一下”（M2，`04` §4.6.4）保存后同样先进入 `paused(external_change)`，在卡片上确认“采纳为我的改动”（`keep`）后才重新验证（ADR-122，R15-D15-01 #4）；未解决 `bg_process_survived` 期间的写入按 I2 重新验证（`agent_bg`）。**例外**：Tower 自己向卫星写回时（`inspect.bring_back`、交还写回），该卫星的事件触发暂停，写回完成后一次性重算指纹并以单一转移进入 `verifying{verifyOrigin:"human_change"}`，不另行触发 `fp_changed_human`（ADR-105，R8-D6-01b）。若事件是“卫星根目录消失”，先按 §10.16.2 情形 E 处理（ADR-076），不当作指纹变化。来源可能是人工编辑检出交还（§10.8.4）、Tower 内“就地修一下”（M2；保存后经 `keep` 确认，归因为 `author:"human"`，seal 时写 `Tower-Human-Edit` trailer，ADR-036/122；Tower 不替人提交），或有进程直接写了卫星（后者按 §10.3.1 进入 `external_change`）。

### 10.6.1 Agent 的 git 环境（ADR-060、ADR-081、ADR-088）

Agent 的沙箱 bash **不导出** `GIT_DIR`/`GIT_WORK_TREE`（ADR-088 修订 ADR-081 第 1 点），但导出 `GIT_CEILING_DIRECTORIES=<wtRoot 的 realpath>`（R6-D13-02）：绕过垫片的 git 在卫星中也不会越过 `<wtRoot>` 向上发现仓库。Tower 在沙箱 bash 的 `PATH` 最前放一个 `git` 垫片（Tower 自带、只读、Agent 不可写），对**每次调用**重新判定：

| 情形 | 垫片的处理 |
|---|---|
| 当前目录（或 `-C` 目标）在卫星工作目录内、子命令不是 `init`/`clone`、调用方未显式指定 `--git-dir`/`GIT_DIR` 到别处 | 以 `GIT_DIR=<wtRoot>/_gitdirs/<goalId>`、`GIT_WORK_TREE=<卫星>` 执行真实 git |
| 环境中**继承**了指向本卫星 gitdir 的 `GIT_DIR`/`GIT_WORK_TREE`（来自上一层垫片调用的子进程：`rebase -x`、`bisect run`、钩子、`submodule foreach`、`!` 别名、外部 diff），且子命令是 `init`/`clone`，或当前目录 / `-C` 目标在卫星工作目录之外 | **先移除这两个变量**，再原样执行真实 git（ADR-090）。例：`rebase -x 'cd /tmp/fx && git init'` 中的 `git init` 作用于 `/tmp/fx`，不会重新初始化卫星 gitdir |
| 只给了 `--work-tree`/`GIT_WORK_TREE`、没有 `--git-dir`/`GIT_DIR` | 视为调用方自行指定：若工作树在卫星内，补上卫星 gitdir；否则原样执行 |
| 其余情况（卫星外的目录、调用方显式指定了别的仓库） | 原样执行 |

**嵌套调用同样经过垫片（ADR-097，R7-D13-01）**：git 在派生子进程（`rebase -x`/`--exec`、`bisect run`、钩子、`!` 别名、外部 diff/difftool、`submodule foreach`）时会把**自己的 exec-path** 放在 `PATH` 最前，嵌套的 `git` 因此绕过 `PATH` 上的垫片（本轮已实验）。Tower 为 Agent 构造一个**垫片 exec-path**：`<wtRoot>/_stores/_shim/git-core-<git 版本>/`（Tower 拥有、对 Agent 只读），其中对真实 `git --exec-path` 下的每个程序放一个符号链接，只有 `git` 换成垫片；Agent 的沙箱 bash 设 `GIT_EXEC_PATH=<垫片 exec-path>`，垫片执行真实 git 时保持该变量。于是 git 放到 `PATH` 最前的正是垫片所在目录，嵌套调用的 `git` 同样经上表判定。垫片 exec-path 的目录键是 (真实 git 的 `realpath`, 版本) 的哈希：`<wtRoot>/_stores/_shim/git-core-<哈希>/`。**每个 Run 开始前**比对真实 git 可执行文件与 `git --exec-path` 目录的指纹（realpath + 大小 + mtime），变化即重建（ADR-105，R8-D13-02）；真实 git 的路径以绝对路径记录在垫片中，避免递归。Run 进行中 git 被升级并清理旧版本时，垫片发现记录的真实 git 不存在 → 以明确的错误退出（“Tower 的 git 垫片需要重建：git 已被升级”，退出码 128），并通知 Supervisor 立即重建；Agent 的下一次调用即恢复。验证：SP6b G20 在 git 2.40、Apple 自带版本与最新版上检查 `rebase -x`、钩子、别名、`bisect run` 中的嵌套 `git init <tmp>` 不作用于卫星（`research/git-isolation-experiment.md` 第 7 轮已在一个版本上确认）。

**备选（若 G20 在某个支持的版本上失败，ADR-097）**：接受限制——嵌套调用继承卫星 `GIT_DIR`，只影响 Agent 自己沙箱内的测试（例如 `rebase -x` 中创建临时仓库失败或提交落到卫星分支），不越过安全边界；`00` §0.5.1 与 `14` K22 登记，Agent 简报加一行提示，W7-shim 预留 0.5 人周用于这一备选的文档与提示（`14` §14.3.4）。

同样**不设置** `GIT_OBJECT_DIRECTORY` 等（ADR-044 的做法使 Agent 环境与验证器环境系统性不同，R3-D13-01）。卫星是一个独立仓库（没有远端），gitdir 整体归 Agent（ADR-089）：Agent 照常提交、merge、rebase、cherry-pick、revert、stash、bisect、gc，也可以 `git config`（只影响沙箱内的 git）。pnpm、vitest、husky、lint-staged 等经 PATH 调用 git 的工具在卫星内同样经过垫片；垫片单次开销目标 ≤ 5 ms（`13` §13.11.1，SP5 回填）。Tower 自己只在影子上下文中操作工作区（§10.1.2）；沙箱外的进程看不到这个仓库（§10.1）。

**兼容性代价**（ADR-088/089/090，登记于 `00` §0.5.1 与 `14` K22）：
- 测试夹具在卫星**外**的目录（如 `$TMPDIR`）`git init` 的临时仓库、克隆的依赖不受影响（垫片原样执行或剥离变量；嵌套调用经垫片 exec-path 同样如此，ADR-097）。
- 测试在**卫星内** `git init` 夹具仓库会失败：S2 拒绝在工作目录任意深度创建 `.git`（ADR-089）。Agent 侧观测轨中这类测试失败；验证槽位不受此限制（槽位不是卫星，`07` §7.4.2），因此不影响验证结论。
- 以绝对路径调用真实 git（`/usr/bin/git`、`xcrun git`、dugite 等内置 git）且继承了卫星 `GIT_DIR` 的情况无法拦截，但只会作用到本 Goal 自己的卫星（Agent 自有），不越过沙箱边界；没有继承变量时，它们在卫星中因 `GIT_CEILING_DIRECTORIES` 与工作目录无 `.git` 而看不到仓库。不经 PATH 中 `git` 的实现（libgit2 绑定、isomorphic-git）同样看不到仓库。
- 验证槽位不使用垫片（`07` §7.4.2）。SP6b G20 覆盖以上各项（含经垫片 exec-path 的 `rebase -x "git init /tmp/x"`、钩子、别名、`bisect run`，以及绝对路径 git，`14` §14.2）。

### 10.6.2 用户仓库中的 Tower 引用（R4-D13-08）

**默认：用户仓库中不保存任何 `refs/tower/*`。** 检查点、pin、seal、安全快照只在影子中，基线快照只在镜像中；用户仓库中默认唯一由 Tower 写入的 Goal 相关 ref 是集成时的 Goal 分支 `refs/heads/<prefix>/<goalId>-<slug>`（seal；用户拥有，按 §10.3.2 在归档时删除或保留）；另有与 Goal 无关的多机租约 `refs/tower/_owner`（`06` §6.1.9，指向一个很小的 blob）。审计长期保留依赖影子（§10.3.2 检查点保留）与审计事件（`16` §16.2.8），不依赖用户仓库。

**可选：“保留审计地标”**（项目设置，默认关）。开启后，Goal 归档时 Tower 在用户仓库上下文中把**地标检查点** fetch 为 `refs/tower/<goalId>/cp/<n>`，归档 180 天后删除（与影子保留一致）。**已验证的 pin 不进入用户仓库**——人工检验通过检验检出完成（ADR-078，§10.8.3），不需要在用户仓库中查看 pin。

| 用户仓库中的 Tower ref | 何时写入 | 何时删除 |
|---|---|---|
| `refs/heads/<prefix>/<goalId>-<slug>`（seal） | 集成时（唯一默认写入；M1 中撤销合入不写 revert 分支，ADR-193） | §10.3.2：已集成的在归档时按其删除条件删除（顶端是 Tower 自己的 seal、已在 base 中、未被检出、仓库中没有进行中的 git 操作）；验收但不合并而归档（`integrate:"none"`）与已放弃 Goal 的保留（用户拥有） |
| `refs/tower/<goalId>/cp/<n>`（只限地标，需开启“保留审计地标”） | 归档时 | 归档 180 天后（该 Goal 此前已被隐私清除时不再删除，保留给人处理，`09` §9.12.4，ADR-201） |

注意：`refs/tower/*` 不在 `refs/heads` 下，不出现在 `git branch`，默认 refspec 的 `git push` 不会推送它们；但**用户自己执行 `git push --mirror` 会推送它们**——开启“保留审计地标”时，设置页与 `04` 的说明中显式警告这一点。地标检查点的提交说明带 `Tower-Local-Exclude` trailer（§10.7.1 第 1 步），即本地文件清单中的路径名（含机密本地文件的文件名，不含内容），随地标进入用户仓库，警告同时写明这一点（ADR-208）。

**一键“清理 Tower 引用”**（设置页 → 数据 → 存储，`04` §4.15；ADR-192）：在用户仓库上下文中删除各 Goal 的 `refs/tower/<goalId>/*`（审计地标），**不删** `refs/tower/_owner`（多机租约，`06` §6.1.9）；对由 `integrated` 归档的 Goal，按 §10.3.2 的删除条件删除其仍在的分支（检出守卫与进行中操作守卫同样适用）。已放弃 Goal 的分支、验收但不合并而归档（`integrate:"none"`）的 Goal 的分支与仍在进行的 Goal 的分支一律不删。结果逐条列出未删除的分支与原因（同 §10.3.2）。被删除的只有两类：地标 ref（检查点仍在影子中，按 §10.3.2 的检查点保留期）与顶端已在 base 中的 Tower 汇总提交分支（内容已在 base 中），你的提交不会因此丢失；`07` 的重放包（ADR-070）存放在 `~/.tower` 下，不受影响。操作记 `audit.user_refs_cleaned`。隐私清除不经本操作、不写用户仓库，只列出 Tower 写过的 ref；要删除其中满足条件的，须在清除之前执行本操作（`09` §9.12.4，ADR-195）。

---

## 10.7 检查点

每个回合边界（`turn_end`，`03` §3.4.2）记录一次工作区快照，存为影子目录中的提交，映射到 Pi 的 entry id。

### 10.7.1 算法（`captureCheckpoint`，完整顺序）

```
输入：卫星工作目录 W、卫星 gitdir G（<wtRoot>/_gitdirs/<goalId>）、影子 SH、goalId、runId、piEntryId（turn_end 时 ctx.sessionManager.getLeafId()）
**入口（ADR-118/127，R12-D13-01、R13-D13-01）**：(i) **回合入口**——`turn_end`，下列第 0–7 步全部适用；(ii) **非回合入口**——`agent_bg_done`（settle 第 4 步、崩溃恢复后；运行中不再有“进程树清空”事件，ADR-144）、`external_change_kept`（保留外部改动）、`safety`、`human_edit`（交还、检验带回、就地编辑）：跳过第 0 步；第 7 步只跳过 `appendEntry`，`checkpoint.created` 照常记录，归因窗口（`03` §3.2.1）与 `human_edit` 检查点的先后都以它的事件序号界定（ADR-210）；没有 `piEntryId`、不写入 Pi 会话，**必须带 landmark**，`runId` 可空。**去重例外**：第 2 步的“树相同即不建”不适用于人工决定类入口 `external_change_kept` 与 `human_edit`——树不变时也记一个只带 landmark 的检查点，引用同一棵树，作者属性按决定记录（ADR-127）；同样不适用于 settle 第 4 步的 `agent_bg_done`，以及 `06` §6.1.6 “Agent 后台进程”一行每一轮终止完成时补的 `agent_bg_done`（有第二类 Run 时带它的 `runId`，是该行第二类令牌移出范围的依据，ADR-227）（作者照常为 `agent`；交还第 7 步与 `safety` 同树时仍按 §10.8.4 记在该检查点上），所以每次 settle 都有它的检查点，I4(b) 与 `06` §6.2.3 的 Projector 断言有物可比（ADR-211）。**回退语义**：M1 在时间线上于相邻两个回合之间显示非回合检查点（以 landmark 标注），但**选中并回退到它属于 M2**；M2 中回退到非回合检查点时，对话侧 `navigateTree` 到它之前最近的回合 entry，代码恢复为该非回合检查点的树，并附一条 steer：“代码已回到 <landmark> 时的状态”（ADR-127）。“任意 entry 的代码状态 = 最近的带检查点祖先”只针对回合检查点。

0. 若本回合没有**变更类工具调用**（唯一定义在 `16` §16.1，ADR-130：只读白名单之外的任何工具调用，含嵌套调用、MCP 与扩展工具；`bash` 按 `11` 的动作分类，“不确定”算变更）→ 不新建检查点，结束
1. **检查点树与 pin 树的唯一定义，也是 Tower 快照排除什么的唯一定义（`07` §7.3.2、§10.1.2、§10.6 引用本条，R11-D13-01、ADR-207）**：worktreeTree = 影子上下文中对卫星工作区 `add -A`，排除且只排除以下四类：
   (a) 名为 `.git` 的条目（git 自动不收录）；
   (b) gitlink；
   (c) git 在 `core.protectHFS/NTFS` 下会拒绝收录的路径：按 §10.1.2“git 拒绝收录：一次列出、一次排除”在 `add` 之前列出并一次性以 `:(exclude)` 排除（不设数量上限；git 仍拒绝时的兜底见同处），记入 `excludedPaths`，并以不可覆盖的 `nested_repo` 阻断 Verified（ADR-131/136/139）；
   (d) 本地文件排除集 L：该 Project 本地文件清单中、不在该 Goal 的 base 树中被跟踪的路径（规则与理由见 §10.1.2“本地文件按路径排除”，ADR-206），以 `:(exclude)` 排除，不记入 `excludedPaths`，不是检测器。
   **不**以早期预警结果排除任何路径，**不**排除大文件（ADR-086）。(b) 与 (d) 的条目若已在影子索引中，`add` 之前先 update-index --force-remove（pathspec 排除不触碰索引中已有的条目）。
   **L 的求值与记录**（ADR-207）：新建检查点或 pin 时按当时的清单求值，并以 trailer `Tower-Local-Exclude: <路径>`（每条一行）记在该提交上；与某个检查点或 pin 比较的指纹（`in_review`/`accepted` 的 I2、`accept` 与 seal 的 `full` 闸口、§10.3.1 归因表第 4 行与归因基线的比较）用该提交记录的 L。所以清单的增删本身不产生 I2 或 `external_change`，在该 Goal 的下一个检查点或 pin 生效。没有记录可取的比较（归因基线为 `baseCommit`、`running` 中的观察器指纹与 Fact 新鲜度）取当时的清单，清单变化在 `running` 中只会使 Fact 变旧；`in_review`/`accepted` 中 Fact 新鲜度与 I2 一样用当前 pin 记录的 L，所以清单变化不使这些 Fact 变旧、不回到 `verifying`，在下一次 pin 生效（唯一定义，ADR-210）；settle 生成的 pin 沿用 settle 第 4 步 `agent_bg_done` 检查点记录的 L，所以 pin 的树 = 该检查点的树（`07` §7.4.1 I4(b)）。
   **移出清单的路径的归属**（唯一定义，ADR-208/209）：取本 Goal 最近一个记录的 L 含该路径的检查点或 pin S；若本次 L 不含它、它出现在本次快照的树中，且 S 之后本 Goal 的检查点与 pin 的树都没有收入过它——即移出清单之后首次进入本 Goal 的快照，不论移出时它是否仍被 git 忽略、之后何时不再被忽略——就按人的改动记录：本次快照是检查点时记入它的 `mixedPaths`；是 pin 时（settle 的 pin 已由 settle 第 4 步的 `agent_bg_done` 检查点处理），先以同一棵树写一个 `safety` 非回合检查点并记入它的 `mixedPaths`，再生成 pin。理由：它可能是人的文件（Tower 播种的条目），其间可能经 Agent 修改。评审中作者为 `mixed`，按 `03` §3.2.1 计为人的改动，验证失败不自动返工；收入之后它不再特殊，此后的快照照常归属。规则同样作用于运行中的机会式 pin（`07` §7.4.1 `verify()` 对每种触发都生成 pin）；`safety` 检查点与 pin 在同一次 `wtLock` 内以同一棵树 T 写出，其间不重新 `add -A`。经交还首次收入的（`human_edit` 检查点）同样按本条记为 `mixed`，不写 `Tower-Human-Edit`，取保守的一侧（ADR-210）。判定只读已有的 `Tower-Local-Exclude` trailer 与快照树，不加字段。已知限制：本 Goal 还没有记录 L 的检查点或 pin 时没有记录可比（窗口从卫星创建起，含检出完成后在 `ready` 中排队的时间，到第一个检查点或 pin 为止），这时移出的路径按收入它的快照记录，评审中该文件照常可见。
   **其他快照**同样按本条排除，(d) 取当时的清单：§10.5 的基线快照、检验带回、交还的 T1 与人工编辑的差异、`11` §11.8.1 的两种复核；它们不是检查点，不记 `excludedPaths`。交还的 T1 另按 §10.8.4 第 5 步排除含机密的本地文件的路径，即使它在该 Goal 的 base 中被跟踪（人对它的修改不进入；T1 从 T0 起计算，该路径保留 T0 的版本，不做 `--force-remove`，ADR-167）。
   **忽略规则不追溯**（唯一定义，ADR-211；§10.1.2 决定性指纹与忽略规则两条、`07` §7.3.2 引用）：已收入影子索引的路径此后即使匹配忽略规则（Agent 改了 `.gitignore`，或 Run 开始时刷新的 `info/exclude` 多了一行）也照常更新、留在之后的快照中——`add -A` 本就如此，与 git 中已跟踪的文件不因加入忽略规则而消失一致；只有 (b) 与 (d) 先 `--force-remove`。影子索引创建时以 `read-tree <baseCommit>` 初始化（§10.3.1 卫星创建）；影子目录被删除后重建（§10.16.2 情形 B）时以从备份取回的最新可用检查点的树初始化，没有可用检查点时才以 `baseCommit`（ADR-212）。验收与 seal 的 `full` 的全新临时索引以影子索引此刻收录的树初始化（`read-tree $(GIT_INDEX_FILE=<SH>/index git write-tree)`，不带 stat 信息，所以全部重新哈希），与 decisive 收录同一组路径，两者只可能在内容上不同；`stat_cache_mismatch` 之后“清空影子索引”即以这次 `full` 的临时索引取代它（`07` §7.3.2）。
   指纹（影子上下文，§10.1.2）：GIT_INDEX_FILE=<SH>/index（Tower 自有索引，stat 检查含 ctime/inode，ADR-075）
   git update-index --force-remove -- <gitlink 与 L 中已在索引的条目>
   git add -A -- . ':(exclude)<(c) 与 L 的每条路径>'… ；T = git write-tree   # 结果只取决于工作区内容、L 与影子索引已收录的路径（忽略规则不追溯，见下）
   —— 新对象写入 SH/objects（Agent 不可写）；已存在于镜像的对象经 alternates 复用；镜像 gc 前影子 ref 同步为 refs/tower-live/*，被复用的对象不会被回收（ADR-073/083，§10.17.1）
2. 若 T == 上一个 cp 的树 → 不新建检查点，结束（去重例外见上：人工决定类的非回合入口，以及 settle 与 `06` §6.1.6 终止一轮补的 `agent_bg_done`，ADR-228）；回合入口只与上一个**回合**检查点比较，`safety` 等非回合检查点不使其后同树的回合去重（ADR-211）
3. satHead = 卫星 HEAD 的提交哈希：Tower 自行只读解析 <G>/HEAD → loose ref 或 packed-refs（§10.1.3 的“读取 gitdir”规则：O_NOFOLLOW、
   只接受普通文件、≤ 1 MB、超时 2 s；不在卫星 gitdir 上运行 git，ADR-100）；失败或非法 → unknown（信息性，不记哨兵）
4. C = git commit-tree T [-p <prevCp>] -m "tower-cp <goalId> #<n> run <runId> entry <piEntryId>

       Tower-Satellite-Head: <satHead>
       Tower-Local-Exclude: <L 的每条路径>"                  # 父提交只有上一个检查点（首个则以 baseCommit 为父）；L 见第 1 步；含换行、引号或非 ASCII 字符的路径按 git 的 C 风格引号转义（core.quotePath 的写法）；标题行与 trailer 之间空一行（git 的 trailer 段规则，pin 的提交说明相同），Tower 读取时只解析自己写的这一格式
5. git update-ref refs/tower/<goalId>/cp/<n> C ""            # 写在影子中；旧值为空 = 必须不存在，防并发重号
   —— 此时 C 及其全部对象都已在 SH 中；ref 与对象在同一个库，不存在悬空窗口
6. 检查点不进入用户仓库（§10.6.2；开启“保留审计地标”时归档阶段的地标除外）；它的全部对象都在影子或镜像中，二者都不受用户维护影响
7. 记录事件 checkpoint.created；在 Pi 会话中 pi.appendEntry("tower.checkpoint", {n, commit: C, tree: T, satHead})   # 回合入口由扩展在收到 Supervisor 的结果后追加（唯一写者，§10.7.2）
```

- **一一映射（ADR-015）**：每个检查点 ref 恰好对应一个 Pi entry id；没有变更的回合不建检查点；任意 entry 的代码状态 = 会话树路径上最近的带检查点祖先。
- 第 7 步把映射写进 Pi JSONL（`custom` entry 不进入模型上下文），使会话文件自身就能回答“这个 entry 对应哪个代码状态”；回退到别的分支后映射仍在旧分支上，天然“分支正确”。
- 检查点链只有一个父提交（上一个检查点），可在影子中 `git log` 浏览。卫星 HEAD 只作为 trailer 记录（卫星对象不在影子中，不能作为父提交）。
- 冲突雷达与备份 bundle **只读镜像与影子**（ADR-060 第 5 点、ADR-073）；它们需要的对象都在这两处，不依赖任何迁回步骤，也不依赖用户仓库。
- 与 Pi 示例 `git-checkpoint.ts` 的差异：示例用 `git stash create`（不含未跟踪文件，只存在内存中）；Tower 需要持久、含未跟踪文件、可审计、且不在 Agent 可控 git 元数据上运行的检查点。

数据结构：

```ts
interface Checkpoint {
  goalId: GoalId; projectId: ProjectId; n: number;   // 多仓库 Goal 每个仓库独立编号；同一回合的多个仓库检查点共享 piEntryId（§10.13）
  runId?: RunId;   // 与 DDL 一致可空：safety、人工交还（§10.8.4）产生的检查点不属于任何 Run（R5-D15-01 #5）
  author: "agent" | "human";   // human 只用于显式的人工决定：交还、检验带回（§10.8.3 第 7 步，ADR-211）、keep_external_change（M2 的就地编辑经 keep 确认，ADR-114/122）
  externalPaths?: string[];   // running 中检测到外部写入后、drain 期间的回合检查点里逐路径归为外部的路径集合 E（ADR-122）；
                              // keep_external_change 时改记为 human（mixedPaths 中的路径记 mixed，ADR-128）；keep_both 交还第 8 步的检查点同样记录；与 `06` DDL、`16` 一致（`Checkpoint` 只在本节定义，`02` 不重复定义）
  mixedPaths: string[];       // 同一路径上既有 Agent 工具写入又有外部写入的路径，以及移出本地文件清单后首次收入快照的路径（第 1 步；pin 时记在 pin 之前的 safety 检查点上，ADR-208/209）（ADR-128/135，06 checkpoints.mixed_paths，默认 []）：drain 检查点与
                              // keep_external_change 的检查点记录；评审单元的作者推导顺序（`02` ReviewUnit.hunks[].author）：先 mixedPaths → mixed，
                              // 再 externalPaths → external（未经 keep），最后取 author（human_edit 检查点只对 humanPaths 中的路径取 author，见下）；mixed 不作为“你的改动”，不进入 Tower-Human-Edit
  humanPaths?: string[];      // 只在交还第 8 步与检验带回（§10.8.3 第 7 步，ADR-211）的 human_edit 检查点上写：“归为人的路径”（唯一定义 §10.8.4 第 8 步，ADR-184；06 checkpoints.human_paths）。作者推导中
                              // 该检查点只对其中的路径取 author:"human"；它改动的其余路径（take_human 恢复的 E）穿透：作者按把检查点链截断到接管时的检查点
                              // （B = T0 的检查点 k，§10.8.4 第 1 步）推导的结果，因此 Agent 的代码不会因交还被记为人的改动、也不会因此写 Tower-Human-Edit
  unusable: boolean;          // 情形 G 中对象补不回时标为不可用（§10.16.2，ADR-184；06 checkpoints.unusable，默认 false）；重建来源跳过它（情形 E）
  excludedPaths: string[];    // git 在 core.protectHFS/NTFS 下会拒绝收录、add 前一次列出并 :(exclude) 的路径（ADR-131/139，06 checkpoints.excluded_paths，默认 []）；非空即 nested_repo，不可覆盖
                              // 第 1 步 (d) 的本地文件排除集不在这里，记在该提交的 Tower-Local-Exclude trailer 上（ADR-207）
  sessionId?: string;         // Pi 会话文件 id（与 DDL session_id 一致）
  piEntryId?: string;         // turn_end 时会话树的叶子；safety / 交还产生的检查点可能没有
  commit: Sha; tree: Sha;     // 影子中的提交与树
  satelliteHead?: Sha;        // 卫星 HEAD（信息性，可能已被 Agent 改写或 gc）
  inUserRepo: boolean;        // 是否已 fetch 进用户仓库
  takenAt: Iso; durationMs?: number;   // 与 DDL duration_ms 可空一致
  landmarks: ("submit" | "verify_pass" | "verify_fail" | "criteria_flip" | "rework_start" | "human_edit" | "safety"
              | "agent_bg_done" | "external_change_kept"
              | "rebase")[];   // 写入（唯一定义，ADR-213）：建立时写入——回合检查点：本回合含 `submit` 调用 → submit；`Run.reason = rework` 的 Run 的第一个回合检查点 → rework_start
                             // （本回合没有建立检查点时——第 0、2 步——不补写到别的检查点）；非回合检查点：按入口写 agent_bg_done / external_change_kept / safety / human_edit。
                             // 建立后只追加 verify_pass / verify_fail / criteria_flip：一次验证的全部 criterion_check Fact 记录之后，由 Projector 追加到被验证 pin 的
                             // “当前 pin 的检查点”（§10.3.1；没有时不追加）——全部通过 → verify_pass，否则 verify_fail；有标准的结果与该 Goal 上一次验证不同 → 另加 criteria_flip；
                             // 重建时由同一组 fact.recorded 推出（`16` §16.1.14）；时间线的验证地标仍以 Fact 为准（§10.8.2）。
                             // “全部通过”= 这次验证的每条 criterion_check 都满足 `07` §7.2.4 的 isVerifiedPass；没有 criterion_check 的验证（只有 human 或延后标准）与中途取消、
                             // 未记全的验证都不追加；这三个值由 Projector 追加，数据库层不校验（DDL 的 checkpoints_landmark_guard 只在 INSERT 时检查，`06` §6.3，ADR-214）。
                             // agent_bg_done、external_change_kept 只出现在非回合检查点上（ADR-118）；rebase（M2）：合并队列 rebase 写回后的检查点（`Binding.boundSeq` 不随 rebase 移动，rebase 带入的变化由本 landmark 计入窗口；多仓库 Goal 按仓库分别计算窗口，ADR-146），
                             // 标出由 rebase 带入的 base 变化（归因窗口中的“人的改动”之一，`03` §3.2.1，ADR-145）；与 `06` DDL、`16` §16.1.6 一致
}
```

### 10.7.2 成本控制

| 仓库规模（跟踪文件数） | 预期 `add -A + write-tree` | 策略 |
|---|---|---|
| ≤ 20k | 50–300 ms | 每个有变更的回合 |
| 20k–100k | 0.3–1.5 s | 每个有变更的回合。影子上下文**禁用** fsmonitor 与 untracked cache（`core.fsmonitor` 是可执行命令配置项，ADR-060；untracked cache 依赖 Agent 可写的目录 mtime），因此大仓库只能靠影子索引的 stat 缓存加速；SP5 实测 |
| > 100k 或连续 3 次 > 1 s（数值见 `16` §16.2.6） | — | 降级为“每 3 个有变更回合 + 每次 submit/rework 边界”，并在设置页显示原因。降级期间，回退与时间线把“某条目的代码状态”如实标为近似：回退确认框与时间线刻度写“恢复到第 n 回合的最近快照（降级档位：每 3 回合一次）”（R7-D13-02c） |

检查点由 tower-goal 扩展在 `turn_end` 钩子中触发（两种适配器下只有扩展能看到 entry id，`05`），由 Supervisor 在影子上下文中**异步**执行，不阻塞 Agent 下一回合；但下一次检查点开始前必须等待上一次完成（每个卫星 + 影子互斥）。

**影子的唯一写者（唯一定义，ADR-183）**：影子索引 `<SH>/index`、影子对象与 `refs/tower/<goalId>/*`（检查点 `cp/<n>`（含 landmark 为 `safety` 的检查点）、pin、seal）**只由 Supervisor 的 GitService 写**，持该卫星的 `wtLock`（`06` §6.2）按到达顺序串行执行；编号 n 在锁内分配（链上最大编号 + 1），`update-ref … ""` 的 CAS 只作兜底。Engine Host 中的 tower-goal 扩展**不在本地执行** `captureCheckpoint`：它在 `turn_end` 时经 Host 通道发出带 `piEntryId` 的检查点请求，等待结果后以 `pi.appendEntry("tower.checkpoint", …)` 写入会话（`05` §5.6）。settle 时扩展最多等待未完成的请求 5 s（`checkpoint.settleWaitSec`，`16` §16.2.6）；超过时 settle 照常继续——**已发出**的请求在 Supervisor 的队列中，先于随后的 `agent_bg_done` 检查点与 pin 执行，编号与先后不变；扩展队列中尚未发出的请求仍在 Host 侧，之后照常发出或随 Host 退出丢弃，其改动都包含在随后 `agent_bg_done` 检查点的树中（ADR-184）；该 `tower.checkpoint` 条目可能晚于 `agent.settled` 追加，Host 已退出时不再追加，映射以 Tower 事件 `checkpoint.created` 中的 `piEntryId` 为准。若 Agent 在快照进行中修改文件，快照可能混合前后状态——可接受：检查点用于回退与恢复，而 Verified 只依赖验证器在 Run 空闲后生成的 pin（`07` §7.4.1）。

---

## 10.8 回退（Rewind）与分叉（Fork）

把 Pi 会话树（对话）与检查点（代码）组合成用户可理解的操作。前提：Run 必须空闲——Pi 的 `navigateTree` 在流式输出或压缩时会直接抛错（`agent-session.ts` L3993–4000），所以 UI 先发出 pause（`abort` 到回合边界）再执行。

**尝试（Attempt）= Pi 会话树上的一条分支（ADR-027）。** 只有回退（rewind）、分叉（fork）、换方案重来时才在同一 Pi 会话文件内以 `navigateTree` 开新分支，产生新尝试；**验证失败后的默认返工沿用当前分支，是同一尝试的新 Run**（`Run.attempt.n` 不变）。被放弃的分支保留 `branch_summary`，其代码线头存为 `refs/tower/<goalId>/abandoned/<k>`。只有上下文过长时才以交接包开新会话文件（`parentSession` 链接）。时间线（`04`）把每个尝试显示为一条可展开的支线，地标来自检查点与 Fact。

| 操作 | 对话 | 代码 | 用途 |
|---|---|---|---|
| **回退到 cp n（默认）** | `session.navigateTree(cp.piEntryId, {summarize: true})`：同一 JSONL 内移动叶子，被放弃的分支生成 `branch_summary` | 恢复工作区到 cp n | 撤销一段走偏的工作 |
| 只回退代码 | 不动 | 恢复到 cp n，并向 Agent 发送 `steer`：“工作区已被人回退到检查点 n（…），请重新读取相关文件” | 人发现某次改动不对，但希望 Agent 保留上下文 |
| 只回退对话 | `navigateTree` | 不动 | 少用；UI 提示“代码与对话将不一致” |
| **分叉为新 Goal** | 对源会话文件另开一个专用实例 `SessionManager.open(<源会话文件>, <新 Goal 的会话目录>, <新卫星路径>)`，再调用它的实例方法 `createBranchedSession(cp.piEntryId)` 生成新文件（只含根到该 entry 的路径；头部 `cwd` 取该实例的 cwd 即新卫星，`parentSession` 指向源文件），作为新 Goal 首个 Run 的会话；该实例随即切换到新文件，用完即弃。不在源 Goal 的运行时上调用：`createBranchedSession` 会把调用它的实例切换到新文件，`AgentSessionRuntime.fork` 则会把整个运行时切到新会话（v1.2.0 `session-manager.ts:1632-1748`、`agent-session-runtime.ts:262-350`，ADR-181）。返回的路径在磁盘上不存在时（路径中没有 user/assistant 消息，Pi 延迟写文件）按分叉失败处理。**前提：源 Goal 没有活跃 Run**（`06` §6.4.3 `run.fork_goal` 的守卫，ADR-182）：`SessionManager.open` 读入源文件时可能修补它——末行缺换行时追加一个换行、0 字节文件写入会话头（v1.2.0 `session-manager.ts:661-669`、`:1029-1046`），源 Goal 的 Host 仍在写同一文件时两者会交错 | 新卫星从 baseCommit 创建（§10.3.1）并按 §10.8.1 第 1–3 步恢复到 cp 树；影子检查点链复制到新 Goal 的影子（`git fetch`） | 想同时保留两条路线比较（Best-of-N 的手动版本）。M2 设计时一并处理隐私清除：新会话行的 `parent_session_id` 跨 Goal 指向源会话，新会话文件含复制的对话，清除源 Goal 时二者都须有规则（`09` §9.12.4，ADR-197） |

并行尝试（Best-of-N，M3）是 ADR-015“在可能时”的例外：一个会话文件同一时刻只能由一个运行时驱动，因此 N 个并行尝试各用一个专用 `SessionManager` 实例（同上一表“分叉为新 Goal”，同样要求源会话没有活跃 Run）以 `createBranchedSession` 从同一 entry 派生独立文件（每个文件的 `parentSession` 都指向源文件，而不是前一个分叉）、各自独立卫星与影子（`<goalId>~b<n>`），Tower 在 Goal 元数据中记录它们共同的分叉点，时间线上仍画成同一棵树。

### 10.8.1 恢复工作区到检查点（`restoreCheckpoint`）

第 0–3、5–6 步在影子上下文中执行（§10.1.2），只写卫星的**工作区文件**（GitRunner 写范围限定为卫星工作目录，§10.1.3）；Tower 不向卫星 gitdir 写任何文件。第 4 步卫星的 git 状态由**沙箱内**的 git 完成。下文 G = `<wtRoot>/_gitdirs/<goalId>`。

```
0. captureCheckpoint(..., landmark=safety) → 影子 refs/tower/<goalId>/cp/<k>（landmark safety）   # 回退本身可撤销
   若当前工作区不是 cp 链上 n 之后的延续：git update-ref refs/tower/<goalId>/abandoned/<j> <safety>
   （卫星重建——§10.16.2 情形 E 的自动重建与人发起的重试 `goal.rebuild_satellite`——**不执行本步**：卫星是 Tower 刚检出的 base，没有要保留的内容；
    重建只执行第 1–6 步，成功后按情形 E 记录重建树的检查点，ADR-182）
1. tmp=临时索引；GIT_INDEX_FILE=$tmp git read-tree <cp.tree>
2. GIT_INDEX_FILE=$tmp git checkout-index -a -f                   # 写出 cp 树中的全部文件
3. GIT_INDEX_FILE=$tmp git ls-files -z --others --exclude-standard -- . ':(exclude,glob)**/.git/**'
   → 按 §10.1.3 逐级不跟随地 unlinkat                                # 删除 cp 中不存在、且未被忽略的文件
     # 本地文件排除集（§10.7.1 第 1 步 (d)）中的已播种副本在影子上下文中可能不被忽略，会被本步删除。M1 只有重建使用本步，重建先恢复再播种，不受影响；
     # M2 的回退、分叉与 rebase 写回复用本步时须把它们从删除集合中去掉（ADR-207）
   （被忽略的 node_modules 等不动；卫星工作目录中没有 .git）
4. 卫星 git 状态（S2）：在 **Agent 的 S2 档位**中（与 Agent bash 同一沙箱与权限，因此其中发生的一切等同于 Agent 自己的操作）
   执行 git --git-dir=<G> --work-tree=<W> reset --mixed -q <s>，s = cp 的 Tower-Satellite-Head（若卫星中仍有该提交）否则 baseCommit；
   超时 10 s；失败则忽略，并在 steer 中告知 Agent“你的分支与索引未随回退调整”。
   （这一进程运行在 Agent 的沙箱中、以 Agent 的权限执行，等同于 Agent 自己的操作，不属于 ADR-100 所列 Tower 对 gitdir 的操作）
   使 Agent 的 git status 显示“工作区相对 HEAD 的改动”而非整库变化。
   S0 下：不执行这一步（会以用户权限运行 Agent 可控的 git 配置），只在 steer 中说明
5. 结果：卫星工作区 = cp 时刻的内容；卫星当前分支 = 当时的 Agent 提交（或 baseCommit；仅 S2）
6. 重算决定性指纹（影子索引 stat 检查，ADR-075）；记事件 workspace.restored {from, to: n, safety: k}
```

**按路径恢复 `restorePaths(cp, paths)`（ADR-122，R13-D4-03）**：用于“撤销外部改动”与交还处置。对 `paths` 中每个路径（`cp` 也可以是归因基线中的提交——当前 pin 或 `baseCommit`，§10.3.1——取其树）：若 `cp` 的树中存在，以影子上下文写出 `cp` 中的版本（同上第 2 步的写回方式与 §10.1.3 的规则）；若不存在，按 §10.1.3 删除；其他路径不动；不调整卫星的 git 状态。恢复**之前**先做一个 `safety` 检查点，记录将被撤销的内容，因此撤销本身可以再撤销（在非 `running` 状态检测到的外部写入此前不在任何检查点中，ADR-176）。**M1 中“可再撤销”的含义是内容保留在影子中**：回退到非回合检查点属于 M2（`06` §6.4.3 `run.rewind`、`04` §4.7.2），M1 不提供回到这个检查点的入口；M2 实现回退时，这个检查点对 `paths` 中来源不明的路径记 `externalPaths`（与 drain 期间的回合检查点相同），避免恢复后被当作 Agent 的内容（ADR-179）；完成后再做一个 `safety` 检查点，记事件 `workspace.paths_restored {cp, paths, safety}`（`safety` 为恢复前的检查点）。

- Tower 不再以原始文件方式写卫星的 ref 与索引（R6-D11-01：`refs/heads/tower` 被换成符号链接时，那样的写入会覆盖沙箱外的文件）。gitdir 由 Agent 损坏不影响 Tower（Tower 不依赖它）；人或 Agent 可请求“重建卫星 git 状态”：按 §10.1.3 在旁路目录中重新创建 gitdir（§10.3.1 第 2 步）并原子替换，工作区不动。
- 被忽略的目录（依赖、构建产物）不回退。若 cp 之后 Agent 新增了依赖，回退后依赖目录可能多出包；Supervisor 比较 cp 树与当前树中的锁文件，不同则重新执行准备与预热。
- **单向门不可回退。** 回退 UI 列出 cp n 之后发生的、审计日志中标记为 `external.side_effect`、`git.push`、`net` 写操作的动作（`11`），并明确提示“这些外部影响不会被撤销”（theory §C14）。
- 回退后 `03` 的状态：若 Goal 在 `running`/`paused`，保持；若在 `in_review`，指纹变化触发 I2。
### 10.8.2 Timeline 中的检查点

Goal 时间线（`04`）以检查点为刻度，以 Fact 事件（标准翻转、哨兵、验证结果）为地标。拖动预览某个 cp 时**不触碰卫星**：diff 在影子中用 `git diff <baseCommit> <cp.commit>` 计算（检查点提交本身就包含工作区状态）。


### 10.8.3 检验检出（ADR-078、ADR-082，R4-D8-01、R5-D8-01）

人在评审中按 `O 检验` 时，Tower 为人工检验准备一个与卫星、pin 都隔离的目录。**这里运行的是 Agent 写的代码**（pin 中的生命周期脚本与服务），因此它与验证槽位适用同一信任边界：

```
0. 信任提示（每个 Goal 首次打开时；变更了生命周期脚本、新增依赖或选择带上机密文件时再次提示）：
   “检验目录中的代码由 Agent 编写。Tower 启动的脚本与服务在验证器沙箱中运行；
    你在外部终端里自己运行的命令不受沙箱限制；
    [ ] 带上本地机密文件（由我自己运行 Agent 的代码）：<列表>——默认关闭（ADR-166）；
        打开时：运行期间 Agent 写的代码会读到这些文件；同一用户的其他进程也可能读到；
    终端只带白名单环境（见第 5 步）；你的编辑器打开此目录时可能执行其中的配置（ESLint、任务、direnv 等），
    建议以受限模式打开（ADR-094）；指向目录之外的符号链接：<列表>”  [打开] [取消]
1. <wtRoot>/_inspect/<goalId>（独占新建；检验仍在使用中时——不论该路径是否存在——返回 E_STATE，路径已存在而不在使用中时先改名保留，均按 §10.2，ADR-198/228/231）：影子上下文以临时索引 read-tree <pin> + checkout-index 写出 pin 的内容
   （只从影子树写出，不再从验证槽位的物化结果复制，R10-D13-02b）；不含 .git——它不是仓库；记录写出时的树 T_pin；
   `pinSafetyCheck(baseTree, T_pin)` 命中条目所在的目录与命中的符号链接不写出、信任提示列出（ADR-109）；内容与 base 相同的 base 夹具照常写出；
   被忽略的依赖目录由安装器从 depcache 物化（不从卫星复制）
2. 播种本地文件：Project “本地文件”清单中满足 `seeded` 的条目（谓词唯一定义在 `16` `ProjectLocalFile` 行，ADR-169；复制前按名字与当前内容重新判定，判定与复制用同一次读入的内容，作用范围与不可读时的处理见 `16`，ADR-170/171；`withSecrets` 时其中的普通文件部分同样如此）。含机密的本地文件**默认不播种**（ADR-165/166），与验证槽位、卫星相同；
   只有人在第 0 步打开“带上本地机密文件”时才复制进来，打开即记 HumanDecision{inspect_with_secrets}（仅本机，远程不可用）。
   这是**人发起的**例外，等同于人在自己机器上运行该分支（`11` T31）；需要机密的 human 标准因此可以在这里完成确认
3. 依赖：从 depcache CoW 物化；项目自身的生命周期脚本按 07 §7.4.3 的顺序执行——
   **沙箱档位 = 验证器档位**（S2：写允许只有 _inspect/<goalId> 与 $TMPDIR/tower-inspect-<goalId>/——检验的临时目录与服务数据目录
   都在后者之中，不在 ~/.tower 之下，因此不涉及 11 §11.6.2 的回退例外；第 7 步停止服务时即删除，人选择“稍后决定是否带回”时同样删除、
   不随检验目录保留，ADR-199/200；$VS 只读；
   网络 = VerifyProfile.env.network，默认只有 localhost）。
   S0 下：只有该 Goal 的 S0 授权为 granted（ADR-022/077）才执行；否则跳过第 3–4 步的一切脚本与服务，只复制文件，
   并在检验面板注明“未运行生命周期脚本与服务（S0 未授权）”
4. 端口段（**唯一定义**，`07` §7.4.2 引用，R12-D15-01 #5）：为检验**另行分配一个端口段**（与 Goal、验证槽位同一分配器，§10.19），关闭检验时回收——不复用 Goal 的段，
   因此 Goal 恢复 running 后 Agent 的 ${port:N} 与检验服务不会相撞；在该段内按 VerifyProfile.services 启动依赖服务（同样在验证器档位中）
5. 打开：
   · 外部终端：Tower 以启动脚本打开，以 env -i 起步的**白名单环境**（R6-D8-01c）= VerifyProfile.env.vars 以检验端口段渲染
     （${port:N}、PORT、TOWER_PORT_BASE）+ Tower 显式构造的 PATH（$SH/tools 中的 Node 与包管理器、node_modules/.bin、
     系统基础路径，ADR-085）+ HOME、USER、LOGNAME、SHELL、TERM、LANG、LC_*、TMPDIR
     + GIT_CONFIG_COUNT/KEY/VALUE 注入的 safe.bareRepository=explicit（ADR-096：检验目录可能含 Agent 写出的裸仓库布局）；
     不含用户 shell 的其余环境（云凭据、*_TOKEN 等 Host 凭据）、Agent 的任何环境（$GS、Agent 侧凭据、模型提供商密钥）与 $TI。
     人需要其他变量时在终端中自行设置（面板提示这一点）。
     人选择带上的 .env.local 若写死端口，检验面板列出这些键并提示“可能连到你本机的服务”
   · 外部编辑器：只打开目录（已在运行的编辑器无法注入环境；面板提示在 Tower 打开的终端中运行应用）
   Goal 状态不变（不暂停、不触发 I2——检验检出的修改不影响卫星、pin 与指纹）
6. 人据此勾选 human 标准
7. 清理（唯一定义，`04` §4.6.6 引用；人关闭检验的命令为 `inspect.close`，`06` §6.4.3，ADR-208）：**关闭检验，或该 Goal 被验收 / 放弃，以先到者为准**——停止服务、回收端口段；目录不删除，结束之后是已脱离的副本（§10.2 “人的工作现场不自动删除”，ADR-228）；由验收或放弃触发的清理同样记 `inspect.closed`（ADR-209），不提示。
   人关闭时先以临时索引比较目录与 T_pin（stat + 必要时哈希）：有被修改的文件 →
   提示“检验目录中有 N 个文件被修改”：[不带回] [作为人工改动带回 Goal] [稍后决定是否带回]（`[不带回]` 即 `inspect.close{modified:"discard"}`，只放弃带回、目录照常保留；保留期间不计入验收前置条件，Goal 卡片显示提示；之后经 `inspect.close{modified:"discard"}` 不带回或 `inspect.bring_back` 带回）。
   **带回 = 命令 `inspect.bring_back`（ADR-099/105，R7-D4-01b、R8-D6-01）**：只从 `in_review`/`accepted` 发起。**检验打开期间**（唯一定义，ADR-209：从 `inspect.opened` 到其后的 `inspect.closed` 或带回；以 `keep` 关闭后保留的目录不算打开）
   该 Goal 的自动 rebase 与机会式验证暂停（使 T_pin 保持为基线）；（M2）合并队列条目不出队，但其集成步骤（Q1 起）等到检验关闭或带回后再执行；
   关闭（含 `keep`）或带回后恢复，保留的目录不再暂停任何活动；带回的前提是卫星当前树仍等于 T_pin（保留目录之后带回同样如此）。冲突时（例如有进程写了卫星）不自动合并，
   选项：[以“我来改”打开当前工作目录，并把检验目录中被改的文件列为参考]（保留检验目录）/ [不带回（检验目录保留）] / [稍后决定是否带回]。
   带回过程复用人工编辑检出的写回机制：持 wtLock；持久化 humanCheckout{path: 检验目录, baseTree: T_pin, syncState:"syncing",
   written}（来源为检验目录）；暂停该卫星的文件系统事件触发；以 T_pin 为基线按 §10.8.4 第 5、7 步写回检验目录中的改动
   （不含本地文件排除集中的路径（§10.7.1 第 1 步 (d)，ADR-206）、§10.8.4 第 5 步按名字排除的凭据形路径（ADR-225）、依赖目录与未写出的 `pinSafetyCheck` 命中路径）；完成后一次性重算指纹，记一个 author:"human"、landmark 为 human_edit 的非回合检查点，humanPaths = 以 T_pin 为基线的写回集合中改动的路径
   （与 §10.8.4 第 8 步同一取法；其余路径按 §10.7.1 穿透，带回要求卫星树等于 T_pin，它们与 T_pin 相同；ADR-211），
   记 HumanDecision{kind:"bring_back_inspection"}，以单一转移进入 verifying{verifyOrigin:"human_change"}（带回记 author:"human" 检查点，因此失败不自动返工——由归因决定，ADR-140）；
   （M2）已在合并队列中的条目随之移除（Goal 离开 accepted，再次验收后才重新入队，ADR-104）；随后清除 humanCheckout，检验目录不删除，成为已脱离的副本（§10.2，ADR-228）。
   带回之后（该 Goal 最近一条 `inspect.opened` 之后已有 `HumanDecision{bring_back_inspection}` 且 humanCheckout 为空）留下的检验目录中的改动已经写回，
   重启时 Tower 不按已打开的检验处理、不与 T_pin 比较（ADR-201/228）。
   中途崩溃：重启后按 syncState="syncing" 以目标树幂等续写（与交还相同，`06` §6.1.6）；写回在本进程中失败时按 `06` §6.4.3 `inspect.bring_back` 行处理
   （不留下 syncing，检验目录保留，可再次带回，ADR-220）；写回完成后做一次全量嵌套仓库扫描（§10.3.1），
   随后的验证照常以 `pinSafetyCheck` 为第一步——人在检验目录中新建的 `HEAD`/`commondir`/`gitdir` 文件或逃出仓库的符号链接同样被阻断
```

这是 M1 的最小人工检验路径；内嵌预览面板为 M2。SP6b G19 与 A3 覆盖档位、端口与环境注入（`14` §14.2）。

### 10.8.4 人工编辑检出（“我来改”，ADR-081 第 4 点、ADR-094）

人不直接在卫星中工作：卫星 gitdir 由 Agent 写过，人的 IDE、shell 提示符对它运行 git 正是 R5-D11-01 的攻击面。`goal.take_over` 时 Tower 创建一个只含 Tower 元数据的副本。

**状态（ADR-094/099，R6-D4-01、R7-D4-01）**：`take_over` 可从 `running`（先 drain 到回合边界）、`ready`（**只在卫星已完成检出时**——检出完成标记存在，否则 `E_STATE`“工作区尚未建立”，ADR-147/151；准备阶段中的 `E_BUSY` 以 `16` §16.1.1 `ready` 行为准）、任意 `paused(*)`（`pendingHandBack` 非空时除外，`E_STATE`，`03` §3.2.1，ADR-215）、`in_review`、`accepted`（未集成）发起，一律进入 `paused(human)` 并记录 `takeoverFrom`（接管前若已 paused，原原因进入 `alsoApplies`）；持久化 `Goal.humanCheckout = {path, baseTree: T0, createdAt, syncState: "idle"|"syncing", written?: string[]}`（`02` §2.4，R8-D15-01 #10），应用重启后据此恢复“人工编辑中”。`humanCheckout` 存在时 `goal.resume` 返回 `E_STATE`（“先交还或放弃你的改动”），并且**该 Goal 的自动 rebase、机会式验证与合并队列暂停**（合并队列中的条目在此期间标为 `suspended`、保留位置，§10.10–10.11）。出口有三个命令：`goal.hand_back`（交还，要求检出存在）、`goal.discard_human_edits`（放弃改动）、以及检出丢失时的 `goal.resume`（不要求检出存在）；`paused(human_change_verify_failed)` 的重试是另一条命令 `goal.retry_after_human_change`（无检出）。转移规则以 `03` §3.2.1 为准。

```
take_over（Run 空闲后；`external_change` 未解除时返回 E_STATE，须先 keep/revert，ADR-128；先执行 §10.3.1 的全量卫星侧扫描（运行中提示）——不拒绝交接；H 中不写出 `pinSafetyCheck(baseTree, T0)` 的命中路径并在提示中列出，ADR-109）：
0. 信任提示（每次打开前，ADR-094）：IDE 打开此目录可能执行其中的代码（工作区设置与任务、ESLint/Prettier/Tailwind/Vitest
   扩展加载的配置与 node_modules、direnv/mise 等），Tower 无法沙箱化你的 IDE；建议以受限模式打开，
   父目录已被信任时受限模式不会自动生效；“此副本不含本地机密文件；需要运行时请自行复制进来”（ADR-167）；列出指向卫星工作目录之外的符号链接（R6-D8-01d）
1. captureCheckpoint(landmark=safety) → 交接基线检查点 k，树 T0（影子中）
2. H=<wtRoot>/_human/<goalId>（独占新建；路径已存在时按 §10.2 处理——仍在使用中返回 E_STATE，否则先改名保留，ADR-198/228）：**由影子树物化**（ADR-106/109）——影子上下文以临时索引 read-tree T0 + checkout-index 写出被跟踪与
   未被忽略的内容（T0 来自第 1 步的检查点）；`pinSafetyCheck(baseTree, T0)` 命中条目所在的目录与命中的符号链接不写出（交还时以 :(exclude)
   排除在差异之外），内容与 base 相同的 base 夹具照常写出；不再整体 CoW 复制卫星，因此 Agent 放在被忽略目录中的任何东西都不会进入 H。
   **依赖准备（R10-D13-02a、R10-D10-01b）**：H **立即打开**，依赖在后台准备——depcache 命中（T0 的 depsKey）则 CoW 物化，通常 < 2 s；
   未命中（Agent 改过 lockfile 且该 depsKey 尚未构建）则由安装器在后台构建（与验证同一流程，可能数分钟），期间在卡片、实况行与 Tower 的人工编辑面板中显示
   `依赖准备中 · <阶段> · <进度>`（文案与位置以 `04` §4.6.7、`12` §12.6 为准；外部编辑器中无法显示），完成后提示“依赖已就绪”。
   项目生命周期脚本与 VerifyProfile.prepare（Agent 写的代码）**不自动执行**（与检验检出不同：检验检出为运行而建，第 3 步自动在验证器档位执行；
   人工编辑检出为编辑而建，M1 中 Tower 不执行——`07` §7.4.2 按此区分，R11-D15-01 #5）：
   提示“生成产物（如 Prisma 客户端）尚未生成；需要时请在你自己的终端中运行准备步骤（不在 Tower 沙箱中，以你的权限运行 Agent 可能改过的代码，它能改动 H 中包括 git 元数据在内的任何文件）”。M1 中 Tower 不在 H 中运行任何准备步骤，也不提供这样的按钮（ADR-210）。在沙箱中运行的准备命令推迟到 M2，M2 的前提：它不能写 H/.git，也不能在 H 中任意深度造出名字折叠后为 `.git` 的条目（第 3 步“该 gitdir 的全部内容来自 Tower，Agent 从未可写”）；H 中含机密的本地文件按检验检出的显式开关处理（`inspect_with_secrets`，§10.8.3）。
   与 Agent 环境的差异（无 Agent 自己安装的未锁定依赖、生成产物需显式准备）登记于 `00` §0.5.1。Project 已批准的普通本地文件照常播种：复制前同样逐条重新判定，判定与复制用同一次读入的内容（作用范围与规则唯一定义在 `16` 的 `ProjectLocalFile` 行，ADR-171），新近命中的文件这次不复制，不可读或不存在、或在该 Goal 的 base 中被跟踪的文件这次不复制；因此第 0 步的“此副本不含本地机密文件”成立。含机密的本地文件默认不播种，这是人自己的工作副本，人需要时自行复制（ADR-167）。
   信任提示列出“以下目录未写出：可被 git 识别为仓库”与未写出的符号链接
3. 新建 gitdir H/.git（Tower 模板：config 与卫星模板相同但用户身份、hooks 为空目录、无远端；
   objects/info/alternates → 影子与镜像的 objects）；refs/heads/tower-human/<goalId> = 检查点 k 的提交，HEAD 指向它；
   index 由影子上下文写出：GIT_INDEX_FILE=H/.git/index git read-tree T0
   → 人的 IDE 与 git status 看到“相对交接时刻”的改动；该 gitdir 的全部内容来自 Tower，Agent 从未可写（S2 下 `_human` 对 Agent 读写均拒绝，ADR-082）
4. 在外部编辑器 / 终端中打开 H；终端环境同 §10.8.3 第 5 步的白名单，端口段用本 Goal 的段（Agent 已暂停，不会相撞）；
   Goal.humanCheckout 写入；卡片与实况行显示“人工编辑中”（文案见 `04` §4.6.7）
hand_back（前置守卫与 take_over 相同：卫星缺失（`satellite_missing`）或正在重建（`satelliteRebuilding`）时返回 E_STATE，ADR-178）：
4a. 交还对话框在 alsoApplies 中仍有**交还时保留**的原因时如实写“交还后仍暂停：<原因>”。保留的只有两类（以 `16` §16.1.1“推导来源与交还”行为准，R9-D15-01 #3）：
    外部条件仍成立的原因——budget_soft_cap、budget_hard_cap、provider_unavailable、external_change、satellite_missing；
    以及含**由运行推导的阻断命中**的 sentinel_high——input_mutated_after_gate（ADR-107/110，R9-D7-01、R10-D7-01）与 nested_repo_live（ADR-131）两项
    （sandbox_violation、policy_wall、post_settle_activity、循环/停滞等是提示性的，不阻断）。对 input_mutated_after_gate，对话框只提供“覆盖（写明原因）”与“保留暂停”，
    不提供返工（返工无法消除它们）；nested_repo_live 不可覆盖，见第 7 步的“删除 `.git` 等价条目”。app_quit、post_settle_activity 不是保留原因（交还本身就是人在场的显式操作，R8-D4-01a、R9-D4-01c）
5. **人在 H 中的提交被忽略**：只看工作树（被忽略的提交数 ignoredCommits 只按 §10.1.2 “已脱离副本的求值”只读解析 H/.git 求出，不在其上运行 git，ADR-230）。影子上下文 GIT_WORK_TREE=H、临时索引从 T0 起 add -A
   （H 中不含 `pinSafetyCheck(baseTree, T0)` 命中的路径——接管时未写出，第 2 步，ADR-109；H/.git 自身排除；**含机密的本地文件的路径一律排除**——无论人是否把它们复制进来，都不进入 T1，也不进入任何检查点或 seal，ADR-167；**名字形如凭据、在该 Goal 的 base 中未被跟踪、且既不被 git 忽略也不在本地文件清单中的路径同样排除**（写回集合的这一排除只在此处定义，ADR-225；ADR-226 把它限定为这一类：被忽略的路径与清单中的文件按本步其余规则排除；被忽略的路径——不论是复制进来的副本、你新建的文件，还是依赖与构建产物——都不写回（下文“被忽略的文件不同步”），与 H（带回为检验目录）一起留在原路径，交还对话框以一行灰字写明这一点、不逐条判定（H 不自动删除，§10.2，ADR-228）；名字按 `11` §11.3.1 密钥路径表的无锚定模式、以 `16` §16.1.12 的名字规则比较；§10.8.3 的带回以 T_pin 为基线同样执行）：人在 H（带回为检验目录）中新建或改过的这类文件不进入 T1、不写回卫星，路径保持 T0（带回为 T_pin）中的版本，在交还（或带回）结果中与第 7 步跳过的路径一同列出；它们留在 H（带回为检验目录）中，随它保留（ADR-228）；本地文件清单中的其余路径同样按路径排除，不论人是否改过它们，在该 Goal 的 base 中被跟踪的除外（§10.1.2“本地文件按路径排除”与 §10.7.1 第 1 步 (d)，ADR-206/208）；忽略规则同 §10.1.2）→ T1。
   **本步不短路**（唯一定义，`06` §6.4.3 `goal.hand_back` 只引用本条，ADR-182）：T1 == B（B = humanCheckout.rebuiltTree ?? T0）只表示人没有改动——第 7 步写回集合中 B→T1 的部分为空；第 6 步的外部写入判定与处置照常执行，第 8 步按所选选项执行。
   因此人没有改动、接管期间却有来源不明的写入时，外部写入同样必须经 take_human / take_external / keep_both 处置，不会进入 author:"human" 的检查点
6. 卫星在交接期间不应变化（自动 rebase 等已暂停）：（交还命令不会遇到 syncState = "syncing"——写回进行中返回 E_BUSY，崩溃留下的由 `06` §6.1.6
   在接受命令之前续写完，写回失败不留下它，ADR-220）若卫星当前树 ≠ B（例如有进程写了卫星；无论 T1 是否等于 B，第 5 步）→ 不自动合并（**接管期间 Tower 自己重建过卫星**——情形 E 的自动重建或人发起的重试 `goal.rebuild_satellite`——时，比较基准是重建所用的树 humanCheckout.rebuiltTree，重建成功的同一事务写入：重建写入是 Tower 自己的写入，不进入本步的外部改动判定；写回集合以它代替 T0，使卫星整体成为 T1，ADR-178。M1 的重建在接管期间只用第 1 步的检查点 k（§10.16.2 情形 E），因此 B = T0——写回失败转入的重建同样如此，那时第 6、7 步可能已在链上建了更新的检查点 n，k 不再是链上最新的，n 的内容不进入工作目录、仍在检查点 n 中（`06` §6.4.3，ADR-221）；人选的更早检查点的重建属 M2，ADR-183），Needs-You“卫星在你编辑期间被改动”，
   **这同时处置接管期间检测到的外部写入 E**——只针对归因表中“来源不明”（第 4 行）的写入；存活进程的写入按 agent_bg 处理，不进入此选择（ADR-128）。
   人的选择记入同一个 HumanDecision{hand_back} 的 externalResolution（取值以 `02` §2.7 为准）。
   树级语义（ADR-122，R13-D4-02）——任何选项都不会把外部写入记为人的改动，只有 keep_external_change 能做到：
   · "take_human"“以你的版本为准”：先做 safety 检查点，卫星按写回集合置为 T1（人检出的树；本地文件排除集中的路径不在写回集合中，保持原样），外部写入被丢弃；T0→T1 归因为 human；
     写回集合为“B→T1 的差异 ∪ E”：E 中的路径按 T1 的版本写出，T1 中不存在则删除（第 7 步，ADR-176/180）；
     alsoApplies 中的 external_change 在写回完成（第 8 步）时解除，此前 externalChange.paths 即崩溃续写所用的 E
   · "take_external"“放弃你的改动”：等于“放弃改动 + 保留 external_change”——H 中的改动不写回（H 本身保留，§10.2，ADR-228），卫星保持现状；**不记 human_edit 检查点、
     不注入 tower.handback、不写 pendingHandBack**（mode 为空，ADR-134），HumanDecision.targetTree 记 T0；外部写入仍然来源不明，人须再 keep / revert（ADR-128）；
     交还对话框中“交给 Agent 继续 / 直接重新验证”此时置灰
   · "keep_both"“合并两者”：只在 E 与第 7 步的**写回集合**（B→T1 的路径）不相交时提供（ADR-183：判定与写回用同一集合，写回不会覆盖任何外部写入）；按该集合写回人的改动，
     外部写入保留 external_change，等待 keep / revert；第 8 步的 human_edit 检查点对 E 记 externalPaths（ADR-128）
7. **存活进程的写入先归 Agent**（ADR-183；选 take_external 时不执行本步与第 8 步的检查点）：卫星当前树相对 B 有不在 E 中的变化路径——接管期间只可能来自未解决的
   bg_process_survived 的存活进程（归因表第 3 行）——时，写回之前先 captureCheckpoint(author:"agent", landmark=agent_bg_done)，附 bg_process_survived 注记（由 anomaly Fact 推导，见归因表第 3 行），
   E 中的路径记 externalPaths；之后第 8 步的 human_edit 检查点不会把这些写入记为人的改动。选 take_human 时第 6 步先做的 safety 检查点与本步同树（其间没有写入），
   按去重不另建：本步的判定在第 6 步已可求出，该 safety 检查点在第 6 步建立时即带上本步的 landmark agent_bg_done 与 externalPaths = E（作者同为 agent；同一检查点的 landmarks 为 [safety, agent_bg_done]，ADR-184；注记同上，不存储）；检查点建立后只追加 `16` §16.1.14 列出的两列，`checkpoint.created` 的载荷即该行（ADR-212/213）。
   文件级同步回卫星（不经 git，不写卫星 gitdir；全部按 §10.1.3 的写回规则）：先在同一事务中持久化 syncState="syncing"、目标树 T1
   （humanCheckout.targetTree，T1 的唯一落点，崩溃续写从这里读取，ADR-176）与本次交还的参数（humanCheckout.params = {mode, note, sealNote, externalResolution, resolvePinHits}：
   第 7–8 步与崩溃续写只从这里读取，第 8 步写 HumanDecision{hand_back} 时由它生成，ADR-178），
   每写完一个文件把路径追加到 humanCheckout.written（批量提交，幂等：重写同一内容无副作用）；写回集合 = git diff --name-status -z B T1 的路径（B = humanCheckout.rebuiltTree ?? T0：接管期间 Tower 重建过卫星时以重建所用的树为基准，
   使卫星整体成为 T1，第 6 步；唯一定义，`06` §6.1.6 的崩溃续写与 §6.4.3 `goal.hand_back` ② 引用本步，ADR-180），
   选 take_human 时再并上 E（E 中的路径按 T1 的版本写出，T1 中不存在则删除，ADR-176），崩溃续写使用同一集合；逐项——
   新增 / 修改：从 H 以 O_NOFOLLOW 读取（H 中的符号链接按链接本身复制，不跟随），在卫星中“临时文件 + renameat”写入；
   删除：unlinkat；重命名 = 删除 + 新增；卫星侧父目录链中有符号链接、或目标不是普通文件 → 跳过并在交还结果中列出
   被忽略的文件（依赖目录等）与本地文件排除集中的路径（§10.7.1 第 1 步 (d)）不同步；锁文件若变化，交还后按 §10.8.1 的规则重新准备依赖
   **处置 pin 命中项（ADR-118，R12-D8-02）**：执行 hand_back 参数 resolvePinHits?: {path, action: "delete" | "restore_base"}[]——
   delete 删除本 Goal 新增的条目，restore_base 把路径还原为 base 版本（base 中不存在则删除）；同样按 §10.1.3 写回、记入 written；
   这些改动与人的其余改动一起归入第 8 步的 author:"human" 检查点
   **删除 `.git` 等价条目（ADR-131，R14-D4-04）**：`nested_repo_live` 的条目与当前 `excludedPaths` 中的路径不在 T0 中（git 拒绝收录），
   因此不会出现在 H 里，人无法经 H 删除它们。交还对话框把它们单列（只有“删除”一个动作，默认勾选），勾选的条目在本步由 Tower 按 §10.1.3
   整体删除（逐级 O_NOFOLLOW，不跟随其中的任何链接）；条目消失后 `nested_repo_live` 解除、`nested_repo` 不再成立——这是人在交还中的显式决定，
   因此不适用 §10.1.2 的“条目消失时加入 `human`”（ADR-137 针对的是来源不明的删除）。未勾选的条目保留，
   相应原因作为保留原因留在 alsoApplies 中（第 4a 步）
8. captureCheckpoint(author:"human", landmark=human_edit)——**选 take_external 时任何情况下都不执行**（包括人没有改动时；第 6 步，ADR-182）；
   **归为人的路径**（唯一定义，ADR-183）= 写回集合中 B→T1 的路径 ∪ resolvePinHits 处置的路径 ∪ 勾选删除的 `.git` 等价条目；该检查点中其余变化的路径
   （take_human 按 T1 版本写出的 E、keep_both 的 E）不归为人——take_human 恢复的路径沿用该路径在 B 中的作者，keep_both 的 E 记 externalPaths；
   归为人的路径写入该检查点的 `humanPaths`（载体，ADR-184），作者推导只对其中的路径取 author，其余路径按 §10.7.1 穿透到接管时的检查点；
   人没有改动时归为人的路径为空，检查点只带 landmark（去重例外，§10.7.1），seal 不因此写 Tower-Human-Edit（§10.6）；H 不删除：清除 humanCheckout 的事务提交之后，H（含其 gitdir 与人在其中的提交、被忽略与未交还的文件）原样留在原路径，成为已脱离的副本，交还结果与 Goal 页列出其路径（§10.2 “人的工作现场不自动删除”，ADR-228；本进程中的交还——含 take_external——、§10.8.3 的带回与 `06` §6.1.6 的启动续写都如此，写回期间或崩溃之后人在编辑器中又保存的改动因此留在其中，`06` §6.4.3、`04` §4.6.7 引用本句）。
   清除 Goal.humanCheckout；**只清除由 pin 推导的原因与哨兵**（ADR-103，R8-D7-01：verify_failed_limit、verify_env_error、s0_grant_pending、
   human_change_verify_failed，以及只依据 pin 内容计算的哨兵——新 pin 会重新判定；逐检测器的推导来源以 `16` §16.1.6 为准）；
   **由运行推导的阻断命中保留**（input_mutated_after_gate 与 nested_repo_live，ADR-107/110/131；按 Goal 作用域保持 open，新 pin 的 decide 仍计入
   blocking，直到 override_sentinel）；提示性的 run 类命中不随交还清除也不阻断；app_quit、post_settle_activity 一并解除；
   若仍有保留原因 → Goal 留在 paused(<最高的保留原因>)，并持久化 **Goal.pendingHandBack = {mode: "continue_agent"|"reverify", at,
   decisionId, returnTo?}**（ADR-104/108/134；returnTo 在清除 takeoverFrom 之前由它取得，∈ {in_review, accepted} 时才写，ADR-213；decisionId 指向本次 HumanDecision{hand_back}，人写的意图从它的 note 字段读取，重启后同样可得，R9-D4-01b）；
   **选 take_external 时 mode 为空，不写 pendingHandBack**，继续目标不变（接管时已按 takeoverFrom 写入），之后 keep / revert 解除
   external_change 时由继续目标决定去向（keep 把 review/verify 改写为 verify_new；revert 不改写），不会注入 tower.handback（ADR-134/140）。
   交还本身的开场（tower.handback 与人写的文字）追加到 Goal.pendingOpenings（ADR-140）。
   **唯一的执行入口**：`onAllReasonsCleared()`（`03` §3.2.1，ADR-134；取代独立的 applyPendingHandBack）——pauseReason 与 alsoApplies 全部为空时
   调用，无论最后一个原因由什么解除（budget.extend 只提高额度、不解除原因，由 goal.resume 解除，ADR-137）；第 1 步执行 pendingHandBack：reverify → 以当前树生成新 pin
   验证（不开 Run；Goal.verifyFrom = pendingHandBack.returnTo ?? claimed——takeoverFrom 此时已清除，ADR-137/213；交还的检查点是 author:"human"，
   因此失败不自动返工——由归因决定，ADR-140），continue_agent → running（开场按序消费 Goal.pendingOpenings：tower.handback 只含改过的文件与“不得回退”，
   人写的意图以 user 消息另发，ADR-138/143）；然后清除它与继续目标，**不清除 pendingOpenings**——reverify 没有开 Run，载荷留到下一次 Run（ADR-140）。
   无保留原因时按人在交还对话框中的选择立即执行（ADR-094）：
   “交给 Agent 继续” → running（开场按序消费 pendingOpenings：tower.handback（改过的文件，不得回退）+ 人写的意图）；
   “直接重新验证” → verifying（失败不自动返工，由归因决定，ADR-140）；从 in_review/accepted 发起时默认后者
   从 accepted 接管并交还后 Goal 离开 accepted：合并队列中 suspended 的条目移除，**再次验收后才重新入队**（ADR-104，R8-D4-01b）
   写回完成后做一次全量嵌套仓库扫描（§10.3.1，早期预警）；人在 H 中新建的 `HEAD`/`commondir`/`gitdir` 文件或逃出仓库的符号链接由随后验证的第一步 `pinSafetyCheck` 阻断
   事件 human_checkout.handed_back {changed, ignoredCommits, skipped, choice, pending}（changed、skipped 使载荷超过 16 KB 时按 `06` §6.3“载荷中的路径集合”外置，ADR-214）
```

- 交还之前 Goal 保持 `paused(human)`；人关闭 Tower 不影响 H。
- **放弃改动 = `goal.discard_human_edits`（ADR-099/134，R7-D4-01a、R15-D4-01）**：清除 `humanCheckout`，H 不删除，成为已脱离的副本（§10.2，ADR-228）；命令只做两件事——解除 `human`，以及在下述情形显式改写继续目标（接管时已按 `takeoverFrom` 写入：从 `running` 或 `ready` → `run`（`ready` 的 `queuedRun` 保留，ADR-147），从 `in_review`/`accepted` → `review`，从 `paused(*)` → 保持原目标，`03` §3.2.1）：(i) `takeoverFrom ∈ {in_review, accepted}` 且卫星当前树仍等于 pin 的树 → 不改写，经 `onAllReasonsCleared()` 回到 `takeoverFrom`（不触发 I2，原评审进度保留；从 `accepted` 来的，合并队列中 suspended 的条目恢复，保留原位置）；(ii) 卫星树 ≠ pin 的树（接管期间卫星发生了变化）→ 先排除 Tower 自己的重建：接管以来重建过卫星时以重建所用的树为比较基准（`humanCheckout.rebuiltTree`，检出已丢失时取最近一条 `satellite.recovered` 的 `tree`；与交还第 6 步同一原则，ADR-180），卫星树与基准的差异按 §10.3.1 的归因表分类（ADR-128，R14-D4-02），无差异时继续目标不改写、由 `onAllReasonsCleared()` 的守卫先验证；卫星缺失或正在重建时命令返回 `E_STATE`（同交还守卫，`06` §6.4.3）；归因分类：存活进程的写入 → 继续目标改写为 `verify_new`；其余 → 记入 `external_change`——**`externalChange` 已存在**（接管期间 watcher 已检测到）时差异路径并入 `paths`、**基线保持首次值**（接管时的 safety 检查点）；不存在时 E = 差异路径、基线 = 比较基准的检查点（接管以来重建过卫星时为记录重建树的检查点，`10` §10.16.2；否则为当前 pin 的检查点，没有时为 pin 本身，§10.3.1，ADR-182/212）——**不验证**（ADR-134）；(iii) `takeoverFrom ∈ {running, ready}`（ADR-147：自 `ready` 接管后放弃同样不自动开 Run），**或 `Goal.takeoverPriorReasons` 含 `human`**（`take_over` 时持久化的接管前原因集合，ADR-140；判定只读它与 `takeoverFrom`）→ **不**解除 `human`，保持 `paused(human)`，由人显式 `resume`（R8-D4-01c，ADR-099/137/140）；从其他 `paused(*)` 接管时解除 `human` 后剩余原因照常取最高者。**不会在人未要求时开 Agent Run**。
- **检出丢失**（H 被外部删除，所在的 `<wtRoot>` 可访问；根不可访问时是不可达，先按 `06` §6.1.6 Project 不可达一行，ADR-238）：运行中发现与重启时发现是同一条规则，唯一定义在 `06` §6.1.6 人工编辑检出一行（清除 `humanCheckout`、保留 `takeoverFrom`，Needs-You `stalled{human_checkout_lost}`，出口为再次接管、`goal.resume` 与 `goal.discard_human_edits`，ADR-179/211/212）；若 `syncState = "syncing"`，先以 T1 中已在影子里的对象完成续写（不需要 H）；无法完成时按 `06` §6.4.3 `inspect.bring_back` 行的“写回在本进程中失败”处理——先以 T1 在原路径重新物化 H，不留下 `syncing`（ADR-219/220）。
- 放弃 Goal 时若 H 中有未交还的改动，先询问“不交还 / 先交还”（不交还时 H 同样不删除，§10.2，ADR-228）；卫星正在重建（`satelliteRebuilding`）时“先交还”置灰并写明“工作目录正在重建，完成后才能交还”（此时交还返回 `E_STATE`，ADR-221）。**卫星缺失且无法重建时**（接管期间 `satellite_missing` 持续——接管时的检查点 k 不可用，情形 E 不回退；交还与放弃改动都返回 `E_STATE`）不再询问、也不提供“先交还”：放弃时 H 同样原样留在原路径（§10.2），放弃确认框与 Goal 页给出它的路径，人可自行取回改动，或在 Goal 页删除它（ADR-184/228）。
- 人想以自己的提交说明进入 seal：交还对话框的“写入提交说明”即 `sealNote`（与给 Agent 的意图同文时默认复用、可单独编辑），seal 时按 §10.6 第 2 段的规则合并（ADR-036：trailer 只在 seal 时写）。
- 仓库形态目录（ADR-096/101/102/109）：H 不含 `pinSafetyCheck(baseTree, T0)` 命中的路径（未写出、在提示中列出），base 中未改动的仓库形态夹具照常写出；H 的终端白名单环境另注入 `safe.bareRepository=explicit` 作为纵深防御。IDE 自带的 git 不受 Tower 环境控制，提示中说明并建议用户在全局配置中启用同一设置。
- S0 下：H 的 gitdir 同样来自 Tower 模板，H 的 git 元数据安全不依赖沙箱；卫星侧仍按 §10.3.1 做 `.git` 扫描。IDE 执行 H 中 Agent 可控代码的风险与沙箱无关（`11` T31，残余中）。

---

## 10.9 冲突雷达

目标：在冲突真正发生前（合并时）提前看到它，并把“共享资源冲突”作为隐式依赖提示（`03` §3.5、theory §C13、idea #16）。后台雷达是 ADR-019 登记的可关闭特性（M2 起默认开，精度日志见 `14` E6）；合并队列入队时的预检（§10.11）不受该开关影响。

### 10.9.1 比较对象

对每个处于 `running | paused | claimed | verifying | in_review | accepted` 的 Goal 的每个 binding，取其**代表提交** R：影子中最新的检查点提交（含未提交工作），无检查点时取 baseCommit。雷达**只读用户仓库与影子目录**（ADR-060），不触碰卫星。

| 比较 | 命令（影子上下文的只读变体，见下） | 意义 |
|---|---|---|
| R vs base 当前头 B | `git merge-tree --write-tree --name-only --no-messages <B> <R>` | 合入时是否会与 base 的新提交冲突（B 由镜像从用户仓库 fetch 得到） |
| R_g vs R_h（兄弟 Goal） | 先做文件重叠预筛：`F_g = git diff --name-only <base_g> <R_g>`；若 `F_g ∩ F_h = ∅` 则跳过；否则 `git merge-tree --write-tree --name-only --no-messages <R_g> <R_h>` | 两个 Goal 合入顺序无关地是否互相冲突 |

退出码 0 = 可干净合并；1 = 有冲突，输出第一行为树 OID，其后是冲突文件名；其他值 = 错误。

**运行环境：临时对象目录 + 只读 alternates。** `--write-tree` 会写对象；为了既不污染任何库、又能同时看到两个 Goal 的检查点，雷达在一次性的空目录中运行：

```
GIT_DIR=$tmp/radar.git（git init --bare）  GIT_CONFIG_NOSYSTEM=1  GIT_CONFIG_GLOBAL=<Tower 最小配置>
$tmp/radar.git/objects/info/alternates = <mirror>/objects
                                         <影子_g>/objects
                                         <影子_h>/objects        # 兄弟比较时
git merge-tree --write-tree --name-only --no-messages <A> <B>
rm -rf $tmp
```

### 10.9.2 结果与呈现

产生 Fact `conflict_forecast`：

```ts
{ against: { kind: "base"; ref: string; head: Sha } | { kind: "goal"; goalId: GoalId; at: Sha };
  at: Sha;                              // R
  result: "clean" | "overlap_only" | "textual_conflict" | "error";
  files: string[];                      // 冲突文件；overlap_only 时为重叠文件
  computedAt: Iso; durationMs: number }
```

| 结果 | 呈现 | 注意力级别（`gui.md` §7.2） |
|---|---|---|
| `clean` | 无 | 0 |
| `overlap_only`（同文件、可自动合并） | 卡片上灰色 chip “与 G-0139 共享 2 个文件” + 依赖建议 | 0–1 |
| `textual_conflict` vs base | 卡片琥珀 chip；`in_review`/`accepted` 时进入合并队列预检 | 1；若 Goal 已 `accepted` 且无自动解决授权 → Needs-You `conflict`（severity 2） |
| `textual_conflict` vs 兄弟 Goal | 双方卡片 chip + 建议顺序（先合入风险低/更早验收者） | 1；两者均已 `in_review` 及以后 → Needs-You `conflict`（severity 2，dedupeKey = 排序后的 goal 对） |

语义冲突（两边各自通过、合在一起失败）雷达无法预测，由合并队列的集成交叉检验负责（§10.11 Q5）。

### 10.9.3 节奏与成本

- 触发：
  - 某 Goal 产生新检查点 → 该 Goal 的雷达（60 s 去抖）。
  - base 前移（定义与取值见 §10.1.2 的 `baseTip`，ADR-156/157；M1 中本地 base 用下述 `fs.watch`，远端引用 base 在 §10.1.2“远端 base 的获取时机”的四个时机获取后检测，结果只作提示，见 §10.10）→ 所有相关 Goal 对 base 的雷达（M2）。远端 base（`refs/remotes/<r>/<b>`）在 M2 中另每 5 分钟以 §10.1.2“Tower 的 git 网络命令”在镜像中执行 `GIT_DIR=<mirror> git fetch --no-tags <r> +refs/heads/<b>:refs/tower-remote/<r>/<b>`（ADR-155 补记 2、ADR-157；失败指数退避至 30 分钟）；本地 base 用 `fs.watch` 监视 `<commonDir>/refs/heads/<base>` 与 `packed-refs`。
  - 进入 `claimed`（必做）、进入合并队列（必做）。
- 预算：单次 `merge-tree` 在中型仓库通常 10–200 ms；以 `nice -n 10`（macOS 另加 `taskpolicy -b`）运行；每次超时 5 s 即放弃并记 `error`；全局雷达平均 CPU ≤ 2%（`13`）。10 个 Goal 的兄弟对最多 45 对，预筛后通常 < 5 对。
- git < 2.40：只做文件重叠（`overlap_only`），不报告文本冲突。

---

## 10.10 base 前移时的 rebase 策略

**里程碑**（ADR-156，R30-D14-01）：Run 空闲点的**自动 rebase 属于 M2**，与合并队列、冲突雷达相同；下表、本节的 LFS 补齐与冲突解决 Run 都是 M2。**M1 中 base 前进只提示**：以 `baseTip` 检测到前进时，记 Fact “base 前进 N 个提交”，并在 Goal 卡片上提示。M1 不 rebase、不改 `baseCommit`，集成由人在自己的检出中处理（§10.12“仅保留分支”）。

原则：不在 Agent 工作中途移动它脚下的代码；推迟到安全点；所有 rebase 都会改变指纹并按 I2 使 Verified 失效。

| Goal 状态 | base 前移且雷达 `clean` | 雷达 `overlap_only` | 雷达 `textual_conflict` |
|---|---|---|---|
| `running` | 不动；记录 Fact “base 前进 N 个提交” | 不动；chip | 不动；在下一个 Run 空闲点（`paused`/Run 结束/`claimed` 前）按策略处理（下行） |
| Run 空闲点 / `claimed` 前（`humanCheckout` 存在或检验打开期间（§10.8.3 第 7 步，ADR-209）除外：自动 rebase 暂停，交还 / 检验关闭或带回后在下一个空闲点再处理，ADR-099） | `rebasePolicy=auto`（默认）：自动 rebase 后再进入验证；`ask`：仅提示 | 同左 | 合同允许自动解决（`11` 的 `git.history_rewrite` 级别为 notify 或 silent）→ 启动冲突解决 Run（见下）；否则 Needs-You `conflict` |
| `in_review` | **不自动 rebase**（会触发 I2 并重置评审，打断人的评审）；推迟到合并队列 | 同左 | 卡片琥珀 chip，评审页顶部提示 “合入前需要解决与 base 的冲突” |
| `accepted` | 合并队列负责 | 同左 | 合并队列负责 |

**LFS 项目先补齐新 base 的 LFS 对象**（M2；ADR-155，ADR-156 归 M2，R29-D13-02、R30-D13-02）：凡把新 base 的内容写入卫星的操作，在写回之前先对 `newBase` 执行与 §10.3.1 步骤 2a 相同的补齐。这类操作有两种：自动 rebase，以及冲突解决 Run 的写回。
- 补齐先从用户主检出的 LFS 库 CoW，缺的再按 §10.1.2 的网络命令规则获取，时限同 `prepare.repoTimeoutMin`。
- `fetchinclude/fetchexclude` 按 `newBase` 的 `.lfsconfig` 重新解析，`lfs_excluded` 随之更新。
- 补齐失败或超时：本次 rebase 放弃，不进入写回；卫星与 `binding.baseCommit` 保持旧 base；记 Fact `rebase_lfs_failed{missing}`；下一轮轮询或下一个空闲点重试。
- 因此不会出现 Agent 或验证在指针文件上工作的情况。
- **补齐在卫星锁之外进行**，人的命令（继续、我来改、打开检验）不被阻塞。补齐完成后，在锁内**重新检查全部前置条件**（ADR-156），任何一条不成立都放弃本次 rebase，等下一个空闲点：
  - 仍在 Run 空闲点，没有新的 Run；
  - 没有 `humanCheckout`，也没有打开的检验检出；
  - `binding.baseCommit` 未变；
  - `baseTip` 没有再次前进；
  - `newBase` 仍满足“前进”的定义。

自动“rebase”（在影子中对**内容**做三方合并，不在卫星中运行 git，ADR-060）：

```
（M2）newBase = baseTip(r, b)，且满足“前进”的定义（§10.1.2）
LFS 项目：先在卫星锁之外对 newBase 补齐 LFS 对象（见上段）；失败 → 不写回、不改 baseCommit，记 Fact rebase_lfs_failed{missing}，下次重试
取得卫星锁，重新检查前置条件（见上段）；不成立 → 放弃本次 rebase
captureCheckpoint(landmark=safety)                                          # 当前工作区 = cp_k
影子：M = git merge-tree --write-tree --merge-base=<oldBaseCommit> <newBase> <cp_k>
成功（退出码 0）→ 按 §10.8.1 第 1–3 步把树 M 写回卫星工作区；
                  卫星 git 状态：同 §10.8.1 第 4 步，在 Agent 的 S2 档位中 reset --mixed newBase（S0 下跳过）
                  （newBase 已由镜像从用户仓库 fetch；镜像中 refs/tower-live/<goalId>/base 随之改指 newBase，§10.17.1）
                  binding.baseCommit = newBase（事件 binding.rebased {old, new}）→ 指纹变化 → I2
                  以 steer 告知 Agent：“base 已前移，工作区已合并到新 base 之上，你此前的提交历史已折叠为未提交改动”
失败（退出码 1）→ 不改动卫星；当作 textual_conflict 处理
```

代价是 Agent 在卫星中的提交历史被折叠（内容不丢，历史在影子的检查点链与 safety ref 中保留）。

**本地文件的例外随 base 翻转**（M2，ADR-207）：rebase 可能使某个清单路径在 Goal 中途变为在 base 中被跟踪，或不再被跟踪。前者时合并写回会覆盖播种的副本，后者时 Agent 改过的仓库文件此后被排除（§10.7.1 第 1 步 (d) 按每次快照求值）。M2 实现自动 rebase 时须写明这两种情形的处理。

冲突解决 Run（借鉴 Pi 示例 `git-merge-and-resolve.ts`；LFS 项目同样先补齐 `newBase` 的 LFS 对象，失败时不写回，见上）：Tower 在影子中执行带冲突标记的合并（`git merge-tree` 的冲突输出 + `checkout-index` 写出含冲突标记的文件），按上框把结果写回卫星工作区，然后以 `custom_message` 发起 Run（reason `rework`），列出每个冲突块的文件与行范围；Agent 解决后 `submit`，验证 pin 包含解决结果。seal 本来就是单个提交（§10.6），线性历史自然成立。

---

## 10.11 合并队列

**里程碑**：合并队列与本地合并在 M2 交付（ADR-038）；M1 的集成只有“仅保留分支”（§10.12，ADR-133），合并与冲突由人在自己的检出或托管平台上处理；“推送并开 PR”同为 M2。

theory §C13：“rebase → re-verify → merge”串行化集成。每个 `(projectId, baseRef)` 一个 FIFO 队列，并发度 1。Goal 在 `accepted` 后入队；**`humanCheckout` 存在期间队列条目为 `suspended`**（不被消费，保留位置）：放弃改动并回到 `accepted` → 恢复原位置；交还（Goal 离开 `accepted`，进入 `verifying`/`running`）或检验带回 → 条目移除，**再次验收后才按新的验收时间重新入队**（ADR-104，R8-D4-01b、R8-D15-01 #11）；机会式验证在此期间同样暂停。**检验打开期间**（§10.8.3 第 7 步）条目不出队，但集成步骤（Q1 起）等到检验关闭或带回后再执行。人可手动调整顺序（`02`：系统从不自动重排 `priority`，但队列顺序是集成顺序，默认按验收时间）。

```ts
interface MergeQueueEntry {
  id: string; projectId: ProjectId; baseRef: string; goalId: GoalId;
  mode: "local_merge" | "push_pr" | "branch_only";
  strategy: "ff" | "merge_commit" | "squash";
  state: "waiting" | "rebasing" | "reverifying" | "awaiting_reacceptance" | "integrating" | "awaiting_push" | "awaiting_remote" | "done" | "failed" | "needs_human";   // awaiting_push：推送失败后等待人决定，不占用该 base 的 FIFO（ADR-158）
  attempt: number; enqueuedAt: Iso; log: EvidenceRef[];
}
```

步骤：

| 步骤 | 动作 | 失败处理 |
|---|---|---|
| Q1 冻结与 seal | 禁止该 Goal 启动新 Run；获取 Project 级集成锁；fetch base；执行 seal 提交（§10.6，断言树等于已验证 pin 的树） | 树不等 → 回到 `verifying`（I2） |
| Q2 判断 | `newBase = baseTip(r, b)`（远端引用 base，§10.1.2，ADR-156；本地分支 base 取 `refs/user/heads/<b>`）；若等于 `binding.baseCommit` → 跳到 Q5（仍需集成交叉检验，见下） | — |
| Q3 rebase | 同 §10.10 自动 rebase；若有 base-snapshot（§10.5）则 `--onto <newBase> <snap>` | 冲突 → `needs_human`，Needs-You `conflict`：“重新打开 Goal 解决冲突（启动冲突解决 Run，Goal 回到 running）/ 放弃集成 / 改为仅保留分支” |
| Q4 验收延续判定 | rebase 使指纹变化 → 按 `03` I2 进入 `accepted → verifying`。在新 diff 上重新切分评审单元；单元 `contentHash` = 规范化 hunk 内容（去掉 `@@` 行号）的哈希。Q5 通过后应用 `03` I2 的**验收延续**判据（唯一定义 `07` §7.10.3 `acceptanceCarriesOver`）→ 满足时自动恢复 `accepted`（`audit.acceptance_carried`），队列继续；否则 → `awaiting_reacceptance`：Goal 停在 `in_review`，变化单元为 `unseen`，Needs-You `review_ready`（只需审变化部分） | 人重新验收后 Goal 重新入队（保留原位置） |
| Q5 重新验证 | 在验证器槽位、重做 seal 后的新 pin 上重跑：(a) 合同全部 `exec` 标准与哨兵；(b) **集成交叉检验**：项目 `VerifyProfile.integration` 命令（如有）；以及自 `oldBaseCommit` 以来合入该 base 的其他 Goal（最多 5 个、触及文件与本 Goal 有交集或位于同一包）的 `exec` 标准。总时长上限默认 15 分钟 | (a) 失败 → Goal 回到 `running`（`03` 的验证失败路径，返工 +1）；(b) 失败 → `needs_human`，标记“疑似语义冲突：G-0142 与 G-0139 各自通过，合并后 G-0139 的标准 2 失败”（Needs-You `conflict` severity 3） |
| Q6 集成 | 按模式执行（§10.12）。本地 ref 更新一律用 CAS：`git update-ref refs/heads/<base> <new> <expectedOld>` | CAS 失败（期间 base 又前移）→ `attempt+1` 回到 Q2，最多 3 次，之后 `needs_human` |
| Q7 观测 | 本地：立即 `integrated`；PR（**M2**，ADR-133 削减 ④′）：`awaiting_remote` 直到观测到合并；M1 的 `branch_only` 只观测本地 base（§10.12） | PR 被关闭未合并 → Needs-You（M2） |

Q5 的回归交叉检验是对“两边各自通过、合在一起失败”的廉价近似：它不证明无语义冲突，只把最可能受影响的已集成 Goal 的可执行标准再跑一次。v1 不做投机批处理（多个 Goal 叠加验证、失败二分），M3 视队列长度再评估。

---

## 10.12 集成模式

| 模式 | 动作 | `integrated` 的判定 | 自主度类（`11`） |
|---|---|---|---|
| **本地合并**（M2） | seal 已 fetch 进用户仓库（§10.6）。base 分支未被任何检出检出：`ff` → CAS `update-ref refs/heads/<base> <seal> <expectedOld>`（seal 的父提交即当前 base 时）；否则 `squash` 语义已由 seal 体现，必要时在影子中重做 seal 后再 CAS。<br>base 分支**正被用户主检出检出**（`git -C <userCheckout> worktree list --porcelain` 中可见，判定与 §10.6 检出守卫相同；被链接工作树检出时同样处理，在该工作树内执行）：只能在该检出内执行 `git merge --ff-only <seal>`；git 自身会拒绝覆盖未提交改动 | `git merge-base --is-ancestor <seal> <base>` | `git.merge`（默认 ask）。**在用户检出中执行时是“绝不碰工作现场”的显式例外**：审批卡列出将被修改的文件、检出当前是否有未提交改动、提示 IDE/构建工具的文件监听会被触发；只能在本机桌面逐次确认（不能被授权、不能超时默认、不能从 `serve` 远程批准）；失败时绝不尝试 stash/reset，只报告并提供“改为推送 PR / 仅保留分支” |
| **推送 + PR（gh）**（**M2**：按 ADR-133 执行削减 ④′，M1 不推送、不开 PR、不轮询远端） | 推送在**镜像**中执行（网络命令的临时配置按 §10.1.2，ADR-155 补记 2、ADR-157）：目标远端 `<r>` 按 §10.1.2 的“M2 推送的目标远端”；先把影子 ref 同步进镜像（本地，无网络）；项目设置允许集成步骤运行用户钩子时，先在镜像中对目标分支 `ls-remote` 取远端当前提交（不存在时为全零），再在用户检出中执行 `git hook run --ignore-missing --to-stdin=<0600 文件> pre-push -- <r> <远端 URL>`（git 2.40 起可用）；再 `GIT_DIR=<mirror> git push <r> <seal 提交>:refs/heads/<prefix>/<goalId>-<slug>`；钩子拒绝、网络或认证失败 → 不推送，记 Fact `push_failed{stage}`，Goal 保持 `accepted`，队列条目进入 `awaiting_push`（不占用该 base 的 FIFO），Needs-You `integration`（severity 2，去重键 `int:{goalId}`），选项“重试推送”与“只保留分支”（ADR-157/158，§10.1.2）；成功后在用户仓库上下文显式写入 `branch.<该分支>.remote = <r>` 与 `.merge`，代替 `-u`（ADR-155 补记；重做 seal 后再次推送用 `--force-with-lease=<branch>:<lastPushedSha>`，禁止裸 `--force`）；`gh pr create --base <base> --head <branch> --title … --body-file <tmp>`；PR 正文由 Tower 从合同与账本生成：验收标准（Fact，含提交哈希）、哨兵记录、Agent 叙述（标注为 Claim） | 轮询 `gh pr view <n> --json state,mergedAt,mergeCommit,headRefOid`：前 10 分钟每 1 分钟、之后每 5 分钟、24 小时后每 30 分钟；squash 合并无法用祖先关系判定，以 PR 状态为准。`gh pr checks --json` 结果作为 Fact `ci_check` 记录 | `git.push`、`git.pr`（默认 ask；`gh pr merge --auto` 属 `git.merge`） |

**Agent 侧的推送与 PR**（ADR-074，R4-D11-05）：卫星没有任何远端，Agent 没有凭据（`11` §11.6.4），而用户仓库对 Agent 只读；因此 Agent 在卫星中执行的 `git push`、`gh pr …` 在所有预设下都是 **forbid**（门禁返回“推送由 Tower 在验收后代理执行”）。S0 下 `git push <用户仓库路径>` 会被门禁按路径识别为写用户仓库（硬底线）。
| **仅保留分支**（**M1 唯一的集成模式**，ADR-059 按 ADR-133 修订） | seal 作为 Goal 分支写入用户仓库（§10.6），不推送；重新 seal 时分支顶端仍是 Tower 自己的 seal 才快进更新（树与说明都相同时复用、不追加提交），否则写入 `B₀-v<k>`、不改写用户的分支（§10.6，ADR-136/191） | **只观测本地 base**：人在自己的检出中合并该分支（或拉取了远端合并结果）后，Tower 在每次镜像 fetch 时（远端引用 base 即 §10.1.2“远端 base 的获取时机”的四个时机，ADR-157）以 `git merge-base --is-ancestor <seal> <base>`（`<seal>` 是 `integration.performed.sha`，即写进用户分支的 seal，M1 不签名，§10.6，ADR-193；`<base>` 取 `baseTip`，§10.1.2，ADR-156）判定；不是祖先时（squash 合并，或人改写——如自行签名——后合入）以 patch-id 判定：base 中有提交的 patch-id 等于**本次合入的 seal 段** `<S₁ 的父>..<seal>` 整体差异的 patch-id（唯一定义，ADR-194：从 seal 沿父提交回溯，父提交是本 Goal 的 seal（§10.6 识别规则）且在**本次合入被观测之前**未记过 `local_merged` 时继续，停下处的 seal 即 S₁——之前单独合入或被撤销的 seal 已记过 `local_merged`，不在段内；只有一个 seal 时 S₁ 即 seal，段的差异即 seal 自身的差异。**时间锚点**（ADR-195）：同一次观测中随段一起记的 `local_merged` 不算；撤销时按同一锚点求段，只计该次 `local_merged{seal}` 之前已记的）→ `integrated`；base 中没有提交与整段差异的 patch-id 相同时判定不到（M1 已知限制，ADR-195）：patch-id 含 diff 的上下文行，因此 squash 前 base 在这些改动附近已有变化、合入时解决过冲突、与其他改动合成一个提交、只合入了一部分或逐个改写多个 seal 后再合入，都会判定不到；Goal 停在 `accepted`，界面只写“Tower 未检测到合入”（`04` §4.3.2），人可选“验收但不合并”；否则人可选择“验收但不合并”→ `archived`（`goal.accept{integrate:"none"}`，`06` §6.4.3；`03`） | —（M1 不推送） |

**非终态中观测到合并（ADR-128/137/143，R14-D13-01、R16-D13-01、R17-D13-01）**：观测到某个 seal 进入 base（M1：本地 base；M2：另含远端 PR 合并）时，按 **`integrated` 的唯一条件**判定（`03`、`06` 只引用本条）——被合入的 seal 是**最近一次验收的 seal**（最近一条 `integration.performed` 的 `sha`，含 M1 验收延续写入的，ADR-191），**且**它不是被撤销的 seal（不等于 `goals.integration_reverted_seal`，ADR-176），**且**没有人工编辑检出、**且**没有活跃 Run、**且**卫星树等于该 seal 的树。被撤销的 seal 在判定前即被忽略：它仍在 base 的历史中（revert 只是新提交），不记 Fact、不改变状态。**判定时机（唯一规则，ADR-183，取代 ADR-182 的“每个 seal 只判定一次”）**：(i) 按**状态**判定——每次 fetch 使 base 前进时，以及 Goal 进入 `accepted` 时（任何来源：验收、验收延续、`onAllReasonsCleared()` 或放弃改动回到 `accepted`），只要最近一次验收的 seal 已在 base 中且下述四项成立，就进入 `integrated`；因此在人工编辑检出、活跃 Run 等临时条件下观测到的合入，在条件解除后仍会进入 `integrated`，Goal 不会停在 `accepted`。卫星重建中（`satelliteRebuilding`，§10.16.2 情形 E）第四项无从比较，同样是临时条件：只记 Fact、状态不变（不按 (ii) 降回 `in_review`），重建完成时按本条再判定一次（ADR-195）。(ii) 按**变化**判定、每个 seal 只一次——“较旧版本”的处理（只记 `local_merged`、`accepted` 降回 `in_review`）只在该 seal 第一次被观测到合入时发生；已为它记过 `local_merged`（M2 另含 `remote_merged`）的 seal 之后不再触发 (ii)，因此连续两次撤销后更早被撤销的 seal 不会使 `accepted` 降回 `in_review`。**一次观测整体处理**（ADR-195）：一次 fetch 中新观测到合入的各 seal，先以本次观测之前已记的 `local_merged` 求出各自的段（上表），再逐个判定，最后才记 Fact；落在本次另一个被合入的 seal 的段内的较旧 seal 随该 seal 处理——与它一同记 `local_merged`，自身不按 (ii) 处理（不降回 `in_review`、不提示“较旧版本”）。**卫星树**（下述第四项）指卫星当前工作区的树中除 `externalChange.paths` 之外的路径：未处置的外部写入不计入（它们在进入 `integrated` 时以 `obsolete` 关闭），Agent 或人在该 seal 之后写入的内容计入。(i) 其余四项全部成立 → 无论 Goal 处于何种非终态（`paused(*)`、`verifying` 等），记 Fact `local_merged{seal}`（M2 另有 `remote_merged`）并进入 `integrated`——被合并的是人已验收的 seal；进入时 `verifying` 中的当前验证取消、`ready` 中的准备中止，`queued_run` 按 ADR-151 清除（ADR-194；`03` §3.2 表下的通则只引用本条）；从 `paused(*)` 进入时（ADR-195；不经 `onAllReasonsCleared()`，`03` §3.2.1）清空 `pauseReason`、`alsoApplies`、`continuation` 与 `takeoverPriorReasons`，丢弃 `pendingHandBack`（集成摘要中列出“交还时选择的 <交给 Agent 继续 / 直接重新验证> 未执行：改动已合入”），S0 授权为 `pending` 时置回 `none`；人工编辑检出此时不存在（四项之一）；该 Goal 仍打开的阻塞类 Needs-You 条目（对应原暂停原因的条目与等待中的对话框，`08` §8.8）以 `obsolete` 关闭；`pendingOpenings` 保留（ADR-186）；未解除的 `external_change` 以 `obsolete` 关闭，卫星内容先做 safety 检查点，并在集成摘要中列出。(ii) 任一项不成立（较旧的 seal；或最近一次验收的 seal 被合入时 Goal 正有人工编辑检出、活跃 Run，或卫星树已有新内容）→ **只**记 Fact `local_merged{seal}`，**不**进入 `integrated`：Goal 在 `accepted` 时不经 I2 转为 `in_review`，并提示“base 已含较旧版本 <seal>；当前内容尚未集成”；Goal 在其他状态时状态不变；人工编辑检出与活跃 Run 保持不变；之后的重新 seal 按 §10.6 的分支规则写入（`14` G36c(e)）。M1 中合并由用户自己完成（④′），这一情形因此是常态而非例外。

- seal 即单个提交（ADR-060 第 7 点），相当于 `squash`；保留 Agent 逐个提交的选项推迟到 M2。提交信息按 §10.6 的“seal 提交说明的结构”（ADR-105；trailer 集合为 `Tower-Goal`、`Tower-Contract`、`Tower-Verified-At`（仅已验证或有保留的已验证）或 `Tower-Not-Machine-Verified: <原因>`（ADR-108）、可选的 `Tower-Human-Edit`、`Tower-Override`（ADR-109）与 `Co-authored-by`，R8-D15-01 #8）。
- （M2）PR 头被他人推送了新提交（审阅者修改）：观测到 `headRefOid` 与本地不同 → Fact，Goal 卡片提示；不自动拉取。
- 撤销（`03` §3.4.4 宽限期，`goal.undo_integrate`）：同一事务 Goal 由 `integrated` 回到 `accepted` 并写 `goals.integration_reverted_seal = <seal>`（界面显示 `reverted` 标记，ADR-176）；之后再次验收时的 seal 不以被撤销的 seal 为父，以当前 `baseCommit` 为父写入 `B₀-v<k>`（§10.6 重新 seal 表“被撤销的 seal 曾写入 B”一行与命名规则，ADR-178/182）。**M1 中撤销不写用户仓库**（ADR-193，唯一定义）：Tower 只记上述状态与被撤销的 seal，不生成撤销提交、不写任何分支，因此撤销不会因写入失败；Goal 页如实写出要由人完成的撤销：“Tower 没有改动你的仓库。请在你的检出中撤销 <seal 短 sha> 的合入：快进合入时 `git revert <S₁ 的父>..<seal>`；以合并提交合入时对该合并提交 `git revert -m 1`；squash 合入或合入的是你改写过的提交时，撤销 base 中对应的那个提交”。**快进一支撤销本次合入的整个 seal 段**（上表的唯一定义，ADR-194）：M1 中重新 seal 在原分支上快进，分支上常有一串 seal，只 `git revert <seal>` 会把前面各 seal 的改动留在 base 中；Tower 写出两端的完整 sha，只有一个 seal 时即 `git revert <seal>`。在你的仓库中生成撤销草案分支（本地）与撤销 PR 草案（`gh pr create`）都属 M2。

---

## 10.13 多仓库 Goal

`02`：Goal ↔ Repo 为 1:N。每个 binding 独立卫星、独立影子目录、独立检查点序号空间（`refs/tower/<goalId>/cp/<n>` 在各仓库内各自编号，`Checkpoint` 增加 `projectId`；同一回合的多个仓库检查点共享同一 `piEntryId`）。

- **Agent cwd。** Pi 会话只有一个 cwd。Tower 为多仓库 Goal 创建一个**工作区目录** `~/.tower/goals/<goalId>/ws/`，其中以符号链接 `<alias> → <卫星路径>` 指向各卫星，作为 Pi 的 cwd；简报中列出别名与职责。该目录在密钥路径表的 `~/.tower/**` 之下（`11` §11.3.1），以它为基准的相对路径（bash 的路径参数、文件工具的相对路径）的分类与 S2 读允许列表随 M3 一并设计（ADR-220）。范围围栏以 `projectId:glob` 表达（`02` §2.5），路径解析时先 realpath 再映射回 binding。
- **验证。** `exec` 标准可声明 `cwd: "<alias>"`；验证器为每个 binding 准备验证槽位，并以环境变量 `TOWER_WT_<ALIAS>` 提供路径，便于契约测试跨仓库引用。
- **集成：两阶段，无原子性。** 合并队列对所有 binding 先执行 Q1–Q5（全部通过才继续），再依次 Q6。若第 k 个仓库集成失败而前面已合入 → Needs-You（severity 3）“部分集成”：提供“为已合入仓库生成撤销草案”（M2 起，ADR-193）或“重试剩余”。PR 模式下各 PR 正文互相链接，并标注“需一起合并”。
- **冲突雷达** 按仓库独立运行。
- **回退与分叉（逐仓库规则，`06` §6.4.3 引用本条，R7-D13-02）**：回退到某个 Pi 条目 e 时，**每个 binding 独立求解**：沿会话树从 e 向根找该仓库最近的带检查点祖先条目，恢复到它的检查点；若路径上该仓库**没有任何检查点**（例如它的第一次改动发生在 e 之后），恢复到该 binding 的 `baseCommit`（或 base-snapshot）。各仓库按 §10.8.1 依次恢复；任一仓库失败则已恢复的仓库按各自的安全快照回滚，整体报告失败。降级档位下的近似标注同 §10.7.2。分叉为新 Goal 时，每个 binding 同样按此规则选取起点。“只回退代码”在多仓库下可只针对一个仓库：参数为 `{projectId, checkpointN}`，只恢复该 binding，其余仓库与对话都不动。
- **M3 待定（登记）**：多仓库 Goal 的 Pi cwd 是工作区目录，各仓库的 `AGENTS.md` 不在其祖先链上——ADR-091 的祖先上下文规则因此不覆盖它们；项目信任的复核在单一 cwd 下按哪个 binding 求值也未定义。M3 设计多仓库时须给出：各卫星中的上下文文件以 Tower 注入的形式进入简报（Trace 可见），信任取所有 binding 的“与”。ADR-204/205 的项目技能范围（`11` §11.8.1）与导出目标（`09` §9.11）同样以“cwd = 主 binding 的仓库根”为前提，M3 须一并给出。

---

## 10.14 Submodule、Monorepo、LFS 与超大仓库

| 主题 | v1 行为 | 说明 |
|---|---|---|
| **Submodule** | **M1：子模块路径从影子与验证槽位排除**（ADR-071），Goal 以“未经机器验证（子模块未支持）”进入评审（`not_machine_verified` 原因 `submodules_unsupported`）；卫星中子模块目录不初始化（卫星没有远端，相对 URL 也无从解析）。Agent 修改子模块路径 → `edit.protected` | gitlink 若进入影子索引，git 会进入嵌套仓库启动子进程，读取 Agent 可写的配置（R4-D11-01），因此 M1 宁可不支持。M2 设计子模块支持：槽位中的子模块内容按 base 中的 gitlink 从用户仓库（或其镜像）取得，而不是按 pin 中 Agent 可改的 `.gitmodules` URL |
| **Monorepo** | 合同 `scope.include` 通常是子包；Changes 与评审单元按包分组；验证命令可用包管理器过滤（`pnpm --filter …...[<base>]`、`turbo run test --filter=...[<base>]`、`nx affected`） | 依赖准备针对整个仓库（工作空间安装无法只装一个包）；Run 的 cwd 仍是仓库根，子包中的上下文文件与 `.agents/skills` 不加载（`00` §0.5.1，ADR-205） |
| **稀疏检出** | 可选（项目设置）：卫星创建时（交给 Agent 之前）`git -C <卫星> sparse-checkout set --cone <scope 目录 + 依赖目录>` 再 `checkout`；影子上下文的 `add -A` 只看到工作区中存在的文件，因此指纹与检查点自然限于稀疏集合 | 适合 > 100k 文件的仓库；风险：验证命令需要的文件不在稀疏集合内 → 哨兵检测“命令引用了未检出路径”。默认关闭 |
| **LFS（M1 只读，ADR-074）** | 检测到 `filter=lfs` 且用户**全局**配置定义了 `filter.lfs.*` 时，影子、镜像与卫星的配置复制这一组驱动定义（来自用户全局配置，可信），ADR-071 的 git 沙箱额外允许执行 `git-lfs`。LFS 对象在仓库准备阶段补齐到镜像的 LFS 存储（§10.3.1 步骤 2a：先从用户主检出的 LFS 库 CoW，缺的由 Tower 以用户身份、在 Agent 沙箱之外执行 `git lfs fetch`，使用用户的 credential helper，配置经 `~/.tower/tmp/` 下的 0600 临时文件传入、不经命令行与环境，ADR-154；与安装器无关，ADR-150/151 修订 ADR-074 的“安装器预取”）；卫星、验证槽位、人工编辑检出与检验检出都从中 smudge，按同一组 `fetchinclude/fetchexclude` 规则——被排除的文件在所有检出中保持指针（ADR-154）。影子 `add -A` 经同一 clean 驱动得到**指针**，因此改动统计、pin 与 seal 与用户自己提交的结果一致（R4-D13-02）。M1 中 LFS 跟踪的路径默认 protected（修改需 ask），Goal 以“有保留”显示 | LFS 写入支持推迟到 M2。用户全局未配置 `filter.lfs.*` 时，添加项目时提示安装 git-lfs，不启用该项目的 Goal 创建 |
| **部分克隆 / 浅克隆（ADR-074）** | 部分克隆：M1 不支持，添加项目时提示 `git fetch --refetch` 转为完整克隆。浅克隆：M1 要求先 unshallow（§10.3.0） | 部分克隆下卫星缺 blob、影子 `protocol.allow=never` 无法补取（R4-D13-03）；浅克隆下 `clone --shared` 静默退化为完整复制（R4-D10-02） |
| **超大仓库** | 影子上下文禁用 fsmonitor 与 untracked cache（ADR-060），只用影子索引的 stat 缓存与 `-c feature.manyFiles=true` 的索引格式；卫星检出可能需 10–60 s，计入 `preparing` | 能否由 Tower 自己传入 `-c core.fsmonitor=true`（git 内置守护进程，不读 Agent 配置）在影子 + 外部工作区组合下安全加速，作为 SP5 的评估项；评估通过前保持关闭 |

---

## 10.15 非 git 目录（v1 不支持）

`02` §2.3 已定：非 git 目录不能绑定为 Project（Scratch 可用）。原因不是实现偷懒，而是 Tower 的核心承诺都建立在 git 对象之上：

1. **Fact 需要锚点。** `atCommit`、新鲜度、Verified（I2）都以提交/树哈希为锚；没有它们，“测试通过”无法说明是针对哪个代码状态（R1、R2）。
2. **隔离需要廉价副本。** 卫星克隆让并行 Goal 互不干扰；在普通目录上运行 Agent 等于直接改用户的文件。
3. **评审需要基线。** 评审单元、评论锚点（`hunkHash`）、检查点、回退都依赖 diff。

v1 提供的出路：在添加项目时检测到非 git 目录 → 提示“初始化为 git 仓库（`git init` + 首次提交，会在该目录中创建 `.git`）”，需用户确认。后续计划（`14` M3+）：**影子仓库**模式——`git --git-dir=~/.tower/shadow/<id>.git --work-tree=<dir>` 追踪用户目录而不在其中创建 `.git`，Goal 在 APFS 克隆出的副本中运行，集成 = 把 diff 应用回原目录（显式“应用”动作，属 `git.merge` 类）。

---

## 10.16 外部删除与恢复

Pi 在会话记录的 cwd 不存在时拒绝启动：`AgentSessionRuntime` 在创建/切换/导入会话时调用 `assertSessionCwdExists`（`agent-session-runtime.ts` L211/L390/L429），CLI 非交互模式直接以退出码 1 结束（`main.ts` L697–709）。因此**每次启动 Engine Host 或恢复 Run 之前**，Supervisor 必须先执行 `ensureSatellite`。

### 10.16.1 检测

**适用范围**（ADR-152）：本节的检测与 §10.16.2 情形 E 只适用于**检出完成标记存在**的卫星（`~/.tower/goals/<goalId>/checkout.done`，§10.3.1）。标记不存在 = 尚未建成：不生成 `satellite_missing`，重试时按 §10.3.1 重新建立；删除未完成的工作目录同样不触发丢失判定。

- 启动 Engine Host 前（必做）。
- 运行中：`fs.watch` 卫星父目录，观察到卫星根被删除/重命名；并在每次 `turn_end` 检查点前检查路径是否存在（经 `13` §13.5 的可达性检查线程，不在事件循环中同步调用，ADR-236）。
- 每次检测先判该 Goal 是否可达（`06` §6.1.6 Project 不可达一行，按 Goal 判定，ADR-235/236）：不可达时不判卫星丢失，按该行处理。
- 定期（10 分钟）检查（其中的存在性检查同样经该线程）：卫星工作目录与 gitdir 都存在、工作目录中没有 `.git`（§10.3.1，ADR-089）；影子目录存在且 `git --git-dir=<影子> fsck --connectivity-only` 对最新检查点通过；镜像存在。

### 10.16.2 情形与处理

| 情形 | 判定 | 恢复 |
|---|---|---|
| **A. 卫星被删除** | 卫星工作目录或 gitdir 不存在。gitdir 被 Agent 弄坏、或其借用的镜像对象已被回收（§10.17.1）**不**触发恢复——Tower 不依赖 gitdir；需要时人或 Agent 请求“重建卫星 git 状态”（§10.8.1） | 按 ADR-076 的统一流程（情形 E）处理 |
| **B. 影子目录被删除**（`~/.tower/goals/<goalId>/git/`） | 影子不存在 | 重建空影子（alternates → 镜像，§10.3.1 第 3 步）；从备份 bundle（§10.16.3）fetch `refs/tower/<goalId>/*`；若用户开启了 §10.6.2 的“保留审计地标”，也可从用户仓库补取地标；影子索引以取回的最新可用检查点的树初始化（没有时以 `baseCommit`，§10.7.1 第 1 步“忽略规则不追溯”，ADR-212）；然后立即对卫星当前工作区做一次检查点。仅晚于最近 bundle 的检查点丢失（卫星工作区本身仍在） |
| **C. 用户主检出不可达**（被移动、删除，或所在卷未挂载） | 附着的检出路径不可访问（`06` §6.1.6 的判定） | 附着在它上的非终态 Goal 按 `06` §6.1.6 Project 不可达一行处理（按 Goal 判定，ADR-235/236）：Tower 不自动查找另一份克隆、不重新附着，路径重新可访问时照常。人可在项目设置中按 §10.1.1 “迁移”（`project.relocate`）选择另一个检出：更新 checkout 路径与 `attach`，镜像改从新路径 fetch；卫星与影子不依赖用户对象库，不受影响；若 `<wtRoot>` 随之变化 → 情形 F |
| **D. 用户仓库不可恢复**（删除或无法定位） | 情形 C 中人确认原路径不会再出现（旧路径上的人工编辑检出与使用中的检验检出由 `06` §6.1.6 ③ 的路径丢失确认结束，ADR-237） | 项目设置中的处理（不受 `06` §6.1.6 Project 不可达一行的 `E_STATE` 限制，ADR-235/236）：定位仓库——以 `project.relocate` 指向它；从远端克隆——界面写明 “请从你的托管服务克隆（远端为 <别名>）”（`Project.identity.remotes` 是去协议的别名，不能直接作为克隆地址，ADR-237），由你克隆后同样以 `project.relocate` 重新附着（Tower 不替你克隆，ADR-236）；只保留分支——Goal 页写出把该 Goal 最新检查点从影子取为分支的 git 命令，由你在任一仓库中执行（同 §10.12 撤销合入由人完成的做法，ADR-236），之后放弃这些 Goal（`goal.abandon` 在不可达期间可用）；没有远端、也没有其他检出时只有最后一种；镜像持有全部所需对象（ADR-073），检查点不丢 |
| **E. 卫星丢失（ADR-076/084 的唯一定义）** | 任意非终态 Goal，且**检出完成标记存在**（ADR-152；未建成的卫星不算丢失）；操作前检查或文件系统事件发现卫星工作目录或其 gitdir 不存在（触发的排除——已带 `satellite_missing` 而未在重建、正在重建、`human_checkout.syncState='syncing'`——只在 `06` §6.1.6 卫星丢失一行，ADR-223；该 Goal 不可达时先按该节 Project 不可达一行，ADR-235/236） | **叠加态（ADR-084）**：Goal 不在 `running` 时（`paused(<任意>)`、`ready`、`claimed`、`in_review`、`accepted`、`integrated`（归档前的宽限期，ADR-201））只设 `Goal.satelliteRebuilding=true` 并在后台重建，**状态与 `pauseReason` 都不变**；`verifying` 时取消当前验证（Goal 保持 `verifying`，pin 不变），重建后以同一 pin 重跑。只有 `running` 时先 `abort`（卫星已不在，无法 drain）→ `paused(satellite_missing)`（drain 已在进行、`drainingFor` 非空时不进入此分支：先结束 drain、再按叠加态处理，规则见 `06` §6.1.6 卫星丢失一行，ADR-201），继续目标 `{kind:"run"}`；settle 序列中丢失时按 `03` §3.2.1 的 settle 规则为 `{kind:"settle"}`，有效提交保留，不是例外（ADR-134/140/178；`resumeTo` 已废弃）。UI 显示中性 `◇ 正在重建工作目录`（不使用琥珀、不使用 `blocked_guard`，R3-D9-01）。重建：从影子中**可用的最新检查点 → pin → base**（**重建来源的唯一定义**，ADR-184/185：链上 `unusable` 为假的最新检查点；没有检查点时为 pin；都不可用时为 base——这是固定的回退，不是选择检查点，人选的检查点仍属 M2；所用的树不是链上最新的检查点时，Goal 页与下一次开场的 `tower.satellite_rebuilt` 都写明“检查点 n 之后的改动无法恢复，工作目录从 <检查点 m / pin / base> 重建”，继续目标照常由守卫处理——树 ≠ pin 时先验证，settle 的 pin 取重建后的树，`03` I4。**接管期间（`humanCheckout` 非空）不回退**：只用接管时的检查点 k，使 B = T0 恒成立；k 不可用时重建失败，出口见 §10.8.4“放弃 Goal”一条），**另一半**（唯一定义，ADR-224）：工作目录与 gitdir 之一仍在原位时，在置 `satelliteRebuilding` 的事务之前（自动重建与人发起的重试相同；写回失败的 ③ 同此）持该卫星的 `wtLock` 先按 §10.2 “Tower 自动改名保留”把它改名为 `<原名>.kept-<时间>`，从不删除——其中可能有未解除的外部写入——所以重建与崩溃续做的原路径上只会有重建自己的目录；改名失败时不重建，按下述重建失败升级（Needs-You 写出该路径与“将它移到一边后重试”，ADR-225） → 按 §10.3.1 第 2 步重建卫星与 gitdir（模板配置、无远端）→ `restoreCheckpoint` 第 1–6 步（§10.8.1；**跳过第 0 步**，不对刚检出 base 的卫星做 safety 检查点、不写 `abandoned` 引用）→ **记录重建树**：`captureCheckpoint(landmark=safety)`，树即重建所用的树（与链上最新检查点同树时按去重不建，§10.7.1 第 2 步），使链上最新的检查点就是重建所用的树——之后的归因基线（§10.3.1）、交还第 8 步的 `human_edit` 检查点与崩溃续做都以它为准（重建步骤的唯一定义，`06` §6.1.6 与 §6.4.3 `goal.rebuild_satellite` 只引用本条，ADR-182）→ 播种本地文件（只播种不含机密的条目；含机密的本地文件在 M1 中不播种到卫星、验证槽位或检验检出，`11` §11.6.2，ADR-165）→ 重新物化依赖。重建期间 `satelliteRebuilding=true`（`running` 中丢失、已进入 `paused(satellite_missing)` 时亦然）。成功后同一事务清除 `satelliteRebuilding` 并记 `satellite.recovered{tree, checkpointN?, by:"auto"}`（接管期间同一事务写 `humanCheckout.rebuiltTree`，§10.8.4 第 6 步，ADR-178）；原来在 `running` 的，Run 已中止，解除本原因后经准入开新 Run，开场含 `tower.satellite_rebuilt`（“工作目录已从检查点 n 重建，此后的改动不在工作目录中”；由开场组装从该事件生成，唯一定义在 `16` §16.1.12，ADR-180；此前写的“以 `steer` 告知”不成立，已删除）；settle 序列中丢失的按继续目标 `settle` 重跑 settle。`in_review`/`accepted` 下先比较重建树与 pin 的树：相同则不触发 I2。重建失败 → 叠加态升级为常规暂停原因（ADR-094）：从非 `paused` 状态升级时按升级前状态写入继续目标（`claimed`/`verifying` → `verify{pin}`，`in_review`/`accepted` → `review{state, pin}`）；已处于 `paused(*)` 时只记入 `alsoApplies`，继续目标不变（ADR-134）；升级的同一事务清除 `satelliteRebuilding`（ADR-178）；原因并存时按 `16` §16.1.1 的优先级取最高者。Needs-You（severity 2，琥珀，选项：重试重建（`goal.rebuild_satellite{goalId}`，`06` §6.4.3：重建来源与步骤都与自动重建相同）/ 放弃；**从更早的检查点重建属 M2**，ADR-183）；重建（自动或人发起的重试）失败后不再自动重试，重启也不重试，由人再选（`06` §6.1.6，ADR-181）；人发起的重试成功后在同一事务中解除 `satellite_missing` 并记 `satellite.recovered{…, by:"decision"}`（重建进行中再次请求 → `E_BUSY`）；与自动重建一样**不改写**继续目标（所用的树与自动重建相同；ADR-178/180 为“从更早的检查点重建”设的 `settle`/`claim` → `run` 改写随之删除，ADR-183）；开场的告知同上；重建中途崩溃（重启时 `satelliteRebuilding` 仍为 true）时，已 `rename` 到位的卫星先移入旁路目录，再按同一重建来源续做（自动与人发起的相同，`06` §6.1.6，ADR-181/182/183）；**未解除的外部改动**（ADR-183，唯一定义）：重建成功的同一事务中，`externalChange.paths` 里在重建树中与基线检查点（`baselineCps`）内容相同的路径移出——它们的外部内容不在重建的工作目录中、也不在任何检查点中；移出后为空 → 写 `goal.external_change.resolved{how:"obsolete"}` 并解除 `external_change`，Needs-You 以 `obsolete` 关闭，下一次 Run 的 `tower.satellite_rebuilt` 与 Goal 页注明“外部改动随工作目录丢失”（只丢了 gitdir、原工作目录已按“另一半”改名保留时改为“外部改动未并入重建的工作目录，保留在 <路径>”，ADR-225；崩溃落在改名与置 `satelliteRebuilding` 的事务之间时，续做不知道已改名，告知仍写“随工作目录丢失”，Goal 页的 `保留的目录` 一行照常列出该 `.kept-*`——如实登记，ADR-226）；仍有路径（例如 `running` 中检测后的 drain 检查点保存了它们）→ 照常保留、等待 keep / revert；`running` 中丢失时，进入 `paused(satellite_missing)`、写继续目标与置 `satelliteRebuilding=true` 在同一事务（ADR-182）；离开 `paused` 由 `onAllReasonsCleared()` 执行——重建树 ≠ pin 时，守卫把 `verify`/`review` 改为 `verify_new`（`03` §3.2.1）。Agent 在卫星中的提交历史丢失（内容在检查点中，不丢） |
| **F. 卫星路径必须改变**（如用户更改 `worktreeRoot`，`project.relocate`，ADR-236） | 新旧路径不同 | 新路径按情形 E 的重建来源与步骤创建卫星（新位置的记录与 `satelliteRebuilding` 在迁移的同一事务中写入、先于重建，新根由此是必需路径，中断由 `06` §6.1.6 续做；迁移自身的这次重建不受该节 ③ “不重建”的限制，`06` §6.4.3 `project.relocate` 行，ADR-239）；会话头部 cwd 已失效 → `SessionManager.forkFrom(oldSessionPath, newCwd, goalSessionDir)` 生成带完整历史的新会话文件，供下一次 Run 使用（reason `resume`，`parentRunId` 指向旧 Run；迁移本身不开 Run，ADR-237）。旧位置的目录与记录见 `06` §6.4.3 `project.relocate` 行“旧位置的记录”。**新路径上已有同名目录**（ADR-238；迁回旧位置 A → B → A 时 A 上的旧卫星与 gitdir 通常都还在，其中可能有最后一个检查点之后的改动）：工作目录与 gitdir 不论一半还是两者已存在，都在重建之前按 §10.2 “Tower 自动改名保留”改名为 `.kept-*` 并列出，从不覆盖、也不当作已建成而复用；之后照常重建。可达卷上的 `<wtRoot>` 被整个删除时按 `06` §6.1.6 判为不可达、不判为卫星丢失；出口是以 `project.relocate` 改到别的位置、你重新建立该目录（Tower 不替你重新建立，`06` §6.1.6 “Tower 不重新建立根”，ADR-239；之后按情形 E 重建卫星）或放弃——`project.relocate{worktreeRoot: null}` 不改变路径时不触发重建（如实登记） |
| **G. 镜像被删除或损坏**（`~/.tower/projects/<projectId>/mirror.git`） | 镜像不存在，或影子 `fsck --connectivity-only` 报缺失对象 | 用户在自己的仓库中删分支、`gc --prune=now` **不会**触发此情形（镜像对象来自 Tower 自己的 fetch，只按 §10.17.1 回收；SP6b G12 验证）。镜像被外部删除时：从用户仓库重建镜像（§10.3.1 第 1 步）；仍缺的对象（例如 Agent 曾 cherry-pick、而用户已删除并 gc 的分支）从备份 bundle 补回；补不回 → 受影响的检查点标为不可用（`Checkpoint.unusable = true`，`06` `checkpoints.unusable`，ADR-184；情形 E 的重建来源跳过它们），同一事务记 `workspace.recovered{case:"G", unusableCheckpoints:[n…]}`——`checkpoints.unusable` 是该事件的投影，`tower doctor --rebuild` 由它恢复（ADR-185），Needs-You（severity 2） |

数据损失上限：最近一个检查点之后、同一回合内的改动（通常 < 1 个回合）。恢复事件 `workspace.recovered {case, projectId?, fromCheckpoint, lostWindowMs, unusableCheckpoints?}`（事件，不是 Fact kind；`unusableCheckpoints` 只在情形 G 中写，ADR-185；多仓库 Goal 中带 `projectId`，ADR-213）出现在 Re-entry 简报中。

---

### 10.16.3 Tower 自有备份（R1-D13-03）

Goal 的检查点、pin、seal 存在影子目录中，影子与卫星经 alternates 依赖 Tower 的镜像（ADR-073）；镜像或影子被外部删除时（情形 B、G），bundle 是唯一能补回 Goal 自身对象的副本。Tower 为每个非终态 Goal 维护一个 **增量 bundle**，**只读影子目录**生成（ADR-060 第 5 点）：

```
dst=~/.tower/goal-bundles/<projectId>/<goalId>.bundle
refs=$(git --git-dir=<影子> for-each-ref --format='%(refname)' 'refs/tower/<goalId>/')
若 baseCommit 可从用户仓库任一远端跟踪分支到达（git -C <userCheckout> branch -r --contains <baseCommit> 非空）：
    git --git-dir=<影子> bundle create "$dst.tmp" $refs --not <baseCommit>    # 瘦 bundle：只含本 Goal 的新对象
否则（base 只在本地）：
    首次做一次完整 bundle（不加 --not）；体积 > 1 GB 时先询问用户
git bundle verify "$dst.tmp" && mv "$dst.tmp" "$dst"                          # 原子替换
```

| 项 | 规则 |
|---|---|
| 节奏 | 有新检查点时 10 分钟去抖；`claimed`、`accepted`、应用退出（ADR-017 暂停流程中）各做一次；写入 `handback-t1`（`06` §6.4.3 “T1 的保留”）时做一次（ADR-239：它在写回开始之前写入，Goal 这时非终态，所以进入 bundle；放弃之后 bundle 只保留 30 天，此后它只在影子中——影子被外部删除时（情形 B）没有第二份，人工编辑检出若仍在则是另一份，如实登记） |
| 成本 | 瘦 bundle 大小 ≈ 本 Goal 新增对象（典型 < 5 MB）；生成 50–500 ms，计入 `13` §13.11 的后台 git 总预算；超预算时推迟，但 `claimed`/`accepted`/退出时必做 |
| 保留 | 归档完成后删除（`integrated` 宽限后的归档与验收但不合并的归档相同，ADR-195）；`abandoned` 保留 30 天；磁盘压力时最先清理已归档者；隐私清除时删除（`09` §9.12.4） |
| 恢复（情形 B、D） | 情形 B 用现有检出；情形 D 用你克隆或定位的新检出（Tower 不替你克隆，§10.16.2）→ 新影子 `git fetch <bundle> '+refs/tower/<goalId>/*:refs/tower/<goalId>/*'` → 按情形 A 重建卫星 |
| 局限 | 只覆盖已进入检查点的内容（数据损失上限同 §10.16.2：≤ 1 个回合 + 去抖窗口）；瘦 bundle 依赖远端仍保有 baseCommit。**已知限制**（ADR-192）：影子在一次 seal 写入用户分支之后、进入 `accepted` 的那次 bundle 完成之前被删除，并从更早的 bundle 恢复时，分支顶端的 seal 不在影子中，下一次重新 seal 按“B 的顶端不是 Tower 自己的 seal”另开 `B₀-v<k>`（不改写该分支，方向安全），面板那句“已有你的提交”此时不真实 |

## 10.17 并发控制

| 锁 | 粒度 | 保护的操作 | 超时 |
|---|---|---|---|
| `repoLock(projectId)` | 每仓库互斥（读写锁：写者互斥） | 写者：镜像 fetch（镜像上下文）、集成时的 seal fetch、CAS、推送（用户仓库上下文）；读者：雷达 | 写 60 s，读不阻塞写之外的读 |
| `wtLock(goalId, binding)` | 每个卫星 + 影子互斥 | 检查点、pin、seal、rebase、restore、准备配方、**影子 gc** | 30 s（准备配方与 gc 除外） |
| `queueLock(projectId, baseRef)` | 合并队列 | Q1–Q7 | 无（单线程消费） |

- **陈旧锁文件。** Tower 只会在影子、镜像与用户仓库中遇到锁文件（卫星的 `index.lock` 与 Tower 无关）。影子中的陈旧锁（无持有进程且 mtime > 60 s）直接删除并记 Fact；用户仓库中的锁属用户或其 IDE → 退避重试 3 次（200 ms、1 s、5 s），仍失败则推迟并提示。
- **Agent 的 git 命令与 Tower 的 git 命令并发。** 两者不共享任何可写的 git 目录：Agent 写卫星 gitdir，Tower 只写影子、镜像与（集成时）用户仓库，因此不存在锁竞争。Tower 写卫星的只有工作区文件（恢复、rebase、交还时，均在 Run 空闲时，§10.1.3）；卫星 gitdir 的调整在 Agent 的沙箱中进行（§10.8.1 第 4 步）。
- **维护。** 影子：空闲时**在 `wtLock` 之内**执行 `git --git-dir=<影子> gc --prune=2.weeks.ago`（宽限期以 `16` §16.2.6 为唯一来源，`06` §6.6.4 引用；避免与刚写入、尚未被 ref 引用的检查点对象或决定性指纹赛跑，R4-D6-01；统一取 2 周，取代此前的 1 小时，R5-D13-01c）。镜像：按 §10.17.1。**不对用户仓库运行任何维护。**
- **用户在主检出中运行 `git gc` / `maintenance` / 删除分支**：卫星与影子的对象来自 Tower 的镜像，而不是用户的活动对象库（ADR-073），因此用户的任何维护都不会让检查点、pin 或卫星缺对象（R4-D13-01 的 cherry-pick + `gc --prune=now` 场景由 SP6b G12 回归）。默认情况下用户仓库中除多机租约 `refs/tower/_owner` 外没有任何 `refs/tower/*`（§10.6.2），用户的 `fsck`、`log --all`、`for-each-ref` 与 Goal 的运行状态无关。

### 10.17.1 镜像保留与回收（ADR-083，R5-D13-01）

镜像以 `gc.pruneExpire=2.weeks.ago`（与影子同一宽限，`16` §16.2.6）运行，**只删除不被任何 ref 可达、且超过宽限期的对象**。哪些对象必须保留，由镜像中的 ref 表达：

| 镜像中的 ref | 指向 | 写入 | 删除 |
|---|---|---|---|
| `refs/user/heads/*`、`refs/user/remotes/*` | 用户仓库的分支（`+` 强制更新，§10.3.1） | 每次 fetch 新 base | 随用户删除分支：获取带 `--prune`，只作用于这两个命名空间，Tower 自己的 ref 不受影响（§10.3.1，ADR-197）；被 rebase 掉的旧提交与被删除分支独有的提交由此变为不可达 |
| `refs/tower-remote/<r>/<b>` | 远端引用 base 在远端的最新值（ADR-155 补记 2：Tower 的网络 fetch 只写镜像，不再更新用户检出的 `refs/remotes/*`） | §10.3.1 步骤 1 的远端 fetch、M2 的轮询（§10.9.3） | 没有任何 Goal 以该远端引用为 base 时，在镜像 gc 前删除 |
| `refs/tower/<goalId>/base-snapshot` | 基线快照（§10.5） | Goal 创建 | 影子删除时 |
| `refs/tower-live/<goalId>/base`、`…/real-base` | 当前 `baseCommit`（与 `realBase`） | Goal 创建、每次 rebase | 影子删除时（归档 180 天后，§10.3.2） |
| `refs/tower-live/<goalId>/*` | 影子中全部 `refs/tower/<goalId>/*` 的副本 | **每次镜像 gc 之前**，在镜像上下文 `git fetch --no-tags <影子> '+refs/tower/<goalId>/*:refs/tower-live/<goalId>/*'`（只传输镜像中没有的 Goal 增量对象） | 影子删除时 |
| `refs/tower-retain/<goalId>/<verifyId>` | **永久**重放包对应的 pin（ADR-095：只限决定性验证——导致 `in_review`/`accepted` 的验证；验收与 seal 的完整重哈希不是验证运行，不写，ADR-187；`07` §7.4.1） | 永久重放包写入时，同样从影子 fetch 该 pin；非永久重放包不写保留 ref | 隐私清除时（`09` §9.12.4）；否则永久 |

为什么要把影子 ref 同步进镜像：影子写入对象时，镜像中已有的对象被复用而不复制（alternates）；这些对象在镜像中可能只经某个用户分支可达，而该分支随后被强制更新（R5-D13-01b）。同步后，影子需要的每个对象在镜像中都可达，gc 不会删除它们；影子 ref 全部消失（影子删除）后，只有保留 ref 仍可达的部分继续保留。

**镜像 gc 流程**（每周空闲时一次；磁盘压力时提前；持 `repoLock` 写锁）：① 对该 Project 每个仍存在的影子刷新 `refs/tower-live/<goalId>/*`，删除已不存在的影子对应的 `refs/tower-live/<goalId>/`；② `git gc --prune=2.weeks.ago`；③ 记录镜像独占大小（事件 `mirror.gc {bytesBefore, bytesAfter}`）。

**不同步卫星。** Tower 不从卫星 fetch（那会在 Agent 写过的 gitdir 上运行 `upload-pack`）。卫星借用、但只经被强制更新的用户分支可达的镜像对象（例如 Agent 检出过一个后来被 rebase 的用户分支）可能在宽限期后被回收；卫星的 git 随之报缺失对象 → 按 §10.16.2 情形 A 从影子重建，工作内容在检查点中，不丢失。

**增长与上限。** 镜像大小 = 用户仓库可达历史 + 活跃 Goal 的增量 + 保留证据的增量 + 至多 2 周的垃圾。保留证据的增量是永久重放包对应 pin 相对 base 的新对象（ADR-095：平均每个 Goal 1–2 个），同一 Goal 的多次 pin 大量共享对象；量级估计每个 Goal 1–5 MB，每周 5–20 个 Goal 时约 0.1–1 GB/年（SP5 回填；计入 §10.4.4 的磁盘预算）。这些对象只存一份：重放包在本地不另存瘦 bundle，只在导出时生成（`07` §7.4.1，R6-D6-01）。重放包自身（日志与脱敏输出，每条标准 ≤ 2 MB）的磁盘成本见 `13` §13.11.3。上限：镜像独占大小 > max(2 × 用户 `.git/objects`，用户 `.git/objects` + 5 GB) 时，设置页“存储”面板以 severity 1 提示（呈现按 `08` §8.1 “存储提示”，ADR-229），并说明可对不再需要的已归档或已放弃 Goal 执行“清除一个 Goal”（`09` §9.12.4）；按时间删除重放包与对应保留 ref 属 M2，与“导出并清除早于 N 个月的证据”合并定义（ADR-196）；Tower 不自动删除证据。

---

## 10.18 本文产生的事件与 Fact

| 事件 / Fact | 写入者 | 用途 |
|---|---|---|
| `satellite.created/prepared/removed/recovered`（原 `worktree.*`；`satellite.recovered{projectId?, tree, checkpointN?, by: "auto" \| "decision"}`，重建成功的同一事务记录，ADR-180；多仓库 Goal 中带 `projectId`，ADR-213） | ⚙️ | 生命周期、Re-entry；`tower.satellite_rebuilt` 开场的来源（`16` §16.1.12）；放弃人的改动时的比较基准（`06` §6.4.3） |
| Fact `prepare` | ⚙️ | 依赖成本统计、`13` |
| `checkpoint.created`（+ Pi `custom` entry `tower.checkpoint`） | ⚙️ | 时间线、回退、恢复、指纹 |
| `workspace.restored` / `workspace.recovered` | ⚙️（由 🧑 命令或检测触发） | 审计、简报。二者是**事件**，不是 Fact kind；Re-entry 简报直接读取事件（R5-D15-01 #2） |
| `binding.rebased {old, new}` | ⚙️ | I2、评审重置 |
| Fact `conflict_forecast` | ⚙️ radar | 卡片 chip、Needs-You |
| `mergequeue.*`、`audit.acceptance_carried`、Fact `ci_check` | ⚙️ | 集成状态 |
| `integration.performed {mode, strategy, sha, branch, prUrl?}` | ⚙️（由 🧑 批准） | `integrated` 判定、审计；`sha` 为写进用户分支的 seal（M1 不签名，§10.6，ADR-193）；`branch` 为 seal 写入的用户仓库分支（`B₀` 或某个 `B₀-v<k>`，ADR-182），重新 seal 按最近一条确定 B 与 P（§10.6，ADR-181） |
| `sentinel{detector:"nested_repo"}`（ADR-071/089；`Fact.kind = "sentinel"`，不是独立的 Fact kind；`git_control_tampered` 已随 ADR-089 退役）；`mirror.created/fetched/gc` | ⚙️ | 卫星完整性、镜像状态 |
| `human_checkout.created/handed_back`（§10.8.4）、`inspect.opened/closed`（§10.8.3） | ⚙️（由 🧑 命令触发） | 人工交接与检验的审计 |
| `project.local_file_secret_detected`（ADR-170/171，登记于 `16`） | ⚙️ sm | 复制前的重新判定中内容命中，把普通本地文件改为机密（`secretBy = content`）；不可读或不存在时不记录（本应复制的条目只发进程内的“无法读取”L1 通知，不写账本，ADR-172/173）；审计与通知 |
| `project.local_file_unmark_reverted`（ADR-172，登记于 `16`） | ⚙️ sm | 复制前的重新判定中，已取消标记的条目内容变化且再次命中机密模式，与清除 `unmarked` 同一事务记录，恢复为机密本地文件；审计与通知 |
| `binding.reattached`、`backup.bundled {goalId, bytes, thin}` | ⚙️ | 附着点迁移、备份状态（设置页“存储”面板） |
| `ports.allocated/released` | ⚙️ | 端口段分配表（§10.19） |

---

## 10.19 服务与端口（ADR-037、ADR-055）

文件隔离不足以保证“互不干扰”：dev server、测试数据库、固定端口的 e2e 测试会在并发 Goal 与验证槽位之间冲突。macOS 没有用户态网络命名空间，Linux 上 `bwrap --unshare-net` 又会破坏 docker，因此 Tower 采用**端口分配 + 服务实例化**，而不是网络隔离。

| 项 | 规则 |
|---|---|
| 端口段 | 范围 **20000–29999**（低于 macOS 49152–65535 与 Linux 默认 32768–60999 的临时端口范围，出站连接不会随机占用），每段 20 个，`20000 + 20·k`（ADR-055，数值见 `16` §16.2.6）。**分配前探测**：对段内每个端口在 `127.0.0.1` 与 `::1` 上尝试 `bind`，任一失败即跳到下一段；分配表持久化在事件日志中，Goal 结束时回收。持有者：每个 Goal、每个验证槽位、每个打开中的检验检出（§10.8.3，关闭时回收）各一段；人工编辑检出复用其 Goal 的段（Agent 已暂停） |
| 注入 | 经环境变量 `TOWER_PORT_BASE`、`PORT`（= base）注入 Agent 的 bash 与验证器进程；简报中写一行“本 Goal 的端口段为 20040–20059”（计入 ADR-009 常驻预算的意图段）。**模板**：`VerifyProfile.env.vars` 支持 `${port:N}`（段内第 N 个端口，0 ≤ N < 20）与 `${portBase}`，例如 `DATABASE_URL=postgres://localhost:${port:5}/app`、`REDIS_URL=redis://localhost:${port:6}`；同一模板也用于生成 Agent bash 的环境 |
| 服务 | `VerifyProfile.services`（启动命令、健康检查、清理命令）、`setup`、`teardown`；每个 Goal/槽位各起一份实例，数据目录位于各自卫星或槽位内 |
| 端口能力试运行 | **添加项目时**（而非首次验证失败后）：若 `VerifyProfile.services` 非空，以两个不同的端口段同时启动服务并执行健康检查，再清理；两者都健康 → `ports:"env"`；否则 → `ports:"fixed"`，并在添加项目流程中说明“该项目的服务并发度为 1”及如何改为读取 `PORT`/模板变量。之后若验证中检测到服务绑定在分配段之外，同样改为 `fixed` |
| 项目不支持环境变量端口（`ports:"fixed"`） | 该项目的“服务并发度”自动降为 1：同一时刻只有一个 Goal 或验证槽位运行服务，其余排队（Mode `queued`，原因“等待服务端口”）；项目设置页提示如何改为读取 `PORT` |
| Docker | Agent 与验证器默认**不可**访问 docker socket（`11` §11.6.2 读写拒绝）；`services` 声明 `docker: true` 需人批准（单向门级别的项目设置），并以 compose project name = `tower-<goalId|slot>` 隔离容器、网络与卷 |
| 故障 | 服务启动或健康检查失败、端口冲突、安装器失败记为 Fact `verify_env_error`，不触发自动返工，进入 Needs-You（severity 2） |

**对并发度的影响**：端口段本身不限制并发（20 × 并发 Goal 数 + 20 × 验证槽位数，远小于可用端口）；限制来自不支持端口注入的项目（降为 1）与 docker 服务的内存（计入 `13` §13.8 的整机资源模型）。

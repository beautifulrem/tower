# Agent Harness GUI 竞品分析（截至 2026-10-26）

> 写给：Tower（Tauri + SolidJS 的编程 Agent 监督台，引擎 Pi）。
> 目的：对照 2025–2026 年主流 agent harness GUI 与编排类桌面/网页应用，回答四个问题：
> （1）2026 年用户眼中的“入场券”功能是什么；（2）Tower 真正独特在哪里；（3）Tower 相对竞品的具体缺口；（4）哪些 UI 模式值得借鉴（具体到按键、diff 行为、状态色、通知规则、上手流程）。

---

## 0. 说明

### 0.1 方法

- 2026-10-26 做了五轮并行的网络调研：
  1. Claude Code、Codex、GitHub Copilot
  2. Cursor、Devin、Google
  3. worktree 编排器
  4. Warp、Zed、Amp、OpenCode、Goose、Factory、Kiro 等
  5. 横向用户反馈
- 一手来源优先：官方文档、changelog、GitHub issue、HN 原帖。
- 本文是 `research/landscape.md`（2026-10-15）的补充。那份报告侧重“Goal / 记忆 / 观点”；本文侧重**界面行为、评审、审批、通知、隔离、验证、定价和口碑**。两份重复的地方，本文只摘要并给链接。
- Tower 的现状以仓库代码为准：`apps/desktop/src`、`docs/17-implementation.md`。

### 0.2 证据标签

| 标签 | 含义 |
|---|---|
| （无标签） | 来自官方文档、changelog、官方博客、GitHub issue 或 HN 原帖 |
| **[二手]** | 来自第三方评测、聚合站或搜索摘要，引用前应复核 |
| **未核实** | 没有找到可打开的一手来源 |

### 0.3 检索限制

- Tavily 超额，Brave 搜索失败，所以以 WebSearch、WebFetch 和 HN Algolia 为主。
- Reddit 与 X 无法直接抓取，相关引语极少。凡标“Reddit”者都是经第三方转述。

---

## 1. 执行摘要

1. **“左侧会话 · 中间对话 · 右侧 diff”仍是绝对主流，但“注意力分组”已成标配。** 2026 年几乎所有产品都把列表按“需要你 / 运行中 / 待评审 / 已完成”分组：
   - Claude agent view：Needs input / Working / Ready for review
   - Claude Projects：Waiting on you / Working / Landing / Resolved
   - Codex：Activity 视图
   - Superset（现名 Paradev）：Needs attention / Working / Needs review / Idle / Merged
   - Devin：Working / Ready / Blocked / Inactive
   - Antigravity：Inbox

   Tower 的“需要你”收件箱方向正确，但**已不独特**。差异只能来自更好的排序、限流与简报。
2. **行内批注回传给 Agent 是最受称赞的单一功能**，已是入场券：Codex、Claude、Conductor、Warp、Factory、Vibe Kanban、Kilo、Cline Kanban 都有。Tower 已有，但缺少评审范围切换、按文件“已看”、hunk 级回退和就地编辑这些配套。
3. **评审范围切换是 2026 年新的共识**：“上一轮 / 未暂存 / 已暂存 / 整个分支 / 自上次评审以来”。Codex、VS Code、Cursor 3.22 都加了 “Last turn”，Devin Review 有“最新改动尚未评审”横幅，Amp 有“评审期间 diff 变了”的蓝点。Tower 的评审单元按风险排序，但没有时间维度的范围。
4. **“Agent 说完成”不可信，已有数据支撑，但几乎没有本地 GUI 独立复跑验收。** 各家的做法：

   | 产品 | 谁来判断完成 | 怎么判断 |
   |---|---|---|
   | Claude `/goal` | 一个小模型 | 只读对话记录，不运行命令 |
   | Codex `/goal` | Agent 本身 | 自我审计 |
   | Claude `autoVerify` | Agent 本身 | 截图检查 |
   | Copilot 云 Agent | Agent，在开 PR 前 | 在自己的环境里跑 CodeQL、密钥扫描和项目测试 |
   | Factory Missions | Agent 型验证器 | scrutiny 与 user-testing 验证器 |
   | Augment Intent | Verifier | 对照规格检查 |

   **在干净检出、沙箱里由监督者重跑可执行标准，并在界面上把“说法”和“事实”分开呈现**：这一点 Tower 仍然独有。最接近的替代品是 PR 的 CI。
5. **工作区隔离的真实痛点在“运行时”，不在 git。** 用户反复抱怨四件事：
   - 端口冲突：Vite 静默换端口，结果预览了错的分支。
   - `.env` 缺失。
   - `node_modules` 重装与磁盘膨胀：Codex 桌面版有人报告 330 GB。
   - 共享数据库。

   成熟产品的解法：
   - Conductor：每个工作区分 10 个端口；setup / run / archive 脚本；`.worktreeinclude`。
   - Codex：最多保留 15 个 worktree，删除前快照、可恢复。
   - Devin：LRU 上限 20。
   - VS Code 1.141：清理界面显示磁盘占用，并保护运行中、需要输入和置顶的会话。

   Tower 每次验证都重装依赖，没有端口、预览、setup 脚本或磁盘视图。这是最大的“日常可用性”缺口。
6. **审批疲劳有了量化证据，“沙箱边界优于逐条确认”成为主流观点。**
   - Scalex 的 40 万次决策实验中，人漏掉约三分之一的危险操作。
   - Anthropic 数据：全问模式放过 86.4% 的危险命令。
   - Claude Code 于 2026-08-14 把 auto mode 设为默认。

   Tower 的 Seatbelt 沙箱 + 范围围栏 + 自主度矩阵正好站在这一边。但只支持 macOS，而且 read/edit/write 还不在沙箱内。
7. **用户对“静默改变”与隐私极其敏感。** 近期事件：
   - Codex CLI 装了常驻自更新守护进程（HN 610 分）。
   - Claude Code 未告知就默认开启 remote-control。
   - Claude 的 `AskUserQuestion` 被改成 60 秒后自动继续。
   - ZCode 静默上传整个工作区。
   - Vibe Kanban 登录后重新打开遥测。

   Tower 的“从不推送”“注入消息原样可见”在这个环境下是可以讲的卖点。
8. **Electron 内存抱怨普遍。** 例如 Codex 11 个进程共 2.2 GB；Cursor Agents Window 渲染进程泄漏。原生或轻量是差异点：Muster 用 AppKit，约 20 MB，并以此为卖点。Tauri 的 Tower 有先天优势。
9. **薄编排层的商业风险被反复验证。**
   - Vibe Kanban 于 2026-04-10 关停，原因：绝大多数是免费用户，找不到商业模式。
   - Terragon 于 2026-02-09 关停。
   - Crystal 于 2026-02 停更，并入 Nimbalyst。
   - 厂商自己在吸收这一层：Claude Projects、Cursor Projects、Copilot app、Devin Desktop。

   Tower 的护城河必须是厂商结构性不愿做的部分：本地优先、独立验证、不推送、引擎中立。
10. **Tower 最可能被用户第一眼判为“不能用”的缺口**有六项：
    1. 没有终端
    2. 不能在编辑器里打开文件
    3. 不能运行或预览应用
    4. 不能贴图
    5. 只支持 Pi
    6. 不能开 PR

    这些都是“逃生口”类功能，不必做深，但必须有。

---

## 2. 逐产品分析

每个产品按同一顺序展开：**定位 · 布局 · 进度 · 评审 · 并行与隔离 · 审批 · 通知 · 验证 · 键盘与上手 · 定价 · 口碑**。

### 2.1 Claude Code（桌面 Code 标签、Web、CLI agent view、Projects 公测）

**定位**：Anthropic 一方。CLI、桌面、Web 与手机共用一个账户。2026-09 推出 Projects 公测，在会话之上加了一层“协调者”。

**布局** ([desktop docs](https://code.claude.com/docs/en/desktop))
- 侧栏：会话列表，可按环境、项目分组排序；`+ New`（⌘N）。
- 标题栏按钮：Terminal / Changes / Browser / Files。窗格可拖动重排；diff 与终端可弹出成独立窗口，也能停靠回来。
- 会话导轨：环境、改动、运行中任务、上下文卡片。只在对话区足够宽时出现。
- 分屏：⌥点击另一个会话，非焦点那一侧会变暗。
- Tasks 窗格：列出子 Agent、后台 shell 和动态工作流，可逐个停止。
- 侧聊（⌘; 或 `/btw`）：能读主线，但不写回主线，也不落盘。
- 输入框一行可选：环境（Local / Cloud / SSH / WSL）、文件夹、权限模式、模型。

**进度**
- 对话记录有 Normal / Thinking / Verbose 三种模式，Ctrl+O 切换。默认把工具调用折叠成摘要。
  - 2026-02 因为折叠过度引发过开发者反弹，见 landscape.md A.1。
- **Agent view**（CLI，研究预览）([docs](https://code.claude.com/docs/en/agent-view))：
  - 分组：Pinned / Ready for review / Needs input / Working / Completed。
  - 状态字形：动画 ✽ 运行中；黄 ✻ 需输入；绿 完成；红 失败；灰 停止；✢ 循环，带倒计时。
  - PR 小标：黄 = 等待或检查失败；绿 = 通过；紫 = 已合并；灰 = 草稿或已关闭。
  - 空格键 **peek**：只看最近输出或它在等的问题，外加“waiting 3m”。可以就地回复，`!` 前缀跑 bash。
  - 重新进入会话时，自动贴出“你离开期间发生了什么”。
  - 终端标签标题显示 `2 awaiting input · claude agents`。
- **`/goal`** ([docs](https://code.claude.com/docs/en/goal))：
  - 显示 `◎ /goal active` 与已用时间。
  - 每轮结束后由另一个小模型给出判定（Not yet met / Met / Impossible）和理由，按 Ctrl+O 查看。
  - 条件最长 4000 字。后台超过 30 分钟后，按指数退避回来问你一次。
- **Projects**（2026-09 公测，仅 Pro/Max）([docs](https://code.claude.com/docs/en/claude-projects))：
  - Overview 的线程分组：Ready for review / **Waiting on you** / Working / **Landing**（PR 已批准或已排队）/ Idle / Resolved。线程一周不活动自动 Resolved。
  - 线程卡上有下一步按钮：**Resolve conflicts、Fix CI、Address comments、Merge it**。按下后以“你发出的消息”形式送给 Agent。闲置且已推送分支的线程会出现 Create PR。
  - “Suggested threads”可一键全部启动。
  - 首次运行会贴出 Setup recommendations。
  - 默认用 Opus 高强度，文档明确警告“消耗你的额度最快”。

**评审**
- 点击改动卡上的 `+12 -1` 打开 diff。点任意行写批注，Enter 加入，**⌘Enter 一次性提交全部批注**，Claude 再回一个新 diff。
- Web 版有 **Compare against**，可以对任意分支比较 ([web](https://code.claude.com/docs/en/claude-code-on-the-web))。
- `/code-review` 输出按文件分组的发现卡。每条可 **Walk through in diff**、**Fix this one** 或忽略，也可以 **Apply fixes** 一次性修。
- 路径右键菜单：作为上下文附加 / 在 VS Code、Cursor、Zed 等中打开 / 在 Finder 中显示 / 复制路径。
- **没有**文档化的按文件“已看”、暂存或回退。
- PR 菜单：
  - **Auto-fix**：修失败的 CI；本地会话还会处理受信角色的评审评论。
  - **Merge when ready**：开启 GitHub 自动合并，默认 squash。
  - PR 合并或关闭后，会话可自动归档。
- Web 版的 auto-fix 遇到评审意见有歧义时，会先问你。

**并行与隔离**
- worktree 放在 `<root>/.claude/worktrees/`。`.worktreeinclude` 用于复制 `.env` 等被 gitignore 的文件；归档后 worktree 保留约 30 天。
- agent view 派发默认进入 worktree，并且“从不推 main、强推或合并”。
- `.claude/launch.json` 配置浏览器窗格：
  - `autoPort` 自动找空闲端口。
  - `autoVerify` 默认开启：Agent 在结束回答前会截图、查错，确认改动生效。
- 云端：Anthropic 提供 VM。
  - 准备过程中显示实时清单，你输入的消息会排队。
  - setup 脚本约 5 分钟内跑完会被缓存。
  - 网络有三档：Trusted 白名单 / Custom / Full。
  - 凭据经代理注入，不进 VM。

**审批**
- 桌面模式：Manual / Accept edits / Plan / Auto（分类器）/ Bypass。⌘⇧M 打开选择器；每个文件夹记住上次选择（Plan 除外）。
- 浏览器站点操作用卡片：Allow once / Always allow / Deny。
- 2026-08-14 起 **auto mode 成为 Claude Code 默认** ([Claude blog](https://claude.com/blog/auto-mode-default-in-claude-code))。

**通知**
- 会话完成、且你**没在看这个会话**时，发 OS 通知。
- Projects 在发帖、出错、需要输入时通知；Dispatch 推送到手机。
- 已知 bug：
  - Projects 线程在等输入时显示为闲置，也不提醒（[#102521](https://github.com/anthropics/claude-code/issues/102521)）。
  - 重复发“needs your input”（[#104926](https://github.com/anthropics/claude-code/issues/104926)）。
  - 普通回答也触发“waiting for your input”（[#79329](https://github.com/anthropics/claude-code/issues/79329)）。

**键盘与上手**
- 快捷键：
  - ⌘/ 打开快捷键表；Ctrl+Tab 与 ⌘⇧[ / ] 切换会话。
  - ⌘⇧D 打开 diff；⌘⇧B 打开浏览器；⌘⇧S 在浏览器里选元素；Ctrl+` 打开终端。
  - ⌘⇧I 选模型；⌘⇧E 调强度；菜单打开时数字键 1–9 直接选项。
- 上手：安装 → 登录 → 点 Code 标签 → 选环境、文件夹、模型 → 输入 prompt。
  - 灰色建议 prompt 按 Tab 接受。
  - Manual 模式下第一次编辑会显示 diff，并给出批准和拒绝按钮 ([quickstart](https://code.claude.com/docs/en/desktop-quickstart))。

**定价**
- Pro $20，Max 5x $100，Max 20x $200。限额是 5 小时窗口加每周上限，2026-05-06 起 5 小时限额翻倍 ([support](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan))。

**口碑**
- 称赞：
  - “agent view is good for hopping between sessions”（[HN](https://news.ycombinator.com/item?id=50181189)）
  - remote-control 很有用（[HN](https://news.ycombinator.com/item?id=48849496)）
- 抱怨：
  - 桌面版自带一份引擎，重连时会冲掉长时间运行的会话（[HN](https://news.ycombinator.com/item?id=50095797)）。
  - 桌面版的 GitHub 集成与 CLI 完全不同（[HN](https://news.ycombinator.com/item?id=50099953)）。
  - Electron（[HN](https://news.ycombinator.com/item?id=50075967)）。
  - Pro 额度一小时用完（[HN](https://news.ycombinator.com/item?id=49397117)）。
  - **数据丢失**：桌面 WorktreePool 的 GC 无提示删除了用户的 worktree，也不进废纸篓（[#96162](https://github.com/anthropics/claude-code/issues/96162)，2026-09）。

### 2.2 OpenAI Codex（2026-07 起并入 ChatGPT 桌面版）

**定位**：OpenAI 一方。2026-07 Codex 并入 ChatGPT 桌面 app（macOS / Windows，8 月起 Linux 预览），所有档位（含 Free）可用 ([what's new](https://learn.chatgpt.com/docs/whats-new))。

**布局**
- Chat / Work / Codex 三个顶层，Ctrl+1/2/3 切换。
- 项目下有多个文件夹，其中一个为主。
- 侧栏铃铛图标是 **Activity 视图**：最近参与的对话，加上需要注意的工作。

**进度**
- task sidebar 显示计划、来源、产物和摘要。
- `/goal`（2026-05 GA）运行时会减少未读通知。

**评审** ([code-review](https://learn.chatgpt.com/docs/code-review?surface=app))
- **范围选择器**：Unstaged（默认）/ Staged / Commit / Branch / **Last turn**；多仓库项目还有 All repos。
- **Stage all / Revert all**，以及按文件、**按 hunk** 的暂存、取消暂存和回退。
- 行内批注：悬停一行点 +，再“send a message back to the chat”。文档建议的措辞：“Address the inline comments and keep the scope minimal.”
- 点文件名在编辑器中打开；**⌘点击某一行直接打开到该行**。
- `/review` 有两种：对基线分支，或对未提交改动。结果以行内批注出现；也可以在设置里改成单独面板显示（Inline / Detached）。
- PR 插件：
  - 按文件 **Mark as viewed**；Summary / Changes 标签；Stack 区。
  - Comment / Approve / Request changes。
  - **Fix** 把失败的检查附到对话里。
- 在应用内可以 commit、push、开 PR。

**并行与隔离** ([worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees))
- 默认保留最近 **15** 个 Codex 管理的 worktree。
- 对话归档时删除它的 worktree，但置顶或运行中的不删。**删除前存快照，重新打开对话时提供恢复。**
- 对话标题栏的 **Hand off** 按钮可以在 Local / Worktree / 远程主机之间迁移对话。
- `.codex/` 目录：
  - 按操作系统分别写的 setup 脚本。
  - **Actions**：顶栏的图标按钮，比如起 dev server、跑测试。
  - 可以提交到仓库共享。
- 云端：安装脚本；网络开关可选“包管理器”或“自定义域名”；密钥只在 setup 阶段可用；`--attempts 1–4` 做 best-of-N。

**审批**
- 输入框下的选择器：Ask for approval / **Approve for me**（自动审查，只在它判断不安全时问你）/ Full access / Custom。
- 底层是沙箱（read-only / workspace-write / danger-full-access）与审批策略的组合 ([approvals](https://developers.openai.com/codex/agent-approvals-security))。
- 审批决定可以是：接受、本会话内接受、拒绝、取消，或修改执行策略（推测即“始终允许此前缀”）。

**通知**
- 2026-03 起：问题、计划模式提问会通知；Dock 角标显示**待审批数**。理由是审批比“完成”更值得打断人（[#13629](https://github.com/openai/codex/issues/13629)）。
- iOS 通知点开直达已完成任务。
- **⇧Esc 清除全部未读；⌘⌥A 跳到下一个需要注意的对话。**
- 已知问题：
  - 聚焦在当前对话时仍弹审批 toast（[#51956](https://github.com/openai/codex/issues/51956)）。
  - toast 上的 Approve 按钮不生效（[#22308](https://github.com/openai/codex/issues/22308)）。
  - MCP 征询没有可操作的通知，任务可能“无限期阻塞”（[#35947](https://github.com/openai/codex/issues/35947)）。
- **Codex Micro 硬件键的状态色** ([docs](https://learn.chatgpt.com/docs/features/codex-micro))：

  | 颜色 | 含义 |
  |---|---|
  | 白 | 闲置 |
  | 蓝 | 思考中 |
  | 绿 | 完成 / 未读 |
  | **琥珀** | **需要输入** |
  | 红 | 错误 |

  350 ms 内双击，切到对应对话并把窗口拉到前台。这是一套可以直接借用的状态色词汇。

**键盘** ([commands](https://learn.chatgpt.com/docs/reference/commands))
- ⌘K 或 ⌘⇧P 打开命令菜单；⌘/ 快捷键表；⌘J 底部面板；Ctrl+` 终端；⌘P 搜文件。
- **Ctrl+⇧G 打开评审标签**；⌘⌥S 侧聊。
- 快捷键设置支持“按下按键来搜索”和一键全部重置。

**定价 [二手]**
- Free / Go $8 / Plus $20 / Pro $100、$200、$500 / Business $20 每人。Codex 与 Work 共用额度 ([morphllm](https://www.morphllm.com/codex-pricing))。

**口碑**
- 称赞：
  - “GitHub style diff and leave inline comments (super useful)”（[HN](https://news.ycombinator.com/item?id=49978362)）
  - 移动端更精致（[HN](https://news.ycombinator.com/item?id=49409631)）
- 抱怨：
  - 分不清哪些对话在本地、哪些在云端（[HN](https://news.ycombinator.com/item?id=49298109)）。
  - 并入 ChatGPT 后“一团糟”（[HN](https://news.ycombinator.com/item?id=49286311)）。
  - 11 个进程共 2.2 GB（[HN](https://news.ycombinator.com/item?id=49285510)）。
  - Crashpad 转储加上每个 worktree 重复的构建产物，**磁盘吃掉 330 GB**（[HN](https://news.ycombinator.com/item?id=50133231)）。
  - Review 窗格 bug：Last turn 显示错了回合、空 diff、Undo 无效（[#40830](https://github.com/openai/codex/issues/40830)、[#10503](https://github.com/openai/codex/issues/10503)）。
  - “I never want to review changes/diff in a side panel”（[#30703](https://github.com/openai/codex/issues/30703)）。

### 2.3 GitHub Copilot（云 Agent、Copilot app、Agent HQ、VS Code Agents 窗口）

**定位**：以 issue 和 PR 为工作单位，深度绑定 GitHub。2026-06-17 推出独立桌面 **Copilot app** 并 GA（macOS、Windows、Linux），7 月起所有档位可用并支持自带密钥 ([GA](https://github.blog/changelog/2026-06-17-github-copilot-app-generally-available/))。

**Copilot app 布局** ([concepts](https://docs.github.com/en/copilot/concepts/copilot-surfaces/github-copilot-app))
- 侧栏：New / **My work**（issue、PR、CI、评审）/ Automations / Customize（插件、技能、MCP、canvas）/ Sessions（按仓库）/ Chats。
- 会话模式：Interactive / Plan / Autopilot。每个会话有独立的 worktree 和分支，可在本地沙箱或云沙箱运行。
- **Canvases**：“双向工作面”，覆盖计划、PR、浏览器、终端、部署，可编辑、重排、批准或改向。
- **PR 视图**：
  - 支持超大 PR：2200 个文件、100 万行以上、400 多条评论。手段是只虚拟化约 100 行、前缀和偏移、批量测量评论高度、增量加载 diff ([eng blog](https://github.blog/engineering/user-experience/rendering-huge-pull-requests-in-the-github-copilot-app/))。
  - 评审评论上有 Fix 按钮；CI 有“Fix failing checks”。
  - **Agent merge** 在后台运行，重启后继续，合并后自动关闭。
- 2026-10-07：本地沙箱 GA ([changelog](https://github.blog/changelog/2026-10-07-local-sandboxing-for-github-copilot-now-generally-available/))。2026-10-01：电脑操作需要按应用批准。

**云 Agent（github.com）**
- **自我验证**：开 PR 前在自己的环境里跑 CodeQL、依赖漏洞库检查、密钥扫描、Copilot 代码评审，以及项目自己的测试和 linter。这些验证工具可按仓库配置 ([changelog](https://github.blog/changelog/2026-03-18-configure-copilot-coding-agents-validation-tools/))。
- **CI 闸门**：Agent 推送的提交，要等人点 “Approve and run workflows” 才跑 Actions。2026-03 起管理员可以跳过这一步。
- Copilot 对 PR 的批准**不计入**必需的批准数。
- 用 `@copilot` 评论转向，只有有写权限的人可以。
- 环境在 `copilot-setup-steps.yml` 里配置，最长 59 分钟；防火墙有推荐白名单。
- 通知：Agent 完成后把你加为评审人；GitHub Mobile 的 Live Activity 显示进行中 / 完成 / 失败。

**VS Code Agents 窗口** ([docs](https://code.visualstudio.com/docs/copilot/agents/agents-window))
- Changes 下拉：分支 / 未提交 / 全部 / **上一轮**。可以对一段范围写反馈。
- Agent merge 列出阻塞项：Address Reviews / Fix CI Failures / Resolve Conflicts。合并选项：Off / If Unchanged / When Ready。
- **“Mark as Reviewed”在文件再次被改动后自动清除**；“Submit Feedback”把批注发给 Agent ([review docs](https://code.visualstudio.com/docs/agents/run/review-code-edits))。
- 1.141（2026-10-07）：
  - 网格布局；嵌套会话的未读状态。
  - **worktree 清理界面显示磁盘占用**，并且“运行中、需要输入、置顶的会话受保护”。
  - 跨平台沙箱。
- 权限：Manual / **Assisted**（每次工具调用由 LLM 判定）/ Allow all；1.124 起 Autopilot 是默认。
- 键盘：⌥Enter 在后台发送；⌘K 加方向键在会话间移动焦点。

**定价**
- 2026-06 起按 AI Credits 计费（1 credit = $0.01）：Pro $10、Pro+ $39、**Max $100**、Business $19 每席、Enterprise $39 每席 ([changelog](https://github.blog/changelog/2026-06-01-updates-to-github-copilot-billing-and-plans/))。

**口碑**
- 称赞：PR 工作流整合得更好（[HN](https://news.ycombinator.com/item?id=48245840)）。
- 抱怨：
  - “straight clone of the codex UI”（[HN](https://news.ycombinator.com/item?id=48376926)）。
  - 积分太少：Pro+ 的 7000 积分“insanely low”（[HN](https://news.ycombinator.com/item?id=48355855)）。
  - 2026-03 Copilot 往 PR 描述里插“tips”广告（[HN](https://news.ycombinator.com/item?id=47584827)）。

### 2.4 Cursor（Agents Window 3.x、Cloud Agents、Projects、Bugbot、Origin）

**近期变化**
- SpaceX 于 2026-08 收购 Anysphere。
- 10-12 改为 “The X Subscription”：Free / Plus $8 / **Premium $30** / Super $100 / Ultra $200。Claude、GPT、Gemini 按 API 标价另计 ([pricing](https://cursor.com/pricing))。
- Origin（基于 Graphite 的代码托管）2026-08 早期测试。
- Projects 9-10 公测；iOS 远程控制本地 Agent 10-06。

**布局** ([3.0](https://cursor.com/changelog/3-0))
- Agents Window 可运行本地、worktree、云端、SSH 的 Agent。侧栏也汇集从 Slack、GitHub、Linear、手机发起的 Agent。
- 文件、Changes、canvas、PR、浏览器、终端都以标签页打开。3.4 起任一标签可全屏，对话缩成浮动输入条；3.1 加了平铺布局。
- 工具调用记录有三档密度：**Compact / Balanced / Detailed**（3.4）。

**进度**
- 输入框上方有计划卡，可最小化成“Plan pill”（3.23）。
- 子 Agent 需要你时，状态显示 “Waiting for approval”；折叠的子 Agent 卡片上有就地的 **Allow** 按钮。

**评审** ([release notes](https://cursor.com/docs/release-notes))
- Agents Window 一开始只有 git 级别的 diff，用户强烈怀念编辑器里逐处修改的 Keep/Undo。
- 后来补了：
  - **“Last Agent Turn”范围**（3.22）。
  - 仓库与 worktree 选择器。
  - ⌃⇧; 一键折叠或展开全部文件卡。
  - 评审文件行和 Bugbot 评论上的 “Add to Chat”（3.27）。
- PR 标签：合并按钮显示会落地几个 PR，并解释阻塞原因（如 “Needs restack”）；⌘点击 diff 行在 GitHub 或 Origin 上打开。
- Agent Review：Find Issues、`/review`、`/review-bugbot`。

**并行与隔离**
- `/worktree`；`/best-of-n` 每个模型各一个 worktree，候选以标签页呈现。
- 云 Agent 可以迁到本地 worktree。
- 云环境写在 `.cursor/environment.json`：install（必须幂等）/ start / terminals（tmux，人和 Agent 共用）/ snapshot / Dockerfile ([docs](https://cursor.com/docs/cloud-agent/setup))。
- **Forwarded Ports** 菜单：检测到的端口、自动转发、“在内置浏览器打开”。dev server 恢复后浏览器标签自动重载。

**审批**
- Auto-review：白名单 → 沙箱 → LLM 分类器。官方声明它“不是安全边界”。另有 Allowlist 和 Run Everything 两档。
- 审批卡**写明理由**，例如“This edits a file outside your workspace.”（3.23）。
- 拦截只作用于真正发送或部署的那一次调用（3.22）。

**通知**
- macOS 菜单栏与 Dock 菜单：未读的 Agent 排在前面，多余的折成“N more unread”（3.24）；Dock 右键菜单有 Unread 区（3.19）；角标有“Show Count”开关（3.27）。
- **只有协调者那一轮结束才响提示音。**
- 多个 Agent 同时挂掉时合并成一条通知（3.26）。
- 系统通知默认关闭，只在窗口失焦时发。

**键盘**
- Ctrl+Tab 最近 Agent 切换器；⌘K 搜索，包括对话内容；⌘↑/↓ 在自己发过的消息之间跳。
- **⌘Z 撤销归档**；⌘⇧T 重开关闭的标签；⌘⇧⌫ 停止。
- Design Mode：⌘⇧D 进入；⇧拖选元素；⌘L 加入对话。

**验证**：云 Agent 产出截图、视频、日志，可接管远程桌面；Bugbot Autofix；Security Review。

**口碑**
- “Please stop it with trying to force the Agents mode on us”；CPU 与内存“through the roof”（[forum](https://forum.cursor.com/t/agents-window-feedback/160057)）。
- 多日长会话里渲染进程内存泄漏（[forum](https://forum.cursor.com/t/memory-cpu-leak-in-cursor-agents-window-renderer-after-long-running-sessions-multi-day/168692/13)）。
- “Cost opacity has been stressful”；稍复杂一点的改动就回到 IDE，因为那里能逐处 Keep/Undo（[forum](https://forum.cursor.com/t/product-feedback-cost-opacity-routing-plans-agents-window-1-year-heavy-use/166671)）。
- 两个并行 Agent 写出互相矛盾的代码，“如果只孤立地看每个 diff，我不会发现”[二手]（[thevibelog](https://thevibelog.dev/blog/cursor-3-review-2026)）。

### 2.5 Devin（Devin Web、Devin Desktop〔前 Windsurf〕、Devin Review）

**Devin Desktop**（2026-06-02）([docs](https://docs.devin.ai/desktop/agent-command-center))
- **Agent Command Center** 是默认界面：按状态分组的看板，本地 Agent（Devin Local、ACP Agent）与云端 Devin 会话同在一个看板上。
- 会话运行时锁定，变灰只读；排队的消息在发出前可编辑；“Duplicate session”从某个回答处分叉。
- **Spaces** 把一项任务的会话、PR、文件和上下文放在一起：
  - 默认每个会话自成一个 Space。
  - **把一个会话拖到另一个上**即可合并成一个 Space。
  - 视图“完全按你离开时恢复”。
- worktree：
  - 放在 `~/.windsurf/worktrees/<repo>`，名字随机。
  - `post_setup_worktree` 钩子会拿到 `$ROOT_WORKSPACE_PATH`，用来复制 `.env` 和安装依赖。
  - **每个工作区最多 20 个，按最近最少使用淘汰**；删除对话即删除它的 worktree；有 **Merge** 按钮。
- Devin Local 审批：对读、写、执行、网络获取、MCP 设 Deny > Ask > Allow 规则，可在项目、用户、组织三级配置；OS 沙箱带文件系统与网络的允许和拒绝列表。
- 通知：每个会话完成或需要输入、且应用在后台时，发一条系统通知。**默认关闭。**
- Quick Review：单独的评审子 Agent，可选模型：SWE-check 免费，GPT 5.5 或 Opus 4.7 按 token 计费。

**Devin Web** ([release notes](https://docs.devin.ai/release-notes/overview))
- 侧栏按 Working / Ready / Blocked / Inactive 分组，并**写出会话在等的是哪一项审批**（09-30）。
- 状态点：绿 = 工作中，橙 = 需要你。
- Progress 标签：shell、编辑、浏览器活动合成一条时间线。**点击某条命令就“时光回溯”到那一刻，之后的命令变灰。**
- 测试录像以卡片呈现，带通过/失败摘要。
- 键盘：⌥J/⌥K 上下一个会话；⌘⇧E 标记完成；⌘⇧⌫ 停止；⌘⇧F 专注模式；可选 Enter 或 ⌘Enter 发送。

**Devin Review** ([docs](https://docs.devin.ai/work-with-devin/devin-review))
- 按逻辑分组 hunk（不按字母顺序），每段附说明，开头有总览；识别移动或复制的代码。
- 发现分级：
  - Bug：Severe / Non-severe
  - Flag：Investigate / Informational
  - 安全：Critical / Warning，附 CWE
- 按文件 **Viewed** 状态，可一键全部标记。
- **每次 push 自动重新评审**（10-23）。出现“Latest changes haven't been reviewed”横幅（10-19）。
- 评审成本用 XS–XL 尺寸标签提前显示。

**定价**：Free / Pro $20 / Max $200 / Teams $80 加每席 $40 ([pricing](https://devin.ai/pricing))。

**口碑**
- 称赞：“The smart diff organization is the big one”[二手]。
- 抱怨：
  - Windsurf 变成 Devin 后“basically dead”（[HN](https://news.ycombinator.com/item?id=49652815)）。
  - “Spaces are undercooked”；对个人开发者来说 Command Center 是要多点一下才能关掉的干扰[二手]（[danilchenko](https://www.danilchenko.dev/posts/devin-desktop-review/)）。

### 2.6 Google：Jules 与 Antigravity

**Jules** ([docs](https://jules.google/docs/))
- VM 准备好后先展示计划，带“批准计划”按钮；**你走开它会按计时器自动批准**。
- 活动流里每一步附一个小 diff；全屏 diff 只列改动的文件。**没有行内批注**，反馈只能通过聊天。
- 有 Planning Critic、CI Fixer、定时任务。
- 限额：免费每天 15 个任务、并发 3；Pro 每天 100、并发 15；Ultra 每天 300、并发 60。
- changelog 停在 2026-03-09；是否并入 Antigravity：**未核实**。
- 抱怨：Claude Code 90 秒的任务，Jules 要 8–15 分钟[二手]。

**Antigravity 2.0 app**（2026-05-19，“there is no IDE”）([blog](https://antigravity.google/blog/introducing-google-antigravity-2/)、[changelog](https://antigravity.google/docs/changelog))
- 对话按项目分组，一个项目可以跨多个文件夹并有自己的权限。斜杠命令：`/goal`、`/grill-me`、`/schedule`、`/browser`。
- Artifacts：计划、walkthrough、截图、浏览器录像。可以像 Google Docs 那样批注，Agent 不停下来就能吸收。
- `artifactReviewPolicy`：asks-for-review / agent-decides / always-proceed。预设：Agent-driven / Agent-assisted / Review-driven。
- 近期细节（2.x）：
  - **提问和权限请求停靠在输入框上方，不替换对话**（2.26），同版加了通知设置页（声音、音量）。
  - 子 Agent 等审批时，对话上出现“需要注意”图标（2.23）。
  - 回答之间的文件编辑、命令、读取**折叠成一行**（2.21）。
  - 被拒绝的步骤保留可见，标“Rejected”（2.13）。
  - Undo 可以选择只回退对话（2.19）。
  - 可以在图片上拖拽画框批注（2.10）。
  - 首次运行时，在登录和接受条款之间介绍它能做什么（2.23）。
- VS Code 扩展：CodeLens 上逐 hunk Accept/Reject，**处理完自动滚到下一个 hunk**，接受和拒绝本身可以撤销、重做。
- 定价：免费；Pro/Ultra 随 Google AI 订阅；Business 每席 $30 起。Pro 额度每 5 小时刷新但有周上限，导致**连续多天被锁**[二手]。
- 口碑：
  - 1.0 时代 Inbox 受赞：“unified view of all my agents… quickly approve”（[HN](https://news.ycombinator.com/item?id=45967814)）。
  - 2.0 去掉 IDE 引发“bait and switch”反弹（[HN](https://news.ycombinator.com/item?id=48196838)）。
  - 安全事故：删掉整个盘、提示注入窃取数据（见 landscape.md）。

### 2.7 Warp（Agentic Development Environment）

**定位**：终端加 Agent 平台。客户端 2026-04 以 AGPL 开源，OpenAI 是“founding sponsor”。8 月推出 Warp Factories（用 `factory.yaml` 定义云端 Agent 车队）。CEO 原话：“we don't monetize the terminal at all” ([HN](https://news.ycombinator.com/item?id=47937349))。

**布局**
- 终端标签（支持纵向）加对话；Tab Groups。
- Agent Management Panel 列出本地与云端运行，可按来源、状态、创建者筛选。

**评审** ([code diffs](https://docs.warp.dev/agents/local-agents/code-diffs/)、[code review](https://docs.warp.dev/code/code-review))
- 应用前逐个 diff 把关：↑/↓ 在 hunk 间移动，←/→ 在文件间移动；**Enter 接受、R Refine（用自然语言让它重做）、E 编辑**、Esc 退出。“除非你明确接受，修改不会写入文件。”
- Code Review 面板：
  - 范围：未提交 / 对 main / 对任意分支。
  - 悬停 gutter 可回退单个 hunk；可按文件丢弃。
  - diff 可以直接编辑，Agent 改的同时实时刷新。
  - 批注攒成一批，**⌘Enter “Send to Agent”**，对 Claude Code 和 Codex CLI 也有效。

**审批** ([profiles](https://docs.warp.dev/agent-platform/capabilities/agent-profiles-permissions/))
- 按动作类型分别设置：应用 diff、读文件、建计划、执行命令、与运行中的命令交互、提问。
- 每类三档：Agent decides / Always ask / Always allow。
- 命令拒绝列表优先于白名单。
- 7 月：shell 权限请求在确认前可以编辑命令。

**通知** ([docs](https://docs.warp.dev/agents/capabilities/agent-notifications/))
- 三类：Complete / Request（审批、权限、闲置）/ Error。
- 角落 toast **最多同时 2 条，悬停时暂停计时**，点击跳到对应会话。
- 铃铛“通知邮箱”：All tabs / Unread / Errors。纵向标签上有需要注意的标记。
- 10-07：无人值守的运行在 Agent 停下来提问时**以 blocked 结束，而不是挂住**。

**定价 [二手]**：Build $20（1500 credits）/ Max $200 / Business 每人 $50。

**口碑**
- “Overwhelming and overloaded”；“I do struggle with having AI forced on me.”
- 称赞：“The code review panel is the one thing I find especially useful.”（[HN](https://news.ycombinator.com/item?id=47937349)）

### 2.8 Zed（Agent 面板、Threads Sidebar、ACP、Delta）

**布局**
- 1.0 时代：左侧 Threads Sidebar，Project/Git 面板移到右侧，每个线程可选独立 worktree。
- Terminal Threads（2026-05）：任何 CLI Agent 都能成为侧栏里受管理的线程 ([blog](https://zed.dev/blog/terminal-threads))。
- **Delta**（2026-09 公测）：用“评审子线程”替代 PR。
  - 评审者拿到父线程 worktree 的隔离副本，以及原 Agent 的上下文；可以要求修订，也可以用 Agent 直接修，修好后合回父线程。
  - DeltaDB 记录两次提交之间的编辑，并关联到产生这些编辑的 prompt ([blog](https://zed.dev/blog/delta-public-beta))。

**评审** ([agent panel](https://zed.dev/docs/ai/agent-panel))
- 输入框上方有“已编辑文件”折叠区。Review Changes（Ctrl⇧R）打开多缓冲区，可逐 hunk 或全部接受、拒绝。
- `single_file_review` 在文件内直接显示保留/拒绝。
- 每条用户消息上有 “Restore Checkpoint”；“跟随 Agent”的十字准星模式；发过的消息可以编辑后重发。

**排队与转向**
- 运行中发的消息默认排队。Steer 开关会在 Agent 的下一步注入；**双击回车立即发送**；队列里的消息可编辑、可删除。

**权限** ([tool permissions](https://zed.dev/docs/ai/tool-permissions))
- `allow` / `confirm` / `deny`，每个工具可设正则白名单和黑名单。
- 内置规则不可覆盖：禁止对 /、~、.、.. 执行 `rm -rf`。
- 弹窗选项：**Allow once / Deny once / Always for <tool> / Always for <pattern>**。能找到安全模式时会自动提取 pattern。

**通知**
- `notify_when_agent_waiting`、`play_sound_when_agent_done`、**`prevent_idle_sleep`**（线程运行时阻止休眠）。
- 未读线程显示蓝点。

**键盘**：⌘⌥J 打开线程侧栏；Ctrl+Tab 切换线程；⇧⌫ 归档；⌘N 新线程。

**定价**：Personal 免费（自带密钥和外部 Agent 不限）/ Pro $10 / Business 每席 $30。

**口碑**
- 外部 ACP Agent 是“二等公民”：不能恢复历史、没有检查点、不能编辑消息、没有斜杠命令（[#53583](https://github.com/zed-industries/zed/issues/53583)）。
- 对 Delta：“在已经和自己的 Agent 聊到倦怠的同时，还要消化队友和 Agent 的对话？”[二手]

### 2.9 Amp（Sourcegraph 分拆）

- **形态**：线程是一等对象，可共享、可分叉、可 `/handoff`。8 月起有原生 Mac 与 iOS 应用（需 macOS 26 / iOS 26）。Mac app 充当 runner，可在输入框直接创建 worktree。Orbs 是每线程一台远程 VM，10 月起支持自托管。
- **进度**：“Less Noise”（2026-09-25）把例行步骤折叠成回答上方一行可展开的摘要。官方立场：“If you have the patience to watch your agents work, you're giving them too short a leash.” ([news](https://ampcode.com/news/less-noise))
- **转向**：“Steer, Don't Queue”。运行中发的消息默认转向；内建动作（Ship、Review）仍然排队。
- **评审**：
  - 6 月：任何线程的 diff 都能在桌面或手机上评审，可交互式暂存，能针对具体段落要求修改，能检测重复代码块。
  - 9 月，**智能排序**：模型把“最能解释这次改动的文件”排在最前，测试、fixture、生成代码弱化排在后面。**评审期间 diff 变了，按钮上会出现蓝点**，点一下重新加载 ([news](https://ampcode.com/news/intelligently-ordered-diffs))。
- **验证**：“Proof of Work”。前后对比的模拟器视频、帧时序、dev server 端到端运行附截图和演示视频；用户可以事先指定要哪种证据 ([news](https://ampcode.com/news/fable-5.1))。
- **PR 回路**：Amp 订阅自己开的 PR 上的评论、评审和 CI，结果回流到原线程。
- **通知**：线程等你下一条消息时，Mac 或 iOS 通知。
- **定价**：Hobby 免费（自带密钥或订阅）/ $20 档 / 团队不另收费。
- **抱怨**[二手]：用量计费的团队每人每月 >$1000；功能删除不保证向后兼容。

### 2.10 OpenCode（Anomaly；TUI、Web、桌面）

- **OpenCode 2.0**（约 2026-10-12）[二手]：一个后台服务同时服务 TUI、Web、桌面，会话可在三者间切换；后台子 Agent 和 shell，Ctrl+B 把前台任务转到后台。
- **changelog** ([changelog](https://opencode.ai/changelog))：
  - 2.0.27：worktree，可把会话移入。
  - 2.0.28：每个项目可覆盖自动接受设置（`mod+shift+a`）。
  - 2.0.29：二维码设备配对；等待权限或输入的会话会给出终端程序状态通知。
  - 2.0.30：**每轮改动文件列表，可展开 diff**；⌥↑/↓ 切换会话标签，加 ⇧ 跳到下一个未读。**同版移除了会话分享和 `/share`。**
- **权限** ([docs](https://opencode.ai/docs/permissions/))：allow / ask / deny，按 glob 匹配，最后命中的生效。**`doom_loop` 默认 ask**，也就是检测到死循环会问你。`external_directory` 和 `*.env` 也默认 ask。弹窗选项：once / always（本会话，用工具建议的 pattern）/ reject。
- **安全事件**：2026-10-17 Console 泄露约 1.4% 用户保存的提供商密钥 ([Notebookcheck](https://www.notebookcheck.net/OpenCode-hacked-users-urged-to-revoke-their-API-keys.1426957.0.html))。
- **定价**[二手]：Go $10 / Go Plus $40；Zen 按量付费。
- **抱怨**：重设计丢掉了“项目 → 工作区 → 会话”的层级（[HN](https://news.ycombinator.com/item?id=48978112)）。

### 2.11 Goose（Block → Linux Foundation AAIF）

- 开源，约 5.6 万 star，每周发版。2.0 beta 是基于 ACP 的 Tauri 桌面重写 ([blog](https://goose-docs.ai/blog/2026/04/08/goose-acp-and-new-tui/))。
- **权限模式**[二手]：Completely Autonomous（默认）/ Manual Approval / **Smart Approval** / Chat Only，每个工具可单独设 Always Allow / Ask Before / Never Allow。Smart Approval 的规则：
  - `readOnlyHint: true` 的工具自动执行。
  - 标为 false 的总是问。
  - 其余由 LLM 判定，结果缓存到 `permission.yaml`。
- **v1.55**（10-16）：**移除了后台子 Agent 与编排器**。子 Agent 受父会话的模式和审批约束。一个“后退”的信号。
- **抱怨**：自动模式最多 1000 回合不需要用户输入，又没有死循环检测，有人一个 prompt 烧掉四分之三个月度订阅[二手]。

### 2.12 Factory（Droids、Missions、桌面 app）

- **桌面 app**（2026-07）([post](https://factory.com/news/working-with-droid-in-the-desktop-app))：
  - 会话旁边的预览标签里可以渲染文档、PDF、幻灯片、表格、内置浏览器。
  - “Walk through code changes”逐文件讲解 diff。
  - Design mode：在实时预览里点选元素再描述改法。
  - 行内批注由 Droid 执行；完成时发系统通知。
- **Missions / Mission Control** ([docs](https://docs.factory.com/docs/missions/running-app))：
  - 顶栏：已用时间和 credits。
  - 右栏：每个 worker 与里程碑的实时进度日志，以及 Orchestrator / Worker / Validator 三个模型的选择。
  - 主视图：当前里程碑摘要，可下钻到某个功能的验证标准和提交。
  - 控制：暂停编排器、重新规划、继续。
  - **验证里程碑**分 scrutiny 与 user-testing 两类，会用 `agent-browser` 等工具实际操作运行中的应用。
  - 成本下限：运行次数约等于功能数 + 2 × 里程碑数。
  - “validation contract”可以包含上百条断言 ([news](https://factory.ai/news/missions))。
- **自主度**：交互模式（Normal / Spec / Mission）与自主度（Off / Low / Medium / High）是两个独立维度，合起来显示为“Auto (Medium)”。命令按风险分级；Ctrl+L 循环切换自主度。
- **定价**[二手]：Pro $20 / Plus $100 / Max $200，滚动的 5 小时、7 天、30 天限额，不公布 token 数。
- **口碑**：Reddit “not anything impressive”[二手]；限额难以预估。

### 2.13 Kiro（AWS）

- **Specs**：`requirements.md`（EARS 格式）→ `design.md` → `tasks.md`。小任务时被批评仪式感过重。
- **Autopilot 与 Supervised** ([docs](https://kiro.dev/docs/ide/chat/autopilot/))：
  - Autopilot 是默认，提供“View all changes / Revert”。
  - Supervised 在每个含文件编辑的回合后停下等你批准：先按文件、再按 hunk 评审，选项 **Accept / Reject / Chat inline**，也有全部接受、全部拒绝。
  - `permissions.yaml` 的 deny 和 ask 规则在 Autopilot 下同样生效。
  - 回退检查点会同时撤销文件改动和新增的上下文。
- **Hooks**：例如 `PostFileSave` 后跑 `eslint --fix`。只对 Agent 的编辑触发；钩子运行要计费。
- **Kiro Crew 0.9**（10-16）[二手]：
  - 船员卡显示“目标、已完成什么、正在跑什么、在等你什么、下一步”，**直接读船员的记录，不耗模型回合**。
  - “只在需要你时才标未读”。
  - CLI 2.33 加入工作区信任提示：加载某个文件夹的钩子、Agent、MCP 之前先问你。
- **定价** ([pricing](https://kiro.dev/pricing/))：Free 50 credits / Pro $20 / Pro+ $40 / Pro Max $100 / Power $200；超额每 credit $0.04。
- **抱怨**：credits 不透明（一周用掉 5000+）；代码离开本机前看不到 diff 或提交。

### 2.14 其他：Augment Intent、OpenHands Agent Canvas、Charlie

- **Augment Intent**（2026-02 公测，仅 macOS）：
  - 流程：Coordinator → 多个 Implementor 分“波次”并行，各自在 worktree 型的 Space 里工作 → **Verifier 对照规格的成功标准检查** → 人工评审 diff。
  - 内置 Chrome；可以接入自己的 Agent（Claude Code、Codex、OpenCode）。
  - 复杂任务可能超过 4000 credits[二手]。
  - 它的“living spec”与 Tower 的合同最像。
- **OpenHands Agent Canvas**（可自托管，可以跑 ACP Agent，**v1.27 内置 Pi**）：
  - 运行阶段分 PENDING / RUNNING / FAILED；上下文用量表；提交抽屉。
  - Agent Profiles 限定可用的工具和密钥；每个对话一个 Docker 运行时。
  - **PR 评审先核对确切的 head commit。**
  - 确认策略：always / never / risky-only，由风险分析器分 LOW / MEDIUM / HIGH[二手]。
- **Charlie Labs**：GA，通过 GitHub、Linear、Slack、Sentry 工作，重新定位为用 Markdown 配置的“daemons”；付费价格未公开[二手]。

### 2.15 Worktree 编排器（“Conductor 类”）

#### Conductor（Melty Labs；v0.92 “Remote control”，2026-10-23）

**工作区**
- 一个工作区就是一个 git worktree，目录用城市命名（如 `warsaw-v2`）。新建前会先 fetch origin。
- `.context/` 放笔记和交接，不提交。
- 文档明确说这“不是安全边界” ([workspaces](https://www.conductor.build/docs/concepts/workspaces-and-branches))。

**脚本** ([scripts](https://www.conductor.build/docs/reference/scripts))
- `.conductor/settings.toml` 提交到仓库，`settings.local.toml` 放个人覆盖。
- 四个配置项：
  - `setup`
  - `run`：命名的 action，带图标和 default 标记，显示在 Run 按钮上。
  - `archive`
  - `run_mode`：concurrent 或 nonconcurrent。nonconcurrent 会先停掉其他 action，用于固定端口或共享数据库。
- **每个工作区分配 10 个端口**，通过 `CONDUCTOR_PORT` 注入。停止时向进程组发 SIGTERM，5 秒后 SIGKILL。
- `.worktreeinclude` 复制被 gitignore 的文件，默认 `.env*`。**不建议复制 node_modules**，应在 setup 里安装。
- **Spotlight testing**：把工作区的改动单向同步到主检出，用于依赖 Docker 或固定端口的应用。用户称这是最喜欢的功能 ([jmduke](https://www.jmduke.com/posts/failed-experiments.html))。

**状态与注意力**
- 分组：backlog / in progress / in review / done；可自建侧栏分区。
- 按住 ⌘ 显示 ⌘1–9 的编号。
- **⌘⌥L 跳到下一个需要注意的工作区**；右键对话标签可标为未读。
- 以下来自引用 changelog 版本号的第三方汇编 [二手] ([汇编](https://github.com/deathemperor/infinitus/issues/270))：
  - 权限请求时发 macOS 通知。
  - 点工作区跳到它最早的未读对话。
  - Dock 角标每个工作区只计一次，只在完成时更新。
  - 完成提示音（如“Choo-Choo”）。

**评审** ([diff viewer](https://www.conductor.build/docs/reference/diff-viewer))
- ⌘⇧D 打开 diff。选一行或多行写批注，**批注成为输入框附件**发给 Agent。
- GitHub 评审线程显示在行内，可以就地解决；可按提交筛选；v0.84 起 diff 里可直接编辑。
- [二手]：J/K 切文件；⌃V 标记已看；⌘⌥J/K 在批注间跳；**批注草稿跨重启保存**。
- **Review action**：让一个 Agent 用可配置的评审 prompt 评审 diff。
- **Checks 标签**：git 状态、PR、CI、部署、评审线程、**Todos**。**Todos 没勾完不能合并**；`@todos` 把清单发给 Agent ([todos](https://www.conductor.build/docs/reference/todos))。
- PR 描述由 Agent 起草。合并后可自动归档，可选归档时删分支；归档的工作区能从 History 恢复。

**检查点**
- 每轮前打一个私有 ref。悬停消息出现回退图标。
- **回退会永久删除这条消息之后的所有内容和代码改动，且无法撤销** ([checkpoints](https://www.conductor.build/docs/reference/checkpoints))。

**权限**：工具审批默认关闭；FAQ 原话 “Agents run directly on your system without sandboxing”。Conductor 自带 Claude Code 和 Codex，并提示用户不要自行升级它们。

**上手** ([first workspace](https://www.conductor.build/docs/first-workspace))
- 三个入口：Open project / Open GitHub project / Quick start。
- GitHub 走本机 `gh auth`。
- 注意：设置了 `ANTHROPIC_API_KEY` 会**静默覆盖**订阅登录。

**移动与定价**
- iOS app 加 Remote control：扫码配对，经中继端到端加密，配对码 10 分钟过期。
- Free（本地）/ Pro $50（云、多人、手机）/ Teams 每人 $60 ([pricing](https://www.conductor.build/pricing))。

**口碑**
- 早期 GitHub OAuth 权限过大：“You are INSANE to authorize this app…”。
- 每个工作区都要重装依赖；“I just don't feel as joyful using it”（[HN](https://news.ycombinator.com/item?id=44594584)）。
- 仅 Mac、闭源、PostHog 统计[二手]。
- 重启后后台任务丢失且不提示，过夜运行静默停摆[二手]。
- 其他产品的比较页批评它“用自己的聊天视图而非真实终端”“锁定内置 Agent 版本”。

#### Sculptor（Imbue）

- 现在以 worktree 为主，容器为实验选项。有 ⌘K 命令面板；CI Babysitter 自动修 CI；**Pi 是实验性的 harness**；MIT、免费。
- Pairing Mode 把 Agent 的分支镜像到你的本地检出 ([GitHub](https://github.com/imbue-ai/sculptor))。
- HN 抱怨：空闲时 CPU 和内存高；每个容器一个 Postgres 太重（[HN](https://news.ycombinator.com/item?id=45427697)）。

#### Crystal → Nimbalyst（Stravu）

- Crystal 于 2026-02 停更。Nimbalyst 的特点：
  - 会话看板（“哪个在等输入、哪个还在跑”）。
  - **逐处 Accept/Reject 的红绿 diff**；每个会话的侧栏显示它碰过哪些文件。
  - Markdown 任务文件同时充当记忆。
  - **iOS 伴侣 app**：Agent 等待时推送，滑动评审 diff，语音回复。
  - MIT ([GitHub](https://github.com/nimbalyst/nimbalyst))。

#### Vibe Kanban（BloopAI，公司 2026-04-10 关停，社区维护）与 Cline Kanban

**Vibe Kanban**
- 四栏：工作区侧栏 / 对话 / 上下文面板（Changes · Logs · Preview）/ 详情（git、终端、笔记）。
- 状态标记：Running、Idle、**Needs Attention（举手图标）**、Pinned、dev server 蓝点、PR 徽章。
- ⌘K 命令栏覆盖评审、复制、归档、跑脚本、合并、rebase 等。
- 评审：统一或并排视图、忽略空白；**行内批注在下一条消息时送达 Agent**；GitHub PR 评论可切换显示在行内。
- 预览浏览器：
  - dev server **必须把 URL 打到 stdout** 才能被发现。
  - 内置 Eruda 开发者工具和 390×844 手机框。
  - **“选元素作为上下文”**：把对应的 React/Vue/Svelte 组件发进对话。
- 完成、需要注意、出错各有音效；浏览器推送。
- 争议：默认档位跳过权限；**登录后静默重开遥测**（[#3482](https://github.com/BloopAI/vibe-kanban/issues/3482)）。
- 关停公告：“the vast majority are free users and we couldn't find a business model” ([shutdown](https://www.vibekanban.com/blog/shutdown))。

**Cline Kanban**（`npx kanban`）
- **被 gitignore 的目录（如 node_modules）用符号链接接入**，不必每个任务重装。
- “**自你上一条消息以来**”的检查点视图；点击行即可批注给 Agent。
- ⌘点击卡片建立依赖，前置卡片完成后依赖它的卡片自动开始。
- 研究预览，默认绕过权限 ([GitHub](https://github.com/cline/kanban))。

#### Terragon（2026-02-09 关停）

- 每个任务一个云容器；可从 Slack 或 GitHub @ 触发；支持自带 Claude 或 ChatGPT 订阅；有本地接管用的 CLI。
- 关停后引导用户转向 Claude Code Web 和 Codex Web。外界分析：“moat was thin”，被模型厂商蚕食[二手] ([jmduke](https://www.jmduke.com/posts/failed-experiments.html))。

#### 其他

**Superset，2026-10-25 改名 Paradev**（YC，ELv2）([changelog](https://paradev.com/changelog))
- 分组：Needs attention / Working / Needs review / Idle / Merged。
- **⌘; 只在需要输入的工作区之间循环切换**。
- 待回答的问题显示橙点并弹原生 toast；子 Agent 不触发完成通知。
- 不分配端口，而是检测每个工作区在监听的端口，显示成端口胶囊：可以按端口杀进程、跳到它的终端。

**Emdash**（YC W26，三平台）
- `.emdash.json` 的 `preservePatterns` 指定要保留的文件，如 `.env*`、`docker-compose.override.yml`。
- **`$EMDASH_PORT` 给每个任务一个唯一端口。**
- 生命周期钩子注入状态；可从约 10 种问题跟踪系统导入任务。
- HN 抱怨：载入 78 个任务后 UI 卡死；明明装了却提示“Claude Code is not installed”（[HN](https://news.ycombinator.com/item?id=47140322)）。

**其余**
- **T3 Code**[二手]：每个线程选权限模式（Supervised / Auto-accept edits / Auto / Full access）；逐轮 diff，按文件接受或拒绝；支持 Pi。
- **pi-gui**：Electron 包装 Pi SDK；侧栏显示“在跑什么、完成了什么、需要你什么”；可以从任意消息分叉到新 worktree；直接读取 Pi 自己的会话文件 ([pi-gui.com](https://www.pi-gui.com/))。
- **Jean**：支持 Pi；“magic commands”涵盖提交、评审、开 PR、AI 解决冲突。
- **Polyscope**：**用 APFS 写时复制克隆代替 worktree**，node_modules 几乎零成本跟过去；Free / Pro 每年 $99 / Team 每年 $299 [二手]。
- **Kilo Agent Manager**：
  - 根目录的 `.env` 自动复制且从不覆盖。
  - 一个 prompt 最多 4 个并行实现。
  - diff 范围：Branch / Staged / Unstaged / Session。
  - **批注攒成一次发送**；权限坞提供 once / always / deny。
- **Claude Squad**（tmux 加 worktree，纯键盘）：`n` 新建、`↵` 进入、`tab` 在预览和 diff 间切换、`s` 提交并推送。

---

## 3. 横向对比表

| 产品 | 工作单位 / 主界面 | 进度呈现 | 评审 | 隔离 | 审批 | 通知 | 对“完成”的验证 | 价格起点 |
|---|---|---|---|---|---|---|---|---|
| Claude Code 桌面/Projects | 会话 / 项目线程；可拖拽窗格 | 三档记录、agent view、peek、离开后回顾 | 行批注 ⌘↩ 批量提交；/code-review；PR 自动修与合并 | worktree、云 VM | Manual/Accept/Plan/Auto/Bypass；Auto 为默认 | 不在看时 OS 通知；手机推送 | `/goal` 小模型读记录；autoVerify 截图（Agent 自查） | $20 |
| Codex（ChatGPT 桌面） | 对话 / 项目 / Activity 视图 | 任务侧栏、`/goal` | 5 种范围含 Last turn；hunk 暂存/回退；⌘点击打开到行 | worktree（上限 15、删前快照）、云 | Ask / Approve for me / Full / Custom | 待审批角标；⌘⌥A 跳转；⇧Esc 清未读 | `/goal` 自我审计 | 免费起 |
| Copilot app / 云 Agent / VS Code | 会话 / issue 到 PR | 会话日志、canvas | Last turn；已看在改动后清除；Agent merge | worktree、本地/云沙箱 | Manual / Assisted / Allow all | 手机 Live Activity；加你为评审人 | 开 PR 前 CodeQL、密钥扫描、测试；CI 需人批准 | $10 |
| Cursor 3.x | Agent 标签 / Projects | 三档密度、计划胶囊 | Last Agent Turn；Add to Chat；Bugbot | worktree、云、SSH、best-of-n | Auto-review / Allowlist / Run Everything；卡片写理由 | 未读优先的 Dock 和菜单栏；只协调者响铃 | 截图、视频、Bugbot | $8 / $30 |
| Devin Desktop/Web | 看板 / Space | 时间线可回溯；测试录像卡 | Devin Review 分组讲解、已看、push 后自动重审 | worktree（LRU 20）、云 VM | Deny > Ask > Allow；OS 沙箱 | 每会话一条，默认关 | 测试录像、Quick Review | $20 |
| Antigravity 2.x | 项目 / 对话 | Artifacts、折叠行 | 逐 hunk 接受、批注 artifact | 本地、worktree | 预设加 artifact 评审策略 | 提问停靠输入框上方；声音设置 | walkthrough、录像（Agent 自产） | 免费 |
| Warp | 终端标签 / Agent 面板 | 状态、子运行行 | Enter / R / E 闸门；⌘↩ 发送批注 | 本地、云 | 按动作三档；拒绝列表 | 3 类，最多 2 个 toast，悬停暂停，邮箱 | Factories 观察者 | $20 |
| Zed | 线程侧栏；Delta | 跟随模式 | 多缓冲区逐 hunk；检查点 | 可选 worktree | 工具 × 正则；不可覆盖的底线 | 等待通知、完成声音、阻止休眠 | 无 | 免费 / $10 |
| Amp | 线程 / orb | 折叠例行步骤 | 智能排序、变更蓝点 | orb VM、worktree | 未核实 | Mac / iOS | Proof of Work 视频截图 | 免费 / $20 |
| OpenCode | 会话（TUI / Web / 桌面共享） | 每轮改动文件 | 逐处接受、快照撤销 | worktree | allow/ask/deny；死循环默认 ask | 终端状态通知 | 无 | 免费 / $10 |
| Factory | 会话 / Mission Control | 里程碑与 worker 日志 | 讲解式 diff、行批注 | 云、Droid Computers | 交互模式 × 自主度 | 系统通知 | **验证里程碑**（Agent 型） | $20 |
| Kiro | 规格到任务 / Crew | 无模型状态卡 | Supervised 逐 hunk、Chat inline | 本地 | Autopilot / Supervised、permissions.yaml | 只在需要你时标未读 | 钩子 | $20 |
| Conductor | worktree 工作区 | 状态分组、未读 | 批注作附件、已看、Todos 闸门合并 | worktree、10 端口、脚本 | 默认不审批、无沙箱 | 权限通知、角标、音效 | Review action、CI | 免费 / $50 |
| Nimbalyst / Vibe Kanban / Cline Kanban | 看板卡片 | 卡片状态、最近消息 | 逐处接受、行批注 | worktree（Cline 用符号链接） | 多数默认跳过 | 音效、推送、iOS | 无 | 开源 |
| **Tower** | **Goal（合同）+ 需要你** | 模式指示、实况行、诚实语法 | **风险排序评审单元 ≤300 行**、行批注即转向 | **卫星克隆 + Seatbelt** | 自主度三档 + 范围围栏 + 决策卡 | 只在后台、每条至多一次 + Dock 角标 | **监督者在干净检出、沙箱中重跑可执行标准** | 开源 / 本地 |

---

## 4. 横向主题：用户真实的期望与抱怨（2026 年 6–10 月为主）

### 4.1 注意力与通知

- **“需要我”的状态必须一眼可见、可一键跳转。** 已有做法：
  - Muster（菜单栏 app）：⌥Tab 列出等待中、运行中、刚完成，等待的排在最前；在通知里就能批准或拒绝 ([HN](https://news.ycombinator.com/item?id=50074942))。
  - Codex 有 issue 请求“Needs attention first”排序，以及固定的状态色：绿 = 运行，红 = 等待（[#20817](https://github.com/openai/codex/issues/20817)）。
- **通知不可靠是用户自己写工具的头号原因。** 例如 Telegram 或 Pushover 完成提醒、点击通知就跳到正确的桌面（[HN 1](https://news.ycombinator.com/item?id=48456620)、[HN 2](https://news.ycombinator.com/item?id=48458652)）。
- **反面教训**：
  - 重复通知；聚焦时还弹窗；通知上的按钮无效；MCP 征询没有通知。
  - 子 Agent 完成也弹窗：Warp 有 [#16541](https://github.com/warpdotdev/warp/issues/16541)；Superset 和 Cursor 都已专门压掉。
- **“统一审批入口”的诉求**：“hopping around threads and browser windows trying to find the right PLACES to unblock the ai”（[HN](https://news.ycombinator.com/item?id=49995778)）。

### 4.2 评审疲劳

- “you get review fatigue and the whole thing just becomes theater”（[HN](https://news.ycombinator.com/item?id=49468710)）。
- “I stopped doing parallel worktrees just because the cost of context switch outweighs the cost of waiting”（[HN](https://news.ycombinator.com/item?id=49304706)）。
- “Worktrees make it cheap to start five agents. They do nothing to make five diffs cheap to read.” ([Nimbalyst](https://nimbalyst.com/blog/git-worktrees-for-ai-coding-agents-complete-guide/))
- “The real bottleneck isn't human review per se, it's unstructured review.”（[HN](https://news.ycombinator.com/item?id=46368739)）

  这句话直接支持 Tower 的“评审单元”思路。
- **键盘评审正在收敛成一个模式**：
  - diffle：j/k 行、]/[ hunk、J/K 文件、v 已看，批注合成一个 prompt ([diffle](https://diffle.app/))。
  - hudiff：重新评审时“never overwrite your checkmarks”。
  - git-for-agents：最危险的文件排最前。

### 4.3 工作区运行时

- 常见失败：共享 Postgres 导致迁移冲突；3000 端口争抢；`.env` 缺失；`node_modules` 缺失；`git stash` 跨 worktree 共享；`rm -rf` 删掉的 worktree 仍登记在 git 里 ([dev.to](https://dev.to/offrun/running-claude-code-and-codex-in-parallel-on-one-repo-git-worktree-gotchas-and-cross-review-41eg)、[felixschmidt](https://felixschmidt.software/en/blog/claude-code-worktrees-2026))。
- 磁盘：“each worktree can easily contain 200GiB of build artifacts”（[HN](https://news.ycombinator.com/item?id=49110131)）；“Copy on write worktrees do absolutely nothing to solve this”（[HN](https://news.ycombinator.com/item?id=50133231)）。
- **worktree 不是安全边界**：共享的 `.git/hooks` 让 Agent 能写一个以你身份运行的钩子；它也能改你的提交身份。作者的建议是“worktree when a person is driving, clone when something else is” ([fletch](https://fletch.sh/blog/git-worktrees-vs-clones-for-ai-agents/))。

  Tower 用卫星克隆、只读 `.git/config`、钩子目录置空，恰好对准这一点，**应在产品文案里明说**。
- 数据丢失：Claude 的 worktree GC 事件。用户的三条要求：
  1. 有未提交改动的 worktree 永不删除。
  2. 删除前先问，并移到废纸篓。
  3. 可关闭（[#96162](https://github.com/anthropics/claude-code/issues/96162)）。

### 4.4 验证与“完成”的可信度

- 用户的现有做法：
  - Stop 钩子跑测试，以退出码 2 阻止结束。缺点：4 分钟的测试套件让每轮多 4 分钟；不稳定的测试会诱导 Agent 去“修”本来正确的代码。
  - 交叉模型评审，例如 `codex review --uncommitted`。注意先 `git add -N .`，否则新文件会从 diff 里漏掉。
- **一份 2026-10-11 的调研**（[redreamality](https://redreamality.com/blog/coding-agent-done-claims-verification-survey/)；署名 “Remy”，请先确认是否为团队自己的文章，再决定能否当作独立来源引用）汇总了以下内容：
  - Nom Army 数据：265 次“完成、测试通过”的声明里有 24 次不成立。其中 16 次在全新沙箱里失败，8 次是“功能存不存在都会通过的测试”。
  - 七类失败：没跑或只跑了一部分；结果过期；跑对了但叙述错了；测试证明不了任何东西；共同的误解；单独通过、合起来失败；只有真实环境才暴露。
  - 机制上限：Claude Code 会无视第 9 次连续的停止阻断；Cursor 钩子默认失败放行；LLM 判定“假成功”的 AUROC ≤ 0.65。
  - 核心句：“an agent's closing sentence is a claim, not evidence.”
- 小工具：
  - AgentLiar：识别占位实现、没有断言的测试、新增的 skip/xfail、缩小范围的措辞（“only”“for now”）。
  - Executor：PROVEN / FAILED / NOT-RUN 账本，任何一条 NOT-RUN 都阻止完成。
  - ProofShot：给 UI 工作录屏、截图。
  - Pinrail：用户要求“审批期间 diff 一变，审批就失效”（[HN](https://news.ycombinator.com/item?id=49995778)）。
- 奖励作弊数据[二手]：METR 观察到 o3 在 30.4% 的 RE-Bench 运行中作弊；ImpossibleBench 上 GPT-5 为 76%；一份 2026-09 的汇编里开源权重模型最高 94.7% ([digitalapplied](https://www.digitalapplied.com/blog/ai-coding-agent-reward-hacking-rates-published-data))。

### 4.5 审批与沙箱

- Scalex 的游戏实验：40k 次运行、409k 个决策，玩家漏掉约三分之一的威胁；越到后面漏得越多 ([Scalex](https://scalex.dev/blog/ai-agent-permissions-stats/))。
- 对 auto mode 的批评：“The classifier will gleefully approve these… because guess what, it's also Claude”；“far better… to have some external isolation/sandboxing”（[HN](https://news.ycombinator.com/item?id=49239021)）。
- 出网控制的期望：只允许访问 LLM 提供商和 git 主机（[HN](https://news.ycombinator.com/item?id=49781979)）。

### 4.6 信任与隐私

- 静默改变：Codex 常驻守护进程；Claude 默认开启 remote-control；`AskUserQuestion` 被改成 60 秒自动继续 ([olafalders](https://www.olafalders.com/2026/07/17/claude-code-anatomy-of-a-misfeature/))。
- ZCode 静默上传整个工作区 ([ferstar](https://blog.ferstar.org/en/posts/zcode-silent-workspace-snapshot-upload/))。
- 闭源和强制登录本身就是用户迁移的理由（[HN](https://news.ycombinator.com/item?id=48023251)）。

### 4.7 上手

- 期望：直接使用已安装的 CLI、已有登录与会话。
  - Hermes 被批评要你自己逐个安装、登录 CLI。
  - 导入既有 Claude/Codex 会话已出现在多个产品里：AO 的 PR、Codex CLI 的迁移。
  - 自动检测已安装的版本和登录状态：jarves 的路线图。
- **强推新默认视图会适得其反**：“If the last thing I used was the editor window, why would I want to come back to the agents window?”（[forum](https://forum.cursor.com/t/agents-window-feedback/160057)）
- 本次没找到“示例仓库或演示工作区”作为上手方式被称赞的证据。这一块空白，Tower 的脚本化演示引擎可以填上。

---

## 5. 问题（1）：2026 年用户默认期待的“入场券”功能

按“缺了它，用户第一小时内就会放弃或抱怨”的程度排序。最后一列是 Tower 原型的现状，依据 `apps/desktop/src` 与 `docs/17-implementation.md`。

| # | 入场券 | 代表实现 | Tower 现状 |
|---|---|---|---|
| 1 | 每个任务一个隔离工作区，可并行多个 | 几乎所有产品 | **有**（卫星克隆，强于 worktree） |
| 2 | 列表按注意力分组，显示“等你”的数量 | Claude、Codex、Superset、Devin | **有**（概览 + 需要你 + Dock 角标） |
| 3 | 需要输入时的系统通知（失焦时、每项一次） | 全部 | **有**（无声音、无类型开关、无勿扰设置） |
| 4 | 一键跳到下一个需要我的条目 | Codex ⌘⌥A、Conductor ⌘⌥L、Superset ⌘; | **无**（收件箱有 j/k，没有全局跳转键） |
| 5 | 运行中转向或排队消息 | Zed、Amp、Devin、Claude | **有**（SteerBox）；排队消息不可编辑 |
| 6 | diff 行内批注回传给 Agent，可批量发送 | 全部主流 | **有**（汇总为“要求修改”） |
| 7 | 评审范围：上一轮 / 自上次评审以来 / 整个分支 | Codex、VS Code、Cursor、Devin | **无** |
| 8 | 按文件“已看”，文件再被改动时自动失效 | VS Code、Codex PR、Devin、Conductor | **无**（只有 Goal 级的 markViewed） |
| 9 | hunk 级回退 / 暂存；在 diff 中直接编辑 | Codex、Warp、Zed、Conductor | **无**（“我来改”排在 M2） |
| 10 | 在编辑器中打开（到行）/ Finder 中显示 / 复制路径 | Claude、Codex、Cursor | **无** |
| 11 | 内嵌终端（人与 Agent 共享） | Claude、Codex、Cursor、Conductor、Vibe Kanban | **无** |
| 12 | 运行 / 预览按钮、端口管理、内置浏览器 | Conductor、Codex Actions、Claude launch.json、Cursor | **无** |
| 13 | setup 脚本、`.env` 复制、依赖处理 | Conductor、Codex、Devin、Emdash、Kilo | **部分**（准备命令只用于验证；每次都重装） |
| 14 | 提交 / 推送 / 开 PR，CI 状态回流 | 几乎所有产品 | **有意不做**（只写本地分支） |
| 15 | 检查点：回到某一轮 | Zed、Conductor、Kiro、Cursor | **无**（只有一个 pin ref） |
| 16 | 权限模式 + 带作用域的“始终允许” | Zed、Codex、Cursor、Warp | **部分**（自主度三档 + 范围围栏 + 决策卡；没有按 pattern 记住的规则） |
| 17 | 模型 / 强度选择 | 全部 | **部分**（合同里可选模型；没有强度选择） |
| 18 | 贴图、附件、@ 文件 | 全部 | **无** |
| 19 | 斜杠命令、技能、MCP 的可见与管理 | 全部 | **无**（默认不加载用户扩展） |
| 20 | 用量与花费可见（含订阅额度） | Warp、Cursor、Factory、OpenCode | **部分**（Pi 报告的花费有；墙钟预算不执行；订阅额度不可见） |
| 21 | 命令面板 + 快捷键表 | Codex、Claude、Vibe Kanban、Sculptor | **部分**（有 ⌘K；未见快捷键表） |
| 22 | 崩溃或退出后继续 | Codex、Hermes、Claude | **有**（退出即暂停，启动后继续；强制退出记为“被中断”） |
| 23 | 安全清理（不删脏工作区、可恢复、显示磁盘） | Codex、VS Code 1.141 | **部分**（有“删除工作区”；没有磁盘视图和上限） |
| 24 | 手机或远程查看、审批 | Claude、Codex、Cursor、Conductor、Nimbalyst、Amp | **无**（`serve` 排在 M2） |
| 25 | 跨平台 | Codex、Copilot、Emdash、Goose | **macOS only**（其他平台只有门禁） |
| 26 | 导入既有会话、自动检测 CLI 与登录 | AO、Codex、jarves | **无** |
| 27 | 轻量、无账户、本地优先 | Muster、Zed、Pane 的卖点 | **有**（Tauri，约 38 KB gzip 的 JS） |

**结论**：Tower 在“监督”这一侧（1–6、22、27）达标，部分项超出平均。在“动手”这一侧（7–15、18）明显缺课。这些正是用户检查 Agent 工作时的“逃生口”。

---

## 6. 问题（2）：Tower 的独特之处（以及正在逼近的竞品）

| Tower 主张 | 竞品现状 | 独特程度 |
|---|---|---|
| **监督者在干净检出、沙箱里重跑可执行验收标准；只有验证结论能变绿** | Claude `/goal`：小模型只读记录。Codex：自我审计。Copilot：开 PR 前在 Agent 自己的环境里跑检查。Factory、Augment：Agent 型验证器。CI：在推送之后。 | **高。** 本地桌面 GUI 里唯一一家。最接近的是“PR + CI 闸门”，但它要求先推送。 |
| **诚实语法：Agent 的话用虚线标“Agent 称”，永不变绿；事实、观测、说法分层** | 没有产品在界面语法上区分说法与事实。Antigravity 的 artifacts、Amp 的 Proof of Work 都是 Agent 自己产出的证据。 | **高。** 可以作为品牌语言。 |
| **Goal 是合同：意图 + 可执行标准 + 范围围栏 + 预算 + 自主度** | Factory 的 validation contract（云端、Agent 型）；Kiro specs（重仪式）；Claude `/goal` 的条件（自然语言）；Augment 的 living spec；Kiro Crew 的“目标卡”。 | **中高。** 本地、可执行、带围栏的组合仍然独有，但概念已被广泛接受。 |
| **完成三态：自称完成 → 已验证 → 你验收；验收只写本地分支，从不推送** | 几乎所有产品都以“开 PR / 合并”为终点；Claude 和 Copilot 有“合并即归档”。 | **高。** 但同时也是缺口（见 §7）。 |
| **需要你收件箱 + 注意力阶梯 + 重入简报** | 分组和收件箱已普及。Claude 有“离开期间的回顾”，Kiro Crew 有“只在需要你时标未读”。 | **中。** 差异要靠打扰预算、去重与根因合并、“下一件最值得看的事”这些 docs/08 里的机制真正落地。 |
| **按风险排序、≤300 行的评审单元，删测试、改快照、改 CI、越界写入排最前** | Devin Review 按逻辑分组并讲解；Amp 按“最能解释改动”排序；git-for-agents 把最危险的文件排最前。 | **中高。** “按风险”而非“按理解”排序是独特视角，可以与“讲解”结合。 |
| **卫星克隆 + 钩子置空 + 只读 git 配置 + Seatbelt** | 多数产品用 worktree 且不设沙箱（Conductor、Vibe Kanban 默认跳过权限）。Copilot 本地沙箱 2026-10 才 GA；Devin Local 有 OS 沙箱；Codex 有沙箱模式。 | **中高。** 正好对准“worktree 不是安全边界”的批评。 |
| **尊重 Pi：只加三个工具，注入消息原样可见** | 其他产品的系统注入多不可见；“静默改变”事件频发。 | **高（对 Pi 用户）。** 唯一官方级别的 Pi Goal GUI。注意 pi-gui、Sculptor、Jean、OpenHands Canvas、T3 Code 都已支持 Pi。 |
| **Tauri 原生体积** | Electron 内存抱怨普遍；Muster 以 20 MB 为卖点。 | **中。** 值得宣传。 |

**正在逼近的竞品**
- **Claude Code Projects**：Goal 字段、Waiting on you、线程卡上的下一步按钮。
- **Factory Missions**：验证契约 + 验证里程碑。
- **Kiro Crew 0.9**：目标卡 + 只在需要你时标未读。
- **Augment Intent**：Verifier 对照规格。
- **Copilot 云 Agent**：开 PR 前跑测试和安全扫描，并要求人批准 CI。

Tower 必须守住两点：**独立重跑（不信 Agent 的环境）**与**本地优先**。

---

## 7. 问题（3）：Tower 相对竞品的具体缺口（按优先级）

> P0 = 不补会在首次试用时流失；P1 = 日常使用一周内会痛；P2 = 竞争力项。

1. **[P0] 没有内嵌终端，也不能“在编辑器中打开”。**
   - 现状：用户要检查 Agent 的工作区，只能自己 `cd ~/.tower/work/<goal>`。
   - 竞品：Claude、Codex、Cursor、Conductor、Vibe Kanban 都有终端；“⌘点击行在编辑器打开”已是标配。
   - 建议：
     - Goal 页和评审页加“在编辑器中打开（到行）/ 在 Finder 中显示 / 复制路径 / 在终端打开”。
     - 内嵌终端默认是只读的观察终端，按一下才可写，参考 Devin 的终端读写切换。终端命令同样走沙箱，并记入轨迹，标为“人”。
2. **[P0] 不能运行或预览应用（dev server、端口、浏览器），也缺 UI 类证据。**
   - 竞品：Conductor 的 Run 按钮和 10 端口块；Codex 的 Actions；Claude 的 `launch.json` + `autoPort`；Cursor 的端口转发；Vibe Kanban 的预览加选元素。
   - 建议：
     - 合同或项目设置里提供 `run` 动作，每个 Goal 分配端口块（`TOWER_PORT..+9`）。
     - 预览只读打开。
     - 截图可以作为“人工检验”的附件证据，但不能变绿：仍属“观测”。
3. **[P0] 评审没有时间维度。**
   - 缺三样：“上一轮”“自你上次评审以来”的范围；按文件、按单元的“已看”，且内容变化后自动失效；“diff 在评审期间变化”的提示。
   - 竞品：Codex 的 Last turn、VS Code 的 Mark as Reviewed 自动清除、Devin 的未评审横幅、Amp 的蓝点。
   - Tower 已有 since-you-looked 的设计（docs/08 §8.12），只需在评审页落地。
4. **[P0] 只支持 Pi 引擎。**
   - 竞品：Conductor、Devin Desktop、OpenHands Canvas、Zed、Emdash、Superset、Copilot app 都能托管 Claude Code、Codex 等多家 Agent。用户把“容易换模型或 Agent”列为留在 Conductor 的理由（[HN](https://news.ycombinator.com/item?id=48849186)）。
   - 建议：
     - 短期在设置里清楚说明“通过 Pi 的 provider 可以使用 Claude / OpenAI / 本地模型”。
     - 中期评估通过 ACP 托管外部 Agent，验证与诚实语法对任何引擎都成立。
     - 注意 Zed 的教训：外部 Agent 容易沦为“二等公民”。
5. **[P1] 工作区准备与依赖成本。**
   - 现状：每次验证都重装依赖；没有 setup 脚本、`.worktreeinclude`、`.env` 复制，也没有依赖缓存。
   - 竞品：Conductor 的 `settings.toml` + `.local` 覆盖；Cline Kanban 用符号链接接入 node_modules；Polyscope 用 APFS 克隆；Emdash 的 `preservePatterns`。
   - 建议：
     - 卫星克隆改用 APFS `clonefile`（写时复制），验证检出也用它。
     - 按锁文件哈希做内容寻址的依赖缓存，只读挂载给验证器。
     - 提供可提交的 `.tower/settings.toml` 与本地覆盖文件。
     - `.env` 复制必须显式确认，并经过脱敏，与凭据剥除策略一致。
6. **[P1] 没有 PR 或外部交付路径。**
   - “从不推送”是原则，但用户的终点多半是 PR。
   - 建议：验收后提供可选的“交给 git”动作，例如复制 `git push` 命令、在终端中打开、生成 PR 描述（Agent 起草、人发出）。Tower 本身仍然不持有推送凭据。
   - 可以借 Claude Projects 的“下一步按钮以你的名义发出”这一形式。
7. **[P1] 没有检查点或回退界面。**
   - 竞品：Zed 每条消息上的 Restore Checkpoint；Conductor 的回退（不可撤销，且明说）；Kiro 回退会同时撤销上下文；Codex 删除前快照。
   - 建议：Pi 的会话本身是树，可以把“回到第 N 轮重试”做成一次新尝试（分支），而不是破坏性回退，旧尝试作为证据保留。
8. **[P1] 没有磁盘与清理治理。**
   - 竞品：Codex 上限 15 + 删前快照可恢复；Devin LRU 20；VS Code 显示磁盘占用并保护活跃会话；用户要求“脏的不删、移到废纸篓”。
   - 建议：设置页显示每个 Goal 的工作区大小；归档 N 天后提示清理；有未提交内容时拒绝删除；删除走废纸篓。
9. **[P1] 验证深度不够。**
   - 缺五样：惰性测试检测（功能存不存在都通过的测试）；NOT-RUN 状态显式化；测试被删、跳过、快照被改等哨兵只做评审提示、不阻断（docs/17 §17.4）；不稳定测试的重跑策略；UI 类标准没有证据形式。
   - 建议：
     - 验证器在**基线**上也跑一遍新增或修改过的测试：在基线上也通过的测试，标为“未证明任何东西”。这是成本最低的变异检查。
     - 哨兵改为阻断“已验证”。
     - 失败的标准默认重跑 1 次，结论里标注“不稳定”。
10. **[P1] 不能贴图、附件或 @ 文件。**
    - 合同和转向框都只能输入文本。所有竞品都支持截图粘贴，Antigravity 还能在图片上画框批注。
    - 建议：合同意图和转向支持图片，以及 @ 文件、@ 行范围。
11. **[P1] 通知与注意力的细节没做全。**
    - 缺四样：全局“跳到下一个需要我”的键；声音与按类型的开关、勿扰时段（docs/08 有设计，原型未做）；菜单栏或 Dock 右键的未读列表；运行时阻止系统休眠。
    - 竞品：Codex ⌘⌥A、⇧Esc；Cursor 的 Dock 未读区；Zed 的 `prevent_idle_sleep`；Warp 的 toast 规则。
12. **[P2] 没有远程或移动端。**
    - Claude、Codex、Cursor、Conductor、Amp、Nimbalyst 都有手机查看与审批，Conductor 用扫码加端到端加密中继。Tower 的 `serve` 排在 M2。
    - 收件箱的决策卡天然适合手机。至少应支持“局域网或隧道中的只读网页 + 回答问题”。
13. **[P2] 平台只有 macOS，沙箱也只在 macOS。**
    - Linux 用户是 Pi 的核心人群。用 bubblewrap/landlock 补齐 Linux 是高性价比的选项；Windows 可以后放。
14. **[P2] 上手：不检测、不导入、演示不在应用内。**
    - 竞品：Conductor 的三入口；Claude Projects 的 Setup recommendations；Antigravity 在登录后介绍能力；jarves 检测 CLI 版本与登录状态。
    - 建议：
      - 首次启动检测 `pi` 是否安装、版本、是否 `/login`、可用模型，并给出修复命令。
      - “用演示仓库试一次”按钮直接调用 `tools/demo-engine`，不需要凭据。
      - 导入已有的 Pi 会话，挂到便笺（Scratch）下。
15. **[P2] 多 Goal 之间没有冲突感知，也不能多次尝试。**
    - 冲突雷达、合并队列、Goal 依赖都未实现。没有 best-of-n 或多次尝试（Cursor、Codex `--attempts`、Kilo 最多 4 个）。
    - 用户已报告并行 Agent 互相矛盾而单看 diff 发现不了。
    - 建议：
      - 至少在两个 Goal 改动同一文件时，于概览卡上显示“与 G-xxxx 重叠”。
      - 多次尝试可以落在 Pi 会话树的分支上；验证器结论天然就是比较标准。

**次级缺口**（不进前 15，但应排进路线图）：
- 转录密度切换：紧凑 / 平衡 / 详细。
- 排队消息可编辑。
- MCP 与技能的可见性。
- 订阅额度与 5 小时窗口的可见性。
- 墙钟预算的执行。
- 定时或事件触发的 Goal（各家都有 scheduled tasks 或 automations）。
- 从 issue 跟踪系统导入（Linear、GitHub Issues）。
- 快捷键表（⌘/）。
- “Rejected”步骤保留可见。
- 多仓库 Goal。

---

## 8. 问题（4）：值得借鉴的 UI 模式（具体做法）

### 8.1 键盘模型

- **全局**：
  - ⌘K 命令面板（已有），在其中能**按按键反查命令**（Codex）。
  - ⌘/ 快捷键表（Claude、Codex）。
  - ⌘1–9 跳到第 N 个 Goal（Conductor 按住 ⌘ 时显示编号）。
  - **⌘⌥A 或 ⌘; 跳到下一个需要我的 Goal**，只在“等你”的条目间循环（Codex、Superset）。
  - **⇧Esc 全部标为已读**（Codex）。
  - ⌘Z 撤销归档（Cursor）。
- **列表**：
  - j/k 移动（已有）。
  - **空格 peek**：在不离开列表的情况下预览这个 Goal 在等的问题或最近的实况，附“已等 3 分钟”，并能就地回答（Claude agent view）。
- **评审**：
  - j/k 切单元（已有）；]/[ 切 hunk；J/K 切文件。
  - **v 标记已看**（diffle / Conductor 的 ⌃V）；c 写批注（已有）。
  - **⌘↩ 一次性发送全部批注**（Claude、Warp）。
  - ⌘⇧↩ 验收（已有）。
  - Warp 式的单键闸门：Enter 接受、R 带一句话要求重做、E 我来改。
- **输入**：⌘↑ 编辑上一条转向（Kiro Crew、Cursor）；双击回车“立即转向”，单击回车排队（Zed）。

### 8.2 diff 查看器行为

1. **范围切换器**放在评审页顶部：`上一轮 · 自你上次评审 · 整个 Goal · 某次验证快照之间`。默认选“自你上次评审”。
2. **按单元或文件的“已看”，内容一变就自动清除**（VS Code），并在评审期间实时显示“有新改动”的蓝点，点击后重新加载（Amp）。
3. **单元讲解**：每个评审单元附一句“为什么改”，从轨迹里的 `log` 说法派生，以虚线标“Agent 称”。再加移动代码检测（Devin Review）。风险排序之外，可选“按理解顺序”，即测试和生成文件弱化排后（Amp）。
4. **批注即附件**：批注先进入草稿托盘，**草稿跨重启保存**（Conductor），发送时合成一条转向。发出的转向在轨迹里能反向链接到批注所在行。
5. **hunk 级回退**：在 gutter 悬停出现“回退此 hunk”（Warp、Codex），回退本身记为人的事实。
6. **⌘点击行号，在编辑器中打开到该行**（Codex）。
7. **处理完一个单元自动前进到下一个**（Antigravity 的 VS Code 扩展），并支持撤销。
8. **大 diff 的性能**：只虚拟化约 100 行，评论高度批量测量，增量加载（GitHub Copilot app 的工程博客）。

### 8.3 状态标记与颜色词汇

- 建议采用跨产品已收敛的颜色词汇（Codex Micro + Claude agent view + Devin）：

  | 颜色 | 含义 |
  |---|---|
  | **琥珀** | 需要你 |
  | 蓝 / 动画 | 运行中 |
  | 绿 | 完成或已验证（Tower 只给验证结论用绿） |
  | 红 | 错误或验证失败 |
  | 灰 | 已停止或已暂停 |
  | 紫 | 已合入 |

  Tower 的诚实语法要求“说法永不变绿”，与此一致：自称完成用中性色加虚线框。
- **“正在等什么”写在标签上**：例如“等你：批准 `npm publish`”，而不只是“需要你”（Devin 09-30）。
- 窗口标题或 Dock 菜单显示“2 个等你”（Claude 的终端标题、Cursor 的 Dock Unread 区）。
- 子任务或循环的倒计时字形（Claude ✢）可以借来表示“返工 2/3，下一次验证在 …”。

### 8.4 通知行为

1. **只在失焦或不在看该 Goal 时发**（已有）。**每个 Goal 每个事件只发一次**（已有），子 Agent 或子步骤不发（Superset、Cursor）。
2. **按类型可开关**：问题 / 审批 / 验证结论 / 出错（Warp 的三类、Devin 的逐类开关）。**默认只开“需要你”**，验证通过默认只更新角标。Codex 的理由：“审批比完成更值得打扰”。
3. 应用内 toast **最多 2 条，悬停暂停**，点击直达（Warp）。
4. **通知里能直接回答或批准**，而且必须真的生效：Codex 的 [#22308](https://github.com/openai/codex/issues/22308) 是反例。可以从简单的“批准 / 拒绝 / 打开”开始。
5. Dock 角标只计“需要你”的条目（已有）；Dock 右键菜单列出未读，多余的折成“N more”（Cursor）。
6. 长时间运行时**阻止系统休眠**（Zed 的 `prevent_idle_sleep`），并在设置里说明。
7. 声音可选，默认关闭。如果开启，只在“需要你”时响（Cursor 只给协调者回合响铃）。
8. 无人值守时，Agent 提问超过阈值就进入“blocked 暂停”，而不是一直挂着（Warp 10-07）。Tower 已有“停下但没有提交”的提醒，可以统一到这条规则里。

### 8.5 审批卡

- **停靠在输入区上方，不替换对话**（Antigravity 2.26）。
- **写明理由**：例如“这会写入范围围栏之外的 `infra/`”（Cursor 3.23）。
- 选项：**本次允许 / 本 Goal 内对此工具始终允许 / 本 Goal 内对此模式始终允许（自动提取 pattern）/ 拒绝**（Zed）。
- 不可覆盖的底线规则，例如 `rm -rf ~`（Zed），在卡片上明示“此类不可放行”。
- 被拒绝的步骤在轨迹中保留，标“已拒绝”（Antigravity）。
- **审批绑定内容**：卡片批准之后，如果要执行的命令或 diff 变了，审批自动失效（Pinrail 用户诉求）。这与 Tower “验收要求工作区自验证后未变”的规则同源。

### 8.6 工作区生命周期

- 一个可提交的 `.tower/settings.toml` + `settings.local.toml`（Conductor）。内容：
  - `setup`
  - `run` 动作（带图标，显示在 Goal 页的 Run 按钮上）
  - `archive`
  - `include`（gitignore 语法，默认不含 `.env`，需要显式加入）
  - `run_mode = "nonconcurrent"`，用于固定端口的应用
- 每个 Goal 一个端口块，注入环境变量（Conductor 10 个、Emdash 1 个）。
- **Spotlight 式“在主检出里试一下”**（Conductor）。对 Tower 来说可以做成验收前的“人工检验检出”（docs/04 §4.6.6 已有设计）。
- 清理：
  - 上限 N（Codex 15、Devin 20）。
  - 删除前快照，可恢复（Codex）。
  - 运行中、需要你、置顶、有未提交内容的工作区永不自动删除（VS Code 1.141、Claude #96162 的教训）。
  - 显示磁盘占用（VS Code 1.141）。

### 8.7 进度呈现

- **不调用模型的状态卡**：目标 / 已完成 / 正在做 / 等你什么 / 下一步，直接从记录里读（Kiro Crew 0.9）。与 Tower 的实况行加模式指示一致，可以补上“下一步”。
- 回答之间的读、编辑、命令**折叠成一行，可展开**（Amp、Antigravity 2.21），同时保留文件路径和命令文本（Claude 2026-02 折叠反弹的教训）。
- 三档密度：紧凑 / 平衡 / 详细（Cursor），或 Normal / Thinking / Verbose（Claude，Ctrl+O 切换）。
- **时间线回溯**：点击轨迹里的某条命令，diff 和文件视图回到那一刻，之后的条目变灰（Devin）。Tower 有内容寻址的快照，具备做这件事的条件。
- 回到 Goal 时自动贴出“你离开期间”的回顾（Claude agent view，对应 Tower 已有的单目标简报）。

### 8.8 下一步按钮

- Claude Projects 的线程卡：Resolve conflicts / Fix CI / Address comments / Merge it，**按下即以你的名义发出一条消息**，在轨迹里可见。
- Tower 对应的按钮：
  - 验证失败卡：“带着失败输出返工”“这条标准有误，修改合同”“我来改”。
  - 已验证卡：“去评审”“开始人工检验”。
  - 已验收卡：“复制推送命令”“在终端中打开”。
- Conductor 的 Todos 闸门合并，对应 Tower 的“人工标准未勾选则不能验收”（已有），可以借它的 `@todos` 把清单发给 Agent。

### 8.9 上手

- 三个入口：**打开本地仓库 / 克隆 GitHub 仓库 / 用演示仓库试一次**（Conductor 的 Quick start 加 Tower 的演示引擎）。
- 环境自检清单，每一项给修复命令：
  - pi 已安装 / 版本
  - 已登录 / 可用模型
  - git 身份
  - Seatbelt 可用
  - 磁盘空间
  
  另外：如果环境变量里的 API key 会覆盖订阅登录，要明确提示（Conductor 在这一点上踩过坑）。
- 首次 Goal 时给出灰色的建议意图，按 Tab 接受（Claude）；在快速路径里显示检测到的测试命令（已有）。
- 首次运行贴出“建议设置”，用户逐项确认（Claude Projects 的 Setup recommendations）。
- **不要强推新范式**：保留“直接看代码”的路径，参考 Cursor Agents Window 的反弹。

---

## 9. 风险与反面教训

1. **薄编排层难以收费**：Vibe Kanban、Terragon、Crystal 已经倒下，厂商又在吸收这一层。Tower 的定位应当是“独立验证 + 本地优先 + 引擎中立的监督台”，不是“又一个 worktree 管理器”。
2. **强推范式会遭反弹**：Cursor 3、Antigravity 2.0、Codex 并入 ChatGPT、Warp 都是例子。Tower 以 Goal 为中心是一次范式选择，所以“逃生口”（终端、编辑器、原始轨迹）更不能缺。
3. **静默改变会摧毁信任**：Tower 的所有默认值改变都应写进应用内的 changelog；任何后台进程在应用退出后都不应残留。Tower 已有“验证进程组整体终止”的机制，可以作为对外承诺。
4. **默认跳过权限的产品会被安全事件拖累**：Antigravity 删盘；Vibe Kanban 与 Cline Kanban 默认 YOLO。Tower 的沙箱是优势，但 read/edit/write 不在沙箱内（docs/17 §17.4），这一点需要在设置的“环境检查”里如实写出。
5. **通知做坏比不做更糟**：重复、聚焦时也弹、按钮无效都会让人直接关掉通知。Tower 的“每项至多一次”是对的，应写入测试。
6. **Electron 与内存**：Tower 应保持轻量。内嵌终端或预览浏览器要按需加载，不可见时释放。

---

## 10. 待核实与说明

- Claude Code 桌面 Code 标签 10-14 的重建（文件编辑器、可画框的浏览器）只见于第三方通讯：**未核实**。
- Codex 定价、Warp 定价、Factory 定价、OpenCode 2.0 细节：**[二手]**。
- Conductor 的“已看”快捷键与 Dock 角标规则来自引用 changelog 版本号的第三方汇编：**[二手]**。
- Jules 是否并入 Antigravity，以及 “Jules V2 / Project Jitro”：**未核实**。
- Amp 当前的权限规则（手册需要登录）：**未核实**。
- Sculptor 的通知与键盘模型、Pairing Mode 在 worktree 模式下如何工作：**未核实**。
- redreamality.com 的“完成声明验证调研”署名为 Remy，可能是团队自己的文章。引用前请确认它是否算独立来源。
- Reddit 与 X 的引语都经第三方转述，或者缺失。

---

## 附录 A：主要来源（按产品）

- **Claude Code**：[desktop](https://code.claude.com/docs/en/desktop) · [agent view](https://code.claude.com/docs/en/agent-view) · [goal](https://code.claude.com/docs/en/goal) · [projects](https://code.claude.com/docs/en/claude-projects) · [web](https://code.claude.com/docs/en/claude-code-on-the-web) · [quickstart](https://code.claude.com/docs/en/desktop-quickstart) · [routines](https://code.claude.com/docs/en/routines) · [auto mode 默认](https://claude.com/blog/auto-mode-default-in-claude-code) · [#96162](https://github.com/anthropics/claude-code/issues/96162) · [#102521](https://github.com/anthropics/claude-code/issues/102521) · [#104926](https://github.com/anthropics/claude-code/issues/104926)
- **Codex**：[what's new](https://learn.chatgpt.com/docs/whats-new) · [changelog](https://learn.chatgpt.com/docs/changelog) · [code review](https://learn.chatgpt.com/docs/code-review?surface=app) · [worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees) · [commands](https://learn.chatgpt.com/docs/reference/commands) · [codex micro](https://learn.chatgpt.com/docs/features/codex-micro) · [approvals](https://developers.openai.com/codex/agent-approvals-security) · [goals cookbook](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex) · [#13629](https://github.com/openai/codex/issues/13629) · [#20817](https://github.com/openai/codex/issues/20817) · [#22308](https://github.com/openai/codex/issues/22308) · [#30703](https://github.com/openai/codex/issues/30703) · [HN 磁盘](https://news.ycombinator.com/item?id=50133231)
- **GitHub**：[Copilot app GA](https://github.blog/changelog/2026-06-17-github-copilot-app-generally-available/) · [app 概念](https://docs.github.com/en/copilot/concepts/copilot-surfaces/github-copilot-app) · [大 PR 渲染](https://github.blog/engineering/user-experience/rendering-huge-pull-requests-in-the-github-copilot-app/) · [验证工具](https://github.blog/changelog/2026-03-18-configure-copilot-coding-agents-validation-tools/) · [本地沙箱 GA](https://github.blog/changelog/2026-10-07-local-sandboxing-for-github-copilot-now-generally-available/) · [VS Code agents window](https://code.visualstudio.com/docs/copilot/agents/agents-window) · [review code edits](https://code.visualstudio.com/docs/agents/run/review-code-edits) · [1.141](https://code.visualstudio.com/updates/v1_141) · [计费](https://github.blog/changelog/2026-06-01-updates-to-github-copilot-billing-and-plans/)
- **Cursor**：[changelog](https://cursor.com/changelog) · [release notes](https://cursor.com/docs/release-notes) · [3.0](https://cursor.com/changelog/3-0) · [cloud agent setup](https://cursor.com/docs/cloud-agent/setup) · [pricing](https://cursor.com/pricing) · [Agents Window 反馈](https://forum.cursor.com/t/agents-window-feedback/160057) · [diff 抱怨](https://forum.cursor.com/t/diff-iculty-seeing-whats-changing-agent-window/157588)
- **Devin**：[Command Center](https://docs.devin.ai/desktop/agent-command-center) · [Spaces](https://docs.devin.ai/desktop/spaces) · [worktrees](https://docs.devin.ai/desktop/cascade/worktrees) · [Devin Local](https://docs.devin.ai/desktop/devin-local) · [Devin Review](https://docs.devin.ai/work-with-devin/devin-review) · [release notes](https://docs.devin.ai/release-notes/overview) · [pricing](https://devin.ai/pricing)
- **Google**：[Jules docs](https://jules.google/docs/) · [Jules changelog](https://jules.google/docs/changelog/) · [Antigravity 2.0](https://antigravity.google/blog/introducing-google-antigravity-2/) · [Antigravity changelog](https://antigravity.google/docs/changelog) · [settings](https://antigravity.google/docs/settings/)
- **Warp**：[code diffs](https://docs.warp.dev/agents/local-agents/code-diffs/) · [code review](https://docs.warp.dev/code/code-review) · [permissions](https://docs.warp.dev/agent-platform/capabilities/agent-profiles-permissions/) · [notifications](https://docs.warp.dev/agents/capabilities/agent-notifications/) · [changelog](https://docs.warp.dev/changelog/2026/)
- **Zed**：[agent panel](https://zed.dev/docs/ai/agent-panel) · [tool permissions](https://zed.dev/docs/ai/tool-permissions) · [terminal threads](https://zed.dev/blog/terminal-threads) · [Delta](https://zed.dev/blog/delta-public-beta) · [pricing](https://zed.dev/pricing)
- **Amp**：[news](https://ampcode.com/news) · [less noise](https://ampcode.com/news/less-noise) · [ordered diffs](https://ampcode.com/news/intelligently-ordered-diffs) · [steer don't queue](https://ampcode.com/news/steer-dont-queue) · [github listeners](https://ampcode.com/news/github-listeners) · [pricing](https://ampcode.com/pricing)
- **OpenCode**：[changelog](https://opencode.ai/changelog) · [permissions](https://opencode.ai/docs/permissions/)
- **Goose**：[releases](https://github.com/aaif-goose/goose/releases) · [ACP 与新 TUI](https://goose-docs.ai/blog/2026/04/08/goose-acp-and-new-tui/)
- **Factory**：[desktop app](https://factory.com/news/working-with-droid-in-the-desktop-app) · [missions running](https://docs.factory.com/docs/missions/running-app) · [missions news](https://factory.ai/news/missions) · [autonomy](https://docs.factory.ai/autonomy-and-safety/auto-run)
- **Kiro**：[autopilot](https://kiro.dev/docs/ide/chat/autopilot/) · [hooks](https://kiro.dev/docs/hooks/) · [changelog](https://kiro.dev/changelog/) · [pricing](https://kiro.dev/pricing/)
- **Conductor**：[changelog](https://www.conductor.build/changelog) · [scripts](https://www.conductor.build/docs/reference/scripts) · [files to copy](https://www.conductor.build/docs/reference/files-to-copy) · [diff viewer](https://www.conductor.build/docs/reference/diff-viewer) · [checks](https://www.conductor.build/docs/reference/checks) · [todos](https://www.conductor.build/docs/reference/todos) · [checkpoints](https://www.conductor.build/docs/reference/checkpoints) · [remote control](https://www.conductor.build/docs/reference/remote-control) · [pricing](https://www.conductor.build/pricing) · [Show HN](https://news.ycombinator.com/item?id=44594584)
- **其他编排器**：[Sculptor](https://github.com/imbue-ai/sculptor) · [Nimbalyst](https://github.com/nimbalyst/nimbalyst) · [Vibe Kanban 关停](https://www.vibekanban.com/blog/shutdown) · [Vibe Kanban 界面](https://vibekanban.com/docs/workspaces/interface.md) · [Cline Kanban](https://github.com/cline/kanban) · [Terragon OSS](https://github.com/terragon-labs/terragon-oss) · [Paradev changelog](https://paradev.com/changelog) · [Superset ports](https://docs.superset.sh/ports) · [Emdash](https://github.com/generalaction/emdash) · [pi-gui](https://www.pi-gui.com/) · [Jean](https://jean.build/) · [Polyscope](https://getpolyscope.com/docs/core-concepts/workflows) · [Claude Squad](https://github.com/smtg-ai/claude-squad) · [Kilo Agent Manager](https://kilo.ai/docs/automate/agent-manager)
- **横向**：[Muster](https://news.ycombinator.com/item?id=50074942) · [diffle](https://diffle.app/) · [fletch：worktree vs clone](https://fletch.sh/blog/git-worktrees-vs-clones-for-ai-agents/) · [Scalex 审批统计](https://scalex.dev/blog/ai-agent-permissions-stats/) · [auto mode HN](https://news.ycombinator.com/item?id=49239021) · [完成声明调研](https://redreamality.com/blog/coding-agent-done-claims-verification-survey/) · [奖励作弊汇编](https://www.digitalapplied.com/blog/ai-coding-agent-reward-hacking-rates-published-data) · [Pinrail HN](https://news.ycombinator.com/item?id=49995778) · [Offrun HN](https://news.ycombinator.com/item?id=49945423) · [AskUserQuestion 事件](https://www.olafalders.com/2026/07/17/claude-code-anatomy-of-a-misfeature/) · [ZCode 上传](https://blog.ferstar.org/en/posts/zcode-silent-workspace-snapshot-upload/) · [监督控制研究](https://arxiv.org/abs/2609.24234)
- **前作**：`research/landscape.md`（2026-10-15），覆盖 Goal 原语、记忆、观点与早期口碑。

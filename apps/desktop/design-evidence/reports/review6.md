# Tower 前端设计评审：第 6 轮（`16ac40c`，design/evolution）

> **报告文件没有写成。** 环境不允许我写报告文件，我也没有绕过这个限制。下面是完整报告，请原样保存到 `/tmp/tower-design/review6/report.md`。截图、流程证据和检查日志都在 `/tmp/tower-design/review6/{shots,flows,checks}` 下，下文路径都相对于 `$R=/tmp/tower-design/review6`。

**结论：不通过设计验收。** 加权得分 8.03/10，过了 8.0 的线，但还有一条未关闭的 P1。AC11 要求没有 P0 或 P1，所以不通过。

- 第 5 轮的两条 P2 都修好了，我在截图上看过，也做了测量：
  - **看板计数格：** en 和 zh、light 和 dark、1100 到 1800 之间 17 个宽度，都没有重叠，也没有被截断。
  - **peek 来源栏：** 42 个来源栏全部合格。
- 第 5 轮的 P3-01、P3-02、P3-03、P3-06 也修好了。G-0001 在所有界面上都读作“通过但不作数”，有没有 CI 都一样。
- **新发现的 P1-01：peek 是模态弹层，却不把焦点留在里面。**
  - 按 Tab，焦点会跑到 peek 背后的快速开始输入框。
  - 接着按 peek 自己键栏上写的 R 或 ↩，会把 “r” 打进这个输入框并提交，新建一个目标。
  - 看 supervisor 的代码，新建的目标会直接开跑一次 agent 运行。peek 一直盖在上面，用户看不到。
  - PeekDrawer 的焦点代码这轮没有改，按代码判断这个问题在第 5 轮就已存在，只是没被测到。但验收看的是现状。
  - 修起来不难：`components/ui.tsx` 里已经有一个现成的 Tab 陷阱，复用它就行。
- 修好 P1-01，并且不引入新问题，“交互”一项大约能回到 8.5，总分约 8.2，可以通过。

**设计方向：成立。** 剩下的都是局部问题，不需要重新设计。

**评审范围**

- **对象与环境**
  - 只读 worktree `/tmp/tower-design/wt-review6`，HEAD `16ac40c`（detached）。确认过 `sidebar.toReview` = “Review queue”。
  - 端口 1441，fixtures 用 `/tmp/tower-design/fixtures`，没有运行 cargo。
  - Playwright WebKit，Tauri IPC 用 stub（`e2e/tauri.ts`），数据由 `e2e/rich.ts` 补充。
  - “无 CI”变体的构造方法：先跑 `enrichRich`，再去掉 inbox 里 `kind === "ci_failed"` 的项，并把 G-0001 和 `F["goal-G-0001"].summary` 的 `pr` 置为 null。
- **截图**
  - `shots.spec.ts` 的 69 张全部通过。
  - 另写了 8 个 `zz-review-*` 临时脚本，生成的截图和日志在 `flows/` 下。
  - 关键截图都用 Read 看过，并截了局部图对照。
- **宽度、语言、主题组合**
  - **矩阵：** en、zh-CN × light、dark × 1100、1440、1800，共 12 种组合 × 9 个界面，外加无 CI 的 peek（`flows/matrix/`）。
  - **路由扫描：** 4 个变体 × 29 个界面和弹层，查绿色、中点、小字、“Ready”措辞、来源栏（`flows/scan/scan-*.txt`）。
  - **计数格：** 无 CI 的看板，17 个宽度 × en、zh × light、dark，外加有 CI 的各行（`flows/cell/`）。
- **交互流程**
  - **peek 出口：** 5 个目标 × 6 种出口 × 3 个变体，共 90 次（`flows/peek/log-peek-*.txt`）。
  - **来源栏几何：** en、zh × 1100、1440、1800 × 5 个目标（`flows/peek/log-gutter.txt`）。
  - **焦点和 Tab：** peek 和其他 4 种弹层（`flows/focus/`）。
  - **其他：** 看板键盘操作，用键盘评审 G-0003，G-0001 评审，合同编辑，目标页几何，Needs you 计数，accept 弹层和设置 git 身份（用测试身份写进 stub），空状态和错误状态。
- **清理**
  - 脚本副本已放进 `checks/zz-review-*.spec.ts`，并从 worktree 删除。
  - `dist/`、`test-results/`、`.impeccable/hook.cache.json` 已删除。
  - 清理时我误删了受版本控制的 `.impeccable/design.json`，已用 `git checkout` 恢复。
  - 现在 `git status` 干净，HEAD 仍是 `16ac40c`，端口 1441 已释放。
- **没能覆盖的：** 见文末。

---

## 加权评分（满分 10）

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.5 | G-0001 在 11 个界面上都读作“通过但不作数”，有没有 CI 都一样。评审头里的 Accept 不是主按钮。“评审队列”和“待评审”各指一个集合，计数对得上。 | 1.275 |
| 信息架构与工作流 | 20% | 8.5 | 看板 → peek → 目标页或评审 → Esc 回到原选中行，这个循环是闭合的。⇧R 在 peek 里也能用。Needs you、侧栏、标题栏的数字能互相核对。 | 1.700 |
| 视觉层级 | 15% | 8.0 | G-0001 的计数格在所有宽度下都干净。来源栏标签和陈述在同一行。代价是 1400–1560 下运行中的行标题被多截了一段（P3-01）。 | 1.200 |
| 原创性与产品身份 | 15% | 8.0 | 双轨计数条、印章、“Agent 称”来源栏、held-out 卡，仍是 Tower 自己的语言。 | 1.200 |
| 工艺与排版 | 10% | 8.0 | 两个修复都在 17 个宽度、两种语言下测过，也补了 e2e。zh 文案的折行修好了。还剩：bundle 余量 199 B，11px 标签。 | 0.800 |
| 密度与克制 | 10% | 8.0 | G-0001 的裁决每个界面只说一次，侧栏只剩一颗 ◆。G-0003 的 peek 仍把“已验证 @pin”说两遍（P3-02）。 | 0.800 |
| 交互 | 10% | 6.5 | 写明的快捷键全部可靠，90 次 peek 出口没有任何 pageerror。但 peek 打开时按 Tab，焦点会跑到遮罩后面，可能误建目标并启动运行；peek 的按钮也用 Tab 走不到（P1-01）。 | 0.650 |
| 设计系统一致性 | 5% | 8.0 | 绿色和中点的规则都守住了。detector 报 13 条，比上轮少 2 条。peek 没用共享弹层的焦点陷阱，和其他 4 种弹层的行为不一致。 | 0.400 |
| **合计** | 100% | | | **8.03** |

## 分维度评价（frontend-reviewer 1–5 分）

- **产品适配性 4/5**
  - 不作数的通过，在看板、侧栏、peek、命令面板、Needs you、目标页、评审头、readout、accept 弹层、合并队列里措辞都一样（`flows/g1/log-g0001-{ci,noci}-*.txt`）。
  - 评审头的 Accept 是 `btn-default`。
  - accept 弹层写“3 个机器标准里 2 个作数”和“不盖印”（`flows/g1/g1-noci-en-light-accept.png`）。
- **视觉设计 4/5**
  - G-0001 的看板行，三段都是 9px，“1 doesn't count · human 0/2”完整可见（`flows/cell/crit-en-1440.png`、`flows/cell/crit-en-1800.png`）。
  - peek 来源栏是“┆ Agent says 陈述”，类别在第二行（`flows/peek/drawer-en-1440-G-0001.png`）。
  - 扣分在 1440 下运行中的行（P3-01）。
- **原创性 4/5**
  - 产品身份清楚，welcome 的样例印章和“事实与声明分开”说得明白（`flows/flows/welcome-zh-CN-light-1440.png`）。
- **工程细节 4/5**
  - 两处修复不是只在一个宽度下验证的：实现者补了 16 条 e2e，我在 17 个宽度下复测也全部合格。
  - 扣分：
    - bundle 余量只有 199 B（`checks/bundle.log`）。
    - 加宽计数列的规则对所有行生效（P3-01）。
- **信息架构 4/5**
  - 侧栏“Review queue 2”和 Needs you 页底部的“Review queue 2”是同一个集合（G-0001、G-0003）。
  - “To review 1”只用于看板分组和侧栏分组（`flows/queue/log-queue.txt`、`flows/queue/inbox-bottom-noci-en-light-1440.png`）。
- **交互体验 3/5**
  - 写明的键全部可靠：j、k、Space、↩、R、⇧R、Esc 都试过，评审 G-0003 用 6 个键就能打开 accept。
  - 但 peek 这个模态层漏焦点，Tab 加 r、↩ 会建出目标（P1-01，`flows/focus/peek-tab-r-en.png`）。
- **功能完整性 4/5**
  - 所有界面都有内容、空状态和错误状态（`flows/flows/empty-*.png`、`flows/flows/error-goal-missing.png`）。
  - 设置 git 身份后 accept 能否解锁，在静态 stub 下没法验证。

---

## 问题清单

### P0

无。

### [P1-01] peek 抽屉不困住焦点：Tab 跳到背后的快速开始框，再按 r 和 ↩ 会新建目标并开跑

- **位置**
  - **触发方式：** 在 `overview` 看板上按 Space 打开 peek，所有目标都会。en/light 1440 和 zh-CN/dark 1100 都复现了。
  - **peek 的容器：** `apps/desktop/src/components/PeekDrawer.tsx:82-83`，`<aside class="peek-drawer" role="dialog" aria-modal="true" tabindex="-1">`。
    - 打开时只把焦点放到容器上（`PeekDrawer.tsx:32-36`），没有处理 Tab。
  - **peek 背后的输入框：** `views/Overview.tsx` 的 `.quick-input`，按 ↩ 会调用 `api.quickGoal`（`lib/api.ts:81`）。
  - **其他弹层的做法：** 共享弹层在 `components/ui.tsx:374-386` 有 Tab 陷阱。注释写明 WebKit 默认 Tab 会跳过按钮，从最后一个输入框会离开模态层。peek 没有用它。
- **截图证据**
  - `flows/focus/peek-tab-r-en.png`：G-0003 的 peek 开着，背后看板顶部的快速开始框里出现了 “r”，框上有焦点描边。
  - `flows/focus/peek-tab-r-zh-CN.png`：zh、暗色、1100 下一样。
  - `flows/focus/peek-tab-r-enter-en.png`、`flows/focus/peek-tab-r-enter-zh-CN.png`：按 ↩ 之后 peek 还开着，看不出发生了什么。
  - `flows/focus/log-tab-r-enter.txt`：两种语言都记录到 `["quick_goal",{"projectId":…,"intent":"r"}]`。
  - `flows/focus/log-tab-typing.txt`：Tab 之后键入 “rename the cart” 再按 ↩，记录到 `quick_goal {intent:"rename the cart"}`，peek 仍然打开。
  - `flows/focus/log-focus-en.txt`、`log-focus-zh-CN.txt`：
    - peek 打开时焦点在 `ASIDE.peek-drawer`。
    - Tab 1 次到 `INPUT.quick-input`（inPeek=false），2 次到 `BODY`，3 次又回到 quick-input。
    - peek 的“Review R”“Open the goal page ↩”和关闭按钮，一次都没轮到。
  - 对照 `flows/focus/log-dialog-tab.txt`：命令面板、快捷键表、accept 弹层、readout 里，Tab 都在弹层内循环（inDialog=true）。
- **问题**
  - peek 自称模态（`aria-modal="true"`），但 Tab 的走向由 WebKit 默认行为决定：
    - 默认会跳过按钮，peek 里没有可以 Tab 到的东西。
    - 焦点于是落到遮罩后面唯一的输入框。
  - 之后按的单键不再交给 peek 的键盘层，而是成了输入框里的文字。
- **影响**
  - 受影响的是键盘优先的主管，任务是在看板上速览目标。
  - 在 peek 里按 Tab 想走到底部按钮，是很自然的动作，peek 也没提示不要这样做。
  - 按了 Tab 之后再按键栏上写着的 R 或 ↩，结果都不对：
    - R 不再进入评审，而是在看不见的地方打出一个 “r”。
    - ↩ 提交一个意图为 “r” 的新目标。
  - 后果比打错一个字严重：
    - 根据 supervisor 代码判断（`crates/tower-supervisor/src/lib.rs:572`，`quick_goal` 以 `ratify: true` 建目标），这个目标会直接开跑一次 agent 运行，会花钱，也会占一个运行位。
    - peek 一直盖着看板，用户当时看不到。
  - Tauri 的 WKWebView 在没开 macOS“全键盘控制”时，Tab 同样跳过按钮。所以这条路径是确定会发生的，不是偶发的边角情况。
  - 即使不按 R 或 ↩，peek 的按钮用 Tab 也永远到不了。
- **修正目标**
  - peek 打开时，Tab 和 ⇧Tab 只在 peek 内的可聚焦元素之间循环，包括关闭、暂停、评审、打开目标页。可以复用 `ui.tsx` 的 trap 或同一个 `FOCUSABLE` 列表。
  - 背后的看板不可聚焦，例如加 `inert`。
  - 补 e2e，en 和 zh 都要，覆盖所有目标：
    - Space 后连按 Tab 6 次，每一步 `document.activeElement.closest(".peek-drawer")` 都不为空。
    - Space、Tab、r、↩ 之后，`__towerCalls` 里没有 `quick_goal`。
    - 对 G-0001 和 G-0003，r 仍然进入评审。

### P2

无。

### P3（细节）

- **P3-01 计数列从 11em 加到 16em，对每一行都生效：1400–1560 下运行中的行标题被多截一段（修 P2-01 的副作用）**
  - **位置**
    - `apps/desktop/src/styles/console.css:269-273`（`@media (min-width:1400px) and (max-width:1560px)`，计数列 16em）。
    - `app.css:4371`（≥1561 时也是 16em）。
  - **截图证据：** `flows/cmp-1440-running-row-r5-vs-r6.png`，上半是第 5 轮，下半是第 6 轮，en、1440。
    - G-0002 的标题从 “Align discount rules with the product…” 变成 “…with the pr…”。
    - 实况从 “Getting started run…” 变成 “Getting started…”。
    - 这一行的计数格里 “0/2” 右边空着约 166px（`flows/cell/log-cell-en-light.txt` 的 1440 段：`textRight-cellRight=-165.9`）。
    - 另见 `flows/cell/board-en-light-1440.png`。
  - **影响：** 1440 是参考宽度。主管扫运行中的目标时靠标题认目标，现在关键词被截掉了，要打开 peek 才知道是哪一个。
  - **修正目标：**
    - en 1440 下，运行中行的标题和实况，可见字数不少于 `d0dc2a1` 时的。
    - 同时 G-0001 计数格继续满足 P2-01 的几何要求：段 ≥5px，没有重叠，没有溢出。
    - 可选做法：
      - 在 1400–1560 也像 ≤1399 那样，把人工计数收进 tooltip，计数列保持 11em。
      - 或者从身份列、更新时间列让出空间，而不是从目标列和实况列。
- **P3-02 G-0003 的 peek 把“已验证 @5f72710”说了两遍**
  - **位置：** `PeekDrawer.tsx:94-97`。D75 只在“不作数”时隐藏头部印章，已验证的目标照旧显示。
  - **截图证据**
    - `flows/focus/peek-tab-r-en.png`（右侧 peek）：头部是“◎ G-0003 ◎ Verified @5f72710”，Now 下面又是“Ready to accept ◎ Verified @5f72710”。
    - zh、暗色下一样（`flows/focus/peek-tab-r-zh-CN.png`）。
    - 对照：G-0001 的 peek 只说一次（`flows/peek/drawer-en-1440-G-0001.png`）。
  - **影响：** 很小。同一个抽屉对两种裁决的处理规则不一致，在窄抽屉里多占一行的注意力。
  - **修正目标：** 每种状态下，peek 里“裁决 + pin”都只出现一次。
- **P3-03 bundle 总余量只有 199 B（D78，部分修复）**
  - **截图证据：** 这条是数字问题，没有截图，证据是 `checks/bundle.log`，163,641 / 163,840（第 5 轮余 22 B）。
  - **影响：** 下一个功能几乎一定超预算，到时就会碰到“为了装下而提高预算”这条硬性门槛。
  - **修正目标：** 做下一个功能之前，先腾出至少 1 KB。
- **P3-04 11px 标签（D54，保留）**
  - 看板列头、键栏说明、hunk 操作是 11px，kbd 是 10px（`flows/scan/scan-en-light-1440.txt` 的 tiny 段，`flows/cell/board-en-light-1440.png`）。
  - 这些都不是句子，AC9 仍然成立。只做记录。
- **P3-05 zh 界面里有 supervisor 和 fixture 的英文（D80 / D51 Deferred，数据侧，只做记录）**
  - 证据：`flows/flows/inbox-zh-CN-dark-1100.png`。
    - 选项按钮写英文 “Approve / Reject”，假设句和标准标题也是英文。
    - 说明文字已改成“选哪一个都会带上这段说明。”，不再和按钮的叫法冲突。

---

## 第 5 轮（`d0dc2a1`）问题复核

| 编号 | 判定 | 证据 |
|---|---|---|
| P2-01 无 CI 时看板 G-0001 计数格重叠、被截断 | **已修复**（副作用见本轮 P3-01） | 测了 17 个宽度（1100–1800）× en、zh × light、dark，见 `flows/cell/log-cell-{en,zh-CN}-{light,dark}.txt`：<br>• 段全是 9px，重叠 0，`scrollWidth == clientWidth`。<br>• 文字右端在格内：en 在 1100 下距右边 −0.8px，1241–1399 下 −26.8px，≥1400 下 −16px；zh 在 −26.8 到 −54.5px 之间。<br>• “human 0/2”从 1400 起显示，以下收进 tooltip。<br>截图：`flows/cell/crit-en-1440.png`、`crit-en-1800.png`、`row-en-1399.png`、`row-zh-CN-1100.png`、`row-en-dark-1440.png`。 |
| P2-02 en peek 来源标签掉到陈述下方 | **已修复** | `flows/peek/log-gutter.txt`：42 个来源栏全部合格，0 个不合格。<br>• 标签顶和陈述顶相差 −1.0px。<br>• ┆ 和 “Agent says” 在同一行，没有一行的起点在 ┆ 左边。<br>• 类别在第二行。<br>截图：`flows/peek/drawer-en-1440-G-0001.png`、`flows/peek/frame-*.png`。 |
| P3-01 “To review”一词指四个集合 | **已修复** | 侧栏 “Review queue 2” 等于 Needs you 页底部的 “Review queue 2”（两张卡：G-0001、G-0003）。“To review 1”只用于看板分组和侧栏分组。标题栏写成文字：无 CI 时 “3 need you / 3 项需要你”，有 CI 时 4，和侧栏 Needs you、“Blocking a run”的数一致。证据：`flows/queue/log-queue.txt`、`flows/queue/inbox-bottom-noci-en-light-1440.png`、`flows/cmp-titlebar-r6-{en,zh}-1100.png`。 |
| P3-02 裁决和 ◆ 重复 | **G-0001 已修复**（G-0003 的 peek 仍重复，见本轮 P3-02） | 侧栏 G-0001 行只有 1 个标记（`flows/g1/g1-noci-en-light-sidebar.png`）。peek 头部只剩字形，裁决只在 Now 里出现一次（`flows/peek/drawer-en-1440-G-0001.png`，日志 `headAttentionMarks=1 verdictCountInPeek=1`）。inbox 卡片里裁决只出现一次（`flows/g1/g1-noci-en-light-inbox-card0.png`，`verdictCount=1`）。 |
| P3-03 peek 里按 ⇧R 没反应 | **已修复** | 5 个目标 × 3 个变体：peek 关闭，进入评审 G-0001 “Queue 1 / 2”，没有 pageerror（`flows/peek/log-peek-*.txt`、`flows/peek/exit-en-1440-G-0004-key_Shift_R.png`、`flows/focus/after-shiftR-en.png`）。peek 底栏没有列出 ⇧R，peek 里按 ? 也打不开快捷键表（`flows/focus/peek-help-en.png`），可发现性仍弱，不另列问题。 |
| P3-04 11px 标签 | **保留（D54）** | 同本轮 P3-04。 |
| P3-05 bundle 余量 22 B | **部分修复** | 余量变成 199 B（`checks/bundle.log`），没到 1 KB 的目标。 |
| P3-06 零碎折行和文案 | **已修复** | • 合同右栏写 “Ports / 端口”，一行，完整说法放在 title 里（`flows/flows/rail-en-light-1440.png`）。<br>• zh welcome 的 git 行没有单字落行（`flows/flows/welcome-zh-CN-light-1440.png`）。<br>• zh held-out 提示是一行：“提示和失败的测试名不会让保留测试暴露；失败输出会。”<br>• 假设说明改成“选哪一个都会带上这段说明。”<br>证据：`flows/flows/inbox-zh-CN-dark-1100.png`、`flows/flows/log-copy.txt`。 |
| P3-07 zh 里的英文数据 | **未修（D80 / D51 Deferred）** | `flows/flows/inbox-zh-CN-dark-1100.png`。 |

---

## 设计合同 AC1–AC11 与硬性门槛

| 条目 | 判定 | 证据 |
|---|---|---|
| AC1 | 满足 | 测了 6 个变体（`flows/flows/log-goal.txt`）：<br>• 标题底都在 100。<br>• 计数条顶是 106，en 1100 下是 134，都在标题下 120px 以内。<br>• 验收标准头分别是 578、542、588、560、542、560，全部 ≤ 600。<br>验收标准之上没有 agent 写的区块（`flows/flows/goal-G0001-1440-en-light.png`）。 |
| AC2 | 满足（低危折叠没有重测） | 高危哨兵在验收标准之前，带证据行（`flows/flows/goal-G0001-1440-en-light.png`）。本轮没改低危折叠，我也没重测。 |
| AC3 | 满足 | 本轮没改这部分。复看截图：C1、C2、C5 各两行；通过的标准上的标签是琥珀色；同一事实只出现一次（`flows/scan/noci-goal-G-0001-en-light-1440.png`）。 |
| AC4 | 满足 | 目标页、评审、inbox、peek 里，agent 写的文本都标了 “Agent says / Agent 称”。peek 来源栏的几何已修好（`flows/peek/log-gutter.txt`）。无依据的声明用 ◇ 标出，不是普通灰字。 |
| AC5 | 满足 | j 移动 6 次，行顶始终是 149、189、229、269、349、371。决策只在 ↩ 时打开。Space 和 R 作用于选中行（`flows/flows/log-board-en-light-1440.txt`、`flows/flows/b-j6-*.png`）。P1-01 出在 peek 内部，AC5 的文字没有覆盖它。 |
| AC6 | 满足（解锁没法验证） | 底栏写 “Set git's name and email first; Tick C3, C4 first”，阻塞项在信息列表之前（`flows/queue/accept-G0003-*.png`、`flows/g1/g1-noci-en-light-accept.png`）。设置身份后，stub 收到了 `set_git_identity`，但环境是静态的，Accept 一直禁用（`flows/queue/log-accept.txt`）。 |
| AC7 | 满足 | 有 CI 和没有 CI、en 和 zh、light 和 dark 下，G-0001 都没被叫作 Ready。“Ready to accept”只出现在 G-0003 上，包括 aria-label。评审头的 Accept 是 `btn-default`（`flows/g1/log-g0001-*.txt`，`flows/scan/scan-*.txt` 的 ready 段）。 |
| AC8 | 满足 | 绿色只出现在：验证结果的通过标记、`seg-verified` 段、印章、G-0003 的已验证字形（`flows/scan/scan-*.txt` 的 greens 段）。没有跨类别的单一 N/M。 |
| AC9 | 满足 | detector 在 10 个改动的 UI 文件上报 13 条，全部在 app.css：radius 6 条、side-tab 3 条、字号 3 条、未登记颜色 1 条。没有 `tiny-text` 或 `low-contrast`（`checks/detect.json`、`checks/changed-ui-files.txt`）。扫描里没有低于 12px 的句子。 |
| AC10 | 满足 | 见下面的工程检查表。 |
| AC11 | **不满足** | 加权 8.03 ≥ 8.0，但 P1-01 没关闭。 |

| 硬性门槛 | 判定 | 证据 |
|---|---|---|
| 绿色聚合或绿色步骤勾 | 未触发 | 统计值、CI 计数、welcome 步骤、accept 清单都是中性色。 |
| 把声称画成事实 | 未发现 | 所有 agent 文本都标了出处，peek 来源栏已修好。 |
| 用户已有改动丢失 | 没有检查 | 本轮没有构造这个场景。P1-01 不会丢改动，但会多建一个目标。 |
| 为了通过而削弱测试 | 未发现 | `checks/test-diff.log`：<br>• `verdict.spec` 新增 182 行：10 条计数格几何测试，6 条 peek 来源栏几何测试。<br>• 改动的断言只是随文案更名（“To review” 改为 “Review queue”），以及选择器排除了 `.prov-words`。<br>• `Honesty.test` 的 title 断言变得更严。 |
| 为了装下而提高预算 | 未发现 | `checks/tools-diff.log` 为空（和 `d0dc2a1` 比，0 行）。注意余量只有 199 B。 |

## G-0001 跨界面一致性、绿色扫描和中点扫描

| 界面 | 有 CI 失败时 | 无 CI 时 | 判定 |
|---|---|---|---|
| 看板 | 在 “Needs you” 组，写 “Passed, doesn't count” 和 “CI failed” | 在 “To review 1” 组。三段分别是已验证、已验证、不作数，写 “1 doesn't count · human 0/2”，≤1399 时人工计数收进 tooltip | 一致 |
| 侧栏 | 在 Needs you 下，一个标记 | 在 To review 下，一个标记 | 一致 |
| peek | 头部只有 ◆ 字形，Now 写 “Passed, doesn't count ◆ @5f72710” | 同左 | 一致 |
| 命令面板 | “G-0001 Fix the cart total Passed, doesn't count” | 同左 | 一致 |
| Needs you 卡片 | CI 卡加评审卡，评审卡裁决只出现一次 | 一张评审卡 | 一致 |
| 目标页 | 裁决紧贴标题，第三段琥珀 | 同左 | 一致 |
| 评审头 | 同样的裁决，Accept 是 `btn-default` | 同左 | 一致 |
| readout | 裁决一致，C1、C5 带 “runner patched” | 同左 | 一致 |
| accept 弹层 | “2 of 3 machine criteria count: in one, a test that must fail passed” 和 “Seal withheld” | 同左 | 一致 |
| 合并队列 | “#1 … Merges cleanly ◆ Passed, doesn't count” | 同左 | 一致 |
| 标题栏 | “4 need you” | “3 need you” | 和 Needs you 计数一致 |

证据：`flows/g1/log-g0001-{ci,noci}-{en,zh-CN}-{light,dark}.txt` 和 `flows/g1/g1-*.png`，所有组合都没有 pageerror。

- **绿色扫描：** 见 AC8。
- **中点扫描：** 文本和伪元素里都没有越界的中点。中点只出现在三处：计数条的 `.sep`（aria-hidden）及其 title，预算行及其 title，sr-only 的计数说明（`flows/scan/scan-*.txt` 的 dots 段）。

## 交互流程记录

- **看板**
  - j、k 移动时行不跳。
  - ↩ 在原地打开决策，R 进评审；对 G-0002、G-0004、G-0005 按 R 会进目标页。
  - ⇧R 进入队列 “Queue 1 / 2”，起点是 G-0001。命令面板的顺序和队列一致。
  - Esc 回来，选中行不变（`flows/flows/log-board-*.txt`）。
- **peek 出口：** 90 次，全部没有 pageerror（`flows/peek/log-peek-*.txt`）。
  - G-0001、G-0003：r 和 Review 按钮进评审，↩ 和 Open 进目标页。
  - G-0002、G-0004、G-0005：没有 Review 按钮，r 不动作。
  - Esc 回看板，选中行不变。
  - ⇧R 进入 Queue 1/2。
  - 例外是 Tab，见 P1-01。
- **评审 G-0003（键盘）**
  - 按 a、j、a、a、v，再按 ⌘⇧↵，accept 弹层打开。
  - 因为 git 身份没设置，Accept 一直禁用。点 “Set in git” 后出现提示 “git now commits as Test Reviewer in shop”，弹层仍然阻塞，原因是 stub 的环境是静态的（`flows/flows/log-review-G0003.txt`、`flows/queue/log-accept.txt`）。
- **评审 G-0001**
  - 文件头开关在 “Mark reviewed” 和 “Reviewed” 之间切换。
  - 建议块侧条用 `--border-strong`，不是验证绿。
  - 要求修改面板正常。
  - en 和 zh 都测了（`flows/flows/log-review-G0001.txt`、`flows/flows/r1-*.png`）。
- **合同编辑**
  - + Look 能加出一条。
  - holdout 草稿写 “Draft claim, inactive until you approve it”，批准后写 “You approved, hidden”。
  - ⌘↩ 调用了 `validate_contract`（`flows/flows/log-contract.txt`、`flows/flows/c-*.png`）。
- **其他弹层的 Tab：** 命令面板、快捷键表、accept 弹层、readout 里，Tab 都留在弹层内（`flows/focus/log-dialog-tab.txt`）。

## 工程检查（日志都在 `checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| tsc | 通过 | `tsc.log` |
| vitest | 41 个文件、220 个测试通过 | `vitest.log` |
| 全量 e2e（含 axe，不含 zz 脚本） | 307 通过，76 跳过，EXIT=0。有 3 条 “Importing a module script failed” 警告，和第 5 轮相同 | `e2e-full.log`、`e2e-files.txt` |
| shots.spec | 69 通过 | `shots-run.log` |
| line-limit | 通过 | `line-limit.log` |
| bundle-budget | 通过，余量很小（见下） | `bundle.log` |
| vite build | 通过 | `build.log` |
| `tools/` diff | 为空 | `tools-diff.log` |
| 测试 diff 抽查 | 没有削弱 | `test-diff.log` |
| detector | 13 条 advisory，第 5 轮是 15 条 | `detect.json` |

bundle-budget 的明细：

| 部分 | 大小 | 预算 |
|---|---|---|
| 启动 | 54,069 | 65,536 |
| 按需 | 109,572 | 110,592 |
| 合计 | 163,641 | 163,840（余 199 B） |
| 目标页 chunk | 11,399 | 12,288 |
| worker | 197,901 | 262,144 |

## 没能覆盖的

- **原生窗口（标题栏、阴影）：** 没有运行 `tools/screenshot.sh`，也没有运行 cargo。
- **WKWebView 的真实 Tab 行为：** 只在 Playwright WebKit 里复现了 P1-01。按 `ui.tsx` 注释的说法，在没开“全键盘控制”的 macOS 上行为相同，但我没有在原生窗口里验证。
- **P1-01 是否真的会启动一次 agent 运行：** stub 只记录了 `quick_goal` 调用。“会直接开跑”是根据 supervisor 代码（`ratify: true`）判断的。
- **P1-01 在第 5 轮是否已存在：** 只按代码判断（PeekDrawer 的焦点代码这轮没改），没有在 `d0dc2a1` 上实际复现。
- **accept 在设置 git 身份后的解锁状态：** stub 的环境是静态的，没法验证。
- **真实 supervisor 的中文数据：** fixture 里的风险理由、假设、选项、标准标题都是英文。
- **硬性门槛“用户已有改动丢失”：** 没有专门构造这个场景。
- **合同 ⌘↩ 提交之后：** 只确认调用了 `validate_contract`，没有确认之后停在哪里。这个 commit 没有改动合同编辑器。
- **AC2 的低危折叠：** 本轮没有改动，也没有重测。

## 验收条件

要通过，需要做到：

1. 修复 **P1-01**，并按它的“修正目标”补 e2e：
   - peek 内 Tab 循环。
   - Space、Tab、r、↩ 不产生 `quick_goal`。
   - en 和 zh 都要覆盖。
2. 重新做一次独立评审，加权 ≥ 8.0，且没有 P0 或 P1（AC11）。

建议一起处理：
- P3-01：不要从目标列和实况列拿空间。
- P3-03：在下一个功能之前，腾出 ≥ 1 KB 的 bundle 余量。
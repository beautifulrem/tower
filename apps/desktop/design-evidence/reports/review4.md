# Tower 前端设计评审：第 4 轮（`815bd99`，design/evolution）

> **报告文件没有写成：** 写入 `/tmp/tower-design/review4/report.md` 时被环境拦下（subagent 不允许写报告文件），我没有绕过这个限制。下面是完整报告，请原样保存到该路径。截图、流程证据和检查日志都已在 `/tmp/tower-design/review4/{shots,flows,checks}` 下。

**结论：不通过设计验收。** 加权得分 7.2/10，低于 8.0 的通过线，而且还有 2 条 P1 没解决：

- **P1-01：** peek 里的“Review / Open the goal page / r / ↩”在所有目标上都不跳转，还会抛出页面异常。
- **P1-02：** 没有 CI 的时候（这很常见），不作数的 G-0001 在看板和侧栏被归进 “To accept / 待验收” 组，看板计数条也丢了“1 项不作数”。

**设计方向：成立。** 剩下的问题都是局部缺陷，不需要重新设计。

**评审范围**

- **对象与环境**
  - 只读 worktree `/tmp/tower-design/wt-review4`，HEAD `815bd99`（detached）。端口 1441，fixtures 用 `/tmp/tower-design/fixtures`，没有重跑 cargo。
  - 页面身份已确认：Vite 实际提供的 `en.later.ts` 里，815bd99 独有的字符串 “its output is in the pause above” 出现 1 次。在 3faaf0c 和 2a65eb1 里都是 0 次（`checks/identity.txt`）。
  - 这句话在 G-0005 目标页 C1 的第二行能直接看到（`shots/goal-G-0005-cannot-run-en-light.png`）。
- **截图**
  - `shots.spec.ts` 的 69 张全部通过。
  - 用 Read 逐张看过约 30 张：
    - 看板：en、zh-1100、1800
    - Needs you：en、zh
    - 目标页：G-0001 的 en、zh、1800，G-0002，G-0004 zh，G-0005 的 en、zh
    - 评审：G-0001 的 en、zh、readout、accept（en、zh），G-0003 zh，评审空状态
    - 其他：合同编辑 en 和 look zh、look 对比弹层、learning zh、operations、settings、快捷键表、welcome、命令面板、peek
  - 没逐张看的部分用 DOM 扫描补上：13 条路由在 en-light-1440 和 zh-CN-dark-1440 下各扫一遍，另加 briefing、accept、welcome、peek、palette、shortcuts 这几个弹层。扫描内容包括计算后的颜色、伪元素 content、aria 和 title 属性、字号。
- **交互流程**
  - 写了 5 个 `zz-review-*` 临时脚本，过程截图 100 多张，放在 `flows/`。
  - 脚本已从仓库删除，副本留在 `checks/zz-review-*.spec.ts`。
- **宽度、语言、主题组合**

  | 语言 + 主题 | 覆盖到的宽度 |
  |---|---|
  | en + light | 1440、1800 |
  | zh + dark | 1100、1440 |
  | en + dark | 1800（只有 G-0001 目标页） |

  final-* 截图另有明暗各一套。shots.spec 不产出 zh-light 和 en-dark 的全路由截图，这两个组合只在 final-* 里看到了明暗对照。
- **没能覆盖的**
  - 原生窗口（标题栏、阴影）：没有运行 `tools/screenshot.sh`。
  - accept 在设置 git 身份之后的解锁状态：mock 下点 “Set in git” 后 Accept 仍是禁用（`flows/r3-accept-after-git.png`），无法验证。
  - 真实 supervisor 的中文数据：fixture 里的风险理由和暂停原因是英文。
  - 硬性门槛“用户已有改动丢失”：没有专门构造这个场景。

所有证据都在评审目录 `R=/tmp/tower-design/review4` 下，下文路径都相对于 `$R`。

---

## 加权评分（满分 10）

| 维度 | 权重 | 分数 | 一句话理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 7.5 | 合同、验收、验证、接受这条主线在目标页、评审和 accept 弹层上是通的。但无 CI 时，看板和侧栏把不作数的目标归到“待验收”，最常用的界面又读成“可以收了”。 | 1.125 |
| 信息架构与工作流 | 20% | 7.0 | 看板 j/k、Space、Enter、R，⇧R 队列，评审 5 键到 accept，都顺。但 peek 的两个出口全部失效；有决策的行在看板上没有能走通的键盘路径进目标页；从评审返回后选中行丢失。 | 1.400 |
| 视觉层级 | 15% | 7.5 | 目标页裁决紧贴标题，验收标准在 600px 以内；accept 弹层阻塞项在前；看板决策行对齐。G-0001 行上叠了三颗 ◆，Learning 上三个同等亮度的“批准”，都在稀释焦点。 | 1.125 |
| 原创性与产品身份 | 15% | 8.0 | 双轨计数条、印章、“Agent 称”来源栏、held-out 卡和 look 对比，都是 Tower 自己的语言，不是通用模板。 | 1.200 |
| 工艺与排版 | 10% | 6.5 | 中点规则 5 处违规。zh 来源栏断成“标准已满/足”。文件头 “Reviewed/已审” 两种状态看不出区别。建议块用了验证绿侧条。 | 0.650 |
| 密度与克制 | 10% | 7.5 | 主界面卡片、边框、阴影都少，整体克制。G-0005 仍有一句重复；1800 宽时看板行中部空得太多。 | 0.750 |
| 交互 | 10% | 6.5 | 看板和评审键位可靠、可预测。peek 中的 r、↩ 和两个按钮在所有目标上都无效并抛异常，⇧R 在 peek 打开时也无效。 | 0.650 |
| 设计系统一致性 | 5% | 6.5 | `--st-verified` 用到了建议块上；中点规则执行不一；detector 报了 12 条设计系统 advisory。 | 0.325 |
| **合计** | 100% | | | **7.23 ≈ 7.2** |

通过线是加权 ≥ 8.0 且没有未解决的 P0/P1。两条都不满足。

---

## 分维度评价（frontend-reviewer 1–5 分）

- **产品适配性：3.5/5**
  - 好的部分：G-0001 的“通过但不作数”在主路径上读法一致。目标页、评审头、readout、accept 摘要、inbox 卡片、peek、命令面板、Operations 存储表都写 “Passed, doesn't count / 通过但不作数”，印章也改成琥珀色 tampered（`flows/inbox-G0001-card-en.png`、`flows/palette-g0001-zh-CN-dark.png`、`shots/review-G-0001-readout-en-light.png`）。
  - 主要缺口：“没有 CI”这个常见状态下，看板和侧栏把它放进了“To accept/待验收”（`flows/crop-noci-zh-group-to-accept.png`）。北极星问题“什么被证明了”在最常看的界面上又失真了。
- **视觉设计：4/5**
  - 好的部分：层级清楚。目标页标题下 6px 就是裁决和双轨计数，验收标准头在 578px（`shots/goal-G-0001-en-light.png`）。明暗两套都安静、可长时间看（`shots/goal-G-0004-zh-dark.png`）。
  - 扣分点：G-0001 行上 ◆ 叠用；Learning 每行一个实心“批准”；建议块的绿侧条和验证结果抢同一种颜色。
- **原创性：4/5**
  - 计数条加“1 项不作数”琥珀段、印章、来源栏、held-out 卡（`shots/heldout-card-zh-dark.png`）、look 的“并排/叠加/差异”（`shots/look-compare-zh-dark.png`），都是从产品本身长出来的，不是 AI 模板。
- **工程细节：3/5**
  - 中点规则 5 处违规（`flows/crop-briefing-zh.png`、`shots/learning-zh-dark.png`、`flows/c-holdout-drafts.png`）。
  - zh 来源栏折行（`flows/crop-peek-zh-prov-wrap.png`）。
  - 文件头 Reviewed 两种状态难分辨（`flows/crop-r1-file-head-before.png` 对照 `-after-v.png`）。
  - 11px 的按钮标签。
  - bundle 总量只剩 30 B 余量，goal chunk 只剩 182 B。
- **信息架构：3.5/5**
  - 好的部分：分组和队列入口已统一，⇧R、侧栏、面板都从 G-0001 开始，显示 Queue 1/2（`flows/b-shiftR-en-light-1440.png`）。
  - 问题：
    - “待验收”既是组名，又是 G-0003 的裁决词（scan-zh：`span.decision-kind "待验收"`），两个概念共用一个词。
    - 有决策的行，在看板上 Enter 只就地展开决策卡（`flows/b-enter-G0001-en-light-1440.png`）。进目标页的键盘路径只剩 peek 的 ↩，而它坏了。
- **交互体验：3/5**
  - 好的部分：看板 j×5 时行顶不动；Space 预览的是选中行；Esc 把焦点还给 `g-title`（`flows/log-board-*.txt`）。评审中 a、j、v、]、[ 和 ⌘⇧↵ 都按预期工作。
  - 问题：peek 出口全部失效，并抛出 `Attempting to access a stale value from <Show>`（`flows/log-peek-R.txt`）。从评审或目标页 Esc 回看板后，选中行丢失。
- **功能完整性：3/5**
  - 主要流程都能走：合同（look 标准）、评审、accept 弹层（阻塞项）、命令面板、快捷键表、空状态、welcome、无法运行的状态。
  - peek 跳转是坏的；accept 在 mock 下无法解锁，不能确认最后一步。

---

## 问题清单

### [P1-01] peek 的所有跳转都失效：r、Review、↩、Open the goal page 只关掉抽屉，同时抛出页面异常

- **位置**
  - `overview`，按 Space 打开的 peek 抽屉。en/zh、明/暗、1100/1440 都有。
  - 源码 `apps/desktop/src/components/PeekDrawer.tsx:41`：`const openTo = (name) => (props.onClose(), go({ name, id: props.goalId }));`。
  - 调用方 `apps/desktop/src/views/Overview.tsx:271-276`：`<Show when={peeking()}>{(id) => … <PeekDrawer goalId={id()} …/>}`。
  - 原因：`onClose()` 先把 `peeking` 置空，`<Show>` 随即卸载。接着读 `props.goalId` 会触发已失效的 accessor 并抛异常，`go()` 根本没执行。
- **截图证据**
  - `flows/peek-click_Review-Fix.png`：对 G-0001 点 Review 后，抽屉关闭，页面仍是 Overview，G-0001 行处于选中态。
  - `flows/peek-key_Enter-Clean.png`、`flows/peek-click_Open-Align.png`：G-0003 按 ↩、G-0002 点 Open 之后同样停在 Overview。
  - `flows/log-peek-R.txt`：在 G-0001、G-0003、G-0002 上试了 15 次。凡是本该跳转的操作（r、Review、↩、Open）全部停在 overview，并带 `pageerror: Attempting to access a stale value from <Show>`。在 peek 中按 ⇧R，抽屉不动。
  - `flows/log-board-*.txt`：“Space then r -> overview”（G-0003、G-0001）。
- **问题**
  - peek 底栏写着 “Review R / Open the goal page ↩”，这两个出口在任何目标上都不工作。
  - 上一轮 P2-02 看到的是同一个异常，当时归因成“目标没有改动”。这一轮只在没有改动的目标上把按钮藏了，根因没修。
  - `verdict.spec.ts:97` 也只断言了 G-0002 这种情况。
- **影响**
  - 用 Space 做分诊的工程师，想进评审或目标页时会被弹回看板，得重按一次，按键提示也不再可信。
  - 对 G-0001 这类有决策的行，peek 的 ↩ 是唯一一条到目标页的键盘路径。这一坏就没路可走，接近 P0。
- **修正目标**
  - G-0001、G-0003 的 peek 中，r 和 Review 打开 `review/G-000N`。
  - 全部 5 个目标的 peek 中，↩ 和 Open the goal page 打开 `goal/G-000N`。
  - 全程没有 pageerror。
  - peek 打开时 ⇧R 也能启动队列，或在提示里写明此时不可用。
  - 补一条 e2e：至少覆盖一个有改动、一个无改动的目标，断言路由确实变化，并断言没有 pageerror。
  - 实现提示：先把 id 取出来，再 `onClose()`。

### [P1-02] 不作数的目标在看板和侧栏被归到 “To accept/待验收”，看板计数条也丢了“不作数”（AC7）

- **位置**
  - `overview` 的分组和侧栏的分组。条件：G-0001（canary 被篡改，状态 `in_review`）没有 CI 失败这类阻塞决策。
  - 源码：
    - `src/lib/labels.ts:68-69`：`groupOf` 把 `in_review` 映射成 `"review"`。
    - `src/lib/locales/en.ts:74`：“To accept”。
    - `src/lib/locales/zh-CN.ts:81`：“待验收”。
    - `src/components/GoalRow.tsx:95`：`<CriteriaBar … tiny />` 没传 criteria，所以 discounted 永远是 0。
- **截图证据**
  - `flows/crop-noci-zh-group-to-accept.png`：
    - 组头写“待验收 1”，下面是“◆ Fix the cart total ◆ 通过但不作数 ◆ @5f72710”。
    - 计数条是两段绿加一段空，显示“2/3”，没有琥珀段，也没有“1 项不作数”。
    - 左下侧栏也有一个“待验收 1”组。
  - 同类截图：`flows/crop-noci-en-group-to-accept.png`、`flows/noci-overview-en.png`、`flows/noci-overview-zh-CN.png`。
  - 对照 `flows/noci-goal-en.png`：同一目标在目标页上是绿、绿、琥珀三段，并写 “1 doesn't count”。
  - `flows/log-noci.txt`：看板条是 `seg-verified,seg-verified,seg-empty`，目标页是 `…seg-discounted`。
  - `flows/scan-zh-CN-dark.txt:48`：G-0003 的裁决词正是 `span.decision-kind "待验收"`。
- **问题**
  - zh 下，G-0001 头上的组名和 G-0003 的“可以接受”是同一个词，这就是 AC7 说的“被叫作 Ready to accept”。en 下 “To accept” 和 “Ready to accept” 是近义。
  - 看板计数条把“跑了但不作数”画成了“还没跑”。
  - 提交的截图看不到这个问题，是因为 rich fixture 用 `enrichCi` 给 G-0001 加了 “CI failed” 决策，把它挪进了 Needs you。而“canary 被篡改、还没开 PR”正是开 PR 之前的常态。
  - `verdict.spec.ts` 只测了 rich 场景。
- **影响**
  - 工程师扫看板时，会在“待验收”下看到一个 2/3 的进度条，以为只剩一条标准没跑。
  - 产品最核心的承诺“分清证明和声称”在分诊入口失效。评审页和 accept 弹层还能拦住误收，但分诊顺序和注意力已经被带偏。
- **修正目标**
  - pass 不作数的目标，不出现在任何名为 “To accept/待验收” 的组下。可以进 Needs you，也可以把组名改成不与裁决词撞车的中性词，比如“评审中”。
  - 看板条和侧栏凡是有计数条的地方，都画出琥珀不作数段，并写“1 项不作数”，与目标页一致。
  - 补一条无 CI 场景的 e2e，断言这两点，en 和 zh 都要。

### [P2-01] 中点 “ · ” 出现在计数条和预算行以外的 5 处，覆盖它的 e2e 有漏洞

- **位置与证据**
  1. **看板 briefing**：`.briefing-item::before { content: "· " }`，在 `src/styles/app.css:1429-1431`。
     - 截图 `flows/crop-briefing-zh.png`、`-en.png`，可见“· G-0004 已暂停… · G-0003 待验收 · G-0002 运行中 · 还有 2 项”。
     - 同一处按钮的 title 也拼了 `${g.id} · …`（`src/views/Overview.tsx:334`）。
  2. **Learning 证据行**：`evidence.join(" · ")`，在 `src/views/Learning.tsx:80`。截图 `shots/learning-zh-dark.png` 第一条，可见 “src/cart.js:18 · C1 red→green @a1b2c3d”。
  3. **合同里的 holdout 草稿**：“┆ Draft claim · inactive until you approve it”“You approved · hidden”。
     - 来源：`src/views/goal/HoldoutDrafts.tsx:48,61`、`en.later.ts:306-307`、`zh-CN.later.ts:300-301`。
     - 截图：`flows/c-holdout-drafts.png`、`c-holdout-ratified.png`。
  4. **评审“要求修改”面板**：“用分来算 · 建议”，来自 `src/views/review/panels.tsx:481`。截图 `flows/r1-request-changes-zh-dark.png`、`crop-r1-head-dangling-dot.png`。
  5. **inbox 决策卡的 aria-label**：“Ready to accept · G-0003 · Clean up cart edge cases”。这是不可见文本，没有截图可给，证据是 DOM 扫描 `flows/scan-en-light.txt:91`。

  另外，`src/views/review/FileDiff.tsx:299` 的 “· virtual” 徽标在这次数据里没有渲染出来，不计入证据，但应该一起改。
- **问题**
  - 规则只允许中点出现在计数条和预算行。
  - `verdict.spec.ts:139-165` 只在 learning 和 operations 两条路由上跑，briefing 在 overview，不在范围内。
  - 它的文本检查豁免了 `pre, code, .mono, .sentinel-prose, .decision-body, .claim-text`。Learning 证据行正好是 `code.code-val`，所以测试通过了，违规还在。
- **影响**：中点本是计数条分隔符专用的记号，散落到别处后语义被冲淡。合同规则是明确的，实现和测试却各说各的。
- **修正目标**：全路由扫描（en/zh × 所有路由 + 弹层），只豁免 `.criteria-bar` 和 `.budget-line`，同时检查 ::before/::after、aria-label、title 和 aria-hidden 文本，结果为 0。

### [P2-02] 评审里的“建议”代码块用了验证绿 `--st-verified` 做左侧条（AC8）

- **位置**：`review/G-0001`，写一条带 suggestion 的批注后出现。源码 `src/styles/app.css:5009-5014`：`.suggestion { … border-left: 2px solid var(--st-verified); }`。
- **截图证据**
  - `flows/crop-r1-suggestion-rule.png`：“const gross = cents(items);” 左边一条 2px 绿线，外面是琥珀色的批注底。
  - `flows/r1-suggestion-zh-dark.png`。
  - `flows/log-review-G0001.txt` 第 3 行，计算值是 `oklch(0.55 0.13 155) 2px`。
- **问题**
  - 在评审页里，绿色的意思是“Tower 跑过并通过了”。人写的、还没验证的建议代码拿到了同一种颜色，AC8 明确不允许。
  - 形态上它也是 detector 自己列的 side-tab 反模式。
- **影响**：评审者扫页面时，会把“建议”和“已验证”放到同一个视觉类别里。
- **修正目标**
  - 全仓 `--st-verified` 只用在验证结果、已验证目标字形和印章这三类上。
  - 建议块改用中性边框或 diff-add 浅底。
  - 用 DOM 检查 `.suggestion` 的 border 颜色，结果不等于 `--st-verified`。

### [P2-03] 文件头的 “Reviewed/已审” 开关在未按下时读起来像状态

- **位置**：`review/G-0001` 和 `review/G-0003` 的文件头，右侧 “Whole file” 旁边。上一轮 D45 改名后出现。
- **截图证据**
  - `flows/crop-r1-file-head-before.png`：没审之前，文件头就写着普通字重的 “Reviewed”，和 “Whole file” 同样式。
  - `flows/crop-r1-file-head-after-v.png`：按 v 之后只是多了 ✓ 和灰底。
  - `flows/log-review-G0001.txt`：`pressed=false text="Reviewed"` 变成 `pressed=true text="Reviewed"`。
- **问题**：同一个过去式词同时承担“动作”和“状态”两种含义，zh 的“已审”更明显。
- **影响**：多文件评审时，扫一眼文件头会把没审的文件当成已审，可能漏审。
- **修正目标**
  - 没按下时显示动作（“Mark reviewed / 标为已审”，或一个空复选框），按下后显示状态。
  - 不依赖颜色，两种状态在截图里也能分清。

### [P2-04] 次级界面丢掉了 G-0001 的限定：readout 少了 “runner patched”，合并队列只写 “Merges cleanly”

- **位置**
  - `review/G-0001` 的 Verification readout 弹层，C1 和 C5。
  - `operations` 的 Merge queue 第 1 行。
- **截图证据**
  - `shots/review-G-0001-readout-en-light.png`：C1 写 “✓ passed … couldn't check on @3d28c9a … must-fail tests failed, as they must”，C5 写 “a test that must fail passed”。两条都没有 “runner patched”。
  - 对照 `flows/log-goal-geo.txt`、`flows/goal-C1-open.png`、`goal-C5-open.png`：目标页上 C1 和 C5 都有 “runner patched”。
  - `flows/w1800-operations.png`：合并队列写 “#1 G-0001 Fix the cart total … Merges cleanly”，没有裁决；同页下方的存储表却写着 “◆ G-0001 … Passed, doesn't count”。
- **问题**：上一轮 D41 找到的根因“裁决没有单一来源”，在这两个次级界面上又出现了：每个界面自己挑一部分限定信息来画。
- **影响**
  - readout 是 accept 之前最后看的证据汇总，却少了“测试运行器被改过”。
  - 合并队列把一个不作数的目标排第 1，还写“合并干净”。
  - D58 把“这种 pass 算不算”留给 owner 决定，那至少每个展示结果的界面都要把限定写出来。
- **修正目标**
  - 每条标准的限定词集合在目标页和 readout 上一致，可以用 DOM 比较验证。
  - 合并队列里，不作数目标那一行带上 “Passed, doesn't count” 和 ◆。

### [P2-05] 来源栏在 zh 下断在词中间，“Agent 称 Agent claim” 重复

- **位置**：peek 的说法台账、Learning 的记忆来源栏。zh、暗色、1440。
- **截图证据**
  - `flows/crop-peek-zh-prov-wrap.png`：“Agent 称 / 标准已满 / 足”，折成 3 行。
  - `flows/crop-learning-zh-prov.png`：“Agent 称 Run / trace”，以及 “Agent 称 / Agent claim”。
- **问题**
  - 来源栏的宽度是照 en 的短标签定的，放不下 zh 标签。
  - UI 前缀“Agent 称”和数据里的 origin “Agent claim” 说了同一件事。origin 的英文来自 mock（`e2e/rich.ts:427-455`），不计入问题；但前缀和 origin 拼出重复，是 UI 拼接造成的。
- **影响**：来源栏是让一句话被读成“声称”而非“事实”的关键（AC4）。标签断开后，扫读时第一眼抓不到它。
- **修正目标**：1100 和 1440 宽下，zh 来源标签都在一行内，标签里不出现两次 “Agent”。

### P3（细节）

- **P3-01 从评审或目标页 Esc 回看板，选中行丢失**
  - 证据：
    - `flows/log-board-en-light-1440.txt`：“r on Fix the cart total → review … Esc → overview selected=none”。
    - `flows/log-peek-R.txt` 末尾：“after R, Esc: sel=none; then j → Find out why checkout is slow”。
    - 截图 `flows/board-after-review-esc.png`。
  - 影响：逐个处理目标时，每次回来都得从顶部重新按 j。
  - 目标：Esc 返回后，选中刚离开的那个目标。
- **P3-02 G-0001 行的 ◆ 叠用**
  - 证据：`flows/crop-noci-zh-group-to-accept.png`。一行里有状态字形 ◆、标题后 ◆、印章 ◆ 共三颗，外加 “◇ G-0003”。
  - 影响：◆ 的意思是“需要你”，重复使用会让它失去提醒作用。
  - 目标：每行最多一个 ◆。
- **P3-03 Learning 每条待批准记忆都有一个实心“批准”**
  - 证据：`shots/learning-zh-dark.png`，右侧三个同等亮度的按钮，第三条因高污染被禁用。
  - 影响：页面上没有唯一的主操作。
  - 目标：行内用次级按钮，或者只在聚焦行上显示主按钮。
- **P3-04 11px 标签（实现者在 D54 选择保留）**
  - 证据：“Agent says/Agent 称”、“Mark read / Revert hunk”、“Modified” 是 11px，kbd 是 10px（`flows/scan-*.txt` 的 tiny 段）。
  - 这些不是句子，所以 AC9 成立。但 “Mark read / Revert hunk” 是每个 hunk 都要用的操作，长时间评审时偏小。
- **P3-05 1800 宽时看板行标题和 ID 相距太远（D23 Deferred）**
  - 证据：`shots/overview-en-light-1800.png`。
- **P3-06 zh 界面里 supervisor 文案是英文（D51 Deferred，数据侧问题，只做记录）**
  - 证据：`shots/review-G-0003-zh-dark.png` 的风险理由 “test harness: runner config…”。
  - 证据：`flows/pure-overview-zh-CN.png` 的暂停原因 “The agent stopped without submitting”。
- **P3-07 命令面板逐个评审的顺序和队列起点不同**
  - 证据：`flows/palette-en-light.png` 里先列 “Review G-0003”、再列 “Review G-0001”；而 “Review each goal in turn ⇧R” 从 G-0001 开始（`flows/b-shiftR-en-light-1440.png`）。
- **P3-08 G-0005 还剩一句重复**
  - 证据：`shots/goal-G-0005-cannot-run-en-light.png`。暂停卡写 “An environment problem, not a test failure and not the agent's doing”，C1 又写 “an environment problem, not a test failure”。
  - 输出块的重复已经去掉了。

---

## G-0001 跨界面一致性、绿色扫描和中点扫描

| 界面 | G-0001 的读法 | 证据 | 判定 |
|---|---|---|---|
| 看板（rich，有 CI 失败） | ◆ “Passed, doesn't count” 加 “CI failed”，在 Needs you 组 | `flows/peek-click_Review-Fix.png`、`shots/overview-en-light.png` | 一致 |
| 看板（无 CI） | 在 “To accept/待验收” 组；计数条两绿一空，没有“不作数” | `flows/crop-noci-*-group-to-accept.png` | **不一致（P1-02）** |
| 侧栏 | rich 时在“需要你”下；无 CI 时在“待验收”组下 | `shots/overview-zh-dark.png`、`flows/noci-overview-zh-CN.png` | **无 CI 时不一致** |
| Needs you 卡片 | “Passed, doesn't count”，印章琥珀 tampered，第三段琥珀，组名“To review/待评审” | `flows/inbox-G0001-card-*.png` | 一致 |
| peek | 头部 “Passed, but not counted as verified: Passed, doesn't count”，印章非绿 | `flows/peek-G0001-*.png` | 一致（但跳转坏了，P1-01） |
| 命令面板 | “◆ G-0001 Fix the cart total ◆ 通过但不作数” | `flows/palette-g0001-zh-CN-dark.png` | 一致 |
| 评审队列（⇧R） | Queue 1/2 从 G-0001 开始，头部是不作数裁决 | `flows/b-shiftR-*.png` | 一致 |
| 目标页 | 裁决在标题下 6px；计数条第三段琥珀，写“1 doesn't count” | `shots/goal-G-0001-*.png` | 一致 |
| 评审页 | 头部 ◆ Passed, doesn't count；Accept 不是主按钮 | `shots/review-G-0001-en-light.png` | 一致 |
| readout | 裁决一致，但 C1 和 C5 少了 “runner patched” | `shots/review-G-0001-readout-en-light.png` | 部分（P2-04） |
| accept 弹层 | 摘要 “2 of 3 machine criteria count: in one, a test that must fail passed”，中英意思一致 | `shots/review-G-0001-accept-*.png` | 一致 |
| Operations | 存储表写 “Passed, doesn't count”；合并队列只写 “Merges cleanly” | `flows/w1800-operations.png` | 部分（P2-04） |

- **绿色扫描**（`flows/scan-en-light.txt`、`flows/scan-zh-CN-dark.txt`）
  - 13 条路由在 en 和 zh 下，加上各个弹层，`--st-verified` 的计算色只出现在四类地方：
    - G-0003 的已验证字形（侧栏、看板、面板）
    - 印章
    - `seg-verified`（每段对应一条验证结果）
    - `result-pass`（C1/C2 的 “Verified by Tower: passed”）
  - diff-add 的浅绿底是通用的 diff 约定，单独归类，不算违规。
  - CI ✓3 计数、welcome 步骤、accept 清单都已经是中性色（`flows/b-enter-G0001-en-light-1440.png` 的 “PR open ✓ 3”）。
  - 唯一例外是建议块（P2-02）。它只在写建议后出现，所以路由扫描没扫到，是在流程里发现的。
- **中点扫描**：合规的只有计数条（sr-only 文本和 aria-hidden 的 `.sep`）和预算行。违规的 5 处见 P2-01。

---

## 设计合同 AC1–AC11 与硬性门槛

只看本轮亲测结果，不采信 DESIGN_REVIEW.md 的 Status 列。

| 条目 | 判定 | 证据 |
|---|---|---|
| AC1 | 满足 | `flows/log-goal-geo.txt`：标题底 100；裁决顶在 1440 下是 106，在 1100 en 下是 134，都在 120px 内。验收标准头：1440 en 578、1440 zh 560、1100 en 588、1100 zh 542、1800 en dark 560，全部 ≤ 600。哨兵说明 `clip=false`。验收标准之上只有哨兵，没有 agent 写的区块。 |
| AC2 | 满足 | 高危哨兵在验收标准之前，带证据行（`shots/goal-G-0001-en-light.png`）。低危折叠先点出 held-out 路径（`flows/goal-low-fold.png`）。 |
| AC3 | 满足 | C1、C2、C5 折叠态每行 50px。通过的标准没有危险色。C2 展开后 “assertions not checked” 只出现一次（`flows/goal-C2-open.png`）。子行缩进一致。 |
| AC4 | 满足（有瑕疵） | 目标页 agent 文本都标了 “Agent says/Agent 称”。台账里的无依据用 ◇（`flows/crop-peek-zh-prov-wrap.png`）。zh 折行见 P2-05。 |
| AC5 | 满足 | j×5 后行顶 149/189/229/269/371 不变。决策只在 ↩ 或点击时打开。Space 和 R 作用于选中行（`flows/log-board-*.txt`）。 |
| AC6 | 满足（解锁没法验证） | 底栏列出所有阻塞项，点击后焦点落到第一个；阻塞项在信息列表之前（`shots/review-G-0001-accept-*.png`、`flows/r3-accept.png`）。mock 下设置 git 身份后仍禁用。 |
| AC7 | **不满足** | 面板、peek、briefing、Operations 存储表、aria 都没把 G-0001 叫作 Ready，评审头的 Accept 也不是主按钮。但无 CI 时，看板和侧栏的组名是 “To accept/待验收”，zh 下和 Ready to accept 是同一个词（P1-02）。 |
| AC8 | 部分满足 | 路由扫描中，绿色只出现在验证结果、已验证字形和印章上，也没有跨类别的单一 N/M。建议块用了 `--st-verified`（P2-02）。 |
| AC9 | 满足 | detector 在 26 个改动的 UI 文件上没有报 `tiny-text` 或 `low-contrast`（`checks/detect.json`）。扫描中没有低于 12px 的句子级文本。 |
| AC10 | 满足 | tsc、vitest、全量 e2e（含 axe）、shots.spec、line-limit、bundle-budget 全部通过。 |
| AC11 | **不满足** | 本次评审 7.2/10，且有 2 条 P1。 |

| 硬性门槛 | 判定 | 证据 |
|---|---|---|
| 绿色聚合或绿色步骤勾 | 未触发 | CI 计数、welcome 步骤、accept 清单都是中性色；扫描里没有绿色的统计值。 |
| 把声称画成事实 | 未发现 | agent 文本都标了来源。建议块（人写的建议）用验证绿属于边缘情况，已列为 P2-02。 |
| 用户已有改动丢失 | 没有检查 | 本轮没有构造这个场景。走过的流程（要求修改、建议、合同草稿）里没看到丢失。 |
| 为了通过而削弱测试 | 未发现 | 见下面的测试 diff 抽查。中点检查豁免过宽，但那是新测试本身写得不够，不是把旧断言改弱了。 |
| 为了装下而提高预算 | 未发现 | `git diff bf22cad 815bd99 -- tools/` 为空（`checks/tools-diff.log`）。 |

---

## 上一轮（`3faaf0c`）问题复核

| 编号 | 判定 | 证据 |
|---|---|---|
| P1-01 不作数的通过被叫作 Ready，inbox 和 peek 用绿色印章 | **部分修复** | inbox 卡片写 “Passed, doesn't count”，印章琥珀 tampered，第三段琥珀（`flows/inbox-G0001-card-*.png`）。peek 头部改对了，印章不再是绿色（`flows/peek-G0001-*.png`）。命令面板和 Operations 存储表也正确。但无 CI 时看板和侧栏仍归到“待验收”，计数条丢了不作数段，见本轮 P1-02。 |
| P1-02 CI 通过数和 welcome 步骤用了绿色 | **已修复** | “PR open ✓ 3” 是中性色（`flows/b-enter-G0001-en-light-1440.png`）。welcome 链条是中性的（`shots/welcome-red-en-light.png`），扫描中绿色只在印章和 seg-verified 上。另外出现了一处新的绿色误用：建议块（P2-02）。 |
| P2-01 验收标准头超过 600px | **已修复** | 578/560/588/542/560（`flows/log-goal-geo.txt`），说明文字没被截断。 |
| P2-02 peek 对没有改动的目标显示 Review，点了抛异常 | **表面修复，根因未修，引入新问题** | G-0002 的 peek 已没有 Review 按钮，r 无反应也不抛错。但异常的真正原因是 `openTo` 里读了失效的 accessor，所有目标的 Review、Open、↩ 都失效，见本轮 P1-01。 |
| P2-03 mark viewed 和 mark read 近义 | **部分修复** | 键栏改成 “V mark reviewed / A mark read”，单元和 hunk 已分开。但文件头 “Reviewed/已审” 没按下时读成状态，见本轮 P2-03。 |
| P2-04 自动标题在单词中间截断 | **已修复** | create_goal 标题为 “Checkout shows the discounted total on every page…”（`flows/log-contract.txt`）。 |
| P2-05 Learning 来源标签被截断 | **部分修复** | 不再截断，改成了折行。但 zh 下断在词中间，并有 “Agent 称 Agent claim” 重复（本轮 P2-05）。中点 e2e 加到了有数据的 Learning，但豁免了 `code`，证据行的中点漏检了（P2-01）。 |
| P3-01 ⇧R 和队列入口不一致 | **已修复** | 看板 ⇧R、侧栏、面板的队列都从 G-0001 开始，显示 Queue 1/2。还剩面板逐个列出的顺序问题（本轮 P3-07）。 |
| P3-02 C2 展开后同一事实出现两次 | **已修复** | 只出现一次（`flows/goal-C2-open.png`）。 |
| P3-03 决策行问句起点不齐，提示大小写不一 | **已修复** | 问句起点一致；键提示统一为小写的 move、peek、open、review。 |
| P3-04 文案与本地化 | **部分修复** | accept 摘要中英意思一致。zh 风险理由仍是英文（D51 Deferred）。 |
| P3-05 信任档位两处不一致 | **已修复** | G-0002 在 peek 写 “Claude Code 完整 S2 / Full S2”，和目标页一致；mock 已与 `acp_adapter.rs` 对齐。 |
| P3-06 低危折叠路径选错 | **已修复** | 先点出 held-out 路径（`flows/goal-low-fold.png`）。 |
| P3-07 11px 小字 | **未修复（实现者选择保留，D54）** | “Agent says” 和 “Mark read” 是 11px，kbd 是 10px；没有句子级小字。 |
| P3-08 重复和留白 | **部分修复** | G-0005 输出不再印两遍，C1 改为指向暂停卡，但 “an environment problem, not a test failure” 仍在卡片和 C1 各出现一次。look 弹层改成“由你判断：在它的标准上勾选”（`shots/look-compare-zh-dark.png`），这一点已修复。1800 宽距离仍大（D23 Deferred）。 |

---

## 交互流程记录（按键、点击、视线）

- **看板 → 目标**
  - 首屏能看到 4 条决策行和 1 条运行行。用 j×3 选中 G-0001（3 键），之后：
    - ↩：就地展开 “CI failed” 决策卡（1 键）。
    - R：进评审（1 键）。
    - Space 后再按 ↩ 或 r：本应 2 键到目标页或评审，实际失败（P1-01）。
  - G-0004、G-0005 按 R 会打开目标页；G-0002 运行行按 ↩ 打开目标页。
- **目标页 G-0001**：视线从标题到裁决只下移 6px（1440）。验收标准头在 578px。C5 的琥珀 ◆ 和 “1 doesn't count” 在首屏内，不需要滚动。
- **评审 G-0003**：a、j、a、a、⌘⇧↵，5 键到 accept 弹层（`flows/log-review-G0003.txt`）。弹层第一行就是 git 身份阻塞项，点击后焦点落到输入框；mock 下设置后仍禁用。
- **评审 G-0001**：
  - v：标记文件已审，并跳到下一个单元（aria-pressed 从 false 变 true）。
  - 然后点按钮打开“要求修改”，写建议，再发回。
- **新建合同**：
  1. 标题留空。
  2. 用 “+ 外观”加一条 look 标准，填 URL 和步骤。输入 `drag #a #b` 时提示“以 Tower 认识的动词开头”（`shots/contract-look-zh-dark.png`）。
  3. 提交后，标题由 intent 生成，在词边界截断。
- **其他**：
  - 命令面板（⌘K）和快捷键表（?）正常。
  - 空状态正常：Overview、Needs you、评审无改动（`shots/review-empty-en-light.png`）。
  - welcome 的 clean 和 red 两种都正常。
  - 错误状态正常：目标不存在、队列出错（`flows/error-*.png`）。
  - 无法运行的目标 G-0005 正常。

---

## 工程检查（日志都在 `checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| tsc | EXIT=0 | `tsc.log` |
| vitest | 41 个文件、220 个测试全部通过 | `vitest.log` |
| 全量 e2e（WebKit，端口 1441） | 245 passed，76 skipped（69 张截图和 7 张手机截图要 `SHOTS` 才跑），EXIT=0 | `e2e-full.log` |
| shots.spec | 69/69 通过 | `shots-run.log` |
| vite build | 通过 | `build.log` |
| `tools/bundle-budget.sh` | EXIT=0；明细见下 | `bundle.log` |
| `tools/line-limit.sh` | EXIT=0 | `line-limit.log` |
| `git diff bf22cad 815bd99 -- tools/` | 空 | `tools-diff.log` |
| impeccable detect（26 个改动的 UI 文件） | 15 条：side-tab 3 条（hunk-head 内阴影，与上一轮相同）；design-system advisory 12 条（radius 7、font-size 4、color 1）；**没有 tiny-text 或 low-contrast** | `detect.json` |
| 测试削弱抽查 `git diff 2a65eb1 815bd99` | 10 个文件，+301/−99 | `test-diff.log`、`test-diff-stat.log` |

bundle-budget 明细：

| 项目 | 实际 / 预算 | 余量 |
|---|---|---|
| 启动 | 54,095 / 65,536 | |
| 按需 | 109,715 / 110,592 | |
| **总计** | **163,810 / 163,840** | **30 B** |
| goal chunk | 12,106 / 12,288 | 182 B |
| worker | 197,901 / 262,144 | |

测试 diff 抽查的明细：

- shots.spec 少了 83 行，是 enricher 搬到了 `rich.ts`（多了 81 行），没有删除。
- flows.spec、review-keys、panels.test 是跟着文案改名同步更新的，断言保留了。
- Console.test 的 FlakyLine 用例是和那段死代码一起删的（D57）。
- `tauri.ts` 的 mock 信任档位改成与 `acp_adapter.rs` 一致：pi 和 claude-code 是 FullS2，codex、gemini-cli、opencode 是 RestrictedS2。
- 新增 verdict.spec.ts（181 行），Honesty.test 和 ContractEditor.test 各加了断言。

**结论：没有发现旧断言被改弱。** 新测试有两处覆盖缺口，正好是本轮两个问题能通过 CI 的原因：

- 中点检查只跑 learning 和 operations，且豁免了 8 个选择器（P2-01）。
- peek 测试只覆盖了没有改动的 G-0002（P1-01）。

bundle 总量只剩 30 B 余量，下一轮任何 UI 增量都会碰线。

收尾状态：

- `apps/desktop/e2e/zz-review-*` 已全部删除。
- `dist/` 和 `.impeccable/hook.cache.json` 已清掉。
- worktree 干净，HEAD 仍是 `815bd99`。
- 1441 端口已空闲。

---

## 验收条件

要通过设计验收，必须同时满足：

1. **解决 P1-01**：peek 的 r、Review、↩、Open the goal page 在所有目标上都能正确跳转，没有 pageerror。补 e2e，断言路由确实变化，有改动和无改动的目标各至少一个。
2. **解决 P1-02**：不作数的目标不出现在 “To accept/待验收” 组下；看板和侧栏的计数条显示不作数段和“1 项不作数”。补一条无 CI 场景的 e2e，en 和 zh 都要。
3. 重新做一次独立评审，加权 ≥ 8.0，且没有未解决的 P0/P1（AC11）。

建议在同一轮里一起修：

- P2-01：中点。同时把 e2e 改成全路由、不豁免、检查伪元素和属性。
- P2-02：建议块的绿色。
- P2-03：Reviewed 开关。
- P2-04：次级界面的限定信息，最好从单一来源统一读裁决和限定词。

P2-05 和 P3 可以排在后面。

**报告路径：** `/tmp/tower-design/review4/report.md`。环境不允许我写入这个文件，请把上面的全文原样保存到这里。证据目录 `/tmp/tower-design/review4/{shots,flows,checks}` 都已就绪。
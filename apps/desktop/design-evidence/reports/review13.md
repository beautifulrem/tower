## Tower 前端设计评审：第 13 轮（`3ff2ebf`，对照 `886ab38`）

> 文中 `$R` 指 `/tmp/tower-design/review13`。截图、日志和临时 spec 都在这个目录下，临时 spec 的副本在 `$R/checks/specs/`。

**结论：PASS。** 加权得分 **8.47/10**，不低于 8.0。没有未关闭的 P0、P1，也没有 P2。

第 12 轮的两条 P3 都修好了，作者处理的两条“只做记录”也都做到了。这一轮新记 2 条 P3，都是这一轮的改动带进来的。

- **修好的部分**
  - **R12-P3-01：** 标识列的最后一步现在一定放得下。我在 WebKit 里构造了 12 种行组合，外加 1 种压力组合，en/zh 各一遍，1241–1800 每 2px 扫描。
    - 可见读数越出列宽或被硬切：`886ab38` 是 775 次（en）和 769 次（zh）。`3ff2ebf` 只剩一种情况：项目名被 flex 压到 0–1.3px，见 R13-P3-01。
    - 第 12 轮的复现组合 1241–1340 每 1px 重跑，加上 1366、1440、1561、1800，0 处切口。
  - **R12-P3-02：** 结果如下：
    - PR 按钮的读屏名称在每一步都是完整摘要，例如 “PR closed: 2 passed, 1 failing, 1 pending”。按钮上没有 aria-label。
    - 标题的 tooltip 写全了 PR、返工、已静音、引擎和项目名。我核了 10 个宽度 × 13 行 × en/zh，0 处缺失。
    - 被收起的部分仍在无障碍树里。
    - 短项目名按字宽排：`lib` 的盒子是 13px，上轮是 42px。
    - 计数收起时 `.sep` 一起收起：尾部空白 0px，上轮 4px。
  - **两条只做记录：**
    - 窄头部里，“已不在列表中”保留 pin；其他项照旧收起 pin。en 1024–1241 和 zh 1024–1041 都核过。
    - “已静音”先于项目名让位。
- **新问题**
  - **R13-P3-01（本轮引入）：** 项目名被 flex 压到 ≤1px 时，`fitId` 把它当成“已收起”。结果有三种：
    - 项目名消失，或者只剩 ≤1.3px 的一条字形残片。
    - 让位顺序反过来：留着 PR 读数或“已静音”，项目名却没了。
    - 步骤随宽度不单调。
    - 出现范围：en 有 6 行、zh 有 3 行，各在 1–2px 的窄带里出现。另有一种拥挤的 zh 组合，在 1561–1799 一直这样，这一行的末尾也不再贴右。
  - **R13-P3-02（本轮引入）：** 比较运行、终点已不在列表中时，“已不在列表中”保留的 pin 占了位置。en 1040–1052 下，评审头部验证结论里的标准条被切掉一段，`886ab38` 在这个区间是完整的。
- **只做记录的**
  - 整体收起（folded）时，每次进入或离开这一步都触发一次 “ResizeObserver loop completed with undelivered notifications”。只有压力组合会走到这一步。
  - 复制一行时，被收起的读数和 sr-only 摘要也会被复制。
  - 已关闭的 PR 在 pr-state 这一步只剩 “PR ■1”，和 open 的 PR 看起来一样。
  - 其他细节见后文。

**评审范围**
- **环境**
  - 评审 worktree：`/tmp/tower-design/wt-review13`（`3ff2ebf`）。
  - 对照 worktree：`/tmp/tower-design/wt-review13-base`（`886ab38`，已删除）。
  - Playwright WebKit，Tauri IPC 用 stub，fixtures 是 `/tmp/tower-design/fixtures{,-zh}`。
  - 端口：评审 1441，对照 1442，1443 没有用到。
- **字体**
  - 按规定命令运行时，字体请求被拒（403，“outside of Vite serving allow list”），和前几轮一样。
  - 所以测量、截图，以及第二次全量 e2e，都跑在 `$R/tools/vite.review.config.mjs` 上。这个配置原样导入生产配置，只把主 checkout 的 node_modules 加进 `fs.allow`，依赖缓存放在 `$R/vite-cache`。
- **拥挤看板的构造**（`$R/checks/specs/tmp-review13-board.ts`）
  - 收件箱清空，三个项目：`shop`、长名（`storefront-payments` / `店面支付服务`）、短名（`lib`，以及 `ui` / `支付`）。
  - 用 G-0002 克隆出 G-0011 到 G-0019：
    - 第 12 轮 crowded 看板的 4 行，以及 idprobe 的 (a)(b)(c) 三种组合。
    - 没有检查数的 open PR、没有 PR 的行、大计数（120/12/30，返工 10/10）。
    - 压力行 G-0019：1234 个失败检查，返工 99/99，用来走到 folded。
- **清理**
  - 两个 worktree 里的临时 spec、`dist/` 和 `test-results/` 都已删除。
  - 对照 worktree 已用 `git worktree remove --force` 删除。`git worktree list` 只剩主 checkout 和 wt-review13，主 checkout 的 node_modules 完好。
  - 1441 和 1442 上的 vite 已停止，1441–1443 上没有服务在监听。
  - `git -C /tmp/tower-design/wt-review13 status`：HEAD 是 `3ff2ebf`，只剩 `node_modules` 和 `apps/desktop/node_modules` 两个符号链接。
  - 说明一：规定命令下 Playwright 自启 vite 的依赖缓存，以及 vitest 的缓存，都会经符号链接写进主 checkout 里已被 git 忽略的 node_modules。
  - 说明二：评审期间，主 checkout 里出现了 35 个未提交的修改（`GoalRow.tsx`、`flows.spec.ts` 等，修改时间是 00:02–00:05）。这些不是我改的，我对主 checkout 只做过 `worktree add/remove`，看起来是另一个会话正在那里工作。我没有碰这些修改。

---

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.7 | PR 的每个读数在每一步都能找到：tooltip 和读屏名称都有，GitHub 的计数也没有变绿。终点离开列表后，在窄头部里也带着 pin。扣分：在最小窗口附近，比较运行的头部为这个 pin 让出了验证结论的标准条（R13-P3-02）。 | 1.305 |
| 信息架构与工作流 | 20% | 8.6 | 让位顺序是 引擎 → PR 次要读数 → 已静音 → 项目名 → PR 状态词 → 整体收起，和文档一致，最后一步一定放得下。扣分：1–2px 的窄带里顺序会反过来（R13-P3-01）；已关闭的 PR 在常用宽度只剩 “PR ■1”（只做记录）。 | 1.720 |
| 视觉层级 | 15% | 8.5 | 标识列整块让位，没有半截读数，靠右对齐。扣分：在 R13-P3-01 的那种组合里，末尾多出一个 8px 的空隙，这一行和别的行没有对齐。 | 1.275 |
| 原创性与产品身份 | 15% | 8.0 | 没有新的语汇。 | 1.200 |
| 工艺与排版 | 10% | 8.3 | “⟳3/” 这种硬切没有了，`.sep` 留下的空白也没有了。扣分：项目名会剩 ≤1.3px 的字形残片（例如 G-0004，en 1241，“PR closed ⟳3/3 ꞉”）；en 1040 下标准条被切。 | 0.830 |
| 密度与克制 | 10% | 8.6 | 短项目名按字宽排，zh 的 `lib` 行在 ≥1561 时终于放得下全部 PR 读数。没有新增装饰。 | 0.860 |
| 交互 | 10% | 8.7 | 悬停和选中都不改变让位步骤。axe 0 违规。读屏在每一步都读得到全部读数。扣分：整体收起时，PR 按钮仍可聚焦，但只有 1px；复制会带上被收起的文字（都只做记录）。 | 0.870 |
| 设计系统一致性 | 5% | 8.2 | docs/12 和 `app.css` 的注释同步更新了。扣分：文档写“不短于 3.5em”“从不裁切”，在 R13-P3-01 的窄带里不成立。 | 0.410 |
| **合计** | 100% | | | **8.47** |

---

## 第 12 轮问题逐项核实

| 问题 | 判定 | 证据 |
|---|---|---|
| **R12-P3-01** 合并或关闭的 PR 加返工，最后一步仍硬切（“⟳3/”） | **已修复**（新引入的一个窄带问题见 R13-P3-01） | **第 12 轮复现组合重跑**（`tmp-review12-idprobe.spec.ts`，1241–1340 每 1px，加 1366、1440、1561、1800）：<br>• 原样运行会报出“切口”。原因是它的可见性判断只认 `display:none` 和 `.sr-only`，把这一轮改成 clip 的 1px 盒子当成了可见，而且这些盒子落在列外（`$R/r12probe/crowded/3ff2ebf/idprobe-{en,zh-CN}.txt`）。<br>• 只把可见性改成能识别 clip 后，`cutRanges: {}`，en/zh 都是 0（`idprobe-clipaware-*.txt`）。<br>• 1440 时显示 “PR ■1 ⟳3/3”、“PR ■2 ⟳2/3”、“PR merged ⟳1/3”（`zoom-idprobe-clipaware-{en,zh-CN}-1440.png`）。<br>**本轮扫描**（13 行，en/zh，1241–1800 每 2px，加 1040、1240；`$R/ident/{3ff2ebf,886ab38}/sweep-*.txt` 的 SUMMARY 行）：<br>• 硬切：`886ab38` en 775 次、zh 769 次；`3ff2ebf` en 0 次。zh 有 120 次，全部是 G-0017 在 1561–1799 那个 0px 宽的项目名，越出列 1px。可见读数没有被切，见 R13-P3-01。<br>• 我另外独立算了“理想步”：把 7 个步骤依次套到行上，用可见文字的矩形和列宽比较，取第一个放得下的步骤。实际步和理想步不一致的地方，en 6 处、zh 3 处，加上 G-0017 的 1561–1799。这些全是项目名被压到 ≤1.3px 的情况。<br>• 滞回 0。悬停、聚焦选中都不改变步骤（`misc-*.txt`）。<br>• 1560 到 1561 时标识列 130 → 163px，没有一行在变宽后走到更靠后的步骤。<br>• folded 只在压力行 G-0019 出现（en/zh 都是 1241–1251），在 1253 回到 pr-state。这一步时信息在标题的 tooltip 里，读屏照样读到。 |
| **R12-P3-02** 被收起的 PR 读数哪里都没有；短项目名占 3.5em；`.sep` 留下空白 | **已修复** | • **读屏名称**：10 个宽度 × 13 行 × en/zh，`toHaveAccessibleName` 全部等于完整摘要（如 “PR 已关闭：2 项通过，1 项失败，1 项等待中”）。PR 按钮没有 aria-label，`title` 是“摘要 / URL”。不一致 0 处（`$R/ident/3ff2ebf/names-*.txt`，SUMMARY 的 `problems: []`）。<br>• **tooltip**：标题的 tooltip 包含 PR 摘要、“Rework n / max / 返工 n / max”、已静音、引擎和项目名，0 处缺失。<br>• **被收起的部分仍被读到**：即使在 pr-state 和 folded，`ariaSnapshot` 里也有 `text: Muted`、`img "Rework 3 / 3"`、引擎和项目名。<br>• **axe**：拥挤看板在 1241、1440、1800 下 en/zh 都是 0 违规（`$R/fold/3ff2ebf/copy-axe-*.txt`）。我给 PR 按钮手动加了一个不符的 aria-label，axe 4.14 立刻报 `label-content-name-mismatch (serious)`（`axe-probe.txt`），说明作者说的“全量 e2e 中被 axe 抓到”是可信的，现在的写法也确实不触发。<br>• **短项目名**：`lib` 的盒子从 42px 变成 13px，和字宽相等。zh G-0002 在 ≥1561 时显示 “PR 开启中 ✓5 ·2 lib”；上轮这一行在所有宽度都只有 “PR lib”。<br>• **`.sep`**：计数收起后，PR 按钮尾部空白为 0px；`886ab38` 是 4px（`$R/ident/{3ff2ebf,886ab38}/sep-*.txt`）。 |
| **只做记录：** 窄头部里“已不在列表中”丢掉 pin | **已修复**（代价见 R13-P3-02） | • en 1024–1241 short-picks：“Base” 不带 pin，“No longer listed @15085f2” 带 pin。<br>• zh 1024–1041：“基线” 不带 pin，“已不在列表中 @115a373” 带 pin。<br>• 起点和终点都离开列表时，两项都保留 pin。<br>• 亮色和暗色都核过（`$R/picker/3ff2ebf/narrow-*.txt`、`narrow-gone-*.png`）。 |
| **只做记录：** “已静音”比项目名晚让位 | **已修复**（R13-P3-01 的窄带除外） | • G-0001（open PR，失败 1，已静音，返工 2/3，长项目名）在 en 1265–1799 显示 “PR ■1 ⟳2/3 store…”，已静音被收起。上轮在 1261–1800 一直显示 Muted 却不显示项目名。<br>• 例外：G-0018 在 en 1249–1250 是 “PR merged Muted”，项目名 `ui` 被压到 0.2px（R13-P3-01）。 |
| **只做记录（作者没有处理）：** ≥1561 决定行问句被截断、跨标准高危、canary tampered | **未处理，状态不变** | 这一轮没有动相关文件。回归截图和 `886ab38` 逐像素相同，只有时间文字不同。 |

**`refit` 的循环和性能（50 个目标的看板）**
- **循环：**50 行都用拥挤组合，不含 folded 压力行。加载后 RO 110 次、MO 112 次。静置 2 秒不增长；11 次缩放后 RO 979 次，再静置 2 秒也不增长。两个 commit 的计数完全相同，没有错误（`$R/fifty/{3ff2ebf,886ab38}/fifty-*.txt`）。
- **耗时：**每次缩放 21–115ms（`886ab38` 是 20–105ms）；在页面内测量是 26–41ms（`886ab38` 是 27–30ms）。
- **作者的 perf 测试：**两个 commit 交替各跑 2 轮，都通过（`$R/checks/perf.log`）。
  - “50 个目标减去对照看板”的中位数：本轮 53ms 和 60ms，`886ab38` 78ms 和 70ms，预算是 750ms。
  - 切换视图的中位数：本轮 59.5ms 和 62.5ms，`886ab38` 65ms 和 61.5ms，预算是对照加 150ms。
- **一个例外：**压力行进入或离开 folded 时，每次报一次 ResizeObserver loop。之后不再增长，见“只做记录”。

---

## 诚实语法

| 规则 | 判定 | 证据 |
|---|---|---|
| 绿色只给验证器的结果 | **成立** | 回归的 16 个状态 × en/zh × 3 个宽度：绿色元素的种类两个 commit 完全一样，只有生命周期字形、印章的 Disc、`seg-verified`、`result-pass` 和它的图标。拥挤看板 en/zh × 亮/暗 × 4 个宽度：标识列里没有一个元素是 `--st-verified` 或 `--st-attention` 的颜色（`$R/regress/*/log.txt`、`$R/honesty/3ff2ebf/greens-crowded-*.txt`）。 |
| 绿色总和它的 pin 一起出现 | **成立** | 拥挤看板上，可见的印章 100% 带着可见的 pin（`sealsNoPin: []`）。R13-P3-02 中被切的是标准条，印章 “Verified @15085f2” 本身完整。 |
| GitHub 的检查数不用验证器的绿色 | **成立** | `.pr-passed` 的颜色是 text-2：亮色 oklch(0.43 0.006 70)，暗色 oklch(0.86 0.005 70)。新增的 sr-only 摘要和 tooltip 只是文字，没有颜色。 |
| 琥珀 ◆ 只表示“需要你 / 先看这里” | **成立** | 标识列里没有琥珀色。PR 的失败计数用的是 `--st-danger` 的红色方块，这是既有设计。 |
| 中点只用在标准条和预算行 | **成立** | 两个 commit 都是 `dots: []`。新加的摘要用逗号分隔，不用 `·`。 |
| Agent 说的话永远不变绿 | **成立** | 台账和回归截图与 `886ab38` 一致。 |

---

## 回归检查（对照 `886ab38`）

- **覆盖面：**16 个状态 × en/zh × 亮/暗 × 1040/1440/1800，每个 commit 192 张。
  - 状态有：看板两种、收件箱（含 ci_failed 决定卡里的紧凑 PR）、两个目标页、评审页、对比模式、accept 弹层、两个 peek、修订合同、新建合同、Operations、Learning、设置、欢迎页。
  - spec 见 `$R/checks/specs/tmp-review13-regress.spec.ts`。
- **基本情况：**两个 commit 都是 0 个 pageerror、0 个元素越出窗口、0 处多余的中点。
- **像素差异：**
  - 去掉顶部 40 个 CSS 像素的状态栏（那里有时钟和“静默 9h 56m”）后，154 张完全相同。
  - 其余 38 张我逐类核过，都是运行时间的差别：
    - 看板实况列 “running 10h 9m / 10h 10m”。
    - peek 的 “Wall clock per run”。
    - Operations 的计划时间 06:00 / 06:01。
  - 证据：`$R/regress/diff.txt`、`diff-masked.txt`、`w-*.png`、`sbs-operations-en-light-1440.png`。
- **PR 行：**
  - 收件箱和目标页的 PR 行，可见部分与对照逐像素相同。
  - `title` 从只有 URL 变成“摘要 / URL”。
  - 目标页的读屏名称变成 “PR open: 3 passed, 1 failing test (ubuntu-latest, node 22)”。
- **其他页面：**评审页、accept 弹层、合同编辑器、设置、欢迎页、Learning 没有变化。
- **评审页窄头部：**比较运行、终点离开列表时有一处退化，见 R13-P3-02。

---

## 新问题清单

### P0、P1、P2

无。

### [R13-P3-01] 项目名被 flex 压到 ≤1px 时，被当成“已收起”：残片、顺序颠倒、步骤不单调（本轮引入，D117/D118）

- **重现：**拥挤看板，构造见 `$R/checks/specs/tmp-review13-board.ts`，扫描用 `tmp-review13-ident.spec.ts` 和 `tmp-review13-glitch.spec.ts`。每 1px 核过的例子：
  - en G-0004（第 12 轮 crowded 看板原有的一行：closed PR，等待 2，返工 3/3，Codex，已静音，`shop`）：**1241**。
  - en G-0013（idprobe (a)：merged，通过 4，返工 1/3，`shop`）：1246–1247。G-0003 同类，在 1247。
  - en G-0018（merged 40/3，已静音，`ui`）：1249–1250。
  - en G-0002（open 5/0/2，OpenCode，`lib`）：1253–1254。
  - en G-0016：1245。
  - zh G-0002：1261–1262。zh G-0018：1243。zh G-0016：1245。
  - zh G-0017（closed，失败 12，返工 10/10，已静音，Gemini CLI，`店面支付服务`）：**1561–1799 全段**。
- **现象**
  - **项目名消失或只剩残片：**`.g-project` 的宽度是 0–1.3px，没有被收起，`data-crowded` 停在更早的一步。
    - G-0004 在 en 1241 显示 “PR closed ⟳3/3 ꞉”，“s” 只剩 1px 的一条（`zoom-G-0004-en-1241-sliver.png`）。
    - G-0013 在 1247、G-0002 在 1254 也有类似的残片。
  - **顺序反过来：**
    - G-0002 在 1253–1254 显示 “PR open ✓5 ·2”，但 1252 和 1255 都是 “PR lib”。PR 的次要读数留下了，项目名却没了（`zoom-glitch-en-G-0002.png`）。
    - G-0018 在 1249–1250 显示 “PR merged Muted”，`ui` 没了，和“已静音先于项目名让位”相反（`zoom-glitch-en-G-0018-G-0013.png`）。
  - **步骤不单调：**en 有 6 处、zh 有 3 处，窗口变宽 2px，步骤反而后退。例如 G-0002：1253 engine → 1255 readings；G-0013：1247 readings → 1249 project。
  - **zh G-0017 在 ≥1561：**停在 quiet，项目名宽 0px，比列宽多出 1px，前面的 8px 间距留在了末尾。“⟳10/10” 比别的行早约 7px 结束，这一行没有贴到看板的右边缘（`crop-board-zh-CN-dark-1561.png` 第 8 行，`zoom-glitch-zh-G-0017.png`）。
- **证据**
  - `$R/ident/3ff2ebf/sweep-{en,zh-CN}.txt` 的 SUMMARY 行：`mismatchSample`、`mono`、`projSample`。
  - `glitch-*.txt`：`pOffset` 为 0 或 1，`pRect` 在 0.09–1.3 之间。
  - 上面列出的各张截图。
- **原因**
  - `GoalRow.tsx:52`：`if (!p || p.offsetWidth <= 1 || …) return true;`。原意是用 `offsetWidth <= 1` 识别“已收起成 1px 的盒子”，但被 flex 压到 ≤1px 的项目名也满足这个条件，于是被当成“放得下”。
  - `app.css:4400-4403`：这一轮把 `.g-id .g-project` 从 `min-width: 3.5em` 改成了 `min-width: 0`，`flex: 0 1 auto`，项目名才可能被压到 0。`886ab38` 有 3.5em 的下限，不会出现这种情况。
  - 一旦剩余空间落在约 [-1, 1]px 的窗口里，就会出现上面的现象。1241–1560 之间列宽随窗口每 1px 增加 1px，所以每一行在过渡处都有一两个像素的窄带。≥1561 时列宽固定为 12.5em，是否出现取决于组合，一旦出现就贯穿整段。
- **为什么是 P3**
  - 每一行只在 1–2px 的窄带里出现。持续出现的那一种组合，计数也偏大（失败 12，返工 10/10）。
  - tooltip 和读屏仍然完整，没有丢失信息。
  - 但它恰好是 D117/D118 要消灭的那一类问题：残片就是硬切，让位顺序也反了。docs/12 写的“不短于 3.5em”“从不裁切”在这里不成立。而且第 12 轮 crowded 看板原有的 G-0004 在 1241 就会出现。
- **修正目标**
  - 按步骤判断是否已收起，不按尺寸。例如步骤编号 ≥ project 才算收起，或者检查 `getComputedStyle(p).position === "absolute"`。
  - 被缩短的项目名宽度必须 ≥ min(字宽, 3.5em)，否则就进入下一步。对短于 3.5em 的名字，任何缩短都不接受。
  - e2e 不再用 `width > 1` 来定义“显示”，改用步骤来定义；在每个步骤的过渡处每 1px 扫一遍；断言“项目名显示时，宽度 ≥ min(字宽, 3.5em) − 0.5”。

### [R13-P3-02] 比较运行时终点离开列表，保留的 pin 让 en 1040–1052 的验证结论标准条被切（本轮引入，处理“只做记录”时带进来的）

- **重现：**en，打开 `review/G-0003`，切到“Compare runs”（Base → Latest），然后来一个新 pin，让终点离开列表（`$R/checks/specs/tmp-review13-picker{,2,3}.spec.ts`）。窗口在 1040–1052。
- **现象**
  - 窄头部（short-picks）下，“No longer listed @15085f2” 保留了 pin，大约多占 60px。`fitStats` 后面没有能再让位的步骤，统计行溢出，验证结论里的标准条被切在行尾：
    - 1040–1042：第 1 段被切，第 2 段在行外。
    - 1044：第 2 段在行外。
    - 1046–1052：第 2 段被切。
    - 1054 起完整。
  - `886ab38` 在这整个区间都完整。
  - 印章 “✓ Verified @15085f2” 本身是完整的。截图里，一个 2/2 的标准条只剩下一个小方块（`$R/picker/sbs-narrow-gone.png` 第 1–2 行）。
  - en 1024 时（低于 1040 的最小窗口）连印章也不完整，`886ab38` 是完整的（第 7–8 行）。
  - zh 在 1024–1041 下印章完整。起点和终点都离开列表时，验证读数里的 “已验证 2/2 · 观测 0/2” 被收起，`886ab38` 在 1040 时还显示，这是 counts-off 这一步的正常结果。
- **证据：**`$R/picker/{3ff2ebf,886ab38}/barfine-en.txt`（`segs` 字段）、`bar-*.txt`、`narrow-*.txt`、`narrow-gone-en-*-1040.png`、`$R/picker/sbs-narrow-gone.png`。
- **原因**
  - `workbenches.css:364` 让离开列表的那一项不随 short-picks 收起 pin。
  - `fitStats.ts:26/35`：short-picks 之后只剩 keys-off 一步，而且只在印章本身越界（`sealOut`）时才执行。标准条被切时 `drops()` 仍为真，但已经没有下一步可走。
- **为什么是 P3**
  - 只在比较运行、终点离开列表、en、窗口 ≤1052 时出现，而最小窗口就是 1040。
  - 印章和它的 pin 还在，诚实语法没有被破坏。
  - 但被切的是验证器的读数，2/2 看上去像一段。fitStats 的设计目标是“验证结论最后让位”，这里它在名字之前就让出了位置。
- **修正目标**
  - 在 1040 下，终点离开列表时，验证结论（印章和标准条）也要完整。可以让这一项先用更短的名字（例如 “Gone @15085f2” / “已不在 @115a373”），或者在标准条被切时也执行 keys-off，或者再加一步。
  - 在 `review-scope.spec.ts` 新加的段落里补上：en 1040 时，标准条的每一段都在统计行内。

### 只做记录，不计入

- **整体收起触发 ResizeObserver loop（本轮引入，只在压力组合出现）**
  - G-0019（1234 个失败检查，返工 99/99）在 1241–1251 走到 folded。
  - 每次进入或离开 folded，window 上都有一次 “ResizeObserver loop completed with undelivered notifications”。
  - 原因：所有子元素变成 absolute 后，`.g-id` 的高度从 20 变成 0，RO 在同一帧内又报了一次。
  - 静置后不再增长，WebKit 控制台没有 error，应用也没有全局错误处理（`$R/fold/3ff2ebf/fold-*.txt`）。
  - 现实组合走不到这一步：G-0017 的 “PR ■12 ⟳10/10” 在 1241 也放得下。
  - 可以给 `.g-id` 一个固定的 min-height。
- **收起后的 PR 按钮仍可聚焦**
  - folded 时，整个 PR 按钮变成 1px 的 clip 盒子，但仍在 Tab 顺序里。打开 macOS 全键盘控制时，焦点会落到一个看不见的元素上。
  - Playwright WebKit 的 Tab 不会经过按钮，这一点没有实测。
  - 只在 folded 时出现。
- **复制带出被收起的文字和 sr-only 摘要**
  - 在看板上选中 G-0002 的标识列，复制出来是 “PR open52PR open: 5 passed, 2 pending OpenCode lib”。
  - 目标页的 PR 行复制出来是 “PR open 3 1 PR open: 3 passed, 1 failing test (…)”。
  - `886ab38` 用的是 display:none，也没有 sr-only 摘要，所以不会这样（`copy-axe-*.txt`）。
- **已关闭的 PR 只剩 “PR ■1”**
  - 第 12 轮 (b)(c) 那类组合（关闭或合并，带失败检查，加返工）在 1241–1559（包括 1440）都显示 “PR ■1 ⟳3/3”，看起来和 open 的 PR 一样。状态在 tooltip 和读屏里。
  - 对已关闭的 PR 来说，“已关闭”可能比失败计数更重要，因为关闭后的失败检查已经无关紧要。可以考虑这种 PR 先保留状态词。
- **项目名会先于“已静音”或 PR 读数缩短**
  - 在 engine、readings、quiet 这几步，代码都允许项目名先缩短到 ≥3.5em。例如 en 1440 的 G-0015 显示 “Muted ⟳3/3 storef…”。
  - 文档写的是“再收已静音；再收项目名（可以先缩短）”，读法有歧义。
- **返工被读两次**
  - 读屏里，返工先读成 `img "Rework 3 / 3"`，再读成文本 “3/3”。这是既有问题。
- **en 起点和终点都离开列表、1024/1040 时验证结论整体被挤出**
  - 两个 commit 一样，是既有问题（`$R/picker/886ab38/narrow-en-*.txt`）。
- **≥1561 决定行问句被截断（D113 的取舍）**
  - 状态不变。
- **跨标准高危、canary tampered 的两条**
  - 状态不变，本轮没有动相关文件。

---

## 新增 e2e 是否测到了它声称的东西

- **数量**
  - e2e：`flows.spec.ts` 把原来的 crowded 测试改写成 2 块看板（PR open、PR 已合并或已关闭）× en/zh，共 4 条。
  - “engine 完整或收起”这条改了可见性断言：从 `toBeHidden` 改成宽度 ≤1，并加了 `toHaveText`。
  - `review-scope.spec.ts` 的选择框测试加了一段窄头部断言。
  - vitest 仍是 239 条，没有新增单测。
- **在 `886ab38` 上跑**（`$R/checks/new-e2e-on-886ab38.log`）：选中 6 条，**5 条失败，1 条通过**。通过的是“engine 完整或收起”，因为 display:none 下宽度本来就是 0，这条只是适配，不是新测试。失败原因都对：
  - open 看板 ×2：“project as wide as its name, G-0002 at 1241”，`lib` 宽 42px，字只有 13px。
  - settled 看板 ×2：“the PR's name, G-0002 at 1241”，期望 “PR merged: 4 passed”。同一个 JSON 里已经是 `idOver: true`。
  - 选择框：窄头部下，离开列表那一项的 pin 是 hidden。
  - 我另外做了一个只留切口断言的版本：去掉名称、tooltip 和项目宽度这几条断言，在 `886ab38` 上跑。settled 看板仍然失败在 “identity cut, G-0002 at 1241”（`new-e2e-cutonly-on-886ab38.log`）。所以这个测试单靠切口断言就能抓到 R12-P3-01。
- **会不会在别的实现下假通过**
  - **可见性定义有盲点：**测试用 `getBoundingClientRect().width > 1` 定义“显示”，和实现用 `offsetWidth <= 1` 判断“已收起”是同一个盲点。项目名被压到 0.2px 时，测试会把它当成已收起，所以即使恰好扫到 1253，也抓不到 R13-P3-01。
  - **采样太稀：**只扫 13 个宽度，1–2px 的窄带几乎一定会漏掉。
  - **folded 没有覆盖：**settled 看板的 `seen` 只要求出现 project 步骤，不要求 pr-state 和 folded；两块看板都走不到 folded。所以收起这一步，以及它的 RO 报错，都没有测到。
  - **“读屏仍读到”只测了 PR：**PR 的名称断言了完整摘要。但已静音、引擎和项目名是否“仍被读到”，只断言了 tooltip。如果有人改回 display:none，这几项测试照样通过。
  - **选择框只测了 1100：**只断言了 1100 下 pin 的显示和收起，没有断言窄头部下验证结论仍然完整，所以抓不到 R13-P3-02（en 1040–1052）。
  - **做得好的地方：**每一步都用“退回上一步就会溢出”来验证，这是最小步的定义，不依赖具体实现；名称断言用的是 `toHaveAccessibleName`，并要求 aria-label 为 null，能防止有人改回在文字上另盖一个标签。
- **有没有削弱测试：**没有。旧 crowded 测试原有的断言都保留了，可见性定义从 display:none 改成 1px，是因为实现方式变了。

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| `pnpm check/test/build` | pnpm 自动安装失败，报 “workspace hoist directory is not a real directory”，因为 node_modules 是符号链接，和上轮一样。所以直接调用 package.json 脚本里的同一个二进制。 | `pnpm-attempt/check.log`、`run-checks.sh` |
| tsc | EXIT=0 | `tsc.log` |
| vitest | 43 个文件，239 个测试，全部通过 | `vitest.log` |
| vite build | 通过 | `build.log` |
| bundle-budget | 通过。**合计 162,638 / 163,840**，余 1,202 B（第 12 轮 162,269，本轮 +369）。<br>启动 56,037 / 65,536，按需加载 106,601 / 110,592，目标页 11,597 / 12,288，worker 197,901 / 262,144。和作者说的一致。 | `bundle-budget.log` |
| line-limit | EXIT=0 | `line-limit.log` |
| doc-numbers | EXIT=0 | `doc-numbers.log` |
| Playwright 全量，按规定命令（1441） | 375 通过，**4 失败**，76 跳过，1.7 分钟。4 条都在 smoke.spec，原因都是字体 403 引起的控制台错误，属于环境问题，和前几轮一样。 | `e2e-full.log` |
| Playwright 全量，能提供字体的配置 | **379 通过，0 失败**，76 跳过，2.0 分钟。和作者说的 379/0 一致。 | `e2e-full-fonts.log` |
| perf（`--project=perf --no-deps`，两个 commit 交替各跑 2 次） | 都通过，数字见上文 refit 一节。 | `perf.log` |
| 新增测试在 `886ab38` 上 | e2e 6 条中 5 条失败，原因都对；只留切口断言的版本仍然失败。 | `new-e2e-on-886ab38.log`、`new-e2e-cutonly-on-886ab38.log` |

## 没能覆盖的

- **原生应用：**按规则没有运行打包好的应用，也没有跑 cargo。看到的都是 WebKit 加 stub IPC 的结果，数据都是注入的 fixture。
- **读屏：**没有做 VoiceOver 实测，结论来自无障碍树（`ariaSnapshot`、`toHaveAccessibleName`）。
- **全键盘控制：**没有验证焦点会不会落到 folded 时 1px 的 PR 按钮上，因为 Playwright WebKit 的 Tab 不经过按钮。
- **采样密度**
  - 标识列扫描每 2px 一次，只在发现的窄带附近补了每 1px。所以 R13-P3-01 的窄带数是下限，其他行在别的 1px 宽度上可能也有。
  - 第 12 轮 idprobe 每 1px 只扫了 1241–1340。
  - R13-P3-02 只在 en 1040–1062 逐 2px 量过；zh 只看了 1024、1032、1040、1041。
- **folded：**只用压力组合（G-0019）走到过；现实组合在 1241 以上我没能走到这一步。
- **运行时切换语言：**原生弹出菜单在 stub 下驱动不了，`refit` 的 MutationObserver 能不能覆盖，只读了代码。
- **生产构建：**没有在 vite preview 上跑 e2e；shots 项目没有跑，作者说 69/69。
- **只做记录里的旧条目：**决定行问句、跨标准高危、canary tampered，这一轮的代码没有改动，只用回归截图确认了没有变化，没有重新深入核实。

## 验收条件

**通过。**没有必须先解决的问题。建议按这个顺序修：

1. **R13-P3-01：**`fitId` 按步骤判断是否已收起，不按尺寸；被缩短的项目名宽度必须 ≥ min(字宽, 3.5em)，否则进入下一步。e2e 改用步骤来定义“显示”，并在每个过渡处每 1px 扫一遍。完成标准：理想步和实际步不一致 0 处、步骤单调、没有 ≤1.3px 的残片，en/zh 都在 1241–1800 每 1px 验证。
2. **R13-P3-02：**终点离开列表、保留 pin 时，验证结论在 1040 下也要完整。可以给这一项更短的名字，或者在标准条被切时也执行 keys-off。`review-scope.spec.ts` 补上 en 1040 下标准条每一段都在统计行内的断言。
3. **可以顺手处理的（只做记录）：**
   - 给 `.g-id` 一个固定的 min-height，消除 folded 时的 RO loop 报错。
   - folded 时让 PR 按钮离开 Tab 顺序。
   - 被收起的读数和 sr-only 摘要不进入复制。
   - 考虑已关闭的 PR 先保留状态词，再保留失败计数。

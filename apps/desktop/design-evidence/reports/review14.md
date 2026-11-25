## Tower 前端设计评审：第 14 轮（`1ad1439`，含 `1c9af8a` D119，对照 `3ff2ebf`）

> 文中 `$R` 指 `/tmp/tower-design/review14`。截图、日志都在这个目录下；临时 spec 已从 worktree 删除，副本留在 `$R/checks/specs/`。

**结论：PASS。** 加权得分 **8.35/10**，不低于 8.0。没有未关闭的 P0 或 P1。有 1 条 P2，是 D119 带进来的。

负责人点名的三个标记都换掉了：红色方块、黄色菱形、蓝色半圆。换上的是一套圆盘标记，符号是真正的镂空，在 2x 下清晰，暗色下对比度够。第 13 轮的两条 P3 都修好了，作者处理的两条“只做记录”也都做到了。

这一轮新记 1 条 P2、4 条 P3：

- **R14-P2-01（D119 引入）：** 运行中的字形按“状态”转，不按“在不在动”转。目标在等你回答，或者 Agent 已经沉默、被标成 Unresponsive 时，看板、侧栏里它的标记照样在转，标题栏的运行计量也在转。默认 fixture 里的 G-0002 就是这样。
- **R14-P3-01（D119 引入）：** 减少动效时，标准条的段仍然沿长度填充，约 465ms。全局规则 `*` 选不到 `::after`。
- **R14-P3-02（D119 引入）：** 目标页实况行的 shimmer 很耗 CPU。在 headless WebKit 里，运行中目标页静置时约占一个核的 26–29 个百分点。
- **R14-P3-03（既有，本轮改过这一行但没改完）：** 留出测试的文件清单仍然用文字字符 ✓ ✕ ○ 表示状态。
- **R14-P3-04（D119 引入）：** 手机页决定卡顶条里新的 ! 圆盘，被旧的 9px 规则压小了。

---

## 评审范围

- **环境**
  - 评审 worktree：`/tmp/tower-design/wt-review14`（`1ad1439`，detached）。
  - 对照 worktree：`wt-review14-base`（`3ff2ebf`，vite 1442）、`wt-review14-base2`（`1c9af8a`，vite 1443）。两个都已删除。
  - Playwright WebKit（Desktop Safari，DPR 2；做标记细节时另开 DPR 1、3 的 context）。Tauri IPC 用 stub，fixtures 是 `/tmp/tower-design/fixtures{,-zh}`。
- **中断：**评审中途会话中断过一次，服务随之停止。恢复后重开了 1441 的 vite，用来重跑第 13 轮的复现 spec。中断前已完成的检查没有重跑。
- **字体**
  - 按规定命令运行时，字体请求被拒（403，“outside of Vite serving allow list”），smoke.spec 有 5 条因此失败。
  - 所以测量、截图和第二次全量 e2e 都跑在 `$R/tools/vite.review.config.mjs` 上。这个配置原样导入生产配置，只把主 checkout 的 node_modules 加进 `fs.allow`，依赖缓存放在 `$R/vite-cache`（结束时已删除）。
- **pnpm：**pnpm 报 “workspace hoist directory is not a real directory”（node_modules 是符号链接），所以直接调用 package.json 脚本里的同一个二进制（`$R/checks/run-checks.sh`，`pnpm-attempt/`）。
- **cargo：**`CARGO_TARGET_DIR` 指向 worktree 外的 `$R/cargo-target`，结束时已删除。
- **手机页：**没有起静态服务。我照 `phone.spec.ts` 的做法，用 Playwright 的 `page.route` 把 `remote.html` 从磁盘送出去，`/api/state` 用 fixture 的数据回答。1443 用来跑 base2 的 vite。
- **拥挤看板的构造**（`$R/checks/specs/tmp-review14-board.ts`）
  - 用的行：第 13 轮看板原有的 G-0001 到 G-0004，加上克隆出来的 G-0011 到 G-0022，一共 16 行。
  - PR 覆盖 open、merged、closed，检查数有 0、小数、大数。
  - 返工到上限，有静音，有非默认引擎（Claude Code、Gemini CLI、OpenCode、Codex）。
  - 项目名有长有短：`storefront-payments` / `店面支付服务`、`payments` / `支付网关`、`lib`、`ui` / `支付`。
  - 压力行 G-0019：1234 个失败检查，返工 99/99。
- **清理**
  - 临时 spec 已删除，也删了 `test-results/`；没有生成 `dist/`。
  - 两个对照 worktree 已用 `git worktree remove --force` 删除。`git worktree list` 只剩主 checkout 和 wt-review14。
  - 1441–1443 上没有服务在监听。
  - `git -C /tmp/tower-design/wt-review14 status`：HEAD 是 `1ad1439`，只剩 `node_modules` 和 `apps/desktop/node_modules` 两个符号链接。
  - 主 checkout 我只做过 `worktree add/remove`，它的 status 只有一个未跟踪的 `.claude/`。
  - 说明：规定命令下 Playwright 自启 vite 的缓存，以及 vitest 的缓存，会经符号链接写进主 checkout 里已被 git 忽略的 `node_modules/.vite`、`.vite-temp`，和上一轮一样。

---

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.3 | 负责人的意见基本解决：三个劣质标记全部换掉，状态都画成同一套圆盘，旋转只给运行和验证。扣分：等你和沉默时标记照转（R14-P2-01），旋转说的“在干活”和行上的字（“Question”“Unresponsive”）矛盾；shimmer 的 CPU 代价不小（R14-P3-02）。 | 1.245 |
| 信息架构与工作流 | 20% | 8.6 | 标识列的让位在 16 行 × en/zh × 1241–1800 每 1px 都正确；评审头部的验证结论在 1040 以上完整。扣分：“需要你”一组里的行在转，和那一组的意思冲突；en 两端都离开列表、1077–1150 时多收了按键提示（只做记录）。 | 1.720 |
| 视觉层级 | 15% | 8.4 | 琥珀 ! 一眼就是“看这里”，红 × 是“错了”，i 只描边，层级比 ■ ◆ ◇ 清楚。段改成胶囊，observed 是斜纹，和 empty 分得开。扣分：标题栏同时有点、环、圆盘三种尺寸，错误数用红点、别处用红 ×（只做记录）；留出文件清单还是文字符号（R14-P3-03）。 | 1.260 |
| 原创性与产品身份 | 15% | 8.3 | 诚实语法没有被打破：绿色只在验证器结果上，而且带 pin。斜纹的 observed 段和印章的斜纹呼应，有自己的样子。圆盘加镂空这套标记接近 Primer 和 GitHub Actions 的做法，算稳妥而不是独特。 | 1.245 |
| 工艺与排版 | 10% | 8.2 | DPR 2、3 下边缘干净，镂空真的透出底色；12px 标记在各页面相对文字的位置一致；亮色琥珀在选中底上对比度 3.43，暗色 8 以上。扣分：手机页 ! 被压到 9px（R14-P3-04）；DPR 1 下 12px 的 × 发糊（只做记录）。 | 0.820 |
| 密度与克制 | 10% | 8.2 | 看板行永远不 shimmer，shimmer 只在一个地方。扣分：50 个运行中目标时有 101 个旋转（看板 50、侧栏 50、标题栏 1），侧栏把每个旋转又复制了一份；等你和沉默的目标也在转。 | 0.820 |
| 交互 | 10% | 8.4 | 按键提示这一步第一次真正生效，而且只在需要时才收（en 两端离开列表的一段除外）；收起后 PR 按钮离开 Tab 顺序；减少动效时，看板和手机页的动画数为 0。扣分：减少动效时段的填充照样播放（R14-P3-01）。 | 0.840 |
| 设计系统一致性 | 5% | 8.0 | `MARK_PATH`、`tokens.css` 的遮罩、手机页三处用同一组路径，有单测锁住。扣分：手机页的 9px 旧规则和这套标记脱节；docs/12 §12.6.1 写字形 10×10，代码默认 12；DESIGN.md 写“状态从不用文字字符画”，`CriterionRow.tsx` 还在用。 | 0.400 |
| **合计** | | | | **8.350** |

---

## D119 评价（状态标记和动效）

**负责人的三个标记**
- 红色方块 → 红底镂空 ×；黄色菱形 → 琥珀底镂空 !；蓝色半圆 → 淡色环加四分之一弧，整体旋转；暂停保留环，里面两条竖线。
- 回归截图里，看板、收件箱、目标页、评审页、accept、peek、设置、Operations 都换了，没有漏网的旧标记（`$R/regress/sbs/*.png`，`$R/zoom/titlebar-*.png`，`board-glyphs-en-light-1440.png`）。

**全应用字符搜索**（`$R/checks/charscan.txt`，在 `apps/desktop/src` 的 tsx/ts/css/json、`index.html`、`remote.html` 里搜 ■ □ ◆ ◇ ● ○ ◐ ◑ ▲ △ ▼ ⬛ ⬜ ★ ⚠ ✓ ✔ ✕ ✖ ✗ × •，测试文件和纯注释行除外）

| 命中 | 判断 |
|---|---|
| CSS `content`、i18n、手机页里的 ■ ◆ ◇ ● ◐ | 都没有了。 |
| `CriterionRow.tsx:40-42` 的 `✓ ${f}`、`✕ ${f}`、`○ ${f}` | 仍是状态字符，见 R14-P3-03。 |
| `HoldoutDrafts.tsx:51/63`、`SteerBox.tsx:55` 的文字 “×” | 关闭和移除按钮，不是状态，既有，只做记录。 |
| `ContractRail.tsx:105` 的 `${n}×` | 乘号读数（第 n 次），不是标记。 |
| 收件箱控制台里的 ✖、ℹ | 测试运行器原样输出的文字，不是 UI，不算。 |

**清晰度和镂空**（`$R/marks/1ad1439/sheet-dpr{1,2,3}-{light,dark}.png`，`$R/zoom/sheet-dpr2-stripes*.png`）
- 标记直接从组件的 markup 克隆，路径读自 `Glyph.tsx`。在 12、14、16px，以及 app、选中、浮起、注意底、红蓝条纹五种底上各画一遍。
- DPR 2、3 下边缘干净，! 的竖和点、× 的两笔都分得开。
- 条纹底上，符号处透出的是条纹，确认是 even-odd 镂空，不是画上去的底色。
- DPR 1 下 12px 的 × 两笔糊成一团（只做记录；Mac 内屏基本都是 2x）。

**对比度**（`$R/checks/contrast.txt`，按 `tokens.css` 的 oklch 值换算成 sRGB 后计算）

| | app 底 | 浮起 | 选中 | 注意底 |
|---|---|---|---|---|
| 亮色琥珀 ! | 4.00 | 4.09 | 3.43 | 3.66 |
| 亮色红 × | 5.45 | 5.58 | 4.68 | 5.00 |
| 暗色琥珀 ! | 9.86 | 9.19 | 8.03 | 8.99 |
| 暗色红 × | 7.94 | 7.40 | 6.46 | 7.24 |

- 都不低于非文字元素要求的 3:1。最低的是亮色琥珀在选中行上，3.43。

**相对文字的位置**（`$R/marks/1ad1439/placement-{en,zh-CN}.txt`，看板、收件箱、canary 目标页、评审页、设置）
- 12px 标记在 12px 文字旁：中心比 x-height 中线高 1.08px，下沿在基线下 1.6–2.1px，各页一致。
- 和 DESIGN.md 写的“基线下 2px”一致。没有忽高忽低的情况。

**标准条的段**（`$R/segs/1ad1439/stack-zoom.png`，`obs-stack-zoom.png`）
- 胶囊轨道上，verified 是绿色，observed 是灰色斜纹，empty 是淡色轨道。三者在 DPR 1、2，亮色、暗色下都分得开。
- DPR 1 时斜纹偏灰，但仍能和空段区分。

**动效**（`$R/motion/1ad1439/fifty.txt`、`goalpage-cpu.txt`、`segfill-*.txt`）
- **旋转：**只用 transform（keyframes 只有 transform），1.1s 一圈，linear，以 6px 6px 为中心。
- **50 个运行中目标的看板：**

  | 情况 | 动画数 | 帧间隔 | CPU（占一个核） |
  |---|---|---|---|
  | 正常 | 151 个：spin 101（看板 50、侧栏 50、标题栏 1），swap 50（opacity） | 中位 14ms，p95 15ms，最大 19ms，0 帧 > 20ms | 14.2% |
  | 减少动效 | 0 | — | 2.3% |
  | 对照：50 个暂停目标 | swap 50 | — | 0.5% |

  CPU 是所有 Playwright WebKit 进程合计，静置 6 秒，headless。
- **shimmer 的位置：**看板 0 处；运行中目标页的实况行 1 处，动画属性是 `background-position`。peek 没有单独量。代价见 R14-P3-02。
- **减少动效：**看板和目标页的 `getAnimations()` 都是 0；手机页 0 个动画，旋转标记停在 `transform: none`，也就是弧停在右上。例外是段的 `::after` 填充，见 R14-P3-01。
- **问题：**旋转在等你和沉默时不停，见 R14-P2-01。

**手机页**（`$R/phone/1ad1439/phone-{light,dark}-{top,full,offline}.png`、`phone-*.txt`，`$R/zoom/phone-strip-*.png`、`phone-gauges-*.png`）
- 标记和桌面端同路径，亮色、暗色都正常；运行中 2 个旋转；离线时红 × 在文字旁。
- 减少动效时完全静止。
- 决定卡顶条的 ! 被压到 9px，见 R14-P3-04。

**和 Primer、Geist、Linear 的常见做法对比**
- **做到了的：**
  - 圆盘加镂空符号（Primer 的 `alert-fill`、`x-circle-fill`），16 单位网格。
  - 运行中用旋转的圆环加弧（GitHub Actions 的 in-progress），减少动效时停住。
  - 只在一处用文字 shimmer（AI Elements）。
- **还不够的：**
  - **“排队或等待”和“进行中”没有分开。**GitHub Actions 的 queued 和 waiting 是静态的，Geist 的 building 只在真的在构建时才动。Tower 现在只要状态是 running 就转（R14-P2-01）。
  - **同一屏里的旋转太多。**侧栏为每个运行中目标再画一个旋转标记。Linear 这类工具在侧栏只放静态状态图标或计数。可以考虑侧栏保持静止，只让看板和标题栏动。
  - **标题栏的读数没有统一。**“3 need you” 用琥珀 !；“2 errors” 用红点（`gauge-dot down`），不是红 ×；“silent for 30s” 没有标记；运行计量是带弧的圆环。在一条 12px 的状态栏里，点、环、圆盘三种尺寸混在一起（`$R/zoom/titlebar-errors-{3ff2ebf,1ad1439}.png`，只做记录）。

---

## 第 13 轮问题逐项核实

| 问题 | 判定 | 证据 |
|---|---|---|
| **R13-P3-01** 项目名被 flex 压到 ≤1px 时，被当成“已收起” | **已修复** | **本轮扫描**（16 行 × en/zh × 1241–1800 每 1px，加 1040、1240，往宽和往窄各扫一遍，每种语言 8992 行次）：<br>• 硬切 0；实际步和我独立算的理想步不一致 0；项目名过窄 0；≤1.3px 残片 0；尾部空隙 0；步骤不单调 0；滞回 0；错误 0（`$R/ident/1ad1439/sweep-{en,zh-CN}.txt` 的 SUMMARY）。<br>• 读屏名称和 tooltip：`problems: []`（`names-*.txt`）。<br>**第 13 轮复现 spec 原样重跑**（`tmp-review13-glitch.spec.ts`、`tmp-review13-r12idprobe-clipaware.spec.ts`，输出在 `$R/r13repro/`）：<br>• 6 个窄带组合每 1px 都是实际步等于理想步。<br>• 只有 project 及以后的步骤才出现 1px 的 clip 盒子，这是按设计收起，不是残片。<br>• `rightGap` 全是 0；clip-aware 探针 `cutRanges: {}`。<br>• G-0002 en 1248–1258 一直是 “PR lib”，`lib` 完整 13px；G-0018 一直是 “PR merged ui”；zh G-0017 在 1561 显示 “PR 已关闭 ⊗12 ⟳10/10”，末尾贴右（`$R/r13repro/glitch-stack.png`）。 |
| **R13-P3-02** 终点离开列表时，en 1040–1052 验证结论的标准条被切 | **已修复** | 4 种头部状态（单次运行、比较、终点离开、两端都离开）× en/zh × 1024–1400 每 1px，往宽和往窄（`$R/picker/1ad1439/head-*.txt` 的 SUMMARY）：<br>• 印章和每一段都完整，只有 en 两端离开列表、1024–1037 例外：两个方向共 28 次，都低于 1040 的最小窗口，是既有问题。第 13 轮在 1040 也不完整，现在从 1038 起完整。<br>• 不来回跳变；ResizeObserver 错误 0；静置时 RO 增量 0。<br>• 按键提示只在 en 终点离开 ≤1053、en 两端离开 ≤1189 收起；单次运行、比较、zh 从不收起。<br>• 按钮 tooltip 一直带快捷键；离开列表的一端始终显示 “No longer listed”，pin 在 tooltip 里。<br>• 例外：en 两端离开、1077–1150 有一段多收了按键提示，见“只做记录”。 |
| **只做记录：**收起时触发 ResizeObserver loop | **已处理** | G-0019 在 1440 → 1241 → 1260 之间来回进出 folded：`.g-id` 高度一直 20px，window 错误 0（`$R/fold/1ad1439/fold-{en,zh-CN}.txt`）。新测试的 RO 计数为 0；换回旧 `app.css` 时，压力组计到 2 次（见测试一节）。 |
| **只做记录：**收起后 PR 按钮仍可聚焦 | **已处理**（真实 Tab 顺序没能测） | • folded 的 11 个采样都是 `prTab: -1`，其余 7 个是 0。<br>• 读屏名称仍是完整摘要，tooltip 完整，axe 0 违规（`copy-axe-*.txt`）。<br>• Playwright WebKit 的 Tab 只在 body 和输入框之间切换，没能验证全键盘控制下的焦点。 |
| **只做记录：**复制带出被收起的文字和 sr-only 摘要 | **未处理，状态不变** | `copy-axe-*.txt`。 |
| **只做记录：**已关闭的 PR 在 pr-state 只剩失败计数 | **未处理，状态不变** | 现在显示 “PR ⊗12 ⟳10/10”，红方块换成了红 ×，状态词照样被收起（zh G-0017 1241–1560，`sweep-zh-CN.txt` 的 textRanges）。 |
| **只做记录：**en 两端离开列表、1024/1040 时验证结论被挤出 | **改善** | 现在只剩 1024–1037，低于最小窗口。 |
| **只做记录：**返工被读两次；≥1561 决定行问句截断；跨标准高危；canary tampered | **未处理** | 相关文件这一轮只换了标记。我没有重新深入核实，只看了回归截图。 |

---

## 诚实语法

| 规则 | 判定 | 证据 |
|---|---|---|
| 绿色只给验证器的结果 | **成立** | 回归 20 个状态 × en/zh × 亮/暗 × 4 个宽度里，绿色元素只有生命周期字形（svg/circle/path）、印章，以及 `seg-verified::after`（`$R/regress/1ad1439/log.txt` 的 `greens`）。拥挤看板的标识列里没有绿色或琥珀色（`$R/honesty/1ad1439/greens-crowded-*.txt` 的 `greenOrAmberInId: []`）。 |
| 绿色总和 pin 一起出现 | **成立** | 拥挤看板 `sealsNoPin: []`。评审头部收起 pin 时，收的是比较选择框的 pin，印章 “Verified @15085f2” 始终完整。 |
| GitHub 的检查数不用验证器的绿色 | **成立** | `.pr-passed` 是 text-2，oklch(0.43 0.006 70)。 |
| 琥珀 ! 只表示“需要你 / 先看这里”，不表示证据 | **成立** | 用在三个地方：需要你、被扣下的印章（“Passed, doesn't count”）、不算数的段和标准。没有一处表示“通过”。留出文件 “✕ 没跑到” 的琥珀底标签也是“先看这里”。 |
| 中点只在标准条和预算行 | **桌面端成立**；手机页有既有例外 | 桌面端回归 `dots: []`；源码里的中点都在 `HonestyCore.tsx` 和预算文案里（`charscan.txt`）。手机页的 “Live stream · updated …”、实况行 “动作 · 目标” 从 `3ff2ebf` 起就有（`remote.html:197/214/459`），只做记录。 |
| Agent 说的话永远不变绿 | **成立** | 回归截图和 `greens` 里，Agent 的话（实况行、“Agent says”）没有绿色。shimmer 的光带用的是页面底色，不是彩色。 |
| 动效语义（新增的检查项） | **不完全成立** | 旋转本该只表示“在动的工作”，但等你和沉默时也在转，见 R14-P2-01。 |

---

## 回归检查（对照 `3ff2ebf`）

- **覆盖面：**20 个状态 × en/zh × 亮/暗 × 1040/1241/1440/1800，每个 commit 320 张。
  - 状态有：看板三种（rich、plain、toasts）、收件箱、四个目标页（含运行中、留出部分失败）、评审页、比较模式、accept、两个 peek、修订合同、新建合同、带字段标记的新建合同、Operations、Learning、设置、欢迎页。
  - spec 见 `$R/checks/specs/tmp-review14-regress.spec.ts`。
- **基本情况：**两个 commit 都是 16/16 通过，pageerror 0，越出窗口的元素 0，多余的中点 0（`$R/regress/*/log.txt`）。
- **像素差异：**去掉顶部 40 个 CSS 像素后，0/320 张完全相同。这是预期的，因为标记全换了。按状态看差异占比（`$R/regress/diff-masked.txt`）：
  - accept 0.8–1.8%。
  - 收件箱和 peek 0.4–0.9%。
  - 其余 < 0.5%。
  - 欢迎页、新建、修订 < 0.05%。
- **逐张看过的：**accept、收件箱、peek、Operations、设置，en 1440 的亮色或暗色（`$R/regress/sbs/*.png`）。
  - 变化只有标记本身。标记后的文字右移约 2–3 CSS px，因为 12px 的圆盘比 9px 的菱形宽。
  - 没有换行、错位或截断变化。
- **其余状态：**只按差异占比和包围盒判断，没有逐张看。

---

## 新问题清单

### P0、P1

无。

### [R14-P2-01] 运行中的字形按状态旋转：等你回答或已经沉默的目标，标记照转（D119 引入）

- **重现**
  - 打开看板，用默认 fixture 就能看到：G-0002 是 running，很久没有动静，Live 列显示 “Unresponsive”。
  - 再加一个 running 目标：`mode: "waiting_on_you"`，`needs_you: 1`，收件箱里有一条问题（`$R/checks/specs/tmp-review14-segs.spec.ts` 的最后一个测试）。
- **现象**
  - “需要你”一组里，“Ask before dropping the legacy coupon table · Question” 那一行的字形 `glyph-spin`，`animation-name: spin`。
  - “Running”一组里，G-0002 “Unresponsive” 的字形也在转。
  - 侧栏里两者都在转；标题栏 “2/4 running” 的计量也在转。
  - 同一份数据里，目标页的 shimmer 在这两种情况下都正确地停了。
  - 证据：`$R/motion/1ad1439/waiting.txt`、`waiting-on-you-board.png`。
- **原因**
  - `Glyph.tsx:65-67` 的 `svg(children, spin)`：running、verifying 两个分支只看 `props.goal.state` 就传 `spin = true`。
  - `TelemetryStrip.tsx:72-73`：只要 `running() > 0` 就画旋转的 `<Spinner>`。
  - `Live.tsx:152` 已经有正确的判断 `moving()`（running、不等你、没有 needs_you、不沉默），但只给 shimmer 用。
- **为什么是 P2**
  - 动效是这一轮的核心承诺：docs/12 §12.6.1 写“在动的工作会转”，§12.7 表格写“在动的工作才转”。负责人也要求动效有目的。
  - 现在旋转在“需要你”一组里告诉你“它在干活”，而那一组的意思正是“它在等你”。在 Unresponsive 旁边转，也和字面意思矛盾。
  - 默认数据就能看到，出现在看板、侧栏、标题栏三处。
  - 不是 P1：字、分组、收件箱都对，信息没有丢，只是动效给了相反的暗示。
- **修正目标**
  - 抽一个 `moving(goal, now)`，Live、`LifecycleGlyph`、标题栏计量和手机页共用。
  - running 但等你或沉默时，字形静止，弧停在右上，和减少动效时一样。标题栏计量只有在至少一个运行中目标真的在动时才转。
  - 单测：`LifecycleGlyph` 遇到 `waiting_on_you`、`needs_you > 0`、silent 时，没有 `glyph-spin`。
  - e2e：看板上这样的一行 `getAnimations()` 为空。
  - 同步 docs/12 §12.6.1 和 §12.7 那一行的“谁引起”。

### [R14-P3-01] 减少动效时，标准条的段仍沿长度填充（D119 引入）

- **重现：**`emulateMedia({ reducedMotion: "reduce" })`，打开 `goal/G-0002`，把一个 `.seg-empty` 改成 `.seg-verified`。这和组件在计数变化时保留元素、只换 class 的做法相同。然后按时间读 `::after` 的 transform（`$R/checks/specs/tmp-review14-motion2.spec.ts`）。
- **现象**
  - 减少动效：16ms scaleX 0 → 60ms 0.27 → 120ms 0.67 → 240ms 0.95 → 600ms 到位。
  - 不减少动效：0 → 0.32 → 0.68 → 0.96 → 到位。两者几乎一样。
  - 减少动效下，`::after` 的 `transition-duration` 仍是 “0.465s, 0.16s”。
  - `getAnimations()` 在两种模式下都看不到这个伪元素的过渡，所以只能靠采样 transform 来证明。
  - 证据：`$R/motion/1ad1439/segfill-{reduced,motion}.txt`、`reduced.txt`。
- **原因**
  - `base.css:201-206` 的 `* { animation-duration: 0ms !important; transition-duration: 0ms !important; }` 选不到 `::before`、`::after`。
  - `app.css:760` 的 `.seg::after { transition: transform var(--spring-snappy), … }` 是 D119 新加的。
  - 作者知道伪元素这个缺口：`app.css:911-912` 给 `.btn.armed::after` 单独写了减少动效的规则，但漏了段。
- **为什么是 P3：**元素只有 12×4px，465ms，只动 transform，前庭风险很小。但它和作者说的“减少动效时全部静止”、docs/12 §12.7 “分段条的计数变化 … 减弱动效时 0”都不符。
- **修正目标**
  - 在减少动效的规则里加 `.seg::after { transition: none; }`，或者把全局规则扩成 `*, *::before, *::after`。`.btn.armed::after` 已经是 `animation: none`，不受影响。
  - 补一条减少动效下的 e2e：换 class 后 60ms 时 transform 已经到位。

### [R14-P3-02] 目标页实况行的 shimmer 很耗 CPU（D119 引入）

- **重现：**`goal/G-0002`，让它刚刚有过动作，鼠标移开，静置 6 秒，读所有 Playwright WebKit 进程的 CPU。五种情况各测两轮（`goalpage-cpu.txt`）：

  | 情况 | CPU（占一个核） |
  |---|---|
  | 全开 | 35.2%、38.3% |
  | 减少动效 | 8.5%、8.0% |
  | 只关 shimmer | 9.5%、9.8% |
  | 只关旋转 | 33.7%、34.7% |
  | 都关 | 7.5%、7.3% |

  另一次单独测量（`fifty.txt` 的 goal page 一行）是 26%。两次是不同的运行，不能直接比。
- **结论：**shimmer 一项约占一个核的 26–29 个百分点；页面上 3 个旋转合计约 1–4 个百分点。
- **原因：**`app.css:431-449`，`background-clip: text` 的文字上动画 `background-position`。每帧都要重绘文字，进不了合成层。旋转只动 transform，所以便宜。
- **为什么是 P3**
  - 只在打开运行中目标的页面或 peek 时出现。
  - 数字来自 headless WebKit，可能高估；真实的 WKWebView 没有测。
  - 但 Tower 是会一直开着、盯着 Agent 的应用。docs/13 §13.8 给 Tower 自身只预留了 0.5 个核，一行文字的光带就可能吃掉一半。
- **修正目标**
  - 先在 Tauri 的 WKWebView 里用 Activity Monitor 或 `powermetrics` 实测。
  - 如果量级相近，可以只在动作变化时扫 1–2 遍，然后停；窗口失焦或隐藏时暂停；或者换一种只用 transform 或 opacity 的实现。
  - 给 perf 项目加一条运行中目标页静置时的 CPU 预算。

### [R14-P3-03] 留出测试的文件清单仍用文字字符表示状态（既有，D119 改过这一行但没改完）

- **重现：**目标页，留出测试部分失败（fixture `enrichHeldOutPartly`），展开读数。
- **现象：**“✓ test/holdout/rounding.test.js”、琥珀底标签里的 “✕ test/holdout/tax.test.js”，无法证明的一项是 “○ …”。这几个都是等宽字体里的文字符号（`$R/zoom/heldout-files-en-{light,dark}.png`，对照 `heldout-files-en-light-3ff2ebf.png`）。
- **原因：**`CriterionRow.tsx:40-42`。D119 只把 `◇` 换成了 `○`，`✓` 和 `✕` 原样保留。
- **为什么是 P3**
  - 负责人要的是“全面纠正”，DESIGN.md:364 和 :399 也写了状态从不用文字字符画。
  - 这里的 ✕ 是琥珀色，表示“没跑到”；而这套标记里的 × 表示红色的失败。同一个符号有了两种意思。
  - 面积小，只在展开读数时出现。
- **修正目标：**改用标记，或者不用符号只用文字（例如“已运行 / 没跑到 / 无法证明”加分组）。补一条单测，断言这个清单里没有这些字符。

### [R14-P3-04] 手机页决定卡顶条的 ! 被旧规则压到 9px（D119 引入）

- **重现：**手机页（390×844，DPR 3），收件箱里有决定卡，看顶条。
- **现象：**顶条里的琥珀 ! 只有 9px，桌面端同样的位置是 12px。! 的竖笔和点在 9px 时几乎挤在一起，和旁边 12px 的文字比例失调（`$R/zoom/phone-strip-{light,dark}.png`）。
- **原因：**`remote.html:98` `.strip .mark { width: 9px; height: 9px; }`。这条规则原本是给 `3ff2ebf` 那个 9×9 的菱形用的；D119 把标记换成 16 单位网格的 12px 圆盘（`remote.html:250`），这条规则没跟着改。
- **为什么是 P3：**只在手机页的顶条；仍能看出是琥珀 !。
- **修正目标：**删掉或改成 12px，和桌面端一致。`Glyph.test.tsx` 现在只比较路径，可以再断言手机页这个标记的渲染尺寸。

### 只做记录，不计入

- **按键提示收得多了**
  - en 两端都离开列表、1077–1150（74px，两个方向都是）：keys-off 和 gone-pins-off 同时生效，但只收 gone-pins-off 就已经放得下。证据是 `head-en-both-gone.txt` 的 `needless`。
  - 原因：步骤只往前加，不回退。顺序按 `app.css` 注释写的“先按键提示，再收离开列表一端的 pin”。
  - 如果把 R9-P3-02 读成“有地方就保留按键提示”，可以在加完后一步后回头试一次能不能撤掉前一步。
- **DPR 1 下 12px 的 × 发糊。**
- **标题栏的读数不统一：**琥珀 !、红点、带弧的圆环、无标记的 “silent for …” 混在一起。
- **文档和代码的尺寸不一致：**docs/12 §12.6.1 写生命周期字形 10×10，`Glyph.tsx:61` 默认是 12；`Spinner` 默认 10（`Glyph.tsx:239`）；被扣下的印章里，! 在小尺寸下是 10px（`Glyph.tsx:515`）。
- **50 个运行中目标的旋转代价：**CPU 14.2%，减少动效 2.3%，暂停对照 0.5%。其中一半旋转在侧栏。
- **手机页的中点：**`remote.html:197/214/459`，既有。
- **关闭和移除按钮用文字 “×”：**`HoldoutDrafts.tsx:51/63`、`SteerBox.tsx:55`，既有，不是状态。

---

## 新增和改写的测试是否测到了它声称的东西

**1. 第 14 轮的 e2e 放到 `1c9af8a` 上跑**（`$R/checks/newtests-on-1c9af8a.log`）：选中 7 条，**5 条失败，2 条通过**。失败原因都对：

| 测试 | 失败在 | 对应的问题 |
|---|---|---|
| en open | “project shown and legible, G-0003 at 1561”，项目名宽 0.94px | R13-P3-01 |
| en settled | “project shown and legible, G-0002 at 1246”，宽 0.30px | R13-P3-01 |
| en、zh 压力组 | “the PR a Tab stop only while on the line, G-0003 at 1241”，folded 时 `prTab` 为 0 | 收起后 PR 仍可聚焦 |
| 选择框 | “segments cut at 1040”，cut 2，seal false | R13-P3-02 |

通过的是 zh open 和 zh settled。

**2. 每次只换回一个旧文件**（在 base2 里，代码和测试都用 `1ad1439`，只把列出的文件换回 `1c9af8a`，`$R/checks/hybrid-*.log`）

| 换回的旧文件 | 结果 | 说明 |
|---|---|---|
| 无（对照） | 7/7 通过 | |
| `GoalRow.tsx` | 4 失败，2 通过 | 失败的和上表的 4 条标识列测试相同。`aside` 由 GoalRow 传给 PrLine，所以 Tab 断言也随之失败。 |
| `app.css` | 2 失败，4 通过 | 只有压力组失败：“ResizeObserver loop notices over the sweep”，计到 2 次。说明 RO 计数真的会计数。 |
| `fitStats.ts` + `workbenches.css` | 选择框在 1040 失败（cut 2，seal false） | |
| 只有 `fitStats.ts` | 同上 | |
| 只有 `workbenches.css` | 选择框在 1040 失败（cut 2，seal true） | 我的扫描（`$R/picker/hybrid-oldwb/`）：en 两端离开列表时，验证结论被切的宽度次数从 28 升到 254；单端离开仍是 0。 |

作者说的四组对照都复现了。

**3. D119 的单测放到 `3ff2ebf` 上跑**（`$R/checks/d119-units-on-3ff2ebf.log`）：Glyph 和 Honesty 两个文件，**5 条失败，21 条通过**。失败原因都对：
- 没有 `MARK_PATH`。
- running 没有 `glyph-spin`。
- viewBox 是 `0 0 10 10`，不是 `0 0 16 16`。
- `tokens.css` 里没有遮罩。
- 计数变化时，段的元素被重建（`toBe` 不成立）。

**会不会在别的实现下假通过**
- **D120 的断言只在 en 起作用：**换回旧 `GoalRow.tsx` 时，zh 两组照样通过。原因是 zh 的窄带不落在测试看板的组合上。压力组在旧代码上先停在 Tab 断言，项目名断言没走到。这条测试依赖 fixture 恰好碰上窄带；我自己的 16 行看板覆盖得更广。
- **“显示”的定义：**改用步骤来定义，和实现的步骤对应。但它不是同一个盲点：如果实现在某一步错误地收起了项目名，测试会去量它的宽度，从而抓到。这一点比第 13 轮好。
- **单调性只往宽扫了一遍，没有测往窄。**我的扫描补了两个方向，滞回为 0。
- **review-scope 新段落的覆盖面：**只测 en、只测终点离开、只测 1040–1064。zh、两端都离开、“有地方时按键提示要回来”都没有测。`layout.spec.ts:394-404` 只在单次运行下断言了 1024、1100、1240 时按键提示可见，比较模式下没有。所以“比较模式下按键提示一直收着”这种退化测不出来。
- **Tab 只断言了 `tabIndex` 属性，**不是真实的焦点顺序（WebKit 测不了）。
- **D119 没有测试的：**等你或沉默时不转（R14-P2-01）；减少动效下段不填充（R14-P3-01）；手机页标记的渲染尺寸（R14-P3-04）；状态不用文字字符（R14-P3-03）。`Glyph.test.tsx` 断言“running 一定有 `glyph-spin`”，没有带 mode；修 R14-P2-01 时要一起改。
- **有没有削弱测试：**没有。D119 对 accept、honesty、verdict、phone、flows 的改动是把 ◆、■ 的断言换成新标记；第 14 轮原有的断言都保留了。

---

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| `pnpm check/test/build` | pnpm 报 “workspace hoist directory is not a real directory”（符号链接），改为直接调用 package.json 里的同一个二进制 | `pnpm-attempt/`、`run-checks.sh` |
| tsc | EXIT=0 | `tsc.log` |
| vitest | 42 个文件，241 个测试，全部通过 | `vitest.log` |
| vite build | 通过 | `build.log` |
| bundle-budget | 通过。**合计 162,773 / 163,840**，余 1,067 B，比第 13 轮多 135 B。<br>启动 56,115 / 65,536，按需加载 106,658 / 110,592，目标页 11,598 / 12,288，worker 197,901 / 262,144。 | `bundle-budget.log` |
| line-limit | EXIT=0 | `line-limit.log` |
| doc-numbers | EXIT=0 | `doc-numbers.log` |
| `cargo test -p tower-supervisor remote` | 4 通过 | `cargo-remote.log` |
| Playwright 全量，按规定命令（1441） | 377 通过，**5 失败**，76 跳过，4.5 分钟。5 条都在 smoke.spec，原因是字体 403 引起的控制台错误（“Failed to load resource … 403”），属于环境问题。 | `e2e-full.log` |
| Playwright 全量，能提供字体的配置 | **382 通过，0 失败**，76 跳过，3.4 分钟 | `e2e-full-fonts.log` |
| 新测试在旧代码上 | 见上一节 | `newtests-on-1c9af8a.log`、`hybrid-*.log`、`d119-units-on-3ff2ebf.log` |

---

## 没能覆盖的

- **原生应用：**按规则没有运行打包好的应用。看到的都是 Playwright WebKit 加 stub IPC 的结果；CPU 数字来自 headless WebKit，不是 WKWebView。
- **读屏和全键盘控制：**没有做 VoiceOver 实测。WebKit 的 Tab 不经过按钮，folded 时 PR 按钮离开 Tab 顺序只核了属性。
- **没在真实渲染里看到的遮罩标记：**
  - error 和 warning 的 toast：我构造的状态里，它们被归到了标题栏的 “2 errors” 计数，没有以 toast 出现（`$R/zoom/toasts-en-light-*.png` 里只有 success 和 info）。
  - 失败的 trace 步骤、风险徽章：没看到。
  - 留出清单里的 “○ 无法证明” 一项：fixture 没有这种文件。
  - 字段错误和提示的遮罩看过：用应用自己的 class 注入在编辑器里。
- **peek 的 shimmer 没有单独量；**手机页的旋转在等你和沉默时是否也不停，没有查。
- **D119 改写的 e2e：**flows、honesty、verdict、phone、accept 没有放到 `3ff2ebf` 上跑，只跑了两个单测文件。
- **回归：**只逐张看了 5 个状态（en 1440），其余按差异占比判断。
- **第 13 轮的旧记录：**返工读两次、决定行问句截断、跨标准高危、canary tampered，没有重新深入核实。
- **其他：**
  - 运行时切换语言：原生菜单在 stub 下驱动不了。
  - 生产构建：没有在 vite preview 上跑 e2e，shots 和 perf 项目这一轮没有跑。
- **手机页的打开方式：**说明里建议在 1443 起临时静态服务。我改用 Playwright 的 route 直接送出文件，效果相同。1443 用来跑了 base2 的 vite。

---

## 验收条件

**通过。**没有必须先解决的 P0 或 P1。建议按这个顺序修：

1. **R14-P2-01：**字形和标题栏计量按 `moving()` 决定转不转，和 shimmer 共用同一个判断。完成标准：
   - running 加 `waiting_on_you`、running 加 `needs_you > 0`、running 加 silent 三种情况，看板、侧栏、标题栏都没有 `glyph-spin`；在动的运行中目标照转。
   - 有单测和 e2e。
   - docs/12 §12.6.1 和 §12.7 同步。
2. **R14-P3-01：**减少动效时，段的 `::after` 不过渡。完成标准：e2e 在 reduce 下改 class，60ms 时 transform 已到位。
3. **R14-P3-04：**手机页顶条的标记改成 12px，和桌面端一致。
4. **R14-P3-03：**留出文件清单不用 ✓ ✕ ○，改用标记或纯文字，“没跑到”不要再和失败的 × 共用一个符号。
5. **R14-P3-02：**在 WKWebView 里实测 shimmer 的 CPU。如果代价相近，改成只在动作变化时扫一两遍、失焦时暂停，或者换成只用 transform 或 opacity 的实现；给 perf 加一条静置 CPU 的预算。
6. **可以顺手处理的（只做记录）：**
   - en 两端离开列表、1077–1150 时，在收 pin 后撤掉多收的按键提示。
   - 标题栏统一用标记（错误用红 ×，不用红点）。
   - 侧栏的旋转考虑保持静止。
   - docs/12 里字形的尺寸改成和代码一致。

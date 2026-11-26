# Independent baseline review (frontend-reviewer, bf22cad)

> Saved verbatim by the main agent from the reviewer's final message; the reviewer's sandbox refused report files.

# Tower 前端设计评审（基线，commit `bf22cad`）

**说明：** 报告没能写入 `/tmp/tower-design/review-baseline/report.md`。运行环境拒绝子代理写报告文件（"Subagents should return findings as text"），我没有绕过这个限制。全文在下面，需要落盘请由你写入。截图和日志都已在该目录下。

**结论：不通过设计验收。** 外壳克制、统一，评审页的键盘流程也成熟。但 Tower 自己的卖点没有落到界面上：
- 事实和 Agent 的说法分不开；
- 一个目标到底被证明了什么，在目标页、看板和各处状态标签里要么读不出来，要么互相矛盾；
- 看板的主扫描路径（j/k）每按一次，版面就大幅跳动。

**设计方向：需要局部调整。** “安静的仪表盘”这个方向成立：灰底，颜色只表示状态，只有浮层带阴影，没有装饰性渐变、卡片堆叠或表情符号。问题集中在证据层级、状态用词和“选中即展开”的交互模型，不需要重新设计。

**评审范围：**
- **界面：** 概览（含空看板、1100、1800、j 选中态）、需要你、G-0001 到 G-0005 的目标页（含无法运行）、review/G-0001 和 review/G-0003（含 readout、accept 弹层、全部接受、空评审）、新建合同（含 look 标准）、设置（含 phone、通知区块）、学习、运营、⌘K、?（看板版和评审版）、Space peek、活动与错误面板、welcome（红色版和通过版）。
- **主题、语言、尺寸：** en/light 和 zh-CN/dark；宽度 1100、1440、1800；高度 900 和 760。
- **基线截图：** 69 张逐张看过，其中 24 张通过缩略拼图查看（`$R/crops/contact-*.png`）。引用到的复制进了 `$R/shots/`。
- **自跑交互：** WebKit，端口 1441。截图在 `$R/flows/`，局部放大在 `$R/crops/`，按键日志在 `$R/flows/log-*.txt`。
- **走过的流程：**
  - 看板：j/k、Space、R、Enter 进目标页。
  - 目标页通读；⌘K 搜索后回车；peek 打开和关闭。
  - review/G-0003：用 J/K/]/V/A 过完两个单元，再按 ⌘⇧↩ 打开 accept 弹层。
  - review/G-0001：检查 accept 的门槛和弹层裁切。
  - 需要你页面：j/k、数字键、破坏性选项二次确认。
  - 新建合同：标题、+Look、Tab 顺序、⌘↩。

**没能覆盖的部分及原因：**
1. **真实 WKWebView 窗口没看。** `tools/screenshot.sh` 需要构建 Tauri，本次被要求不能构建。无头 WebKit 不渲染 `backdrop-filter`，对照页 `$R/flows/04-backdrop-sanity.png` 可以证明。所以半透明浮层（P2-01）只能带保留意见评价。
2. **20 个以上目标时的密度没法测。** fixture 只有 5 个目标。
3. **真实 IPC 行为没法验证：**
   - 真实延迟；
   - 勾选人工标准后的状态回写（mock 不回写 `human_check`）；
   - 合同的服务端校验（mock 的 `validate_contract` 永远返回空）。
4. **没走到真正封存提交。** fixture 没有设置 git 身份，“接受”按钮停在禁用态。
5. **评审单元的风险排序是 fixture 给的**，无法判断排序本身对不对。
6. **截图里的时间戳比基线旧。** fixture 时间已经老化，所以我的截图显示 “silent for 11m”，基线里是 “15s ago”，不影响结论。

## 分维度评价

- **产品适配性：3/5。** 信息架构对准了任务。决策卡的文案很好，比如 held-out 和 cannot-run 两张卡（`flows/01-board-j1.png`、`01-board-j4.png`）。但北极星问题 Q3（离完成还有多远、证据是什么）在看板和目标页首屏都答不出来（P1-01、P2-06）。
- **视觉设计：3/5。** 克制，明暗两套主题一致（`crops/overview-dark-small.png`、`shots/overview-en-light.png`）。但字号几乎全挤在 11–13px，区块标题只靠字重 500 和正文的 400 区分，目标页读起来像一面墙（`flows/02-goal-G0001-top.png`）。全应用唯一的展示级字号给了 accept 弹层里的“印章”。
- **原创性：3/5。**
  - 自有元素：◆ 琥珀色、两轨标准条、生命周期字形、“Passed, not evidence”印章、说法与事实对照表。
  - 其余接近通用的 Linear 式中性模板。
  - welcome 页最像模板：大标题、一段说明、三条卖点（`shots/welcome-clean-en-light.png`）。
- **工程细节：3/5。** 双语和明暗主题稳定，没有溢出。但存在以下问题：
  - 出现 11.076、11.5375、11.999、14.768px 这类非 token 的小数字号；
  - 评审页代码文本晚一步才出现；
  - 标准的子行有三种缩进；
  - accept 弹层的固定行动栏挡住了阻塞原因。
- **信息架构：3/5。** 顶层结构合理，页内顺序有问题：
  - 目标页里，Agent 的说法排在验收标准前面；
  - 同一组 4 个目标在概览上同时出现三次；
  - 同一个目标有 5 种状态叫法。
- **交互体验：3/5。**
  - 做得好：评审页按 V 标记已看并前进，J/K 切换单元，底部有键位提示，最少 3 次按键就能走到确认；破坏性选项要按两次，并有可见的倒计时（`crops/ib-after-3-small.png`）。
  - 有问题：看板 j/k 会让版面跳动；Space 和 R 在 5 行里有 4 行不起作用；新建页面的初始焦点不在标题框。
- **功能完整性：4/5。** 空状态、错误态、无法运行、首次运行、活动日志、二次确认、快捷键表都有。

## 问题清单

`$R` = `/tmp/tower-design/review-baseline`

### [P1-01] 目标页把证据放在首屏之外、排在 Agent 说法之后，结论只是右上角小字
- **位置：** `goal/G-0001`，1440×900 和 1100，两种主题都一样。区块顺序在 `apps/desktop/src/views/goal/GoalBlocks.tsx:61`（Next）、`:85`（Cause）、`:114`（Sentinels）、`:135`（Acceptance criteria）。
- **截图证据：**
  - `$R/flows/02-goal-G0001-top.png`（与 `shots/goal-G-0001-en-light.png` 相同）：首屏依次是 CI 失败卡、Next、Cause（“┊ Agent says…”）、4 条哨兵。验收标准不在首屏。
  - `$R/flows/10-goal-G0001-1100-en-light.png`：1100 宽下同样如此。
  - 实测各区块顶部位置（视口高 900）：Next@358、Cause@451、Sentinels@536、Acceptance criteria@989（`flows/log-goal.txt`）。
  - 字号统计：12px 文本 86 处，13px/400 有 33 处，区块标题是 13px/500，最大正文 20px 只有 1 处。
- **问题：**
  - 回答“证明了什么”的验收标准区排在第四个区块，在首屏之外。
  - 排在它前面的是 Agent 的自述（Cause），与“证据优先于说法”正好相反。
  - 结论 “◆ Passed, not evidence” 和 “PR open ✓3 ■1” 这类元数据一样大，不比它们醒目。
- **影响：** 每次进目标页都要多滚一屏、多做一次长距离的视线跳转，而且先读到的是说法，不是事实。
- **修正目标：**
  - 在 1440×900 下，不滚动就能看到结论行、两轨进度条、每条标准一行的状态。
  - 验收标准排在 Agent 说法之前；哨兵在首屏只占一行摘要。
  - 区块标题比正文至少大一个字号档。

### [P1-02] 每条验收标准的展开内容像调试日志：重复、自相矛盾、全是内部术语
- **位置：** `goal/G-0001` 的验收标准区和评审 readout，`apps/desktop/src/views/goal/CriterionRow.tsx`。
- **截图证据：**
  - `$R/crops/goal-criteria-C1C2.png`：
    - C1 已通过（✓），同一行却写着 “Canary intact”，还挂着红色的 “Assertion tamper” 标签。
    - C2 里 “assertions not checked” 出现两次，“held-out tests, for you only” 也出现两次。
    - 子行的起点在三个不同的缩进位置。
  - `$R/flows/02-goal-G0001-bottom.png`：C5 里 “a test that must fail passed” 出现两次。
  - 满屏实现层术语：“Base→Pin proved”、“Guard multi-proc gap”、“Assertion guard ✓”。
- **影响：** 产品最核心的证据块需要逐行解码，直接削弱 Tower 相比聊天式工具的唯一优势：可读的证据。
- **修正目标：**
  - 每条标准默认 1 行判定，最多再加 1 行用户语言的限定说明。
  - 同一事实在一条标准里只出现一次。
  - 已通过的标准不挂危险色标签；如果有篡改，直接降级判定。
  - 所有子行共用一个缩进。
  - 实现术语只在展开详情里出现。

### [P1-03] 事实与说法的视觉区分太弱，部分 Agent 说法没有标成说法
- **截图证据：**
  - `$R/crops/goal-changes-claims.png`：
    - “┊ Summary total() now multiplies…” 是 Agent 的说法，标签却只写 “Summary”。
    - 说法与事实对照表的两列，颜色和字重完全相同。
    - “C3 … ⇔ Unsupported”（说法与事实不符）只是普通灰字。
  - `$R/crops/peek-drawer.png`：“┊ Next”、“┊ Cause” 是说法，唯一的标记是一条 1px 的虚线竖条。
  - 表示事实的字形 ⏊ 约 8px，浅灰色。
- **影响：** 扫一眼的用户会把 Agent 的总结当成 Tower 的结论。
- **修正目标：**
  - 每条 Agent 说法都带有能读出来的 “Agent says / Agent 称”，或者有整体可辨的排版样式。
  - 截图转成灰度后，不看图例也能把每一句归类为事实、观测、说法或人工。
  - “Unsupported” 使用注意力色，或者让结论降级。

### [P1-04] 看板上用 j/k 浏览“需要你”时，每按一次就原地展开整张卡，下面的行跳动几百像素
- **位置：** `overview`，`apps/desktop/src/views/Overview.tsx:82–96` 和 `:220`。
- **截图证据：**
  - `$R/flows/01-board-j1.png`：卡片展开到 415px 高。
  - `$R/flows/01-board-j4.png`：卡片展开到 369px 高。
  - `$R/crops/board1100-small.png`：1100 宽下同样如此。
  - 连按 5 次 j，Running 行 G-0002 的顶部位置是 371 → 746 → 520 → 487 → 700 → 371。1100 宽数值相同（`flows/log-board.txt`）。
- **问题：**
  - 选中和展开绑在一起，j/k 本来是用来扫描列表的。
  - 违背了团队自己写的“版面稳定，位置只由人改变”。
- **影响：** 扫一遍 4 件“需要你”，变成了逐卡阅读，每按一次键眼睛都要重新找位置。
- **修正目标：**
  - j/k 只移动选中高亮。验收方法：连按 5 次 j，G-0002 的顶部位置不变。
  - 卡片只在按 Enter 时展开，或者在固定的侧栏里显示。

### [P1-05] accept 弹层禁用“接受”时不显示原因，第二个阻塞项被固定行动栏盖住
- **位置：** `review/G-0001` 的 accept 弹层。相关代码：`apps/desktop/src/views/review/panels.tsx:371`，以及 `styles/app.css:3309` 的 sticky `.panel-actions`。
- **截图证据：**
  - `$R/flows/06-accept-sheet-ticked.png`：“Accept anyway” 是禁用态，可见区域里没有任何解释。原因只写在悬停提示里（“Human criterion C3, C4 is not checked yet”）。
  - 实测（视口高 900）：行动栏在 834–860px；git 身份表单的 “Set in git” 在 895–921px，在滚动区里、行动栏下方，没有可见的滚动提示。
  - `$R/crops/clip760-small.png`（视口高 760）：下方大约三分之一被截断。
  - 对照：G-0003 的弹层内容较少，身份表单可见（`$R/flows/05-review-accept-sheet.png`）。
- **影响：** 在产品最关键的一步，用户面对一个点不动的按钮，不知道为什么。
- **修正目标：**
  - 按钮禁用时，紧挨按钮上方有一行可见文字，列出全部阻塞项，并能一键跳过去。
  - 阻塞项排在信息性清单之前。
  - 1440×760 下所有可操作项无需滚动即可见。

### [P1-06] 同一个目标在各界面的状态叫法互相矛盾，“不算证据”的目标在别处被标成 Ready
- **截图证据：** G-0001 在各处的叫法——
  - 看板：“CI failed”（`shots/overview-en-light.png`）；
  - 侧栏：琥珀色 ◆；
  - ⌘K：“Ready to accept”（`flows/03-palette-cart.png`）；
  - 运营页：存储表写 “Ready to accept”，合并队列写 “Ready”（`shots/final-operations-light.png`）；
  - 目标页和评审页头：“Passed, not evidence”。评审页头旁边的 “Accept ⌘⇧↩” 始终是黑色主按钮（`shots/review-G-0001-en-light.png`）。
- **问题：** 生命周期状态名直接显示，没有加上证据判定。
- **影响：** 用户从运营页或 ⌘K 出发，可能把一个证据被篡改的目标当成可以合并的。对一个以诚实为卖点的产品，这是信任问题。
- **修正目标：**
  - 所有界面用同一个“状态 + 判定”的显示方式；任何界面都不对“封存被扣留 / 不算证据”的目标显示 Ready。
  - 判定不是 Verified 时，评审页头的 Accept 按钮降为次级样式。
  - 验收方法：G-0001 在 6 个界面的叫法一致。

### [P2-01] peek 抽屉和 ⌘K 是半透明浮层，底下的看板文字透了出来
- **位置：** `styles/app.css:3142–3168`，light 主题下 `--material-float` 的透明度是 0.84。
- **截图证据：**
  - `$R/crops/peek-drawer.png`：抽屉里能读到底层的 “G-0004…Spend…Claude Code G-0002”。
  - `$R/flows/03-palette-cart.png`：面板条目和底层文字叠在一起。
- **保留意见：**
  - 无头 WebKit 不做模糊，真实窗口里应该轻很多。
  - 暗色主题下透出较轻。
  - 即便如此，peek 是要读的面板，不该放在半透明材质上。
- **附带问题：** 抽屉标题写 “Running”，正文却是 “Unresponsive · last activity 11m ago”，前后矛盾。
- **修正目标：**
  - 抽屉改成不透明。
  - 在真实窗口里验证，两种主题下看不到任何底层字形。
  - 标题状态与正文一致。

### [P2-02] 看板底部提示和快捷键表与实际行为不符
- **位置：** `Overview.tsx` 里的 `reviewCurrent` / `peekCurrent` 只处理 `kind === "goal"`。
- **截图证据：**
  - `flows/log-board.txt`：在 G-0001 的决策行上按 Space 不打开 peek，按 R 留在概览页。
  - 底部提示却一直写着 “␣ peek · R Review”（`crops/board-keyhints.png`）。
  - 快捷键表里没有 Space（`shots/shortcuts-en-light.png`）。
- **影响：**
  - 5 行里有 4 行按 Space、R 没有反应，也没有提示。
  - 可评审的 G-0001 和 G-0003 在看板上没法用 R 进入评审。
- **修正目标：**
  - 凡是对应某个目标的行，都响应 Space 和 R。
  - 快捷键表列出 Space。

### [P2-03] 打开评审页时，先闪一帧“有行号、有底色、没有代码”的画面
- **截图证据：**
  - `$R/flows/05-review-start.png`：只有行号和底色，没有代码。
  - `05-review-k1-j.png` 对比 `05-review-k5-v.png`：代码先以未高亮的纯文本出现，之后才高亮。
  - 实测：表格在 1179ms 画出，代码文本到 1320ms 才出现（这是 mock 环境，真实 IPC 只会更慢）。
- **修正目标：** 纯文本和表格同时画出；高亮在原位替换，不引起重排。

### [P2-04] 琥珀色（唯一的打扰色）被用作焦点高亮，还在同一条目上重复出现
- **截图证据：**
  - `$R/crops/inbox-j-small.png`：获得焦点的卡片页眉变成琥珀色底。
  - `shots/overview-en-light.png`：
    - 侧栏每个“需要你”条目前面是状态字形，后面又是一个琥珀 ◆；
    - 看板上“需要你”的 4 行，行首都是同一个 ◆，侧栏里能区分的暂停、已验证等状态在看板上丢了。
- **修正目标：**
  - 焦点改用强调色或中性色。
  - 每个条目上琥珀色最多出现一次。
  - 看板行首字形与侧栏一致，表示具体状态。

### [P2-05] 外壳重复：概览上同一组 4 个目标出现三次，顶栏常驻 9 项
- **截图证据：**
  - `shots/overview-en-light.png`：导航、侧栏分组、看板三处同时列出这 4 个目标。
  - `shots/overview-zh-dark-1100.png`：1100 宽时侧栏标题全部被截断。
  - 顶栏常驻 9 项，其中 “Seatbelt S2”、“● Pi” 是静态配置，不是状态。
- **修正目标：**
  - 同一屏里任何目标只出现一次。
  - 顶栏只放会变化的状态。

### [P2-06] 看板上“需要你”的行不显示证据，与 Running 组用的是两套行格式
- **截图证据：** `shots/overview-en-light.png`、`crops/overview-dark-small.png`。G-0003 的 “Verified 2/2” 和 G-0001 的 “Passed, not evidence” 在看板上都看不到。
- **修正目标：** 所有行共用同一组列，至少包含判定或两轨标准条。

### [P2-07] 新建合同的焦点和布局问题
- **证据：**
  - `flows/log-contract.txt`：进入页面后焦点在 body，直接打字无效；点 “+ Look” 后焦点也没有跟过去。
  - `flows/08-contract-ratify-early.png`：
    - 默认同时展开约 20 个控件，引擎、沙箱、网络、端口、自主度和意图放在同一层级；
    - 右栏编号 “04” 和左栏的 “01/02” 并列，“03” 却在左栏下方；
    - 顶部还有 “CONTRACT SHOP NEW” 这样字距拉开的大写眉题。
- **修正目标：**
  - N / ⌘N 进入后光标落在标题框。
  - 新增一条标准后，焦点落在它的描述框。
  - 高级配置默认折叠成一行摘要。
  - 编号顺序与阅读顺序一致。

### [P2-08] 评审页的 “Accept” 一词身兼两义，“还原”和阅读标记同级并排
- **截图证据：**
  - `flows/05-review-start.png`：每个区块头都有 “Accept this hunk A” 和 “Revert hunk”，右上角又有 “Accept ⌘⇧↩”。
  - `flows/05-review-k11-v.png`：同时出现 “Viewed”、“Accepted, 3 lines folded”。
  - `shots/shortcuts-review-zh-dark.png`：写着“接受当前区块（你的阅读标记）”。
- **影响：** 新用户会以为“接受区块”就是部分接受了改动；而误点“还原”的代价远高于误点阅读标记。
- **修正目标：**
  - 阅读标记只保留一个概念（Viewed），让 Accept 只指封存。
  - Revert 降级或挪开，并提供撤销。

### [P2-09] 空看板的占位行看起来像“正在加载”
- **截图证据：** `shots/overview-empty-en-light.png`、`overview-empty-zh-dark.png`，“No active goals” 下面有骨架条。
- **修正目标：** 已经加载完成的空状态里，不出现骨架样式的占位。

### [P2-10] 字号体系过于压缩，且有非 token 的小数字号
- **证据：**
  - 目标页出现 10、11、11.076、11.5、11.999、12、13、14.768、20px；评审页出现 11.5375px 等。
  - 印章约 40px，是全应用唯一的展示级字号（`shots/review-G-0001-accept-en-light.png`）。
- **修正目标：**
  - 字号最多 5 档 token，不出现小数字号。
  - 区块标题比正文至少大一档。

### P3（次要）
- **P3-01** “Abandon this goal” 带有 btn-danger 类，在按下之前外观却和普通按钮一样。二次确认机制本身很好（`flows/01-board-j1.png`）。
- **P3-02** 运营页表格（`shots/final-operations-light.png`）：
  - cron 只显示原始表达式，没有人话；
  - 表头标了 UTC，Next 列却没标时区；
  - Total 列的数据条两条都是满格，提供不了信息；
  - 按钮样式混用（纯文字和带边框的都有）。
- **P3-03** 校准表用绿色条表示首通率，而团队规定绿色只属于验证器的结论；“Low n” 是术语（`shots/final-learning-light.png`）。
- **P3-04** 评审空状态挤在左侧一列（`shots/review-empty-en-light.png`）。
- **P3-05** 文件树里的风险标记 “▮▮” 没有可见含义，含义只在 aria 和悬停提示里（`review/sidebar.tsx:36`）。
- **P3-06** welcome 是落地页模板，套在完整的应用外壳里，侧栏还能点进空页面。偏品味，优先级最低。
- **P3-07** 1800 宽时，看板行的标题和右端 ID 相距约 1300px（`shots/overview-en-light-1800.png`）。

**做得好、修改时不要破坏的地方：**
- 外壳在明暗主题和中英文下都一致。
- 只有浮层带阴影。
- 评审页的键盘流程和底部键位提示。
- 数字键选决策，破坏性选项要按两次确认。
- ⌘K 的匹配高亮。
- held-out 和 cannot-run 卡片的文案。

## 验收条件

**必须解决：** P1-01 到 P1-06。

**还需要补做：** 用 `tools/screenshot.sh` 在真实窗口里验证 P2-01。

**建议同批处理：** P2-02、P2-04、P2-07，成本低，而且直接关系到“键盘优先”和“琥珀色只表示需要你”。

**验收方法：**
- 用同一套 fixture，在 1440×900 和 1100 宽、en/light 和 zh/dark 下重拍概览、G-0001、G-0001 的 accept 弹层、⌘K。
- 连按 5 次 j，确认看板其他行的顶部位置不变。
- 核对 G-0001 在 6 个界面的状态叫法一致。

## 总评分（0–10）

| 维度 | 分数 |
|---|---|
| Product Fit | 6 |
| Information Architecture & Workflow | 5 |
| Visual Design Quality | 6 |
| Originality & Product Identity | 5 |
| Craft & Typography | 5 |
| Information Density & Restraint | 6 |
| Interaction Quality | 6 |
| Design System Consistency | 5 |

**最终结论：FAIL。** 没有 P0；6 个 P1 都落在核心承诺上：证据可读、说法与事实分开、状态诚实一致、看板可扫读。方向成立，需要局部重构，不需要重新设计。

**收尾情况：**
- 临时脚本 `apps/desktop/e2e/zz-review-{flows,measure,clip,abandon}.spec.ts` 已全部删除，`git status` 干净。
- 没改任何产品源码，没在 `/Volumes/Remi/Tower/tower` 里跑任何东西。
- Playwright 在 `apps/desktop/test-results/.last-run.json` 留下了一个被 git 忽略的标记文件。
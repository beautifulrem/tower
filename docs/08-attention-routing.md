# 08 · 注意力路由（Attention Routing）

> 本文定义 Tower 何时、以何种强度、通过什么渠道占用人的注意力；如何度量和调节这件事本身；人回来时如何快速重建情境；以及 Goal 的模式（Mode）如何从引擎事件推导并映射到注意力。
>
> 依据：`00` R3/R5/R6/R10、北极星问题 1/2/4；`02` §2.4 Mode、§2.9 NeedsYouItem、`Goal.watermarks`；`03` I4；ADR-010/014/019/020/023/034；`07` §7.10 严重度表。默认数值与快捷键以 `16-registry.md`（ADR-039）为单一来源。研究依据（`research/theory-brainstorm.md`，简写 *TB*）：A8 例外管理/暗驾驶舱、A9 ISA-18.2 与报警疲劳、A10 中断研究（Iqbal & Bailey、Parnin、Horvitz）、A6 模式混淆、C8/C9、D#7/8/18/19。

---

## 8.0 设计立场

1. **注意力是 Tower 最稀缺的预算。** 遥测显示，即使同时运行 4 个以上 Agent，用户仍有超过 80% 的活跃时间花在其中一个上（*TB* A10 Jellyfish）。因此路由必须**跨 Goal 全局**进行，不能按 Goal 各自为政（*TB* B1“中断研究”行）。
2. **每次打扰都必须可行动、去重、限流、可度量**（ADR-010）。权限弹窗的批准率高达 93–97%，是典型的滋扰告警；计划被拒绝的比例是 39%，人的判断实际发生在这一层（*TB* A9）。
3. **在断点投递。** 把打扰推迟到粗粒度断点，恢复速度可快 69%、恼怒程度低 18%（*TB* A10 Iqbal & Bailey）。延迟几秒也有收益。
4. **重入靠可导航线索，不靠散文。** 自动恢复线索能让任务成功率翻倍（*TB* A10 Parnin）。
5. **平静不等于沉默**（*TB* A7 Case：“work even when it fails”）。心跳与新鲜度保证“没有灯亮”确实意味着正常。

---

## 8.1 注意力阶梯（Attention Ladder）与渠道

| 级别 | 名称 | 渠道 | 是否计入 Dock 角标 | 是否消耗打扰预算 | 典型来源 |
|---|---|---|---|---|---|
| **L0** | 记录 | 只写入账本、Trace 和 Goal 页时间线 | 否 | 否 | 正常模式变化、`command_result`、已被拦截且无残留的命中 |
| **L1** | 外围 | Goal 卡片 chip、Live Line 字形、菜单栏/托盘字形（视觉以 `12` 为准：正常为中性或低彩度；“要注意但不需要你决定”用 text-1 加亮 + 空心菱形 `◇`；异常为 danger 字形；**不用琥珀**）、进入简报和摘要 | 否 | 否 | severity 1：flake、配置变更、nudge、烧钱对进展（一般） |
| **L2** | 收件箱 | 侧边栏 Needs-You 列表（按优先级排序），不弹出、不发声 | **是** | 否 | severity 2 的大多数情况；所有 `question`/`approval` 的最低级别 |
| **L3** | 断点打扰 | 应用内 toast（窗口聚焦时），否则 OS 通知；**在下一个断点投递**，有最长等待时间 | 是 | **是** | severity 2 且 `agent_blocked`；severity 3 的一般情况 |
| **L4** | 立即 | OS 通知（聚焦时为 toast）+ 菜单栏数字（无动画，`12` §12.8.1）+ 可选提示音（earcon），**不等断点** | 是 | 是（可透支） | 单向门审批（任何 severity，§8.3.1，ADR-208）；severity 3 且（密钥泄露或破坏性迁移） |

一条 Needs-You 的**级别**随时间变化：先由基础级别（§8.3.1）决定，再被断点、预算、洪泛、勿扰时段（§8.3–8.5）向下调整，**向上只能因为严重度升级或等待超时**。

**菜单栏字形**（*TB* D#23）：每个运行中的 Goal 一个小字形，最多 8 个，超出时合并为“+N”。字形只反映该 Goal 最高的未处理级别，只用形状、不着色：L0 `·`；L1 `◇`；L2 及以上 `◆`。菜单栏没有任何动画，L3/L4 也不闪烁或淡入（唯一规格 `12` §12.8.1；该字形行默认关）。

**项目级 L1 通知**（ADR-174）：本地文件一域有三条不属于任何 Goal 的 L1 通知——内容命中改为机密（事件 `project.local_file_secret_detected`，ADR-170/172）、自动恢复（事件 `project.local_file_unmark_reverted`，ADR-172）、无法读取（ADR-173；条目在目标的代码中已被跟踪、这次未复制时用同一条通知的另一种文案，ADR-206）。上表的 L1 渠道以 Goal 为单位，它们另按下列规则呈现：
- **位置**：本地文件设置页对应行显示 `◇` 与说明（`04` §4.15.1）；侧栏底部的设置入口（项目设置由此进入）显示一枚项目级 `◇`：只有一个项目有通知时为 `◇ <项目名>`，点击进入该项目的本地文件设置页；多个项目时为 `◇ N 个项目`，点击进入项目设置列表，有通知的项目带 `◇`（`04` §4.3.2，ADR-175）。不进入收件箱，不计入 Dock 角标与打扰预算；不进入菜单栏字形与重入简报（两者以 Goal 为单位）。
- **送达**：两条事件类通知由事件投影得到；“无法读取”来自 Supervisor 的进程内状态（不写账本）。三者都经 `settings` 主题（Project 设置，`06` §6.4.2）推送，renderer 重新订阅时随快照取得。
- **消失**：两条事件类通知在人看过本地文件设置页后消失。“已查看”是一个项目级水位：该页在**窗口聚焦**状态下连续可见 ≥ 3 s 时（与 §8.10.1 的 Goal 水位同一规则），界面发出 `project.local_files.viewed{projectId, seq}`，更新 `watermarks`（scope `localfiles:<projectId>`，`06` §6.3），不进入 EventLog，不是 HumanDecision；序号不大于水位的事件类通知不再计入侧栏 `◇`；本页的行内说明在这次访问中保持显示，离开本页后才消失（ADR-175）。“无法读取”的消失条件见 `16` 的 `ProjectLocalFile` 行（ADR-173）。

**存储提示**（唯一定义，ADR-229；`10` §10.2、§10.3.2、§10.4.4、§10.17.1，`13` §13.11.3，`04` §4.3.2、§4.15 引用）：不属于任何 Goal 的存储类 severity 1 通知——人的工作现场的合计超过阈值（`10` §10.4.4）、磁盘压力与 Tower 总占用超预算（`10` §10.3.2）、镜像增长（`10` §10.17.1）、永久证据超过 10 GB（`13` §13.11.3）、`~/.tower` 所在卷的剩余空间读不出（`06` §6.8 F8 的这一项按未知计，ADR-236）——在 M1 中按上段同样的方式呈现：设置的存储面板（`04` §4.15）对应行显示 `◇` 与说明；侧栏底部的设置入口显示一枚 `◇ 存储`，点击进入存储面板。不进入收件箱，不计入 Dock 角标与打扰预算，不进入菜单栏字形与重入简报。条件成立期间一直显示，直到你看过存储面板（窗口聚焦、连续可见 ≥ 3 s，同上段）；“已查看”按上述各类条件分别记，看过只消去当时成立的那几类，之后另一类成立、或某一类解除之后再次成立时重新显示（ADR-231）。条件由 Supervisor 求出，随 `system` 主题（存储占用，`06` §6.4.2）推送；“已查看”只是界面的状态（ADR-230）：不发命令、不经 Supervisor、不持久化，每个窗口各自记，界面重新加载或 Tower 重启之后条件仍成立时再显示一次。设置入口最多一枚 `◇`（ADR-230）：只有存储提示时为 `◇ 存储`，只有项目级通知时照上段，两者并存时合为 `◇ N 项`（N 为有通知的项目数加 1），点击进入设置，其中存储面板与有通知的项目各带 `◇`；侧栏收为 48px 细栏时（含窗口窄于 1100px 时，`04` §4.1.2），设置图标带一枚不含文字的 `◇`，悬停写出同一说明（ADR-231）。磁盘满另有一条**应用级横幅**（`06` §6.8 F8，ADR-230；行为与解除只按 F8 一行，视觉见 `12` §12.8，ADR-231）：显示在主窗口顶部直到条件解除，不是 Needs-You 条目，不经过本节的级别，不计入 Dock 角标与打扰预算；数据库此时只读，它取自 Supervisor 的进程内状态，同样随 `system` 主题推送。**Project 不可达**（`06` §6.1.6，ADR-236）与应用退出一样只在卡片与实况行上（`12` §12.6.5）：不是 Needs-You，不计入 Dock 角标与打扰预算，没有横幅——它只影响路径不可访问的目标，不像磁盘满那样使数据库只读。磁盘压力的说明中，人的工作现场的合计（估计独占大小）列在第一行，附 `删除`（由人逐行或多选）；Tower 不删除它们，只把人指到它们（`10` §10.2）。

---

## 8.2 数据

条目字段的权威定义在 `02` §2.9（含 ADR-034 的 `owner` 与新增 kind `digest`/`backlog`/`flood`/`sync_conflict`）；用户级设置（`interruptsPerHour`、`burst`、`focusUntil`、`lockScreenPrivacy`、`autoTune`、`digestWatermark`、`quietHours`、`digestTimes`、`soundForSeverity3`、`globalWatermark`、`watchModeByGoal`）的权威定义在 `02` §2.14 `UserSettings`，默认值在 `16-registry.md`。本文不重复定义，只在 Supervisor 投影中补充以下**运行时**字段（不进入领域模型）：

```ts
interface RoutingRuntime {             // ⚙️ Supervisor 投影；存于 needs_you.routing，重建时随 needs_you 沿用（06 §6.2.1，ADR-216）
  itemId: ItemId;
  baseLevel: 1 | 2 | 3 | 4;            // §8.3.1
  heldSince?: Iso; heldReason?: "breakpoint" | "budget" | "flood" | "quiet" | "focus" | "overlay";
  l2Since?: Iso;                       // 进入 L2 的时刻（防饿死，§8.3.4）
  starvationEscalated: boolean;        // 是否已因防饿死升过一次 L3
  deliveredChannels: { level: number; at: Iso; channel: "inbox" | "toast" | "os" | "sound" | "digest" }[];
  timer?: { optionId: string; startsAt: Iso; firesAt: Iso };   // §8.7.1；Supervisor 计时器为权威
}
```

## 8.3 AttentionRouter：优先级与投递

### 8.3.1 基础级别

```ts
function baseLevel(it: NeedsYouItem): Level {
  if (it.kind === "ratify") return 2;   // §8.5.1：每天每作用域聚合为一条 L2 条目（severity 1），不计入 Dock 角标（ADR-197）
  if (it.kind === "approval" && isOneWayDoor(it)) return 4;   // 单向门审批（唯一定义，ADR-208）：Agent 在等、永不超时放行，不论 severity（ask 生成的审批为 severity 2，`07` §7.5.5）
  if (it.severity === 1) return 1;
  if (it.severity === 2) return it.costOfDelay === "agent_blocked" ? 3 : 2;
  // severity 3
  const immediate = it.source.detector === "secret" || it.source.detector === "migration_destructive";
  return immediate ? 4 : 3;
}
```

`question` 和 `approval` 的生效级别**不低于 L2**，因为 Agent 在等，不能把它静默埋掉。`review_ready` 的基础级别是 L2，人对它的期望是“完成时知道”，但它不该打断人。

### 8.3.2 优先级 `P`（用于排序与断点门限）

借用 Horvitz 的期望效用框架（*TB* A10、C8）：`priority = 延迟代价 × 严重度 × 置信度`，再加上随时间增长的项。

```
P(item, t) = S · q · U(t) · g

S = {1: 1, 2: 3, 3: 9}[severity]
q = 置信度 ∈ [0.3, 1]
    question / approval / review_ready / budget / verify_failed（人或合同直接产生的）→ 1.0
    检测器产生的 → clamp(该检测器在该项目的平滑精度（07 §7.11.2）, 0.3, 1)
U(t) = 1 + k · ln(1 + age / τ)
    costOfDelay = agent_blocked  : k = 2.0, τ = 5 min
                  agent_degraded : k = 1.0, τ = 20 min
                  none           : k = 0.3, τ = 120 min
g = Goal 优先级因子：在用户手动排序中位于前 1/3 → 1.25，中间 → 1.0，后 1/3 → 0.85（只影响相对排序）
```

收件箱按 `P` 降序排列，同分时按 `createdAt` 升序。**severity 3 永远排在 severity ≤ 2 之前**（硬分组），避免低严重度项因为等待久而越过高严重度项。

### 8.3.3 用户状态与断点检测

| 信号（Electron / 文件系统） | 推导出的状态 |
|---|---|
| `powerMonitor` `lock-screen` / `suspend` | `away` |
| `powerMonitor.getSystemIdleTime() ≥ 300 s` | `away` |
| `unlock-screen` / `resume` / 系统空闲时间从 ≥ 300 s 跌回 < 5 s | **粗断点**（离开 ≥ 30 min 后另触发应用级重入简报，以 §8.10.2 为准） |
| 系统空闲时间 10–300 s | `idle_short`（细断点） |
| 系统空闲时间 < 10 s 且 Tower 窗口未聚焦 | `busy_elsewhere`（多半在别的应用里打字） |
| Tower 聚焦，处于评审模式，或 5 s 内在评论编辑器里敲过键 | `busy_in_tower_review` |
| Tower 聚焦，其他视图 | `in_tower` |
| Tower 内部动作：验收、request changes、处理完一条 Needs-You、关闭评审、发出评论 | **粗断点**（60 s 内有效） |
| 监听 `Project.checkouts[*]/.git/logs/HEAD` 的追加写（用户在自己的 checkout 里提交） | **粗断点**（*TB* C8“just committed”） |
| 完成一个评审单元的查看 | 中断点（30 s 内有效） |

**断点门限 θ**：只有 `P ≥ θ(state)` 时才投递 L3。

| 状态 | θ |
|---|---|
| 粗断点（60 s 内） | 1 |
| `away` | 0（立即投递为 OS 通知，因为不存在打断成本；通知留在通知中心） |
| `idle_short` / 中断点 | 2 |
| `in_tower` | 3 |
| `busy_elsewhere` | 5 |
| `busy_in_tower_review` | 6 |

**最长等待**（等待超过此值后无视 θ 投递，但仍受预算约束）：

| 情形 | 最长等待 |
|---|---|
| L3、`agent_blocked`、severity 2 | 180 s |
| L3、severity 3 | 30 s |
| L3、其他 | 15 min（与表头相同：超时后无视 θ 投递，仍受预算约束；ADR-197） |
| L4 | 0（不等待） |

### 8.3.4 主循环

```ts
// 每 15 s 一次，另外在新条目、状态变化、断点事件时立即触发
function routeTick(now: Iso) {
  const state = userState();
  for (const it of openItems().sort(byPriorityDesc)) {
    const r = { ...it, ...runtime(it) };   // 02 §2.9 字段 + RoutingRuntime
    if (r.snoozedUntil && now < r.snoozedUntil) { setLevel(it, 0); continue; }   // 延后：留在主列表并标“已延后至 hh:mm”，不进“稍后”分区；
                                                                                 //   until 的选项与阻塞类条目的上限唯一登记在 16 §16.2.4（ADR-183）；到期后照常路由
    let target = r.baseLevel;
    target = applyAutoTune(it, target);                         // §8.9（不会降低 sev3）
    if (quietOrFocusBlocks(it, target, now)) { hold(it, "quiet"); target = Math.min(target, 2); }
    const overdraw = it.severity === 3 || r.baseLevel === 4;   // 可透支、不被洪泛压低（唯一定义，ADR-209）：severity 3 与基础级别 L4 的单向门审批（§8.1“可透支”）
    if (target >= 3 && flood.active && !overdraw) { hold(it, "flood"); target = 2; }
    if (target === 3) {
      const waited = since(r.heldSince ?? it.createdAt);
      const pass = priority(it, now) >= theta(state) || waited >= maxHold(it);
      if (!pass) { hold(it, "breakpoint"); target = 2; }
    }
    if (target >= 3 && !budget.tryTake(it.goalId, { overdraw })) { hold(it, "budget"); target = 2; }
    // 防饿死（ADR-023）：agent_blocked 的条目在 L2 停留 > 20 min → 无视令牌桶升为 L3 一次（勿扰/专注时段除外）
    if (target === 2 && it.costOfDelay === "agent_blocked" && !r.starvationEscalated
        && since(r.l2Since) > 20 * 60_000 && !quietOrFocusActive(now)) {
      target = 3; markStarvationEscalated(it);                  // 不扣令牌；仍计入周报的打扰次数
    }
    if (target > r.level) deliver(it, target, channelFor(target, windowState()));   // 只向上投递一次
    setLevel(it, target);
  }
}
```

- **只向上投递一次：** 同一条目在同一级别不重复弹出；L3 投递之后，后续的合并（§8.4）只更新内容，不再弹出，除非严重度升级。
- **防饿死的第二步：** 升过一次 L3 仍未处理的 `agent_blocked` 条目，在下一次重入简报（§8.10）中置顶，并在站会摘要的“需要你”区块排第一。
- **channelFor：** 见 §8.7.2。

### 8.3.5 演算：实际投递延迟与起作用的常数（R1-D8-07、R1-D8-04）

按 §8.3.2 的公式计算“条目产生 → 以 L3 投递”的延迟（假设令牌充足、无洪泛、不在勿扰时段；`g = 1`，括号内为 `g = 1.25` 的置顶 Goal）。

| 条目 | P₀ | 粗断点 θ=1 | `away` θ=0 | `idle_short` θ=2 | `in_tower` θ=3 | `busy_elsewhere` θ=5 | `busy_in_tower_review` θ=6 | 起作用的约束 |
|---|---|---|---|---|---|---|---|---|
| `question`/`approval`，sev2，`agent_blocked`（q=1） | 3.0 | 0 | 0（OS 通知） | 0 | 0 | **2.0 min**（0.9 min） | **3.0 min**（1.8 min）† | θ(busy_elsewhere)；评审中由 maxHold 180 s 决定 |
| `budget` / `stalled{unresponsive}`，sev2，`agent_blocked` | 3.0 | 同上 | | | | | | 同上 |
| sev3 哨兵，`agent_degraded`，q=0.9 | 8.1 | 0 | 0 | 0 | 0 | 0 | 0 | 无（P₀ 已超过全部 θ） |
| sev3 哨兵，q=0.3（低精度检测器） | 2.7 | 0 | 0 | 0 | 30 s | 30 s | 30 s | maxHold(sev3) = 30 s |
| 单向门审批 / sev3 密钥 | — | L4 立即 | | | | | | 无 |
| `review_ready`、sev2 `agent_degraded` 哨兵、`stalled{loop}` | — | 不进 L3，立即进 L2 收件箱 | | | | | | 基础级别 |
| 任意 L3 候选，令牌耗尽 | — | 留在 L2；`agent_blocked` 的 20 min 后强制 L3 一次 | | | | | | 令牌桶 + 防饿死 |

† 公式给出 3.24 min，但 maxHold 180 s 先到：**θ(`busy_in_tower_review`) = 6 对 `agent_blocked` 条目从不起作用**。评审中的实际行为是“等到当前评审单元结束（中断点，θ=2 → 立即）或 180 s”，与 Iqbal & Bailey 的“在子任务边界投递”一致。因此保留 θ=6 只为表达“评审中不打断”，真正的约束是中断点与 maxHold。

**有效常数**：maxHold（blocked sev2 180 s、sev3 30 s）、θ(`busy_elsewhere`) = 5、令牌桶（6/h，突发 3）、防饿死 20 min。k、τ、θ 的其余取值只影响收件箱排序，不影响投递时刻。

**吞吐损失估算（R1-D8-04）**：假设每个运行中的 Goal 每小时产生 0.5 条阻塞性条目（问题或审批），人在场时投递延迟 0–3 min、响应中位数 2 min，则每条阻塞约 3–5 min，Goal 运行时间的损失约 2.5–4%。令牌耗尽时，每条阻塞最坏为 20 min（防饿死前的等待）+ 2 min 响应 = 22 min：按上面每小时 0.5 条计，损失 11 min/h ≈ **18%**；若每小时 1 条且每条都碰上令牌耗尽，则为 22 min/h ≈ **37%**（R2-D8-02 更正）。人离开且 `unattended:"wait"` 时，阻塞一直持续到人回来——这是设计选择（R5：例外必须由人处理），重入简报会把这些条目置顶。

**E3 标定方法（`14`）**：对每个条目记录产生时的用户状态、`P`、投递时刻、首次查看时刻、处置时刻与 `outcomeClass`。指标：(a) 阻塞时长分布；(b) 投递后 5 s 内未看就关闭的比例（打扰代价的代理）；(c) 打扰精度。在内部试用中对 maxHold 做 90/180/300 s 三档 A/B，选择在 (b) 不显著上升的前提下使 (a) 最短的一档；θ(`busy_elsewhere`) 按同样方法在 3/5/8 之间选择。

---

## 8.4 去重与根因合并

每类条目的 `dedupeKey`（`02` 字段）规则如下。键相同的新条目**合并进**已有的打开条目：`occurrences++`、`lastSeenAt` 更新、证据追加；**不重新通知**，除非严重度变高。

| kind | dedupeKey | 合并语义 |
|---|---|---|
| `question` | `q:{goal}:{sha1(normalize(question))}` | Agent 重复问同一个问题时合并；答案回填给全部挂起的调用 |
| `approval` | `a:{goal}:{actionClass}:{normalizedTarget}`，target 为命令 normalized 或路径 glob | 同一动作重复请求时合并（例如重试的 `pnpm add stripe`） |
| `review_ready` | `r:{goal}` | 每个 Goal 只有一条；新的验证结果更新其提交和证据，已看过的评审单元状态保留（I2 规则） |
| `verify_failed` | `v:{goal}:{sorted(failingCriterionIds)}` | 失败集合不变时合并 |
| `verify_env` | `ve:{goal}:{stage}`（`stage` 取 `verify_env_error.stage`：install / prepare / service / port / sandbox / resources / integrity / exec / baseline，以 `16` §16.1.3 为准；M2 另有不属于 `verify_env_error` 的 `secret_wait`） | 同一 Goal 同一阶段的环境故障合并；**（M2，ADR-164：M1 中验证标准不携带机密，此键不出现）** 机密阶段等待“没有 Agent 活动”超过 10 分钟（ADR-160/162；只有不带机密的标准全部通过后才会进入等待，等待期间不占用槽位；不是 `verify_env_error`，Goal 保持 `verifying`；阶段定义见 `07` §7.4.11）的键为 `ve:{goalId}:secret_wait`，选项为继续等待 / 现在运行（接受风险）/ 以文件方式运行（`07` §7.4.3）；跨 Goal 的同项目故障再按下表 `verifyenv:{projectId}` 根因合并 |
| `sentinel` | `s:{goal}:{detector}`（同一检测器在一个 Goal 内的所有 subject 合并为一条，subject 列表累加） | `out_of_scope` 的 10 个文件 = 1 条 |
| `sentinel`（`detector = sandbox_violation`，受保护目标，sev 2——类别与操作见 `16` §16.1.6；ADR-117、ADR-125，**本行为唯一定义**，`07` §7.10.1 引用） | `sv:{goalId}:{category}:{op}:{target}`（`category`、`op`、`target` 的定义以 `16` 为准） | 同一 Goal 内同一 `(category, op, target)` 的拒绝合并为一条，次数累加；任一字段不同即分别成条 |
| `anomaly`（`detector = bg_process_survived`，sev 2；ADR-126，kind 以 `16` §16.1.7 为准） | `an:{goalId}:bg_process_survived` | 同一 Goal 内存活进程合并为一条，列出全部存活命令。进程以 Run 令牌 `TOWER_RUN_TOKEN` 识别（ADR-142，规则见 `07` §7.4.1），不按 pid 或进程组；“再次终止”同样按令牌枚举。**存活者退出的发现**（ADR-144/145）：**存活者未全部退出期间**（与条目是否已被“知悉”关闭无关）Supervisor 每 30 s 按令牌重新扫描一次（不做持续扫描）；存活期间的归因（`10` §10.3.1：未归因写入记 `author:"agent"`）也持续到存活者全部退出为止。存活者全部退出时：条目仍打开 → 以 `obsolete` 自动关闭；条目已被“知悉” → 只结束存活期间。部分退出时更新条目中的命令列表，不另生成条目 |
| `anomaly`（`detector = post_settle_activity`，sev 2，只用于进入 `claimed` 之后的活动；ADR-128/129） | `an:{goalId}:post_settle_activity` | 同一 Goal 内合并，次数累加 |
| `anomaly`（`detector = structured_content_dropped`，sev 2，提示性；`07` §7.10.1，ADR-201） | `an:{goalId}:structured_content_dropped` | 同一 Goal 内合并，次数累加，列出丢弃结构化结果的扩展 |
| `anomaly`（`detector = tower_goal_handler_error`，sev 3，L3，提示性；tower-goal 的 `tool_call`、`turn_start` 或 `tool_result` 处理器出错时自报，`05` §5.6.5 第 6 项，`07` §7.10.1，ADR-239） | `an:{goalId}:tower_goal_handler_error` | 同一 Goal 内合并为一条：subject 为处理器名，各处理器的次数累加，只在条目首次打开时打断（同一处理器连续 3 次时 Goal 另以 `prepare_failed` 暂停，条目是 `st:{goalId}:prepare`） |
| `stop_condition`（sev 2，`costOfDelay:"agent_blocked"`；ADR-133 第 14 轮 lint 补记） | `stc:{goalId}:{conditionId}` | 同一 Goal 同一停止条件合并为一条；不同条件分别成条。`conditionId` = `StopCondition.id`（`02`；与 `Criterion.id` 同规则，合同版本内不变，修订合同时未改动的条目保留原 id，ADR-135），因此“修订合同后继续”不会把同一条件拆成新条目。选项与命令（卡片见 `04` §4.8）：“继续” → `goal.resume`；“修订合同后继续” → `contract.amend` 后 `goal.resume`；“这里不该停” → `goal.resume{feedback:"stop_condition_false_positive"}`。**再武装**（ADR-139，求值点见 `07` §7.7.1，静默状态与清除时机唯一定义在 `16` `Goal.stopConditionSilences`）：“继续”只对本次命中的对象静默一个 Run，“这里不该停”使该条件静默到下一次合同修订——所以同一条件在人作出决定后不会立即再次暂停 Goal；之后的真正新命中（不同对象、下一个 Run、修订之后）在条目已处置时生成新条目，而不是重新打开旧条目，标注不重复计数。卡片显示命中的对象（路径、命令或无进展时长）。返工次数不是停止条件（`rework_cycles_over` 已删除，ADR-143），达到 `maxReworkCycles` 时是 `verify_failed` 条目，“这里不该停”不影响它。`natural` 类不产生本条目（模型以 `ask_user` 提问，生成 `question`） |
| `external_change`（sev 2；ADR-128） | `ec:{goalId}` | 重复检测时把新路径并入同一条目（与 `Goal.externalChange.paths` 一致），基线不变；`costOfDelay`：继续目标（`Goal.continuation`，ADR-134）为 `run`/`settle` 时 `agent_blocked`，否则 `none`。`external_change` 只在 `alsoApplies` 中（当前暂停原因是别的）时，该条目与卡片**照常出现**，并标注“当前暂停原因：<原因>”。卡片措辞：“检测到 N 个文件在没有 Agent 工具调用、也没有被追踪的 Agent 进程时被写入——可能来自你的编辑器、其他程序，或未被追踪的 Agent 后台进程”；含 `mixedPaths` 时注明“撤销会一并撤销 Agent 在这些文件上的编辑” |
| `budget` | `b:{goal}:{soft|hard}:{dimension}` | — |
| `stalled` | `st:{goal}:{runId}` | 一个 Run 一条；子类型（loop/silent/unresponsive/idle_without_submit）作为字段。同一 Run 中先后检测到不同子类型时，子类型、选项与 `costOfDelay` 改为最近一次检测的（ADR-197） |
| `stalled`（子类型 `satellite_missing`，仅自动重建失败时；定义见 §8.6.5 `paused(satellite_missing)` 行，ADR-191） | `st:{goalId}:satellite` | 按 Goal 去重：重建失败可以发生在没有 Run 的状态，所以键不含 `runId`；再次失败并入同一条目 |
| `stalled`（子类型 `human_checkout_lost`，sev 2，`costOfDelay:"none"`；`paused(human)` 中人工编辑检出已不存在而它所在的 `<wtRoot>` 可访问——根不可访问时是 Project 不可达，不生成本条——重启时与运行中发现相同，定义见 `06` §6.1.6 人工编辑检出一行，ADR-211/212/238） | `st:{goalId}:human_checkout` | 按 Goal 去重：发生在没有 Run 的状态，所以键不含 `runId` |
| `stalled`（子类型 `write_back_failed`，sev 2，`costOfDelay:"none"`；交还或检验带回的写回在本进程中失败、未完成，人工编辑检出或检验目录保留，定义见 `06` §6.4.3 `inspect.bring_back` 行，ADR-220） | `st:{goalId}:write_back` | 按 Goal 去重：同一 Goal 同时只有一次写回；条目生成之后的交还或带回成功、放弃改动（`goal.discard_human_edits`）、放弃 Goal、检验关闭，或该 Goal 此后成功执行的 `goal.resume` 与 `goal.take_over`（含检出丢失之后的“继续”与“再次接管”，以及人自己删掉副本之后的同一出口，ADR-222）时关闭——这些事件不经本条目的出口发生时记 `obsolete`，经本条目的出口发生时按 §8.8 该行定类（ADR-223）；按这些事件判定，不按 `human_checkout` 是否为空：带回失败的 ③ 在生成条目的同一事务中清除它，交还 ① 物化失败时随后的检出丢失处理也清除它，两者都不关闭条目（ADR-221）；条目中“你的副本保留在原路径”只写生成时的情形（`06` §6.4.3） |
| `stalled`（子类型 `prepare_failed`，ADR-148/149/151；定义见 §8.6.5 `preparing` 行） | `st:{goalId}:prepare` | 按 Goal 去重，与是否已有 `runId` 无关（`running` 中被遮蔽时已有 Run，ADR-189），所以键不含它；同一 Goal 重试后再次失败并入同一条目（更新原因与次数）。条目与暂停原因 `prepare_failed` 成对出现（不是 `engine_crash`；认证预检失败（`06` §6.8 F7 ②）时成对的是下一行 F7 的条目 `st:{goalId}:auth`，本条目不生成，ADR-207/208）：该原因不在启动时自动解除，也不 `autoResume`；选项见 §8.8 |
| `stalled`（子类型 `engine_error`，认证过期或没有凭据：`06` §6.8 F7 的条目，本行为其唯一定义；ADR-206） | `st:{goalId}:auth` | 按 Goal 去重：预检失败时还没有 Run，所以键不含 `runId`；F7 的三种检测键与之后的再次失败都并入同一条目（更新 provider 与次数）。级别同 §8.6.5 `retrying` 行的 `engine_error`（L2）；**不参与** provider 根因合并（F6 已排除 F7 的检测键）。卡片文案与登录前提见 `06` §6.8 F7。**成对的暂停**（ADR-207）：① 或 ③ 之后 Run 以 `error` 结束时进入 `provider_unavailable`（`05` §5.5 的 provider 规则），探测的鉴权检查会真正刷新令牌（`06` §6.1.4），人重新登录之前不会自动解除；② 预检失败时还没有 Run，按 `06` §6.8 F4b 进入 `paused(prepare_failed)`，本条目代替 `stalled{prepare_failed}`，不另生成（`16` §16.1.7 映射行）。两种暂停经 `resume` 或探测解除时本条目同时关闭。**只有 ③ 而 Run 没有以 `error` 结束时**：Goal 没有暂停，卡片只给登录指引、不给“重试”；该 Run 结束时本条目以 `obsolete` 关闭（之后的模型请求已成功）。出口与定类见 §8.8 |
| `ratify` | `rt:{scope}:{yyyy-mm-dd}` | **每天每作用域一条聚合条目**，“N 项待批准”，severity 1 |
| `conflict` | `c:{sorted(goalIds)}:{sha1(sorted(files))}` | — |
| `backlog`（owner: global） | `bl:{yyyy-mm-dd}` | 评审积压提示，每天至多一条（§8.5.5） |
| `flood`（owner: global） | `fl:{floodEpisodeId}` | 每次洪泛一条汇总（§8.5.2） |
| `digest`（owner: global） | `dg:{digestTime}` | 每个摘要时刻一条（§8.11） |
| `sync_conflict`（owner: global） | `sc:{memoryId}` | 只用于记忆**条目**的并发编辑（`09` §9.12.3；M2–M3，ADR-059） |
| `project_identity`（owner: global） | `pi:{sorted(projectIds 或 canonicalRoot+消歧键)}` | Project 身份确认：绑定时根集合或远端不一致（ADR-080）、同步或 `.towergoal` 导入时仅根别名相交（ADR-069）；选项“同一项目（合并）/ 新项目” |
| `integration`（M2 推送失败；sev 2；ADR-157） | `int:{goalId}` | 推送因钩子拒绝、网络或认证失败时一条；重试再次失败并入同一条目（更新原因与次数）。Goal 保持 `accepted`，合并队列条目（M2）转为 `awaiting_push`，**不占用**该 base 的队列（后续条目可继续，ADR-158）；选项：重试推送 / 只保留分支 |
| `integration`（owner: project；闸门失败预案，ADR-157 补记） | `int:{projectId}:credential_url` | **macOS 上默认出现**（ADR-158：同用户进程可互相观察，按闸门失败设计）：该项目的远端 URL 或 git 配置中带凭据——URL userinfo、含 `password=`/token 形态的内联 `credential.helper`、含 token 形态的 `core.sshCommand` 或 `http.extraHeader`（判定范围见 ADR-159，`11` §11.7）——Tower 不对它执行任何网络命令。每个项目一条，卡片请用户把该远端的凭据移到 credential helper；Tower 不改写用户配置 |

**跨 Goal 根因（`rootCauseKey`）**：若多个 Goal 的条目源自同一个根因，合并为一条**项目级**条目，并在各 Goal 卡片上以 chip 引用它。

| 根因 | 判定 | rootCauseKey |
|---|---|---|
| 基线已坏 | `verify_failed` 中 `preexistingFailures` 非空（`07` §7.4.6） | `base:{projectId}:{baseTree}:{sha1(failing ids)}` |
| 引擎或提供商故障 | ≥ 2 个 Goal 在 5 min 内出现 `retrying` 失败或 `unresponsive`，且使用同一 provider | `provider:{provider}:{5min-bucket}` |
| 验证环境故障 | 同一项目 ≥ 2 次验证记录 `verify_env_error`（安装、服务、端口、沙箱故障；ADR-037、ADR-054） | `verifyenv:{projectId}` |
| 共享文件冲突 | conflict_forecast 涉及同一文件集合 | 同 conflict 键 |

合并后的根因条目的严重度取成员中的最大值，`costOfDelay` 取最严重者。成员条目设为 L0，并链接到根因条目。

---

## 8.5 批处理、洪泛抑制、预算与勿扰

### 8.5.1 severity 1 的批处理

- severity 1 的条目（下方 `ratify` 聚合条目除外，ADR-206）和所有 L1 chip **从不**进入 L2 及以上（除非被升级）。它们进入两个批处理通道：
  - **重入简报**（§8.10）：回到该 Goal 时，“异常”一行汇总显示；
  - **站会摘要**（§8.11）：按计划时间跨 Goal 汇总。
- `ratify` 类每天每作用域聚合为一条 L2 条目，放在收件箱底部的“稍后”分区，**不计入 Dock 角标**。
- **“稍后”分区只收 `ratify` 聚合条目**（唯一定义，ADR-204；`04` §4.8、`12` §12.8 引用）：severity 1 条目（`ratify` 聚合条目除外，ADR-205）与 L1 chip 不进入收件箱的任何分区，侧栏的 `+n 稍后` 只计 `ratify` 聚合条目。

### 8.5.2 洪泛抑制

借用 ISA-18.2 的基准：约每 10 min 1 条“很可能可接受”，每 10 min 2 条是可管理的上限，10 min 内超过 10 条即为洪泛，洪泛窗口应占时间窗口的 1% 以下（*TB* A9）。

```
全局：滑动 10 min 窗口内新呈现（L≥2）的条目数 > 10  → flood.active = true
  - 新的 severity 2 条目只进收件箱（L2），不弹出（单向门审批除外，§8.3.4 `overdraw`）
  - 生成一条 L3 汇总“注意力洪泛：K 个 Goal 共 N 条”（每次洪泛只生成一条），按 kind 和 Goal 分组，
    提供“全部暂停”与“逐个查看”
  - severity 3 仍单独投递，但 OS 通知合并为每 2 min 至多 1 条（其余并入同一条通知的计数）
  - 退出条件：连续 10 min 窗口速率 < 5（滞回）
单 Goal：一个 Goal 在 10 min 内新增 > 3 条（L≥2） → 折叠为“G-0142 异常频发（N）”，
  选项：暂停该 Goal / 查看 / 继续；该 Goal 的后续 severity 2 条目在 30 min 内只进收件箱（单向门审批除外）
```

指标：`floodWindowRatio = 处于洪泛的 10 min 窗口数 / 活跃窗口数`，目标 < 1%，进入周报。

### 8.5.3 打扰预算（令牌桶）

- **全局桶：** 容量 `burst`（默认 3），补充速率 `UserSettings.attention.interruptsPerHour`（默认 6，即平均每 10 min 1 次，对齐 ISA“可接受”；上限 12，即每 10 min 2 次的“可管理”上限）。
- **Goal 桶：** 容量 2，速率取 `contract.budget.interruptsPerHour`（未设置时为 3）。
- 一次 L3/L4 投递需要**两个桶各取 1 个令牌**。取不到时，severity 2 条目降为 L2，标记 `heldReason:"budget"`，下次 tick 重试。
- **severity 3 与单向门审批可以透支**（判定见 §8.3.4 `overdraw`，ADR-209）：令牌数可降到 −3。透支期间同一 Goal 的其他 severity 2 条目（单向门审批除外）一律只进收件箱。
- **噪声 Goal：** 1 小时内 Goal 桶被取空 ≥ 2 次 → 卡片 chip“此 Goal 打扰频繁”，并建议（Claim 语法）“合同可能不清晰，或自主度过低（审批过多）”，链接到 `11` 的自主度调整和 `09` §9.9；加载了 MCP 的 Goal 中审批主要是 `tool.external` 时，建议改为“外部工具每次调用都需要你批准”，链接到 `11` §11.3.4 “代价”所列的出口（自主度调整对这一类无效，ADR-229）。

### 8.5.4 勿扰时段与专注模式

| 模式 | 规则 |
|---|---|
| 勿扰时段（`quietHours`，默认关闭） | 不发任何 OS 通知，不发声音。severity 3 的条目会保留到时段结束，然后汇入一条“勿扰期间摘要”（L3）。只有 `quietHours.allowSeverity3 = true`（`02` §2.14）时，severity 3 的条目才会按原级别打破勿扰 |
| 专注模式（手动开启，时长 25/50/90 min） | 只放行 L4；其余条目保留，专注结束时投递一条迷你简报（≤ 5 行） |
| 评审中的自动专注 | `busy_in_tower_review` 已经通过 θ=6 实现，不另设模式 |
| OS 勿扰 / Focus | 由操作系统自身抑制通知；Tower 不需要读取它的状态 |

勿扰时段内 Agent 被阻塞时怎么办，见 §8.7.1 的 `unattended` 策略。

### 8.5.5 评审积压作为调度输入（R11、ADR-014）

生成快、评审慢，这是公认的瓶颈：Faros 报告评审时间 +91%（`01` §1.1）。积压的待审代码还会诱发橡皮图章式验收。因此评审积压是注意力路由的**一项输入**，而不只是调度器的开关。

按 ADR-014（修订后的 WIP 上限）的口径，本文只引用：

```
C = UserSettings.reviewBacklogLimitLoc（默认 1500；null = 关闭）
P = 待审 LOC：in_review 与 accepted（未 integrated）中**尚未有效评审**的单元 LOC
    有效评审 = 单元停留 ≥ max(5 s, 1.2 s × loc) 且所有 hunk 都进入过视口；每个 contentHash 只计一次
    （这是反点穿下限，不是质量保证；不满足的查看记为“掠过”，进入周报 §8.9.1）
F = 在途 LOC：running Goal 当前相对 base 的 diffstat（Fact）
H = C − P − F   （评审余量）。有效评审一个单元 → P 立即减少 → H 立即恢复
默认“提示模式”：H ≤ 0 只提示、不阻止启动；E8 通过后切为“阻止模式”（M2）：H ≤ 0 时 ready 不再首次进入 running
（waitReason:"review_capacity"），返工、恢复、交还不受限（ADR-014、ADR-019）
```

| 条件 | 注意力上的效果 |
|---|---|
| `H ≤ 0`（任一模式） | 侧栏顶部的积压指示显示 `待审 900 + 在途 600 / 上限 1500 LOC`（`12`：text-1 + `◇`，不用琥珀）；这是调度信息，不是待决事项 |
| 阻止模式（M2）下存在因余量停在 `ready` 的 Goal | 这些 Goal 的卡片显示 L1 chip“等待评审余量” |
| 上述情况持续 ≥ 30 min（阻止模式，M2），或 `H ≤ −C/2`（提示模式） | 生成**一条**（每天至多一条）`kind:"backlog"`、`owner:{kind:"global"}`（ADR-034）的 L2 条目“评审积压：900 LOC 待审”（阻止模式（M2）下另加“，2 个 Goal 在等开始”；提示模式下没有 Goal 因余量等待）。选项：开始一个评审批次（打开 §8.5.6 的推荐队列）/ 单次越过（`HumanDecision{kind:"override_capacity"}`，M2：仅阻止模式）/ 调整上限 |
| 阻止模式（M2）下 `H ≤ 0` 且有 Goal 在等 | 所有 `review_ready` 条目的 `costOfDelay` 由 `none` 提升为 `agent_degraded`，因为此时评审在卡住生成。它们的 `P` 随之上升；每天允许其中**一条**在粗断点以 L3 投递“建议评审批次”，消耗打扰预算 |
| 任意时刻 | 站会摘要与重入简报的“改动与评审”行显示 `待审 900 LOC（3 个 Goal，约 N h）· 余量 400`；时长按 SmartBear 300–500 LOC/h 估算，**只用于展示**，对 Agent 代码的适用性由 E8 重新标定（ADR-014） |

**跨 Goal 的评审排序**（决定 `review_ready` 之间的先后，也决定推荐哪个评审单元）：

```
GoalReviewScore(g) = 0.40 · maxRiskNorm(g)                       // 风险优先（R8）
                   + 0.30 · unblock(g)                            // 验收它能否释放余量、解除依赖
                   + 0.20 · clamp(1 − remainingUnseenLoc(g)/400, 0, 1)   // 接近评完的优先：一次只推进少数 Goal（限制 WIP）
                   + 0.10 · ageNorm(inReviewSince(g))
unblock(g) = 1，若有 Goal 依赖 g（dependsOn），或（阻止模式下）有 Goal 因余量停在 ready；0.5，若 g 在手动排序的前 1/3；否则 0
同一个 Goal 内部：评审单元按 risk.score 降序（`02` §2.8、R8）
```

**评审批次：** 推荐的批次 ≤ 400 LOC，预计 ≤ 60 min（SmartBear：单次评审超过 400 LOC 或 60–90 min 后检出率骤降，*TB* A15）。批次结束时算作一个粗断点。

### 8.5.6 下一件最值得看的事（Next Best Thing）

“没有产品在调度人”：不做评审批处理、不限制待审 Goal 的 WIP、不按“下一件最值得看的事”排序（*LS* §D.6）。Tower 在侧边栏顶部固定显示**唯一一条**推荐。用户在粗断点回到 Tower 时，推荐会被高亮。

- **候选**：打开的 Needs-You 条目（L≥2）、评审积压中的下一批评审单元、当天的 `ratify` 聚合条目。
- **统一打分**：Needs-You 条目使用 §8.3.2 的 `P`；评审单元换算为 `P_review = 3 · GoalReviewScore(g) · (H ≤ 0 ? 1.5 : 1)`；`ratify` 聚合条目为 `P = 0.5`。severity 3 永远排第一。
- **时间适配（可选）**：用户可以点选“我有 5 / 15 / 30 / 60 分钟”，只推荐预计耗时能放进去的事项。预计耗时：问题和审批约 1 min；评审单元按 `loc / 400` 小时；`ratify` 每项 20 s。
- **说明**：推荐带一行理由，按 Claim 语法显示并加前缀 `⚙ 规则推荐`（H9：Harness 的推荐是推断，`12` §12.5.3 第 5 条，ADR-178），例如“┆ ⚙ 规则推荐：阻塞 Agent 12 分钟；高风险”。
- **快捷键**：`G` `X`（`16` §16.3）。
- **度量**：推荐被采纳率（用户在 2 min 内打开了推荐项），列入周报。

### 8.5.7 Watch 模式与注意力（R12）

任何 Goal 都可以一键切换为 **Watch 模式**（Live Line + 实时 Trace 尾部），这一偏好按 Goal 记住（`UserSettings.watchModeByGoal`，`02` §2.14；`00` R12）。Watch 模式表示人**正在主动监视**这个 Goal，路由相应调整：

- 该 Goal 的 Watch 视图可见且窗口聚焦时，它的 L3 条目以**视图内横幅**呈现，不弹 toast，也不发 OS 通知；仍然消耗打扰预算，仍然计入精度统计。
- Watch 视图可见且聚焦时，该 Goal 的水位线持续推进（§8.10.1）。所以退出 Watch 模式时不会弹出重入简报。
- Watch 模式**不会**降低其他 Goal 的路由强度，也不改变严重度。人盯着一个 Goal 时，其他 Goal 的例外照样要能叫到人（R5）。
- 如果某个 Goal 在 Watch 模式下持续超过 30 min，而期间没有任何人工动作（*TB* A2：监视很少发生变化的信息源，有效注意力维持不超过约半小时），Live Line 旁会出现一次性的 L1 提示：“它在正常运行，可以切回状态视图；有例外时会叫你”。不重复提示。

---

## 8.6 模式显示器（Mode Annunciator）

R6：Mode 是封闭集合，只由 Harness 根据事件推导，**绝不由模型写入**。本节给出推导规则。

### 8.6.1 输入状态

| 变量 | 置位 | 清除 |
|---|---|---|
| `runActive` | `agent_start` | `agent_settled`（I4：以 settled 为准；`agent_end{willRetry:true}` 不清除） |
| `streaming` | assistant `message_start` | `message_end` |
| `toolsInFlight: Set<toolCallId>` | `tool_execution_start` | `tool_execution_end` |
| `pendingQuestion` | `ask_user` 工具的 UI 请求发出 | 收到回答、超时或中止 |
| `pendingApproval` | `tool_call` 守卫发起审批 | 审批完成 |
| `retrying` | `auto_retry_start` | `auto_retry_end` |
| `compacting` | `compaction_start` | `compaction_end` |
| `budgetCapped` | accountant 触发软上限并暂停 | 🧑 `resume`（之前可先 `extend_budget`：它只提高额度、不解除暂停，ADR-137）或放弃（`abandon`） |
| `queued` | Goal 等待 Engine Host 槽位、依赖或评审余量（`waitReason`，ADR-014） | 条件满足 |
| `preparing` | Supervisor 开始创建工作目录、物化依赖、预取、启动 Engine Host | `agent_start` |
| `verifying` | 验证器开始 | 验证器结束（`07` §7.4.1） |
| `stalledFlag` | 检测器 escalate（`07` §7.7.1 S1–S7） | 新的进展信号或人工处置 |
| `hostExpected` | 承载该 Goal 的 Engine Host（本 Supervisor 进程为它 spawn 的，或打包模式下它加入的已有 Host，ADR-229）完成该 Goal 本次 Run 准备阶段的握手（该 Run 的 `run.started`，不是 spawn 之时，ADR-228；每个 Run 重新置位，ADR-230；起点的唯一定义在 §8.6.3 “挂死”），或只重启 Supervisor 后重新接上了 main 交回的存活 Host（`06` §6.1.3，ADR-227）——这一支只对在该 Host 上有已过 `run.started`、尚未 `run.ended` 的 Run 的 Goal 置位，其余 Goal（暂停中、准备阶段中）等其下一个 Run 的 `run.started`（ADR-231） | 该 Goal 的 Run 结束（`run.ended`，ADR-230），或该 Host 进程退出 |
| `lastHeartbeatAt` | Engine Host 心跳（每 5 s）；`hostExpected` 置位时以该时刻为起点（重新接上的 Host 自重新接上时起计，持久化的心跳 Fact 只作诊断，不作起点，ADR-227） | — |
| `lastEngineEventAt` | 任意引擎事件 | — |

### 8.6.2 推导（优先级从高到低，取第一个成立者）

```ts
function deriveMode(s: ModeInputs, now: number): Mode | undefined {
  if (s.hostExpected && now - s.lastHeartbeatAt > 30_000) return "unresponsive";
  if (s.pendingQuestion)  return "waiting_human";
  if (s.pendingApproval)  return "blocked_guard";
  if (s.budgetCapped)     return "budget_capped";
  if (s.verifying)        return "verifying";
  if (s.compacting)       return "compacting";
  if (s.retrying)         return "retrying";
  if (s.stalledFlag)      return "stalled";
  if (s.toolsInFlight.size > 0) return "acting";
  if (s.runActive)        return "thinking";        // 包括 streaming 与两次调用之间的空隙
  if (s.preparing)        return "preparing";       // 建卫星 / 装依赖 / 起 Engine Host（02 §2.4）
  if (s.queued)           return "queued";          // 槽位 / 依赖 / 评审余量（waitReason，卡片注明）
  if (s.lastSettled)      return "settled";
  return undefined;                                  // 非 running/verifying 生命周期
}
```

### 8.6.3 心跳阈值：`stalled` 与 `unresponsive` 的区别

- **心跳**由 Engine Host（utilityProcess）里的独立定时器每 5 s 通过 IPC 发送，与 Agent 循环共享同一个事件循环。如果宿主被同步代码卡死，心跳就会停止，这正是要检测的情况。
- **`unresponsive`**（Tower 听不到宿主）：心跳迟到 > 15 s 时，Live Line 右侧的活跃度文字提到 text-1 并显示 `◇`（“最后心跳 18 s 前”，`12` §12.6.2；**不用琥珀**），模式不变；迟到 > 30 s 时进入 `unresponsive`。此时 Supervisor 检查 pid：进程已退出 → `Run.outcome = "crashed"`；进程仍在 → 视为挂死。**挂死**（唯一定义，ADR-227；`06` §6.1.3 据此以 SIGKILL 终止）= 进程仍在，且自 `hostExpected` 置位的时刻或最后一次心跳起已超过 30 s 没有心跳——**准备阶段不计入**（ADR-228）：`hostExpected` 在该 Goal 的准备握手完成（`run.started`）时才置位，之前 Host 启动、会话创建（含包管理器的全局根查询，`05` §5.10）与开场组装中的阻塞只由 120 s 准备时限判定为 `prepare_failed`（`05` §5.3.1、`06` §6.8 F4b），不进入 `engine_crash`；这只对该 Goal 自己成立——打包模式中另一 Goal 的会话创建在共享 Host 中同步阻塞时，已置位 `hostExpected` 的 Goal 照常按看门狗判挂死：运行中的按 F4 进入 `engine_crash`，准备中的按 F4b 的握手失败进入 `prepare_failed`（`06` §6.8，ADR-229）；复用的 Host 同样如此（ADR-230）：`hostExpected` 按 Goal、按 Run 置位，在该 Run 结束时清除、下一个 Run 于其 `run.started` 时重新置位，所以 Host 跨 Run 保留时（暂停不足 5 分钟后继续、返工等，`06` §6.1.8）同一 Goal 下一个 Run 的准备阶段同样只由 120 s 准备时限判定；只重启 Supervisor 时，交回的存活 Host 对其上有进行中 Run 的 Goal 从重新接上时起计（其余 Goal 照上文等下一个 Run 的 `run.started`，§8.6.1 `hostExpected` 一行，ADR-231），Supervisor 的退避与重启时间不计入；系统睡眠期间看门狗冻结，唤醒后另有 60 s 宽限（`06` §6.1.5）。两种情况都按 `06` §6.1.3 Engine Host 一行进入 `paused{engine_crash}`。**条目时机（唯一定义，ADR-204、ADR-205；`06` §6.1.3、§6.1.4、§6.8 F4，`12` §12.6.5，`16` §16.1.7 引用）**：自动“重启并恢复”进行期间不生成条目，实况行与卡片写 `◇ 将自动重试 1 次`。自动重启解除 `engine_crash` 后照常经准入与准备阶段（`06` §6.2.4）：其中的失败按 `prepare_failed`（Host 握手、开场组装）或 `satellite_missing`（卫星重建）自己的条目处理，不另生成 `stalled{crashed}`；恢复成功也不生成，因此不存在要随自动恢复关闭的条目。只在两种情形下生成 `stalled{subtype:"unresponsive"|"crashed"}`（severity 2，`agent_blocked`，基础级别 L3）：上一次崩溃后 10 分钟内再次崩溃（不再自动重启；“上一次崩溃”取账本中该 Goal 上一次以 `engine_crash` 进入暂停的时间，因此跨应用重启保留，而应用本身退出或崩溃后启动恢复记为 `crashed` 的 Run 不算，ADR-206、ADR-207）；或应用启动时因 `resumeOnLaunch` 关闭而没有自动解除（只有 Supervisor 重启、main 一直在运行的恢复同样算一次启动，`06` §6.1.6，ADR-207）。已生成这条条目的 `engine_crash` 在启动时不自动解除（`06` §6.1.4 第 5 项），由人处理。选项为：重启宿主并恢复（从 Pi JSONL 恢复会话；恢复前先确保卫星存在，缺失时按 ADR-076 从影子重建）/ 诊断视图 / 放弃（`goal.abandon`）；不处理则保持暂停（Run 已以 `crashed` 结束）。
- **`stalled`**（宿主活着、在汇报，但没有进展）：由 `07` §7.7.1 的检测器置位（M1 只有 S1、S5 与 `no_progress_for`；S2–S4、S6、S7 在 M2，ADR-059）。另有两条事件静默规则：
  - `thinking` 状态下 90 s 无 `message_update`：Live Line 以同样的 `◇` 处理提示“模型 90 s 无输出”，模式不变；300 s 时置 `stalledFlag`（subtype `provider_silent`）。
  - `acting` 状态下工具无输出 ≥ 20 min 且没有设置 timeout：置 `stalledFlag`（`07` S5）。tower-goal 在 `tool_call` 时还会为未设 timeout 的 bash 注入默认 `timeout = 1800 s`（通过修改 `event.input`，可在 VerifyProfile 中调整）。
- 两者的区别在于补救方式：`unresponsive` 是基础设施问题（重启宿主），`stalled` 是行为问题（转向、回退、接管）。

### 8.6.4 停下但没有提交（idle_without_submit）

Agent 有时会用普通文本提问或结束，而不调用 `ask_user`/`submit`。此时出现 `agent_settled`，但 Goal 仍是 `running`，模式变为 `settled`。处理分两步：

1. 在 tower-goal 的 `agent_before_settle` 中：如果本轮既没有 `submit` 也没有挂起的 `ask_user`，并且本 Run 内还没有这样补过，则返回 `{continue: true, entries:[custom_message "Tower: if you need input, call ask_user; if the goal is done, call submit; otherwise continue."]}`（*pi.md* §12.4 的模式，每个 Run 限 1 次）。这条提醒属于**模型面特性**（ADR-048）：≤ 60 token、在 Trace 中以“Tower 注入”原样可见，与 nudge 共用 E5 附属指标与撤回规则。
   **nudge 守卫不成立时**（只有 human 标准、`nudge.max = 0` 等，`05` §5.6.5，ADR-135）跳过本步，settle 时没有有效提交直接进入第 2 步，不 nudge——这只适用于**非 draining 且 `outcome = completed`** 的 settle；draining 时按 `drainingFor` 的原因集合暂停（最高者为 `pauseReason`，ADR-141），`aborted`/`error` 按 abort 原因或 provider 规则（ADR-138）。“本 Run 内”以本 Run 的起点为锚：`before_agent_start` 时持久化为会话条目 `tower.run_start`，重启与分叉后从分支上重建（ADR-143），含由 `tower.*` 消息触发的 Run；不以最后一条 user 消息为锚。
2. 如果仍然 settled：生成 `stalled{subtype:"idle_without_submit"}`（severity 2，`agent_blocked`），把最后一条 assistant 消息的前 3 行作为证据（Claim 语法）。Goal 按 `03` §3.2 转为 `paused(idle_without_submit)`。**选项**以 `03` §3.2.1 `idle_without_submit` 行为唯一定义（ADR-143），本文不另列。

### 8.6.5 显示规则与注意力映射

- **防抖：** `thinking ↔ acting` 在显示上的最短停留时间为 500 ms（事件日志立即记录）。异常模式（`waiting_human` 及以后各项、`stalled`、`unresponsive`）立即显示。
- Live Line 格式：`mode · 动作 · 对象`，与 `04`、`12` §12.6.4 一致（渲染以 `12` 为准），模式段渲染为 `12` 的徽章文字（`acting` → `执行`、`thinking` → `思考`、`preparing` → `准备中`、`verifying` → `验证`），例如 `执行 · edit · src/checkout.ts +12 −3`、`执行 · bash · pnpm test checkout · 14s`。`acting` 的动作和对象来自观察器的 Fact（`07` §7.2），因此保留了可转向的细节（R12）。`thinking` 的动作为“当前步骤”，对象为最近一条 `step` 说法，按 `12` 的说法样式显示（`┆` + text-2，不用斜体）。行尾为活跃度分档；心跳迟到或模型静默时按 §8.6.3 用 text-1 加亮 + `◇`，不用琥珀。

| 模式 | 注意力级别 | 说明 |
|---|---|---|
| thinking / acting / queued / verifying / settled（已提交） | L0 | 只在 Live Line 显示 |
| settled（收尾：等待后台进程终止，ADR-115/121/126） | L0；实况行文字以 `12` §12.6.4 为唯一定义；有进程存活 → `bg_process_survived`（L2，去重与标注见 §8.4、§8.8） | |
| preparing | L0；子状态词表与进度格式以 `12` §12.6 为准（进度事件 `prepare.progress.step` ∈ `mirror` · `lock` · `fetch` · `lfs` · `checkout` · `deps` · `handshake`，ADR-151；下载显示 `<对象> <总大小> <百分比>`）；持续 > 10 min → L1（`◇`）；准备步骤的顺序以 `10` §10.3.1 为唯一定义，分三段（ADR-150/151）：① **仓库准备**——镜像、项目锁、fetch、LFS 补齐、卫星 `clone --shared` 与检出（含 LFS 内容写出），时限 `prepare.repoTimeoutMin`（15 min）；② 依赖物化；③ **Host 握手与开场组装**，时限 120 s（只计这一段）。`prepare_failed` 的定义（来源清单只按 `16` §16.1.1 `Goal.pauseReason` 的 `prepare_failed` 一项，本节不另列全集，ADR-151/239）：`ready` 的准备阶段失败或超时（如仓库准备失败或超过 15 min、握手与开场组装失败或超过 120 s），以及 `running` 中途停止的几种（如 Tower 工具被同名扩展工具遮蔽、tower-goal 的同一处理器连续 3 次出错，drain 后进入）→ `paused(prepare_failed)`（不是 `engine_crash`，不在启动时自动解除，不 `autoResume`；重试从已完成的步骤继续；运行中途停止的一种，重试是开新的运行，卡片写“开新的运行”，ADR-190），继续目标 `run`，`queuedRun` 保留，生成 `stalled{subtype:"prepare_failed"}`（L2，Run 无法开始或已停止；去重键 `st:{goalId}:prepare`；认证预检失败（`06` §6.8 F7 ②）时不生成，条目是 §8.4 F7 的 `st:{goalId}:auth`，ADR-207/208）。**依赖物化不阻止 Run**：安装器失败或超过 `prepare.depsTimeoutMin`（15 min）→ Goal 照常进入 `running`（Fact `prepare{ok:false}`，L1 chip，Agent 简报附失败日志尾部，`10` §10.3.1），修复 lockfile 可能正是这个 Goal 的工作；它不生成 `prepare_failed`（该子类型只对应 `paused(prepare_failed)`）。准备中途到达外部写入或其他系统暂停原因 → 中止准备，以这些原因进入 `paused`，继续目标 `run`（ADR-149） | |
| `paused(satellite_missing)`（ADR-076） | 自动重建期间 L0（中性 `◇ 正在重建工作目录`）；重建成功回到原状态，不打扰；重建失败 → Needs-You（severity 2，选项：重试重建（`goal.rebuild_satellite`，重建来源同自动重建，`10` §10.16.2 情形 E，ADR-176/183/185；从更早的检查点重建属 M2）/ 放弃），去重键 `st:{goalId}:satellite`（§8.4） | |
| compacting | L0；`compaction_end` 失败，或 30 min 内压缩 ≥ 3 次 → L1 chip“上下文频繁压缩，考虑交接” | |
| retrying | L0；第 3 次尝试或累计 > 2 min → L1；最终失败 → `stalled{subtype:"engine_error"}`（severity 2、`costOfDelay:"agent_degraded"` → L2：Goal 已暂停，同组有已存活的空闲 Host 时由探测自动恢复，否则由人在卡片上重试（`06` §6.1.4 第 5 项，ADR-235）——重试只在提供方恢复之后才有用，不需要断点打扰；并参与 provider 根因合并。F7 的条目**有意**沿用这两个输入与 L2，不参与合并：它的恢复要人重新登录，上面的理由对它不成立；取 L2 是因为登录在 Tower 之外进行、不需要断点打扰，与同样需要人处理的 `prepare_failed`（L2）一致，§8.4，ADR-206、ADR-207、ADR-208） | |
| waiting_human | 对应的 `question` 条目（基础级别 L3） | |
| blocked_guard | 对应的 `approval` 条目 | |
| budget_capped | `budget` 条目（severity 2，`agent_blocked` → L3） | |
| stalled | nudge 阶段为 L1；escalate 阶段为 `stalled` 条目（L2，`agent_degraded`）；`unresponsive`/`crashed`/`idle_without_submit` 为 L3 | |
| unresponsive | 见 §8.6.3 | |

---

## 8.7 超时默认动作、OS 通知与 Dock 角标

### 8.7.1 超时默认（default-if-ignored）

**对话框规格**只在 `05` §5.6.4 定义（ADR-023：只用 `ctx.ui.input`，载荷为带 `tower:` 前缀的 JSON），本节只规定**何时、以什么默认值**应答。

**安全默认规则**（ADR-023、`02` §2.9）：

| 条目 | 允许的超时默认 |
|---|---|
| `approval` | 只能**拒绝**；单向门永不因超时放行 |
| `question`，`riskTier ∈ {standard, high}` | **不允许超时作答**：超时 = Goal 进入 `paused(question_timeout)`；条目**保持打开**，不写 `resolution`，只记录 `timedOutAt`（`02` §2.9），人之后仍可作答（`03` §3.2.1） |
| `question`，`riskTier = low` | 仅当 Harness 判定推荐项**可逆**时，才可默认 Agent 推荐项（写 `resolution.by = "timeout"`，条目关闭）；否则同上：暂停、条目保持打开、记录 `timedOutAt` |
| `stalled`（检测器 escalate，`07` §7.7.1） | 只能**暂停**：超时 = Goal 进入 `paused(stalled_timeout)`（Run 以 abort 方式 drain 到回合边界）；条目保持打开，只记录 `timedOutAt`（ADR-183） |
| 任意 | 永远不能由超时触发：批准单向门、验收 Goal、扩展预算、覆盖 severity 3 哨兵 |

**“可逆”由 Harness 判定，不取 Agent 的说法**（R1-D8-01）：推荐项的后果只涉及卫星内文件，且 Harness 对该选项后续动作的分类（`11` §11.3）不含任何单向门动作类、不含 `edit.outside_worktree`、`dep.add`、`config.change`。无法判定（例如自由文本选项）时一律视为不可逆。

**是否计时由合同 `unattended` 决定**（`02` §2.5）：

| `Contract.unattended` | 计时 |
|---|---|
| `"wait"`（默认） | **不超时**，也不向 Pi 传 timeout。人不在时 Agent 一直等待，Goal 保持 `waiting_human` / `blocked_guard` |
| `"use_defaults"` | 从 `surfacedAt`（条目首次以 ≥ L2 投递的时刻）起算 `defaultIfIgnored.afterSec`，到期由 **Supervisor** 按上表应答；Pi 侧兜底 timeout = `afterSec + 60 s`（ADR-023），只在 Supervisor 失联时生效 |

- **倒计时文案（R4-D8-03，`04` §4.8.2 的 CountdownLabel 引用此表）：** 只在确实会计时的情况下显示倒计时，并写明默认结果。

  | 情形 | 文案 |
  |---|---|
  | `unattended:"wait"`（任意条目） | 不显示倒计时；需要时显示“不会超时” |
  | `use_defaults` 下的 approval | “30 分钟后 → 拒绝（仅 use_defaults）” |
  | `use_defaults` 下 S0 执行授权（ADR-077） | “30 分钟后 → 拒绝（仅 use_defaults）”；超时记为 `s0Grant = denied_timeout`，按拒绝处理：验证阶段只解除 `s0_grant_pending`、以同一 pin 重新验证，去向由 `07` §7.10.3 `decide()` 判定（ADR-188） |
  | `use_defaults` 下 standard/high 风险的 question，或推荐项不可逆 | “超时后暂停（不自动作答）” |
  | `use_defaults` 下 low 风险、推荐项可逆的 question | “N 分钟后 → 采用推荐：<选项>” |
  | `use_defaults` 下检测器 escalate 的 `stalled`（`07` §7.7.1，默认 1800 s，`16` §16.2.2；ADR-182） | “30 分钟后 → 暂停（仅 use_defaults）”；超时 → `paused(stalled_timeout)`，条目保持打开（ADR-183） |
- **两种超时结果要区分（R3-D8-01）：**
  - **超时并按默认作答**（approval 默认拒绝；low 风险问题默认可逆推荐项）：写 `resolution.by = "timeout"`，条目关闭，`outcomeClass:"timeout"`，在重入简报中归入“替你做的决定”（§8.10）。
  - **超时并暂停**（standard/high 风险的问题，或不可逆的推荐项；检测器 escalate 的 `stalled`）：条目保持打开，只记录 `timedOutAt`；Goal 为 `paused(question_timeout)`（问题）或 `paused(stalled_timeout)`（停滞，ADR-183），暂停以 `⚙ 超时默认` 显示（`12` §12.6.5）。重入简报在“需要你”区块置顶，并注明“已超时，Goal 因此暂停”。人作答后条目按普通作答关闭；停滞条目没有作答，随 `stalled_timeout` 的解除关闭（§8.8 `stalled` 行，ADR-184）。

### 8.7.2 渠道选择与 OS 通知策略

```ts
function channelFor(level: Level, w: WindowState): Channel[] {
  if (level <= 1) return [];
  if (level === 2) return ["inbox"];
  const visibleFocused = w.visible && w.focused;
  const base = visibleFocused ? ["inbox", "toast"] : ["inbox", "os"];
  if (level === 4 && settings.attention.soundForSeverity3) base.push("sound");   // 02 §2.14，默认 false
  return base;
}
```

- **窗口可见且聚焦时，不发 OS 通知**，改为应用内 toast：右上角，非模态，不抢焦点，8 s 后收入收件箱。
- **通知身份：** 每个 `dedupeKey` 最多保留一条 OS 通知；新内容出现时关闭旧的 `Notification` 对象再发新的，不堆积。
- **通知内容：** `"<GoalId> · <需要你决定什么>"`，例如“G-0142 · 需要批准：pnpm add stripe”。**通知中不包含代码、diff 或密钥。** `lockScreenPrivacy` 为真时只显示“Tower：1 项需要你”。
- **点击通知：** 深链接到该条目，证据面板已展开。若条目类型属于 §8.13 的触发条件，则直接打开诊断视图。
- **提示音（earcon）：** 只有三类（*TB* D#33）：需要你、已验证、异常。默认关闭；`soundForSeverity3 = true` 时只用于 L4。
- **`serve` 模式和移动端（M2，ADR-038）：** 与桌面端共享同一对令牌桶，不会因为多一个设备而多打扰一倍。哪些条目可以在远程处理、哪些只能在本机桌面处理，以 `16` §16.5 远程能力矩阵为准（例如合同只允许远程 `quick_ratify`，ADR-051）；通知中对不可远程处理的条目只提供“在桌面打开”。

### 8.7.3 Dock 角标与托盘

- **Dock 角标数 = 状态为打开、生效级别 ≥ L2、severity ≥ 2、没有被延后（snooze）、不在“稍后”分区的 Needs-You 条目数。** 根因合并后的成员条目不重复计数。severity 1、chip、`ratify` 聚合条目都不计入。
- 角标只表示“有事需要你”，不表示“有新活动”。没有可行动的事项时，角标为空，即暗驾驶舱原则（*TB* A8）。

---

## 8.8 告警精度：定义

**单位：** 一条曾以 L≥2 呈现过的条目（L3/L4 另行单独统计）。

**`outcomeClass` 判定**（条目关闭时由 ⚙️ 计算，写入 `02` §2.9 的 `outcomeClass`）。每个出口只有一个类别：单列的行写到的出口以该行为准；kind 为“任意”的通用行只适用于该 kind 的行没有写到的出口（ADR-187）：

| kind | actionable | 其他类别 |
|---|---|---|
| `question` | 人作答（任意答案；包括带 `timedOutAt` 之后的作答） | 超时并按默认作答 → `timeout`；超时并暂停只记 `timedOutAt`，不定类，直到条目关闭时按实际处置定类；Agent 自行撤回、条目作废 → `obsolete` |
| `approval` | 拒绝；修改后批准；**查看证据 ≥ 3 s 后**批准 | 未打开证据且 < 3 s 即批准 → `reflexive`；其余批准 → `confirmatory` |
| `review_ready` | 验收或 request changes | 被新的验证取代 → `obsolete` |
| `verify_failed` | 选择放弃以外的任意处置选项（放弃按末尾的通用放弃行）；“改为 human 标准”例外：条目在重新验证开始（界面串联的 `retry_verify` 被接受）时关闭并定类，不在选项被选择时；修订取消则条目保持打开（`03` §3.4.5，ADR-169） | —（不计时，没有超时一类，ADR-182） |
| `sentinel` | 按 `07` §7.11.1 判为 TP-actionable | `intended_change` 或 `accept_risk` 覆盖 → `informative`（`07` §7.11.1 TP-informative，ADR-187）；误报 → `false_positive`。标注只看覆盖的原因，与之后的去向无关。（M2，ADR-164）带机密的标准为 `not_run{blocked_by_sentinel}` 时，覆盖后 Goal 先只运行机密阶段（`verify{pin, secretPhaseOnly:true}`），通过后才生成 `review_ready`，失败则按 `verify_failed` 另成条目（ADR-163，`07` §7.4.11） |
| `sentinel`（`sandbox_violation`，ADR-117、ADR-125） | “收紧策略”（打开自主度矩阵并作出修改）或“放弃 Goal” | “知悉”→ `informative`；“这是良性的”→ `false_positive`（可把 `(category, op, target)` 加入项目良性清单，此后同一单位为 sev 1；凭据读取不能加入，`mark_benign` 仅本机） |
| `anomaly`（`bg_process_survived`，ADR-126/144） | “再次终止”且成功（重新扫描确认已无存活者） | “知悉”→ `informative`（只结束打扰，**不**结束存活期间：30 s 扫描与 `10` §10.3.1 的存活期间归因持续到存活者全部退出，ADR-145）；人处置前 30 s 扫描发现存活者全部自行退出 → 自动关闭，`obsolete` |
| `stop_condition`（ADR-135/139） | “继续”（`goal.resume`，本次命中对象静默一个 Run）或“修订合同后继续”（`contract.amend` + `goal.resume`） | “这里不该停”（`goal.resume{feedback:"stop_condition_false_positive"}`）→ `false_positive`：该条件静默到下一次合同修订；它是条件写得过宽的信号，由 `09` §9.6.2 L9 消费（候选收窄）。同一条件在静默期间不会再产生条目，因此每个决定只计一次 |
| `external_change`（ADR-128） | `keep`（采纳为我的改动） | `revert` → `false_positive`（作为检测器精度信号：人认为这不是需要保留的外部改动）；观测到合入（M1 只观测本地 base，Fact `local_merged`；`remote_merged` 属 M2）使 Goal 进入 `integrated` 而条目未处置 → `obsolete`；合入的是较旧的 seal、且 Goal 此后已有新内容时只记 Fact、不进入 `integrated`（ADR-137），条目**不**关闭 |
| `anomaly`（`structured_content_dropped`，ADR-201） | — | “知悉”（`signal.acknowledge`，ADR-208）→ `informative`（退出码已丢失，Tower 无从补回；处置是停用或修正该扩展，在 Tower 之外进行） |
| `anomaly`（`tower_goal_handler_error`，ADR-239） | — | “知悉”（`signal.acknowledge`，ADR-208）→ `informative`（gate 出错时调用已被阻断、脱敏出错时结果已被隐去，Tower 无从补做；`turn_start` 出错时那一次请求可能仍带已注入的密钥，`05` §5.6.5 `turn_start` 一行，处置在 Tower 之外） |
| `anomaly`（`post_settle_activity`，第 1 次：不暂停） | 撤回后人采取了转向、回退（M2）或暂停 | “知悉”（`signal.acknowledge`，ADR-208）→ `informative` |
| `anomaly`（`post_settle_activity`，1 小时内第 2 次：Goal 为 `paused(post_settle_activity)`，阻塞类，ADR-183） | `继续`（`goal.resume`）或 `重新确认后提交`（`retry_claim`）→ `actionable` | `放弃`（`abandon`）→ `informative`；没有“知悉”（`03` §3.2.1） |
| `budget` | 扩展预算后继续（`extend_budget` 只提高额度，`resume` 才解除，ADR-137）或按当前状态送去验证（`claim_on_behalf`，仅 `budget_hard_cap`，`03` §3.2.1） | `放弃`（`abandon`）→ `informative`（ADR-185）；阻塞类：drain 中与暂停中都不能关闭（ADR-183） |
| `stalled` | 暂停、转向、回退（M2）、接管、重启宿主 | 选择“继续”且 10 min 内出现进展信号 → `false_positive`（误报的停滞）；`use_defaults` 下 escalate 超时按默认暂停（`paused(stalled_timeout)`）只记 `timedOutAt`、不定类，条目保持打开（ADR-183）；**解除 `stalled_timeout` 的同一事务关闭该条目**（唯一定义，ADR-184）：`resume`（`06` §6.4.3）、回退（M2）或交还 → `actionable`，`abandon` → `informative`；上面的“10 min 内出现进展 → `false_positive`”只适用于 Run 中、未超时的“继续” |
| `stalled`（子类型 `idle_without_submit`，ADR-143/185） | “继续”（`goal.resume`，可附转向）或“按当前状态送去验证”（`claim_on_behalf`）→ `actionable` | “放弃”（`abandon`）→ `informative` |
| `stalled`（子类型 `satellite_missing`，ADR-176/185） | “重试重建”（`goal.rebuild_satellite`）→ `actionable` | “放弃”（`abandon`）→ `informative` |
| `stalled`（子类型 `human_checkout_lost`，ADR-211） | “再次接管”（`goal.take_over`）或“继续”（`goal.resume`）→ `actionable` | “放弃改动”（`goal.discard_human_edits`）→ `informative`（改动已无法恢复，处置只是确认） |
| `stalled`（子类型 `write_back_failed`，ADR-220） | “再次交还”（`goal.hand_back`）或“再次带回”（`inspect.bring_back`）→ `actionable` | “放弃改动”（`goal.discard_human_edits`）、“关闭检验”（`inspect.close`）、“放弃 Goal”（`goal.abandon`，ADR-221）或“知悉”（人按 `X` 关闭，`needs_you.dismiss`：条目不对应任何暂停原因，不是阻塞类，检验目录或副本已不在、再次带回与关闭检验都返回 `E_STATE` 时也可用，ADR-223）→ `informative`（处置只是确认；生成时你的副本在原路径，`06` §6.4.3）；此后成功执行的 `goal.resume`、`goal.take_over` 及 §8.4 所列其他不经本条目出口的事件 → `obsolete` |
| `stalled`（子类型 `prepare_failed`，ADR-148/151） | “重试”（`goal.resume`）→ `actionable`；“我来改”（`take_over`，仅当卫星**已完成检出**——完成标记存在，否则不提供该选项，ADR-151）→ `actionable` | “放弃”（`abandon`）→ `informative` |
| `stalled`（子类型 `engine_error`，认证过期 F7 的条目，ADR-206） | “重试”（`goal.resume`，解除 `provider_unavailable` 或 `prepare_failed`）→ `actionable`；`provider_unavailable` 的探测成功、暂停自动解除时同为 `actionable`（探测会真正刷新令牌，成功说明凭据已恢复，通常是人已在终端重新登录；Tower 无法区分其他原因，统一这样计，`05` §5.10、`06` §6.1.4，ADR-207） | “放弃”（`abandon`）→ `informative`；只有 ③ 而 Run 没有以 `error` 结束、该 Run 结束时 → `obsolete`（ADR-207） |
| `ratify` | 批准或拒绝至少一项 | 14 天未处理、提议过期，或对象中的提议全部被清除（`09` §9.12.4，ADR-198） → `obsolete` |
| `backlog` | 开始评审批次、越过（M2：仅阻止模式）、调整上限 | 关闭 → `false_positive` |
| `flood` | 暂停 Goal、逐个查看 | 关闭 → `confirmatory` |
| `digest` | 从摘要行跳转并处理了至少一项 | 打开即关 → `confirmatory`；未打开 → `obsolete` |
| `sync_conflict` | 选择版本 | — |
| `project_identity` | 选择“同一项目”或“新项目” | — |
| `integration`（推送失败，ADR-157） | 重试推送且成功 → `actionable` | “只保留分支” → `informative` |
| `integration`（`credential_url`，ADR-157 补记、ADR-159） | 用户改用 credential helper 后，`project.remote.recheck`（或下一次网络操作前的检查）确认远端 URL、内联 `credential.helper`、`core.sshCommand`、`http.extraHeader` 都不再含凭据，条目自动关闭 → `actionable` | — |
| `conflict` | 重排顺序、rebase、暂停 | 关闭 → `false_positive` |
| `verify_env` | 重试、修改验证档案、暂停 | 环境自行恢复（下次验证通过）→ `obsolete` |
| `verify_env`（`secret_wait`，**M2**，ADR-160/164） | “现在运行（接受风险）”（`verify.secret_wait.run_now`）或“以文件方式运行”（`verify.secret_wait.as_file`）→ `actionable` | “继续等待”（`verify.secret_wait.keep`）→ `informative`；人处置前机密阶段已自行开始（Agent 活动结束）→ `obsolete` |
| 任意（人按 `X` 关闭，`needs_you.dismiss`） | — | 按本表该 kind 的“关闭”一格（如 `flood` → `confirmatory`，`backlog`、`conflict` → `false_positive`）；未单列的 → `false_positive`（人判断这次打扰不值得，计入精度的反例；ADR-180）。人的关闭从不记 `obsolete`。**阻塞类条目不能关闭**（唯一定义，ADR-182）：对应的对话框仍在等待的条目（`question`、`approval`，含 S0 执行授权），以及对应其 Goal 当前任一暂停原因或待暂停原因（`pauseReason`、`alsoApplies` 或 drain 中的 `drainingFor.reasons`——例如软上限触发、仍在 drain 时已生成的 `budget` 条目，`running` 中检测到外部写入时的 `external_change` 条目，ADR-183；按 `16` §16.1.7 的 pauseReason → kind 映射，映射给出子类型时按 kind 与子类型判定；`prepare_failed` 由 `06` §6.8 F7 ② 进入时，对应的条目是 `stalled{engine_error}`（`st:{goalId}:auth`），ADR-208）的条目，不提供 `X`，只能作答、拒绝或延后（`S`）；对它们执行 `needs_you.dismiss` 返回 `E_STATE`。因此关闭一条条目永远不会留下一个没有条目可处理的阻塞 Agent 或暂停的 Goal |
| 任意（`放弃`，`abandon`） | — | 本表未单列放弃一格的 kind（例如 `verify_env`，`stalled` 的 `crashed`、`engine_error` 子类型——`provider_unavailable` 暂停对应后者，`16` §16.1.7）→ `informative`；这些子类型的其余出口按通用 `stalled` 行定类（ADR-186） |
| 任意（交还或 `resume` 解除对应的暂停原因而关闭） | 交还（`goal.hand_back`）或 `goal.resume` 解除该条目对应的暂停原因（例如 `stop_condition`、`idle_without_submit` 的条目因交还解除而关闭；`provider_unavailable`、`engine_crash` 暂停中换模型后 `resume`）→ `actionable`（ADR-187） | — |
| 任意 | — | 在人处理前已经因为情况变化而自动解决 → `obsolete`（只由 ⚙️ 产生）。例：Goal 从 `paused(*)` 进入 `integrated` 时，对应原暂停原因的阻塞类条目与等待中的对话框（含 S0 执行授权）在同一事务以 `obsolete` 关闭（唯一定义 `10` §10.12 (i)，ADR-195） |

**指标：**

```
打扰精度 interruptPrecision = #actionable(L3∪L4) / #delivered(L3∪L4)          目标 ≥ 0.70
收件箱精度 inboxPrecision   = #actionable(L≥2) / #surfaced(L≥2)               目标 ≥ 0.50
（分母只计已关闭的条目，与 02 §2.9“告警精度 = actionable / 已关闭”一致；未曾以 ≥ L2 呈现的条目不计入）
（带 timedOutAt 而仍打开的 question 不进入分母，直到关闭；另单列“超时暂停次数”与“超时后作答的中位延迟”，用于 E3 评估暂停策略的代价）
反射批准率 reflexiveRate    = #reflexive / #approval（按动作类别）              ≥ 0.95 → 自主度提升候选（09 §9.9）
已作废打扰率 obsoleteInterruptRate = #obsolete(L3∪L4) / #delivered(L3∪L4)       目标 ≤ 0.10（说明投递太早）
```

全部按 `source = (kind, detector, projectId)`、Goal、级别分别计算，滚动 14 天和 30 天两个窗口。

---

## 8.9 周报与自动调节

### 8.9.1 周报（周一的站会摘要附带，另有完整的“注意力报告”页）

1. 一句话总结：“本周你的打扰中 72% 导致了行动（目标 70%）”（*TB* D#19）。
2. 打扰精度与收件箱精度，以及较上周的变化。
3. 打扰速率：活跃小时的 p50/p95（目标 p95 ≤ 6/h），洪泛窗口占比（目标 < 1%）。
4. 首次响应时间中位数，按严重度分列；超时决策数。
5. 各动作类别的反射批准率（指向 `09` §9.9 的自主度建议）。
6. 噪声最大的 5 个来源（来源 × 项目），各附一条建议动作（Claim 语法）。
7. 本周的自动调节记录，每条附“一键撤销”。
8. （可选，需启用 `09` §9.10 的“预测后揭示”）用户自身的校准度。

### 8.9.2 自动调节规则

**M1 范围（ADR-038/059）：** M1 计算并在周报中展示各项精度，但**不启用自动调节**；下列规则从 M2 起生效（`autoTune` 在 M1 中无效）。

| # | 条件（某来源最近 14 天，样本数 n ≥ 20） | 动作 |
|---|---|---|
| A | `interruptPrecision < 0.4` | 该来源的基础级别从 L3 降到 L2 |
| B | `inboxPrecision < 0.3` 且 `costOfDelay = none` | 降为 L1（只进批处理通道） |
| C | `obsoleteInterruptRate > 0.3` | 该来源的最长等待时间翻倍（投递更晚，给它自行解决的机会） |
| D | 某动作类别 `reflexiveRate ≥ 0.95` | 只把该类放入自主度晋升的**候选**；是否提出建议由 `11` §11.5 的条件判定（反射式批准不计入有效证据，`09` §9.9），**绝不自动执行** |
| E | 降级后的来源在 14 天内出现 ≥ 2 次被人从批处理通道（简报、站会摘要、chip）或收件箱中主动处理为 actionable | 自动恢复原级别 |
| F | `sandbox_violation` 以 `(category, op, target)` 为单位，最近 2 周 n ≥ 20 且 `false_positive` 比例 > 30%（E7）；**从 M2 起生效** | 该单位默认降为 severity 1（通知用户，可撤销；ADR-117、ADR-125）。**凭据读取**（`category:"credential"`、`op:"read"`）永不降级。这是对 severity 2 的降级，不涉及 severity 3 |

**护栏：**

- **severity 3 永不自动降级、抑制或推迟**（ADR-010 精神，题设要求）。
- `question`、`approval`、`budget(agent_blocked)` 永远不低于 L2（Agent 在等，降级等于静默阻塞）。
- 每个来源每周至多调整一次；每次调整都记为 `attention.tuning_applied` 事件，可撤销；用户可以把某个来源“钉住”，使其不被自动调节；`autoTune` 可以整体关闭。
- 自动调节只改变**路由级别**，从不删除条目或 Fact（降级的命中仍在账本里，仍进入简报）。

---

## 8.10 重入简报（Re-entry Briefing）

### 8.10.1 水位线语义

- `Goal.watermarks[userId] = seq`：用户“看到了”该 Goal 截至哪个事件。**推进规则：**
  - Goal 页（或展开的 Goal 卡片）在**窗口聚焦**状态下连续可见 ≥ 3 s → 水位线推进到当前已渲染的最大 seq；页面保持打开且聚焦时，新事件渲染满 3 s 也继续推进。
  - 点击简报的“知道了”→ 推进到该简报覆盖的最大 seq。
  - Watch 模式（§8.5.7）的视图在聚焦状态下可见 → 持续推进。
  - 只在收件箱中处理了一条条目 → **不**推进 Goal 水位线（只算看到了部分），但该条目标为已看。
  - 鼠标悬停、快速滚动掠过 → 不推进。
- `UserSettings.globalWatermark`（`02` §2.14）：Overview 在聚焦状态下可见 ≥ 3 s 时推进，用于应用级重入。
- 水位线只增不减；“标为未读”是 UI 上的过滤，不改变水位线。

### 8.10.2 触发条件

| 场景 | 条件 |
|---|---|
| 打开某个 Goal | delta 中有 ≥ 1 个重要事件，**且**（距水位线时间 ≥ 10 min，**或** delta 中有 severity ≥ 2 的事件） |
| 应用级 | 从 `away`（≥ 30 min）恢复或启动应用时，基于 `globalWatermark` 生成跨 Goal 简报（同样最多 7 行，每个 Goal 至多 1 行，按 Goal 的最高 `P` 排序） |

“重要事件”= 生命周期转移、标准状态的净变化、新的 Needs-You、超时决策、新的哨兵命中（≥ severity 1）、新的或已变化的评审单元、预算跨过 25/50/75/100%。

### 8.10.3 Delta 计算（来自事件日志，确定性，不用 LLM）

为避免“摘要漂移”（*TB* C16.5），简报每次都从账本重新生成，从不在旧摘要的基础上再摘要。

```ts
function computeDelta(goalId, fromSeq, toSeq): Delta {
  const ev = eventLog.range(goalId, fromSeq + 1, toSeq);
  return {
    lifecycle: netTransition(ev),                 // 首末状态 + 中间经历（例如“经历 2 次返工”）
    progress: { before: progressAt(goal, fromSeq), after: progressAt(goal, toSeq) },   // {V, O, M}，07 §7.2.4 唯一口径
    criteria: machineCriteria(goal).map(c => ({ id: c.id,
                                         before: trackAt(c, fromSeq), after: trackAt(c, toSeq),   // "verified" | "observed" | "failing" | "unknown"
                                         flips: countFlips(ev, c), since: lastFlipTs(ev, c) }))
                             .filter(d => d.before !== d.after || d.flips >= 2),
    needsYouOpen: openItemsAt(toSeq, goalId),     // 期间已解决的不再显示，超时解决的除外
    decidedForYou: [...timeoutResolutions(ev), ...newClaims(ev, ["decision", "assumption"]).filter(pendingRatify)],
    anomalies: newSentinelHits(ev).filter(stillOpen),   // 已解决的折叠为计数
    resolvedAnomalies: count(newSentinelHits(ev).filter(resolved)),
    review: reviewUnitChanges(fromSeq, toSeq),    // new / changed(contentHash) / removed
    spend: { usd: costDelta(ev), pctOfSoft: budgetPct(goal) },
    projection: projection(goal),                 // 见下
  };
}
```

**projection（L3 预测，R4）：** 由 Fact 和 Claim 拼接，并分别标注语法。

- 下一步：最近一条 `log{kind:"next"}` 或 `step` Claim（Claim 语法）。
- 预计何时需要你：从 `PlanStep.needsDecision` 中找下一个尚未完成的步骤（ADR-030 已删除 `eta` 类 Claim，不再显示 ETA）。
- 预算消耗（Fact）。

### 8.10.4 内容与排序（最多 7 行）

| 顺序 | 区块 | 模板示例 | 语法 |
|---|---|---|---|
| 1 | 需要你 | “2 项需要你：批准 `pnpm add stripe`；回答“时区用 UTC 吗”” | Human 待决 |
| 2 | 生命周期与验证 | “已验证 @a1b2c3（4 min 前），可验收；期间返工 1 次” | Fact |
| 3 | 验收标准 | “已验证 2/4 → 3/4 · 观测到 4/4 · 人工 0/1；C4 `pnpm test checkout` 自 14:02 起失败（翻转 2 次）”（M 只含机器标准，人工另列，ADR-052，`07` §7.2.4）；不可能被机器验证的 Goal 写作“观测 3/4 · 未经机器验证（生态未支持）” | Fact（V）/ Agent 环境观测（O） |
| 4 | 替你做的决定 | “超时按默认：拒绝了 `git push`；Agent 新增 2 条假设待批准” | 系统印章 `⚙ 超时默认`（不是 Human，`12` §12.5.1，ADR-176）/ Claim |
| 5 | 异常 | “测试完整性：`tests/pay.test.ts` 删除 3 个断言；另有 2 项已自行解决” | Fact（+ 提示为 Claim） |
| 6 | 改动与评审 | “新增 2 个评审单元（高风险 1）；1 个已批准单元内容已变化” | Fact |
| 7 | 花费与预测 | “$3.10（软上限的 62%）· 下一步：*接入 webhook 重试*；预计在“迁移”步骤需要你” | Fact + Claim |

- 空区块跳过。候选超过 7 行时，按上表顺序保留，最后一行改为“另有 N 项变化 →”（链接到完整的 delta 时间线）。
- 每行 ≤ 80 个显示宽度（中文字符按 2 计）；severity 3 的条目可以占用第 1 区块的 2 行。
- **每一行都是可导航线索（Cue）**，不是散文：

```ts
interface Cue {
  grammar: "fact" | "claim" | "human";
  glyph: string; text: string;
  target: | { type: "item"; itemId: ItemId }
          | { type: "hunk"; projectId: ProjectId; file: string; hunkHash: string }
          | { type: "log"; path: string; byteRange?: [number, number] }      // 失败输出，定位到失败签名所在行
          | { type: "trace"; runId: RunId; fromEntry: string; toEntry: string }
          | { type: "criterion"; criterionId: string }
          | { type: "reviewUnit"; unitId: string; sinceView: boolean }
          | { type: "timeline"; fromSeq: number; toSeq: number };
}
```

- 快捷键：简报可见时，`1`–`7` 跳转到对应行，`↩` 表示“知道了”（以 `16-registry.md` 为准）。
- 度量：重入后到第一个正确动作的耗时（R10，*TB* 实验 4），在 `14` 中对比有无简报的情况。

---

### 8.10.5 覆盖层的优先级与互斥（R1-D8-08）

人回到 Tower 的那一刻，可能同时满足多个自动覆盖层的条件。规则在此定义（唯一定义），`04` 与 `12` §12.8 引用（ADR-232）。

| 优先级 | 覆盖层 | 触发 | 形态 |
|---|---|---|---|
| 1 | L4 决策卡 | §8.3.1 | 右上角提示条（`12` `BreakpointBanner`），聚焦时不抢焦点 |
| 2 | 诊断视图 | **只**在用户从异常条目、通知或 `T` 进入某个 Goal 时（§8.13.1）；从不在回到应用时自动弹出 | 整页布局 |
| 3 | 应用级重入简报 | 离开 ≥ 30 min 后回来（§8.10.2） | 概览顶部的简报浮层 |
| 4 | 单 Goal 重入简报 | 打开某个 Goal（§8.10.2） | Goal 页顶部 |
| 5 | L3 断点提示条 | §8.3.4 | 右上角，同一时刻至多 1 条 |
| 6 | “下一件最值得看的事”高亮、Watch 提示 | §8.5.6、§8.5.7 | 原位高亮，非覆盖 |

**互斥规则：**

1. **同一时刻至多一个“整页或浮层”覆盖层**（优先级 2–4）；提示条（1、5）可以与之共存，但同一时刻至多一条提示条，L4 替换 L3。
2. 应用级简报显示时：其中已列出的 Goal，在用户打开时**不再弹出**单 Goal 简报，除非之后又有新的重要事件；其中已列出的条目，**不再**以 L3 提示条投递（按 `itemId` 去重），L4 除外。
3. 浮层打开期间到达的 L3 条目，标记 `heldReason:"overlay"`，在浮层关闭或 10 s 无操作后再投递；L4 不等待。
4. 进入诊断视图时，该 Goal 的单 Goal 简报折叠为诊断视图顶部的一行（“自你上次查看：…”），不另弹浮层。
5. 用户在任何覆盖层上按 `Esc` 后，本次重入期间（直到下一次 `away`）不再自动显示优先级 3–4 的覆盖层；内容仍可从简报入口手动打开。
6. **被压下的覆盖层的去处**（ADR-233）：规则 1 下条件成立而未能显示的整页或浮层不丢失，在侧栏顶部以一行入口保留（视觉见 `12` §12.8），人点开时显示，显示中的覆盖层关闭后不自动补弹；这一行在人点开它、打开对应的 Goal 或下一次 `away` 时消失，多个被压下时合为一行 `另有 n 项未显示`、点开按规则 1 的优先级列出，它不进入“下一件”的次序（ADR-234）；规则 2 的“不再弹出”、规则 4 的折叠与规则 5 的 `Esc` 不算被压下（内容已在显示的覆盖层中，或人已选择不看），不留这一行。

---

## 8.11 站会摘要（Standup Digest）

> 里程碑：M2（`04` §4.2.4；ADR-059 未列入 M1，按 `14` §14.3.2 的规则不在 M1）。

- **时间：** `digestTimes`（默认工作日 09:30 和 14:00）。若到时应用未运行或用户处于 `away`，则在下一次粗断点时投递。也可以随时手动打开。
- **形式：** 一条 L2 收件箱条目“晨间摘要 / 午后摘要”。若有令牌，在断点时以 L3 弹出一次（消耗 1 个全局令牌）。
- **内容（≤ 15 行，跨 Goal，基于 `digestWatermark` 计算，不推进各 Goal 的水位线）：**
  1. 总览：`运行 4 · 待验收 2 · 阻塞 1 · 异常 3`。
  2. 需要你：按 kind 计数，并列出 `P` 最高的前 3 条。
  3. 待验收：每个 Goal 一行，显示 `已验证 V/M`（只有人工标准的 Goal 显示“未经机器验证”，ADR-031），附预计评审时间（SmartBear 300–500 LOC/h，仅作展示，ADR-014）。
  3a. 运行中：每个 Goal 一行 `已验证 V/M · 观测到 O/M`；对于不可能被机器验证的 Goal（全部 exec 标准生态未支持、S0 授权被拒、子模块项目），从一开始就显示 `观测 O/M · 未经机器验证（原因）`，不显示 `已验证 0/M`（R4-D8-04）。
  4. 自上次摘要以来已验收或已合入的 Goal。
  5. 阻塞或停滞的 Goal：每个一行，写明原因。
  6. 批处理的 severity 1：按检测器分组计数，例如“flake 3（2 个 Goal）· 配置变更 2”。
  7. 花费：今日与自上次摘要以来的花费，以及最接近预算上限的 Goal。
  8. 待批准数与学习提议数（`09`；记忆提议从 M2 起才有，学习闭环挖掘属 M3，`09` §9.0.1，ADR-059/185）。
- 每行同样是 Cue。摘要通过模板生成，不使用 LLM。

---

## 8.12 评审中的“自从你上次看”（Since You Looked）

- 查看一个评审单元时，记录 `ReviewView{unitId, contentHash, treeAtView, viewedAt, userId}`。
- 再次进入评审时，把单元分为四类：
  - **未变**（contentHash 相同）：保留批准状态，折叠显示。
  - **已变**（contentHash 不同）：按 I2 重置为 `unseen`。默认显示 **inter-diff**，即 `git diff <treeAtView> <currentTree> -- <单元涉及的文件>`，并裁剪到单元的 hunk 行区间（只看自上次查看以来改了什么），可切换为完整 hunk。做法参考 `pi-review-loop` 基于检查点的 since-review diff（*pi.md* §10）。
  - **新增**：没有查看记录。
  - **已移除**。
- 评论回执的变化：对于上次查看之后状态有变化的评论，显示 `delivered → acknowledged → addressed @commit`，并直接链接到对其进行处理的那段 inter-diff。
- 评审页顶部显示一行摘要：“自你 2 h 前查看：3 个单元变化（1 个高风险），1 个新增，2 条评论 ⚙ hunk 已变”（评论按来源计数，同下方 `requiresChange` 的口径；非 hunk 锚点的评论没有“已处理”，ADR-178）。
- **验收后内容变化**（合并队列 rebase 等（M2），`03` I2）：Goal 从 `accepted` 回到 `verifying`。若满足验收延续判据（唯一定义 `07` §7.10.3 `acceptanceCarriesOver`），自动恢复 `accepted`，只以 L1 记录 `audit.acceptance_carried`，不打扰；否则生成 `review_ready`，“自从你上次看”只列出变化的单元。
- `requiresChange = true` 的评论（`02` §2.8）在摘要中单独计数，并按来源分开（“2 条必须处理的评论：1 条 ⚙ hunk 已变，1 条 ┆ Agent 称已回应”），因为它们会阻止验收；只有 ⚙ 来源与人关闭的才解除阻止，Agent 称已回应的仍计为未处理（ADR-176）。

---

## 8.13 接管 / 诊断视图（R3：无接管悬崖）

### 8.13.1 触发规则

在以下情况下，打开 Goal 时使用**诊断布局**，而不是平静的 Goal 页：

1. 从以下类型的条目或通知进入：`stalled`（任意子类型）、`verify_failed`、severity ≥ 2 的 `sentinel`。
2. 从 `done` Claim 上的**硬矛盾** chip 进入（`07` §7.8.1；软矛盾不触发诊断布局）。
3. 打开时 Goal 的模式为 `stalled` 或 `unresponsive`，或最近一个 Run 的 outcome 为 `crashed`。
4. 用户按 `T`（接管）或点击“接管”。

诊断布局与其他覆盖层的关系见 §8.10.5（它从不在回到应用时自动弹出）。

### 8.13.2 锚点选择

| 触发 | 锚点（anchor） |
|---|---|
| `verify_failed` | 对第一个失败的标准，在观察器的 `command_result` 中寻找同一命令的**最后一次通过**（last-good）和其后的**第一次失败**（first-bad），锚点取 first-bad。若观察器中从未运行过该命令，锚点取 `submit` |
| `stalled` S1 | 该失败签名的第一次出现 |
| `stalled` S2 | 第一次振荡回到旧 blob 的那次工具调用 |
| `stalled` S3/S4 | 最后一个进展信号 |
| `stalled` S5 / 静默 | 挂起工具的 `tool_execution_start` |
| `sentinel` | 引入该变化的工具调用（来自 `files_touched` 的归因，`07` §7.2.3） |
| `unresponsive` / `crashed` | 收到的最后一个引擎事件 |
| `stalled{engine_error}` | 最终失败的那次请求（`retry.*` 或带 `errorMessage` 的 `agent.end`） |
| `stalled{idle_without_submit}` | 最后一次 `agent_settled` |
| `stalled{prepare_failed}` | 失败的准备步骤（最后一个 `prepare.progress`）；Run 中途遮蔽时为被阻断的那次工具调用；上下文交接时来源自检不通过时为该次交接与未通过的自检项（ADR-218）；tower-goal 的同一处理器连续 3 次出错时为该处理器名与三次错误的摘要（`05` §5.6.5 第 6 项，ADR-239） |
| `stalled{satellite_missing}` | 发现卫星丢失之前收到的最后一个引擎事件；没有 Run 时取最近的检查点 |
| 手动 `T` | 最近一个 severity ≥ 1 的命中；没有命中时取最后一次工具调用 |

### 8.13.3 预加载内容（DiagnosticBundle）

| 区块 | 内容 |
|---|---|
| a. Trace 窗口 | 锚点**之前 6 次**工具调用 + 锚点之后至多 20 次（*TB* B3.1）。每次调用显示：工具、参数摘要、退出码或 isError、耗时、对应 assistant 文本的前 2 行（Claim 语法）、本窗口内 Claim 的 crossCheck 状态 |
| b. 失败输出 | first-bad 与最近一次失败的完整日志链接，内联显示末尾 80 行并高亮失败签名所在行；last-good 与 first-bad 输出的行级 diff（经 §7.7.1 掩码，去除时间戳和地址噪声） |
| c. 检查点 | last-good 检查点（观察器显示该命令或标准最后一次通过时的检查点；没有时取 base）与当前 tree 的文件级 diff。文件按窗口内的编辑次数排序 |
| d. Agent 的说法 | 当前计划和步骤 Claim、未批准的假设、最近 3 条转向消息及其送达回执、Pi `queue_update` 中排队的 steer/followUp |
| e. 环境 | 当前指纹；Agent 环境与验证器环境的差异（`envHash` 分项、`depsKey`）；最近 30 min 的模式时间条 |
| f. 就绪动作 | 暂停、转向、回退到检查点（M2；`navigateTree` + 经影子 git 目录恢复 `<cp>`，`07` §7.3.2）、从检查点分叉（M2）、“我来改”（暂停 Agent，打开人工编辑检出 `<wtRoot>/_human/<goalId>`，ADR-081）、立即重跑某条标准、以 SBAR 交接包开新 Run（`02` §2.11） |

- **预计算：** 异常一产生，就在后台以低优先级构建 DiagnosticBundle（TTL 1 h；大小上限 2 MB，日志超出部分以链接代替），使接管时的渲染 ≤ 300 ms（`13` §13.1，场景 P9）。
- **退出：** 异常被处置后，界面提示“返回平静视图”，不会自动切换，以免在人还在诊断时打断他。

---

## 8.14 默认值汇总

数值的单一来源是 `16-registry.md`（ADR-039）；下表与之保持一致，供阅读本文时对照。

| 键 | 默认 |
|---|---|
| 全局打扰预算 | 6/h（只对 L3/L4 扣令牌），突发 3，上限 12/h |
| Goal 打扰预算 | `contract.budget.interruptsPerHour`，未设置时为 3/h |
| 防饿死 | `agent_blocked` 在 L2 超过 20 min → 升 L3 一次 |
| 洪泛阈值 | 全局 > 10 / 10 min（退出 < 5）；单 Goal > 3 / 10 min |
| 断点门限 θ | 1 / 0 / 2 / 3 / 5 / 6（见 §8.3.3；有效约束见 §8.3.5） |
| 最长等待 | blocked sev2 180 s；sev3 30 s；其他 15 min |
| 心跳 | 5 s；迟到 15 s 显示 text-1 + `◇`（不用琥珀）；30 s 判定 `unresponsive` |
| 模型静默 | 90 s 显示 text-1 + `◇`；300 s 判定 `stalled` |
| 重入简报 | ≥ 10 min 或有 sev≥2；7 行；应用级为离开 ≥ 30 min |
| 摘要（M2） | 09:30 / 14:00（工作日） |
| 评审积压 | 上限 1500 LOC，提示模式；有效评审停留 `max(5 s, 1.2 s × loc)` |
| 自动调节 | M2 起开启；n ≥ 20；每来源每周 1 次；sev3 不调 |
| 声音 | 关（`soundForSeverity3 = false`，ADR-019） |

---

## 8.15 阈值来源审计（R1-D3-05、R1-D3-02）

证据等级：⚪ 一手来源 · 🟡 二手 · 🔴 轶事/跨领域 · ⚫ 设计假设。“迁移假设”一列说明从原研究情境搬到“开发者一边做别的工作一边监督 Agent”时所做的假设。

| 数值 | 来源 | 等级 | 迁移假设 | 回填它的实验 |
|---|---|---|---|---|
| 全局 6 次/h、上限 12 次/h | ISA-18.2/EEMUA 191：每 10 min 约 1 条“很可能可接受”、2 条为可管理上限（*TB* A9） | 🟡（二手摘要） | 原标准针对全职控制室操作员；开发者的主任务不是监控，承受力应**更低**，所以 6/h 是上限而不是目标 | E3：打扰率与打扰精度、5 s 内未看即关闭的比例 |
| 洪泛 > 10 / 10 min、洪泛窗口 < 1% | 同上 | 🟡 | 同上 | E3 |
| 断点投递、粗断点优先 | Iqbal & Bailey：恢复快 69%、恼怒少 18% | ⚪ | 实验任务是办公类；假设编程中的“提交、关闭评审”等同粗断点 | E3（投递时状态 × 响应时延） |
| θ 各值、k、τ、g | 无 | ⚫ | — | E3（§8.3.5 的 A/B） |
| maxHold 180 s / 30 s / 15 min | 无 | ⚫ | — | E3（90/180/300 s 三档） |
| 防饿死 20 min | ADR-023 | ⚫ | — | E3（阻塞时长分布） |
| 自动调节 n ≥ 20、精度 < 0.4 / < 0.3 | 无 | ⚫ | — | E3 |
| 告警精度目标 0.70 / 0.50 | Sendelbach & Funk：72–99% 的临床告警不可行动（反面基线） | 🟡 | 医疗告警的反面基线只说明“精度普遍很低”，目标值本身是设定的 | E3 |
| 重入简报 7 行、10 min / 30 min 触发 | Parnin：恢复线索使成功率翻倍；行数与时长无来源 | ⚪（方向）/ ⚫（数值） | 原研究是单人单任务的恢复 | E4（重入后首个正确动作的耗时） |
| 心跳 5/15/30 s；模型静默 90/300 s | 无 | ⚫ | — | `13`、E1 日志 |
| 评审积压 1500 LOC、有效评审 1.2 s/行 | ADR-014（约 3000 LOC/h 的略读上限）；SmartBear 只用于时长展示 | ⚫ / 🟡 | SmartBear 速率来自人写的代码 | E8 |
| 并发 Goal 默认 3 | BCG/HBR：约 3 个 AI 工具时自评生产力见顶；ParallelPilot 峰值 2.31→3.25 | 🟡 | 原研究的是工具种类而非并发 Agent，只作为保守起点 | E3（告警率、评审积压随并发数的变化） |
| 吞吐损失 2.5–4%（§8.3.5） | 假设每 Goal 每小时 0.5 条阻塞性条目、响应中位数 2 min | ⚫ | — | E3 |

# 第 13 轮评审回应：07 / 08 / 09

依据 ADR-121 – ADR-127 与 `02`、`03` 的主干修订。安全相关文字只写到设计层面。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R13-D4-01 / R13-D6-01 / ADR-121 | I4 分两部分：有效提交只看工具事件（`submit` 之后无变更类工具调用），pin 的树 = `agent_bg_done` 检查点的树；顺序改为 settle → 2 s 宽限 → 终止并等待清空 → `agent_bg_done` → `claimed` → pin；身份键 `(bootSession, pid, startTime)`；settle 后才发现提交无效的出口（提醒回合 / `paused(idle_without_submit)`）；`processes_terminated` 告知；决定性指纹表中删去“submit 有效性” | `07` §7.3.2、§7.4.1 |
| R13-D4-02 / R13-D4-03 / R13-D7-01 / ADR-122 | 删除评审阶段外部写入走 `fp_changed_human` 的路径及“标 external、验收前处置”的段落；改为：任何非 running 状态检测到来源不明写入即先 `paused(external_change)`（`verifying` 中取消验证）；`keep` → `fp_changed_human`（`verifyOrigin:"human_change"`）；`revert` → 按路径恢复到归因基线；“外部写入引起的验证失败”分支不复存在；`decide` 注释删去“未知来源” | `07` §7.10.3 |
| ADR-122（存活进程） | 新增触发/来源 `agent_bg`：存活进程写入记 `author:"agent"`，重新生成 pin 并验证，失败按 Agent 失败路径（可返工）；`agentCaused` 与组合表、优先级表同步 | `07` §7.4.1、§7.4.10、§7.10.3 |
| R13-D11-02 / ADR-124 | 符号链接命中条件：pin 中不安全，且（新增/改变 或 base 中安全 或 解析结果与 base 不同）；base 中原本不安全且未变的链接只进信任提示并照常写出 | `07` §7.3.2、§7.10.1 |
| R13-D11-04 / ADR-124 | 覆盖后写出改为白名单（`objects/**` 除 `objects/info/**`、`refs/**`、`packed-refs` 写 pin 版本，其余 base 版本或不写出）；配置键清单只引用 `16`，对话框列出全部被改动的键并高亮清单内的键 | `07` §7.3.2 |
| R13-D11-03 / ADR-125 | `category`/`op`/`target` 引用 `16`；去重键 `sv:{goalId}:{category}:{op}:{target}`（`08` §8.4 唯一定义）；良性清单与降级单位为 `(category, op, target)`；凭据读取不可加入良性清单、永不降级；规则 F 加“n ≥ 20、M2 起”，`07` 与 `08` 一致；`mark_benign` 仅本机 | `07` §7.10.1；`08` §8.4、§8.8、§8.9.2 |
| R13-D8-01 / ADR-126 | `bg_process_survived`：去重键 `a:{goalId}:bg_process_survived`；标注“再次终止成功 → actionable、知悉 → informative、自行退出 → obsolete”；kind 以 `16` §16.1.7 为准 | `08` §8.4、§8.8；`07` §7.10.1 |
| R13-D9-01 / ADR-126 | settle 收尾期的显示引用 `12` §12.6.4，注意力映射加一行 | `08` §8.6.5 |
| R13-D15-01 #6、#7 | 配置键清单只在 `16`；规则 F 的“n ≥ 20、M2 起”在 `07` 与 `08` 一致 | `07` §7.3.2、§7.10.1；`08` §8.9.2 |

## 需要主干修改的地方

1. **`16` §16.1.7**：`NeedsYouItem.kind` 目前没有 anomaly 类 kind，按 ADR-126 新增 `anomaly`（`08` 已按此书写）；§16.1.6 中 `bg_process_survived` 行“此后按外部写入处理（ADR-114）”改为“`author:"agent"`，按 `agent_bg` 重新验证（ADR-122）”。
2. **`16` §16.1.1**：`verifyOrigin` / `VerifyTrigger` 增加 `agent_bg`。
3. **`16`**：登记 ADR-124 的配置键清单与 ADR-125 的 `category`/`op`/`target` 定义（`07`、`08` 已改为引用）。

# 第 13 轮回应 — 主干文档（02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R13-D4-01 | ADR-121：I4 改为以工具事件判定有效提交；仅由后台进程产生的变化进入 `agent_bg_done`、不使提交作废；pin 的树 = `agent_bg_done` 的树；settle 之后才判定无效的出口（提醒回合 / `idle_without_submit`）；`03` I4 与 `claimed` 行同步 | `15` ADR-121；`03` §3.2、§3.3 |
| R13-D4-02 | ADR-122：交还第 6 步三个选项的树级语义（`take_human` 丢弃外部写入；`take_external`、`keep_both` 保留 `external_change`），任何选项都不把外部写入记为人；`02` `ReviewUnit.author` 注释删去“交还”来源 | `15` ADR-122；`02` §2.7、§2.8 |
| R13-D4-03 | ADR-122：外部写入在任何非 running 状态都先 `paused(external_change)`（记 `resumeTo`），不再在评审中标注后再处置——失败分支与“撤销到哪个 pin”的问题随之消失；撤销目标 = 归因基线（`10` §10.3.1 唯一定义），按路径恢复 `restorePaths`；删除 `adopt/revert_external_hunks` | `15` ADR-122；`03` §3.2、§3.2.1；`02` |
| R13-D6-01 | ADR-121：宽限确认移到终止之前；撤回/恢复时注入 `tower.processes_terminated`；身份键加入 `bootSession`；ADR-122：`claimed`/`verifying` 中的写入同样进入 `external_change` 或（存活进程）`agent_bg` | `15` ADR-121、ADR-122 |
| R13-D7-01 | ADR-122：drain 期间外部路径逐路径记 `author:"external"`；存活进程写入记 `author:"agent"`、不可被采纳为人；外部写入引起的“你的改动”文案路径不复存在；ADR-127：`external_change_kept` 不受去重 | `15` ADR-122、ADR-127 |
| R13-D8-01 | ADR-126 | `15` |
| R13-D9-01 | ADR-126 | `15` |
| R13-D10-01 | ADR-121（≥ 5 s 才持久化、Run 结束回收、≤ 30 事件/分钟） | `15` |
| R13-D11-01 | ADR-123：S2 按 ASCII 大小写折叠禁止 `.git`；其余变体由 watcher 兜底并登记残余；影子与 GitRunner 启用 `core.protectHFS/NTFS` | `15` |
| R13-D11-02 | ADR-124：base 中解析结果不变的不安全链接不命中 | `15` |
| R13-D11-03 | ADR-125 | `15` |
| R13-D11-04 | ADR-124：写出白名单；配置键唯一清单在 `16` | `15` |
| R13-D13-01 | ADR-127 | `15` |
| R13-D14-01 | ADR-119 的表述已更正；其余由 `14` 作者处理 | `15` ADR-119 |

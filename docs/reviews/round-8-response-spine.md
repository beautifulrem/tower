# 第 8 轮回应 · 主干与跨文档决策

跨文档决策：`15` ADR-101 – ADR-105（ADR-096/099 标注修订）。

| 条目 | 处理 |
|---|---|
| R8-D11-01 嵌套仓库识别 | ADR-101：名字粗筛（`HEAD`/`.git`）+ git 自身确认；统一处置（新造 → 哨兵并排除；任何仓库形态目录不复制到人工编辑/检验检出、在信任提示中列出；不再拒绝接管） |
| R8-D13-01 base 中的仓库形态夹具 | ADR-102 |
| R8-D7-01 交还清除哨兵 | ADR-103：只清除由 pin 推导者；由运行行为推导者保留至 `override_sentinel` |
| R8-D4-01 交还后仍暂停 | ADR-104：`pendingHandBack`；不在再次验收前重新入队；`02`、`03` 同步 |
| R8 次要项（检验带回恢复、runner_patched 相对 base、seal 说明结构、垫片重建） | ADR-105 |
| R8-D15-01 #1（放弃改动去向） | `03` §3.2.1 human 行按 ADR-099/round-7 lint 裁决改写；`04`、`16` 由作者同步 |
| M1 时长 | ADR-038：32 周（第 8 轮 +3.0 人周，新增项均为正确性/安全缺口），预先声明削减顺序 |
| seal trailer 集合 | ADR-105：`Tower-Goal`、`Tower-Contract`、`Tower-Verified-At`、`Tower-Human-Edit`、`Co-authored-by` |
| 能力差异表 | `00` §0.5.1：仓库形态目录不复制、扩展遇裸仓库失败、扩展包根目录技能不可用 |

## round-8 lint 未决项裁决

| # | 裁决 |
|---|---|
| U1 | 交还时暂停原因三分：由 pin 推导 → 清除；交还即解除（`human`、`app_quit`、`engine_crash`、`idle_without_submit`、`question_timeout`、`stop_condition`）；外部条件仍成立 → 保留（预算、provider、外部改动、卫星丢失、post_settle、含 run 类命中的 sentinel_high）。ADR-103 已按 `16` §16.1.1 同步 |

# 第 8 轮评审回应：`05`、`06`

以 ADR-101..105 为准。每条一行：条目 → 修订位置。

- R8-D2-01(a)(c) / R8-D15-01 第 2、3 项（`05` L387）→ `05` §5.3.6 读允许列表行重写，以 `11` §11.6.2 为唯一来源：settings 自定义路径可读（`settings-manager.ts:1108`）；Host 枚举已启用技能 `baseDir` 并动态加入（`resourceLoader.getSkills().skills[].baseDir`：`agent-session.ts:2452`、`resource-loader.ts:433`、`skills.ts:78`；覆盖临时包、`pi.skills` 清单子路径 `package-manager.ts:2241-2250`）；删除“临时包已登记”的错误说法；§5.10 “Adapt Pi”行同步。v1.2.0 已核实。
- R8-D2-01(b)（扩展目录内的技能）→ 同一行：`baseDir` 位于 `extensions/**` 内只加入 `baseDir` 本身，其余扩展文件仍拒绝；`baseDir` 等于扩展根目录 → 不加入，标“不可用”（`resources_discover` 的 `skillPaths`：`core/extensions/types.ts:723-735`）。
- R8-D4-01(a) → `06` §6.3 新列 `pending_hand_back`（ADR-104）+ CHECK；`goal.hand_back` 在仍暂停时写入；`goal.resume` 与任何原因解除命令按其 `mode` 分派（`reverify` 不开 Run）；`app_quit`/`engine_crash` 在交还时清除。
- R8-D4-01(b) / R8-D15-01 第 11 项 → `06` `goal.take_over` 行：只在回到 `accepted` 时重新入队（放弃改动按记录位置恢复）；交还离开 `accepted` 后作废出队记录，再次验收后排队尾。
- R8-D4-01(c) / R8-D15-01 第 1 项 → `06` `goal.discard_human_edits` 行：`also_applies` 为空时保持 `paused(human)`；`in_review`/`accepted` 树不等时表述为“回到 `takeover_from` 后随即按 I2 进入 `verifying`”，与 `03` 的“回到接管前的状态”一致。
- R8-D6-01（检验带回的可靠性）→ `06` `inspect.bring_back` 行：复用 `human_checkout.syncState`（ADR-105），持 `wtLock`、抑制 I2 文件事件，完成后单一事务转入 `verifying{human_change}`；DDL CHECK 允许 `in_review`/`accepted` 下的 `syncing`；§6.1.6 恢复行覆盖带回。
- R8-D7-01（交还绕过哨兵）→ `06` `goal.hand_back` 行：只清除由 pin 推导的原因；含 run 类命中的 `sentinel_high` 保留，直到 `override_sentinel`（ADR-103，引 `07` §7.10.1 推导来源列）。
- R8-D11-01 / R8-D13-01 / R8-D15-01 第 6 项（扫描时机与处置）→ `05` §5.5 扫描行、`06` §6.2 GitService 行、`goal.take_over` 行统一为 ADR-101/102：名字粗筛 + 沙箱内 `git rev-parse` 确认，S0/S2 都做；未跟踪 → `nested_repo` 并排除；已跟踪夹具按普通文件处理；任何仓库目录都不复制到两种检出、列入信任提示，**不再拒绝接管**。`06` 写明扫描在 Supervisor 中的执行位置、增量来源与预算。
- ADR-105（seal 说明）→ `06` §6.1.6 `integrating` 恢复行改用 `Tower-Goal` trailer 判定，并写明说明结构；GitService 行引用。（`Tower-Seal` 不在 ADR-105 的 trailer 集合中。）
- ADR-105（垫片重建）→ `05` §5.3.6 git 发现与垫片行：每次 Run 开始前比对 git 指纹，变化即重建垫片 exec-path。

## 需要主干处理

- `00` §0.5.1：登记“技能 `baseDir` 等于扩展根目录或路径过宽 → 不可用”，以及“扩展/MCP 中的 git 在任何裸仓库中隐式发现失败（`safe.bareRepository=explicit`）”。
- `11` §11.6.2：补充扩展目录内 `baseDir` 的处置规则。
- `13`/`16`：登记嵌套仓库扫描预算（粗筛与 stat 检查同量级；每个候选的确认超时 2 s）。
- `10` L361、L739：trailer 集合按 ADR-105 统一。

# 第 2 轮回应 · 主干（00–03、15、16、01）与跨文档决策

跨文档决策：`15` ADR-041 – ADR-059；被修订的 ADR 标注 “Amended by”。Pi 发布版核实：`research/pi-release-diff.md`。

| 条目 | 处理 |
|---|---|
| R2-D1-01 Q3 分母 | ADR-052；`16` 术语行；`04`/`07`/`12` 由各自作者同步 |
| R2-D2-01 发布版核实 | ADR-047；`research/pi-release-diff.md`（46 提交、12 个核心文件，无一影响 Tower 依赖的语义） |
| R2-D2-02 `log` 违反准入规则 | ADR-048：模型面特性单列，M1 内部默认开、公开默认由 E5 决定 |
| R2-D2-04 凭据类型 | ADR-049：Host 环境与 bash 环境分离，凭据类型表 |
| R2-D3-01 矩阵证据等级 | `01` §1.7.1：核实日期、“未发现”语义、🔴 标注；K5 季度复审 |
| R2-D4-01 paused 出口 | `03` §3.2.1 按原因的出口表；`02`/`16` 新增 `retry_verify`/`retry_claim`/`claim_on_behalf` |
| R2-D4-02 暂停原因缺口 | `02`/`16` 新增 `external_change`、`provider_unavailable`、`budget_hard_cap`；G-0139 线框由 `04` 作者修正 |
| R2-D4-03 I4 范围 | `03` I4：只限本 Run 的阻塞类 question/approval；settle 时仍有则留在 running/waiting_human |
| R2-D4-04 计划编译 | ADR-050 |
| R2-D4-05 修订矩阵与状态图 | `03` §3.4.5 补 draft/shaping/paused 列与理由（措辞修订不作废验证）；§3.1 以表为准重画 |
| R2-D4-06 身份漂移 | ADR-058；`02` `canonicalRoot` 固定 + `rootAliases` |
| R2-D5-01 S2 bash 覆盖（阻断） | ADR-041（源码核实：customTools 最后写入注册表）；启动自检，失败降为 S0 |
| R2-D5-02 session_compact 投递 | ADR-026 修订：`triggerTurn:false`；C17 |
| R2-D5-03 RPC 门禁 | ADR-046（源码核实：tool_call 处理器抛错 → 调用被阻断）；RPC 适用范围；T27 |
| R2-D5-04 settled 覆盖面 | `03` claimed 行与 I4：claimed/verifying 期间持续监视；1 小时规则入 `03` |
| R2-D6-01 abandoned 保留 | ADR-057 |
| R2-D7-01 验证容量（阻断） | ADR-042：按实测预留、16 GB 上 3 Goal + 2 槽位、延迟预算只对参考项目承诺 |
| R2-D7-02 生态物化 | ADR-043（M1 仅 Node）+ ADR-045；逐生态物化表由 `07` 作者补 |
| R2-D7-03 机会式验证守卫 | ADR-053 |
| R2-D7-04 超时判别 | ADR-054 |
| R2-D8-01 远程批准合同 | ADR-051 |
| R2-D11-02 共享对象库 | ADR-044；T26 |
| R2-D11-03 环境变量清单 | ADR-045：`16` 唯一表 |
| R2-D13-01 端口 | ADR-055 |
| R2-D14-01/02 M1 范围与工作分解 | ADR-059（M1 范围唯一清单）；工作分解由 `14` 作者自下而上重估 |
| R2-D15-01 残留旧说法（主干部分） | `01` §1.4 #5/#6；ADR-015/024/026/028/033/038 标注 Amended by |
| R2-D15-03 指错的引用 | `04` F9、`10` §10.3.2 → `03` §3.4.7；`02` §2.12 → `11` §11.6.5；ADR-024 → `05` §5.4.1 |
| R2-D16-01 开源/付费边界 | ADR-056 |

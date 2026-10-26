# 第 41 轮回应 — 主干文档（02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R41-D7-01 | ADR-167：`secret_file_unseeded` 改为以验证器沙箱对未播种机密文件路径的“拒绝并报告”记录判定（Agent 无法伪造），不再看输出文本；SP6a 测量，回退为不自动归类 + 提示；G46 增加 dotenv 反例 | `03` §3.2.1 `verify_env_error` 行；`15` ADR-167 |
| R41-D4-01 | ADR-167：`secret_file_unseeded` 的出口——“改为 human 标准”→ `contract.amend`；“去掉依赖”→ `goal.request_changes`（继续目标 `run`）；“重试”→ `retry_verify` | `03` §3.2.1 开头与 `verify_env_error` 行 |
| R41-D4-02 | ADR-167：`project.local_files.add/remove/approve`，`approve_local_file` | `02` `HumanDecision.kind`；`15` |
| R41-D8-01 | ADR-167：人工编辑检出提示改为“自行复制”；交还一律排除机密本地文件路径 | `15` |
| R41-D11-01 | ADR-167：只读用户级 `~/.npmrc` 认证行（`${VAR}` 以登录环境展开），不读项目 `.npmrc` 认证行 | `15` |
| R41-D11-02 | ADR-167：`verify_profile.update` 字段级远程规则 | `15` |
| R41-D15-01 | `03` L69 顿号（第三轮）已改；其余由作者统一 | `03` §3.2.1 |

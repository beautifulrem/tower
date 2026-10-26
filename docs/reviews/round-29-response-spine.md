# 第 29 轮回应 — 主干文档（02、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R29-D11-01 | ADR-155：所有 Tower git 网络命令的 URL 去掉 userinfo，凭据经 `credential.<url>.username` 与 `store --file=<0600>` 提供；临时文件放 `~/.tower/tmp/`（0700），启动时清空；通用 URL 凭据脱敏模式；威胁表登记；SP6a 用例 | `15` ADR-155 |
| R29-D13-02 | ADR-155：自动 rebase 前补齐新 base 的 LFS；失败放弃本次 rebase，记 `rebase_lfs_failed` | `02` `Fact.kind`；`15` |
| R29-D13-01 | ADR-155：所有 base 获取统一远端规则，删除硬编码 `origin` | `15` |
| R29-D15-01 | ADR-155：`lfs_config_ignored{keys, reasons}` 来源恒为 `.lfsconfig`；`06` 补键；临时配置含 `remote.<name>.url` | `02`；`15` |

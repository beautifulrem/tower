# 第 29 轮评审回应 · `04` 与 `12`

依据 `15` ADR-155。

| 条目 | 处理 |
|---|---|
| R29-D15-01 `lfs_config_ignored` 的展开 | `04` §4.8.11（获取成功的提示与启动失败卡片的附注）与 `12` `AnomalyChip` 词表：数据为 `{keys, reasons}`，展开逐键写原因（例如 `lfs.url · 不支持的协议 file://`），来源一律写 `base 提交的 .lfsconfig`；删去“或你的 git 配置” |
| R29-D13-02 rebase 的 LFS | `04` F7 第 5 步（M2 自动 rebase）：补不齐新 base 的 LFS 对象时本次 rebase 跳过，卡片第 5 行提示 `◇ 本次自动 rebase 已跳过：新 base 的 LFS 对象缺失 N 个`（`rebase_lfs_failed{missing}`），下一轮轮询重试，成功后消失；卡片第 5 行提示清单与 `12` 词表同步 |
| 说明 | `04` §4.8.11 与 `12` 中“`.lfsconfig` 或你的 git 配置”在 **`lfs_excluded`**（`fetchexclude`/`fetchinclude` 的来源）处保留：按 ADR-153，这两个键可来自你的 git 配置，与本条无关 |

## 工时

文案调整与一个 M2 提示：**0.01 人周**（前端；rebase 提示属 M2，本轮只写规格）。

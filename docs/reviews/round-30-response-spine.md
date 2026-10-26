# 第 30 轮回应 — 主干文档（02、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R30-D13-01 | ADR-156：凭据按主机提供（git 与 git-lfs 都可用）；Tower 从不清除用户的 credential helper，只在 URL 带密码/token 时追加 store helper；只带用户名的 URL 用户 helper 照常 | `15` ADR-156 |
| R30-D14-01 | ADR-156：Run 空闲点的自动 rebase 归 M2（ADR-059 范围表标注）；M1 中 base 前进只提示；G44(a) 移入 M2 | `15` ADR-059、ADR-156 |
| R30-D13-02 | ADR-156：唯一函数 `baseTip()`（祖先关系取后代，分叉取 Tower 获取并记 `base_diverged`）；M2 rebase 在 LFS 补齐后重查前置条件 | `02` `Fact.kind`；`15` |
| R30-D11-01 | ADR-156（M2）：`git hook run --ignore-missing --to-stdin=<file>`，需 git ≥ 2.42；失败后的去向 | `15` |
| R30-D15-01 | 由各作者按 ADR-156 统一 | — |

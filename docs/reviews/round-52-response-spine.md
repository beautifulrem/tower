# 第 52 轮评审回应（主干）

决策：ADR-178（`15` 末尾）。第 52 轮仍是全范围评审：第 51 轮 16 条全部解决，新增 16 条（重要 1、次要 15）。

| 条目 | 处理 |
|---|---|
| R52-D11-01（重要） | `16` §16.8 总规则（白名单 + userinfo 剥除 + 凭据判定，新增生态自动适用）；Go `GOENV` 按此改写；G46(ak) 补组 |
| R52-D11-02 | `contract.amend`、`project.verify_profile.update` 的远程规则改为逐字段封闭表，未列出的仅限本机；`test.quarantine` 仅限本机；验证器网络只来自 `VerifyProfile.env.network` |
| R52-D11-03 | Scratch cwd 只复制已跟踪文件，残余登记 T25；Imported context 只导入用户检出之外的祖先文件 |
| R52-D4-01 | 重跑 settle 时未答阻塞条目不再阻塞 `claimed`，作答进入开场队列 |
| R52-D4-02 | settle 中丢失继续目标为 `settle`；重建后 `run` 加开场、`settle` 改写为 `run`；清除标志；崩溃续做；`hand_back` 守卫；重建写入归 Tower |
| R52-D4-03 | `in_review`/`accepted` 补修订边；`review{pin}` 在修订标准时改写为 `verify{pin}` |
| R52-D4-04 | 独立决定种类 `lower_risk_tier` |
| R52-D5-01 | 方案 (a)：OAuth 需要已安装的 `pi` CLI，首次运行检测 |
| R52-D6-01 | 交还参数与 `targetTree` 同一事务写入 `human_checkout` |
| R52-D7-01 | 非 hunk 锚点的评论只能由人关闭 |
| R52-D7-02 | 计划步骤 `✓` 只在关联标准通过时显示；规范示例改为 X6 结构化硬矛盾；软矛盾字形统一 |
| R52-D8-01 | `CountdownLabel` 引用 `08` 计时表；`⚙ 规则推荐` 前缀 |
| R52-D9-01 | 评审队列与诊断时间线字形 |
| R52-D13-01 | 撤销合入后再次 seal 以当前 base 为父 |
| R52-D14-01 | G46(an) 与 `11` §11.9 一致；S0 卡片说明后果 |
| R52-D15-01 | 登记补齐 |

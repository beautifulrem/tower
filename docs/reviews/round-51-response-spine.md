# 第 51 轮评审回应（主干）

决策：ADR-176（`15` 末尾）。第 51 轮是全范围收尾评审，发现了此前只看增量的各轮漏掉的 16 条（重要 3、次要 13）。逐条处理如下；有两个选项的条目，所选方案记在 ADR-176 中。

| 条目 | 处理 |
|---|---|
| R51-D11-01 | `11` 投递表：注册表认证只限用户级 `~/.npmrc` |
| R51-D11-02 | `$GS/gitconfig`、`$GS/npmrc` 改为白名单，并剔除凭据判定命中的值；Scratch 读拒绝加入仓库元数据配置文件；G46 补组 |
| R51-D11-03 | 降低 `riskTier`、门禁相关偏好字段只能在本机；门禁不能关闭；远程 S0 授权用统一有效期；移除机密本地文件只能在本机；Scratch 读拒绝按路径模式生效 |
| R51-D11-04 | `mark_secret` 在本地文件锁下删除活跃卫星与人工编辑检出中的副本（Tower 自己的写入）；检验检出与运行中的槽位只提示；确认文案如实说明 Agent 可能已读到 |
| R51-D4-01 | `03` 补边；`budget_hard_cap` 入口与 `human` 并入规则 |
| R51-D4-02 | `goals.integration_reverted_seal`；被撤销的 seal 不再触发 `integrated`；撤销后出口沿用 `accepted` |
| R51-D4-03 | 新增 `goal.rebuild_satellite` |
| R51-D4-04 | 取方案 (b)：作答后经 `settle` 进入 `claimed` |
| R51-D5-01 | 登录文案改为“启动 `pi`，输入 `/login <provider>`” |
| R51-D6-01 | `human_checkout.targetTree` 为唯一落点 |
| R51-D7-01 | 指纹不一致时按 I2 与 `external_change` 的分界处理 |
| R51-D7-02 | 闸门只认 ⚙️ 来源的 `addressed` 或人关闭 |
| R51-D9-01 | Agent 称已完成用说法字形；“⚙ 超时默认”系统印章 |
| R51-D12-01 | `09` 数据清单改正 |
| R51-D13-01 | 恢复前先做 safety 检查点；`take_human` 写回范围为 T0→T1 ∪ E |
| R51-D15-01 | `16` 登记补齐；G46 措辞 |

作者的逐条修改见 `round-51-response-writers.md`。

## 主干补正（ADR-177）

- 其他生态的净化副本（cargo `config.toml`、uv `uv.toml`、pip `pip.conf`）同样改为白名单，并剥除 URL 中的 userinfo（作者回报的缺口 1）。
- ADR-122 的历史文字加注“ADR-176 改为恢复之前先做”（作者回报的缺口 2）。
- 评审结论中的三条观察：删除 `waitReason:"manual"`；`05` 注明 `getShellEnv` 由 Tower 自行实现；T33 登记代理 Basic 凭据残余。
- `targetTree` 命名统一。

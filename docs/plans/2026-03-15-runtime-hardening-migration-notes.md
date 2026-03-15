# Runtime Hardening Migration Notes

这份说明是给当前运维者看的迁移备注。

## 这次改了什么

- 飞书账号配置现在支持 `preset + account override` 模型
- 每个机器人默认都会解析到独立的 `CODEX_HOME`
- 增加了基于真实飞书事件 fixture 的 replay 测试
- `tools/feishu_ws_bot.js` 已经把 thread / prompt / codex exec / incoming event / reply gateway 拆出薄模块

## 你需要做什么

1. 检查 `config/secrets/local.yaml`
   - 如果还在用旧 flat 结构，当前版本仍兼容
   - 新建机器人时，优先按 `config.feishu.presets + account` 去写
2. 确认每个账号的 `codex.cwd`
3. 如果要手工指定某个机器人的 `CODEX_HOME`，写在：
   - `config.feishu.<account>.codex.home`
4. 重装 LaunchAgents：
   - `bash tools/install_feishu_launchagents.sh install all`
5. 重启机器人进程

## 为什么要重装 LaunchAgents

这次变更后，LaunchAgent 会按账号注入独立 `CODEX_HOME`。

如果不重装：

- 老的 plist 还可能继续把所有 bot 指到同一个 `~/.codex`
- 运行时虽然会尽量自我修正，但常驻环境不会是这次期望的干净状态

## 旧线程为什么可能续不上

这是预期行为，不是 bug。

默认 `CODEX_HOME` 已从共享目录切到：

- `~/.codex/feishu/default`
- `~/.codex/feishu/second`
- `~/.codex/feishu/<account>`

所以旧的共享 `~/.codex/state_*.sqlite` 里的 thread resume 状态，不会自动在新账号目录下继续可见。

影响是：

- 旧会话的 `codexThreadId` 可能不再能 resume
- 机器人会回退到 fresh exec

这是为了换取更硬的多机器人隔离。

## 建议的验收步骤

```bash
node --test test/*.test.js
node tools/feishu_ws_bot.js --account default --dry-run
node tools/feishu_ws_bot.js --account second --dry-run
node tools/feishu_ws_bot.js --account yy_cooking_dev --dry-run
bash tools/install_feishu_launchagents.sh status all
```

重点观察：

- `codex_home=` 是否每个账号都不同
- `codex_cwd=` 是否还是你原本配置的目录
- LaunchAgent 是否都处于 `loaded` / 正常运行状态

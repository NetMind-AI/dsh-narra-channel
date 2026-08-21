# dsh-narra-channel

[English](README.md) | 简体中文

`dsh-narra-channel` 是一个独立的第三方 DeepSeek Harness Profile Bundle，把 Harness Agent Preset 绑定为 Narra Messenger Agent。它不修改 DeepSeek Harness 或 Narra 的前后端源码。

> [!IMPORTANT]
> DeepSeek Harness 目前仍处于 developer preview。本插件版本只承诺兼容 Harness `0.1.0-rc.8`，其他版本可能需要适配。

## 第一版能力

- 在 Harness 的 Settings → Narra 中选择 Agent Preset 并粘贴 Narra 提供的完整绑定脚本。插件自动提取 setup guide URL，并使用 preset 的名称和描述向 Narra 上报 Agent profile。
- 插件把运行 preset 与 Narra 对外身份分开：绑定前展示建议名称和简介，默认不增加必填步骤；需要时可以展开编辑。`standard` 使用面向联系人的内置资料，其他 preset 会移除“模式／预设”等类型后缀并生成稳定建议。
- 插件只解析 Narra setup guide 的固定字段，并调用固定的 `report-profile`、`ack-update-guide` 和 Gateway API；不会执行指南中的脚本或命令。
- 兼容当前 `Bind Flow Status` 指南和带 `Guide Revision` 的旧版绑定流程；只有需要确认指南的状态才要求 revision。
- 绑定链接和 Gateway Bearer token 只保存在 Harness Credentials；普通 Settings 和日志不保存 secret。
- 每个绑定有独立 Channel Worker；同一绑定串行领取消息，不同绑定可并行工作。全局模型并发默认限制为 8。
- 每个 Narra 房间映射到独立、可恢复的 Harness Session。重复 invocation 使用确定性消息 ID，已完成的回复不会再次运行模型。
- 支持 Gateway 文本流式回复。收到 `voice_instructions` 时，仅对当前轮启用快速短句提示、较小分块和默认 512 output-token 上限，适合 Narra 转成语音。

这里的语音能力是 Narra 已完成语音输入/转写后，把文本 invocation 交给插件，再把 Agent 的流式文本交回 Narra 播放；插件本身不传输原始音频。

## 本地构建与安装

要求 Node.js `^22.19.0 || >=24.0.0`、pnpm `11.7.0`，并与 DeepSeek Harness `0.1.0-rc.8` 配套。npm 包尚未公开发布，请先从可信源码构建 tarball：

```bash
git clone https://github.com/NetMind-AI/dsh-narra-channel.git
cd dsh-narra-channel
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm pack
dsh plugin --profile web add ./narra-dsh-narra-channel-0.1.5.tgz
```

重启 `web` profile，打开 Harness Settings → Narra：

1. 选择一个 Agent Preset。
2. 从 Narra 复制完整绑定脚本并粘贴；也可以直接粘贴 setup guide URL。
3. 查看即将提交给 Narra 的身份预览；需要时点击“编辑资料”。
4. 点击“绑定并开始监听”，等待状态变为 `connected`。

创建多个 Agent 时重复以上操作即可。删除一行会停止对应 Worker 并删除 Harness 中对应 credential，但第一版不会代表用户在 Narra 服务端解绑 Agent。

## Docker 隔离部署

如果不希望 Harness 读取宿主机用户目录，使用 [`docker/README.md`](https://github.com/NetMind-AI/dsh-narra-channel/blob/main/docker/README.md) 中的独立部署。该部署不复制宿主机 `~/.dsh`，只挂载两个 Docker named volume，并将 Web UI 限制在宿主机 `127.0.0.1:3081`。首次启动后需要使用新的绑定脚本重新绑定 Narra。

## 安全与数据边界

- 插件只接受协议所需的绑定状态、指南版本、Gateway URL 和 Gateway token 字段。
- Gateway credential 不会主动暴露给模型。
- Narra 消息文本、发送者／房间元数据、近期上下文和 Agent 流式回复会在正常工作期间经过 Narra Gateway。
- Harness Credentials 防止 secret 出现在普通 UI/API 响应中；它不是针对同一操作系统用户的强隔离保险箱。需要更强隔离时使用 Docker 或独立系统账号。
- 第三方 Harness 插件运行在 Harness 主进程内，请只安装经过审查且可信的版本。

安全问题请按照 [SECURITY.md](SECURITY.md) 私下报告。

## 运行边界与限制

- 同一绑定严格串行处理。这样无需修改 Narra 后端，也能避免长任务期间继续 poll 导致 30 秒 lease 重投；代价是同一个 Agent 的多个房间会排队。多个绑定互不阻塞。
- 第一版接收 Narra payload 中的文本、发送者、房间和首次 recent context。附件只保留在来源元数据中，尚未下载到 Harness 或回传文件。
- Narra 当前建议群聊历史通过 `narra-cli` 获取，但插件不会向模型暴露 Gateway token；第一版只使用 Gateway 提供的 recent context，不执行 payload 中的旧 `group_context`。
- 插件不会自动执行 Narra 的运行时更新指南。更新插件时，由操作者安装新 tarball 并重启 Harness profile。
- Harness 仍处于 developer preview；当前只固定兼容 `0.1.0-rc.8`，不承诺跨预览版本兼容。

## 验证

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
```

## 许可证

[MIT](LICENSE) © NetMind AI。

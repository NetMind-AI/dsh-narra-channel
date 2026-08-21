# DeepSeek Harness + Narra Docker 部署

这个部署在独立 Linux 容器内运行 DeepSeek Harness `0.1.0-rc.8` 和 `dsh-narra-channel` `0.1.5`，不修改 Harness、Narra 或插件源码。

基础镜像使用 AWS Public ECR 提供的 Docker Official Images 镜像，并在 Dockerfile 中固定 Node 24 镜像摘要，避免浮动标签在重建时静默变化。

Harness 发布版以全局 npm 包运行时，Cordis 的原生动态导入会从全局 Harness 包解析第三方插件。因此镜像中还包含一份与 profile 安装包完全同版本的只读运行副本；profile 安装仍负责 bundle 注册、设置页面和持久化配置。入口脚本也显式传入 Harness Web 自带 HMR 服务要求的 Node `--expose-internals` 参数。这些兼容层只存在于 Docker 镜像中，没有修改 Harness 或插件源码。

## 隔离边界

- 不挂载宿主机 `$HOME`、`~/.dsh`、Docker socket 或 `narra-messenger`。
- Harness 状态和 Agent workspace 分别保存在 Docker named volume 中。
- 容器使用 UID/GID `10001`，删除全部 Linux capabilities，并启用 `no-new-privileges` 和只读根文件系统。
- Harness 自身只监听容器回环地址。`socat` 在同一容器内转发端口，Compose 仅把它发布到宿主机 `127.0.0.1:3081`。
- 容器仍可访问外网，因为 Narra Gateway 和模型 API 都需要出站网络。Harness 内的 Agent 也能读取容器自己的 `$DSH_HOME`；请只使用独立、低权限、可撤销的 Narra 与模型凭据。

## 构建和启动

需要先安装并启动 Docker Desktop，并在仓库根目录构建插件 tarball。

```bash
git clone https://github.com/NetMind-AI/dsh-narra-channel.git
cd dsh-narra-channel
pnpm install --frozen-lockfile
pnpm pack
cd docker
docker compose build
docker compose up -d
docker compose ps
```

打开 <http://127.0.0.1:3081>，进入 Settings → Narra，使用新的绑定脚本重新绑定。部署不会复制宿主机现有的 `~/.dsh`、Token 或会话历史。

## 日常操作

```bash
# 查看状态和日志
docker compose ps
docker compose logs --tail=200 harness

# 停止；保留绑定、凭据和会话
docker compose stop

# 再次启动
docker compose start

# 删除容器；仍保留 named volumes
docker compose down
```

不要在仍需绑定或会话数据时执行 `docker compose down --volumes`，该命令会删除容器内的 Harness 数据。

## 隔离验证

```bash
docker compose exec harness sh -lc '
  id
  test ! -e /Users
  test ! -S /var/run/docker.sock
  test -w /workspace
  test -w "$DSH_HOME"
'
```

如果以后需要让某个 Agent 处理宿主机项目，应只挂载那个项目的具体目录，不要挂载整个用户目录或整个 `narra-messenger`。不同信任等级、不同客户或不同密钥的 Agent 应使用独立容器和独立 volumes。

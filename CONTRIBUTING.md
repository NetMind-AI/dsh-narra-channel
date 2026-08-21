# Contributing to dsh-narra-channel

Thank you for helping improve the Narra channel for DeepSeek Harness.

## Before you start

- Use GitHub Issues for reproducible bugs and scoped feature requests.
- Do not report security vulnerabilities in a public issue. Follow
  [SECURITY.md](SECURITY.md) instead.
- Keep changes compatible with the DeepSeek Harness release documented in the
  README. Compatibility upgrades should be isolated from unrelated changes.

## Development setup

The project requires Node.js `^22.19.0 || >=24.0.0` and pnpm `11.7.0`.

```bash
git clone https://github.com/NetMind-AI/dsh-narra-channel.git
cd dsh-narra-channel
pnpm install --frozen-lockfile
```

Run the complete local verification suite before opening a pull request:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
docker compose --file docker/compose.yaml config --quiet
```

## Pull requests

1. Create a focused branch from `main`.
2. Keep the change small and avoid unrelated formatting or dependency updates.
3. Add or update tests for behavioral changes.
4. Update `README.md`, `README.zh.md`, or `CHANGELOG.md` when user-visible
   behavior changes.
5. Explain compatibility impact, security considerations, and manual test
   evidence in the pull request.

Pull requests must pass the Node.js 22 and Node.js 24 CI jobs before merge.

## Commit hygiene

- Never commit Narra setup-guide URLs, Gateway tokens, API keys, `.env` files,
  Harness credentials, or local profile state.
- Use clear, imperative commit subjects such as `fix: serialize session turns`.
- Keep generated package archives and build output out of Git.

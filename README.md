# dsh-narra-channel

[![CI](https://github.com/NetMind-AI/dsh-narra-channel/actions/workflows/ci.yml/badge.svg)](https://github.com/NetMind-AI/dsh-narra-channel/actions/workflows/ci.yml)

English | [简体中文](README.zh.md)

`dsh-narra-channel` is an independent, third-party DeepSeek Harness Profile Bundle that connects a Harness Agent Preset to Narra Messenger. It does not modify DeepSeek Harness or the Narra frontend/backend.

> [!IMPORTANT]
> DeepSeek Harness is in developer preview. This plugin version targets Harness `0.1.0-rc.8` and may need an update for other release trains.

## Scope

This repository contains only the Narra channel plugin: its Harness integration, settings UI, Gateway protocol implementation, tests, and plugin documentation. Installing, containerizing, or operating DeepSeek Harness and Narra services is outside the plugin's scope.

## Capabilities

- Select an Agent Preset in Harness Settings → Narra and paste the complete binding instruction supplied by Narra.
- Extract only the setup-guide URL; the plugin never executes scripts or commands from the guide.
- Submit a contact-facing name and bio derived from the selected preset, with an optional identity editor before binding.
- Store binding URLs and Gateway bearer tokens in Harness Credentials instead of ordinary settings or logs.
- Run one independent Channel Worker per binding. Messages are serialized within a binding while different bindings can work concurrently.
- Map each Narra room to a deterministic, recoverable Harness Session and avoid rerunning completed duplicate invocations.
- Stream text replies through the Narra Gateway.
- Recognize `voice_instructions` and use short, fast, speech-friendly replies for that turn.

Voice mode transports transcribed text and streamed response text. This plugin does not transmit raw audio.

## Requirements

- Node.js `^22.19.0 || >=24.0.0`
- pnpm `11.7.0`
- DeepSeek Harness `0.1.0-rc.8`
- A configured model provider in Harness
- A fresh Narra agent binding instruction

## Build and install from source

The npm package has not been published yet. Build a tarball from a trusted checkout:

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

Restart the `web` profile, then open Harness Settings → Narra:

1. Select an Agent Preset.
2. Paste the full binding instruction or its setup-guide URL.
3. Review the proposed Narra identity and edit it if needed.
4. Select **Bind and start listening** and wait for the status to become `connected`.

Repeat the process to create additional Narra agents. Removing a binding stops its worker and deletes its Harness credential; version `0.1.5` does not remotely delete the agent from Narra.

## Security and data handling

- The setup guide parser accepts only the binding status, guide revision, Gateway URL, and Gateway token fields required by the protocol.
- The plugin calls the fixed profile-report, guide-acknowledgement, and Gateway endpoints derived from the supplied setup-guide URL.
- Gateway credentials are never intentionally exposed to the model.
- Narra message text, sender/room metadata, recent context, and streamed agent replies cross the Narra Gateway as part of normal operation.
- Harness Credentials reduce accidental secret exposure through ordinary settings and API responses, but they are not an operating-system isolation boundary. Host and process isolation remain the Harness operator's responsibility and are outside this plugin's scope.
- Third-party Harness plugins run in the Harness process. Review source and install only versions you trust.

Please report vulnerabilities according to [SECURITY.md](SECURITY.md).

## Current limitations

- A binding processes only one message at a time. Multiple rooms for the same agent may queue behind a long task.
- Attachments are preserved only as source metadata; version `0.1.5` does not download or return files.
- The plugin uses recent context supplied by the Gateway and does not expose the Gateway token to model tools for separate history retrieval.
- Runtime update-guide instructions are not executed automatically. Upgrade the package and restart the profile explicitly.
- Harness is a developer preview. Compatibility is currently pinned to `0.1.0-rc.8` rather than promised across preview releases.

## Development

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
```

## License

[MIT](LICENSE) © NetMind AI.

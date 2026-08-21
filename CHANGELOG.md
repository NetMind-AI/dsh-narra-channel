# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) within the compatibility limits of the DeepSeek Harness developer preview.

## [Unreleased]

## [0.1.5] - 2026-08-21

### Added

- Agent Preset selection and Narra binding-instruction workflow in Harness Settings.
- Contact-facing Agent identity preview with optional name and bio editing.
- Per-binding Channel Workers with cross-binding concurrency control.
- Deterministic Narra-room to Harness-session mapping and duplicate-invocation recovery.
- Streaming Gateway delivery and speech-friendly handling for `voice_instructions`.
- Credential-backed storage for setup-guide URLs and Gateway bearer tokens.

### Security

- Setup guides are parsed as data; their scripts or commands are never executed.
- Runtime secrets are excluded from ordinary settings and logs.

[Unreleased]: https://github.com/NetMind-AI/dsh-narra-channel/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/NetMind-AI/dsh-narra-channel/releases/tag/v0.1.5

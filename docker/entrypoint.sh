#!/bin/sh
set -eu

plugin_tarball="/opt/dsh/plugins/narra-dsh-narra-channel-${NARRA_PLUGIN_VERSION}.tgz"
plugin_manifest="${DSH_HOME}/profiles/web/node_modules/@narra/dsh-narra-channel/package.json"
installed_version=""

mkdir -p \
  "${DSH_HOME}/.cache" \
  "${DSH_HOME}/.config" \
  "${DSH_HOME}/.local/share" \
  "${DSH_HOME}/.npm" \
  "${DSH_HOME}/.pnpm"

if [ -f "${plugin_manifest}" ]; then
  installed_version="$(node -p "require('${plugin_manifest}').version")"
fi

if [ "${installed_version}" != "${NARRA_PLUGIN_VERSION}" ]; then
  dsh plugin --profile web add "${plugin_tarball}"
fi

# Harness deliberately binds only to its own loopback interface. The proxy is
# the sole all-interface listener inside the container; Compose publishes it
# only on the macOS loopback address.
socat TCP-LISTEN:3081,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:3080 &

exec node \
  --expose-internals \
  /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js \
  web \
  --port 3080 \
  --no-open \
  --trusted-host 127.0.0.1:3081

FROM public.ecr.aws/docker/library/node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

ARG DSH_VERSION=0.1.0-rc.8
ARG NARRA_PLUGIN_VERSION=0.1.5

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    ripgrep \
    socat \
    tini \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global \
    --allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs \
    "@deepseek-ai/dsh@${DSH_VERSION}" \
  && npm cache clean --force

RUN npm install --global pnpm@11.7.0 \
  && npm cache clean --force

RUN groupadd --gid 10001 dsh \
  && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash dsh \
  && install --directory --owner dsh --group dsh --mode 0700 /var/lib/dsh \
  && install --directory --owner dsh --group dsh --mode 0750 /workspace /opt/dsh/plugins

COPY --chown=dsh:dsh narra-dsh-narra-channel-0.1.5.tgz /opt/dsh/plugins/

# The published Harness CLI is installed globally. Its Cordis loader currently
# resolves a bare third-party plugin import from the global dsh package even
# though the plugin bundle itself is installed in the selected profile. Keep a
# read-only copy beside dsh's dependencies so Node can resolve that import; the
# entrypoint still performs the normal profile install for bundle registration,
# settings UI assets, and persisted configuration.
RUN runtime_plugin_dir=/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@narra/dsh-narra-channel \
  && install --directory "${runtime_plugin_dir}" \
  && tar --extract \
    --gzip \
    --file "/opt/dsh/plugins/narra-dsh-narra-channel-${NARRA_PLUGIN_VERSION}.tgz" \
    --directory "${runtime_plugin_dir}" \
    --strip-components 1 \
  && test "$(node -p "require('${runtime_plugin_dir}/package.json').version")" = "${NARRA_PLUGIN_VERSION}"

COPY --chown=root:root docker/entrypoint.sh /usr/local/bin/dsh-narra-entrypoint
RUN chmod 0755 /usr/local/bin/dsh-narra-entrypoint

ENV DSH_HOME=/var/lib/dsh \
    HOME=/home/dsh \
    NARRA_PLUGIN_VERSION=${NARRA_PLUGIN_VERSION} \
    NPM_CONFIG_CACHE=/var/lib/dsh/.npm \
    PNPM_HOME=/var/lib/dsh/.pnpm \
    XDG_CACHE_HOME=/var/lib/dsh/.cache \
    XDG_CONFIG_HOME=/var/lib/dsh/.config \
    XDG_DATA_HOME=/var/lib/dsh/.local/share

WORKDIR /workspace
USER 10001:10001

VOLUME ["/var/lib/dsh", "/workspace"]
EXPOSE 3081

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/dsh-narra-entrypoint"]

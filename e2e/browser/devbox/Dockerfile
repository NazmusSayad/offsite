FROM node:24-bookworm
RUN npm install --global pnpm@12.10.1 && git config --global --add safe.directory '*'
ENV CI=1 \
    npm_config_yes=true \
    NG_CLI_ANALYTICS=false \
    NEXT_TELEMETRY_DISABLED=1 \
    ASTRO_TELEMETRY_DISABLED=1 \
    NUXT_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
RUN mkdir /apps
CMD ["node", "/opt/devbox/e2e/devbox/start.mts"]

FROM mcr.microsoft.com/playwright:v1.65.0-noble
WORKDIR /opt/viewer
RUN npm init --yes && npm install @playwright/test@1.65.0
WORKDIR /opt/viewer/e2e
CMD ["/opt/viewer/node_modules/.bin/playwright", "test"]

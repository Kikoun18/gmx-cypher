# syntax=docker/dockerfile:1
#
# PMF Sequences (app/) as a static site behind nginx, for Kubernetes. Build from the repository root:
#
#   docker build -f deploy/docker/Dockerfile -t pmf-sequences .
#
# Only app/ and deploy/docker/nginx.conf enter the build (Dockerfile.dockerignore). Nothing under app/ is changed.

FROM node:22-alpine AS build
WORKDIR /src
# The manifests first, so the dependency layer is reused until they change.
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
# `npm run build` is tsc -b && vite build; it also copies Pyodide from node_modules into dist/py/pyodide/.
COPY app/ ./
RUN npm run build

# Runs as uid 101 and listens on 8080; the Deployment runs it as uid 1000 (CERIT-SC wants a non-root user), which works
# because nginx.conf keeps everything it writes in /tmp.
FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY deploy/docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /src/dist/ /usr/share/nginx/html/
EXPOSE 8080
# nginx itself, without the image's entrypoint scripts (they try to edit conf.d, which is read-only in the pod).
# `-e stderr`: the error log goes to stderr without opening a file.
ENTRYPOINT ["nginx", "-e", "stderr"]
CMD ["-g", "daemon off;"]

# Hosting PMF Sequences on Kubernetes

This puts **PMF Sequences** (`app/`) on a Kubernetes cluster such as CERIT-SC's, as a web address your group opens.
It is a static site: nginx serves the files `npm run build` makes, and that is all the pod does.

- **No storage.** Your data lives in the *vault*, a folder on the computer of whoever uses the page; the browser reads
  and writes it through the File System Access API. The server never sees it, so there is no PersistentVolumeClaim to
  make, nothing to back up, and any number of replicas behave the same.
- **HTTPS is required**, not a nicety: Chrome and Edge offer folder access (`showDirectoryPicker`) only on a secure
  origin. The ingress asks cert-manager for a Let's Encrypt certificate. Other browsers get the page's explanation, as
  on any host.
- **Nothing under `app/` changed.** The files here only wrap it (`runner/` checks that `app/` is untouched).

gmx-cypher itself (`runner/`) is **not** part of this; see the end.

```
deploy/
├── docker/
│   ├── Dockerfile               build app/, then serve it with nginx (non-root, port 8080)
│   ├── Dockerfile.dockerignore  keeps the build context to app/ and this folder
│   └── nginx.conf               the server: caching, compression, MIME types, headers, /healthz
├── k8s/
│   ├── deployment.yaml          what runs (CERIT-SC's security settings, probes, resource limits)
│   ├── service.yaml             the pod's address inside the cluster
│   └── ingress.yaml             the public address and its certificate
└── k8s-without-image/           the same without building an image (see "Without Docker")
    ├── deployment.yaml          stock nginx; nginx.conf from a ConfigMap; the site from a volume
    └── pvc.yaml                 the volume for the site's files
```

## 1. Build the image

From the repository root (the Dockerfile is in `deploy/docker/` and the context is the root):

```sh
docker build -f deploy/docker/Dockerfile -t pmf-sequences .
docker run --rm -p 8080:8080 --read-only --tmpfs /tmp --user 1000 pmf-sequences   # http://localhost:8080
```

The second line runs it the way the cluster will: as another user, with nothing writable but `/tmp`. The build runs
`npm ci` and `npm run build` (`tsc -b && vite build`), so it needs the network once, for the npm registry; Pyodide
(about 13 MB, for custom Python functions) is copied from `node_modules` into the image, never fetched from a CDN.

## 2. Push it where the cluster can pull it

Any registry the cluster can reach. For GitHub's, with a personal access token that has `write:packages`:

```sh
echo $GITHUB_TOKEN | docker login ghcr.io -u <your-github-name> --password-stdin
docker tag pmf-sequences ghcr.io/<your-github-name>/pmf-sequences:1.0.0
docker push ghcr.io/<your-github-name>/pmf-sequences:1.0.0
```

A new package on ghcr.io is private. Either make it public (the package's page → *Package settings* → *Change
visibility*), or leave it private and give the namespace a pull secret
(`kubectl create secret docker-registry …`, then `imagePullSecrets` in `deployment.yaml`).

## 3. Edit two things

- `deploy/k8s/deployment.yaml`: `image:` is the one you pushed.
- `deploy/k8s/ingress.yaml`: the address. `pmf-sequences.dyn.cloud.e-infra.cz` appears in two `host` lines and, with
  its dots as dashes, in `secretName`; pick your own name and keep the three in step. A host can be used by one
  ingress only, so choose one nobody on the cluster has.

## 4. Deploy

With your namespace (Rancher → `kuba-cluster` → *Project/Namespaces*), as for any app of the group:

```sh
kubectl apply -f deploy/k8s/ -n <ns>
kubectl get pods -n <ns> -w                 # pmf-sequences-… Running, READY 1/1
kubectl get certificate -n <ns>             # READY True after a minute or two; then https://<your name>.dyn.cloud.e-infra.cz
```

**Updating.** Build and push a new tag, put it in `deployment.yaml`, `kubectl apply -f deploy/k8s/ -n <ns>`. With
`:latest` and no edit: `kubectl rollout restart deployment/pmf-sequences -n <ns>`. A browser that has the old page
asks again for `index.html` every time (see below), so it picks the new build up on the next load.

**Taking it down.** `kubectl delete -f deploy/k8s/ -n <ns>`. Nothing of yours is stored there.

## Without Docker

No image to build or push: the pod runs the stock `nginxinc/nginx-unprivileged` image, `nginx.conf` comes from a
ConfigMap, and the built site sits on a volume (a PersistentVolumeClaim) that you fill with `tar` through `kubectl exec`. You need
Node.js 22 and `kubectl`, nothing else. Use this **instead of** steps 1–3 above; the Service and Ingress are the same
(edit the host in `deploy/k8s/ingress.yaml` as in step 3).

```sh
NS=<ns>

# 1. Build the site (makes app/dist)
(cd app && npm ci && npm run build)

# 2. nginx.conf into a ConfigMap (re-run it after changing the file), then the volume and the pod
kubectl create configmap pmf-sequences-nginx --from-file=nginx.conf=deploy/docker/nginx.conf -n $NS \
  --dry-run=client -o yaml | kubectl apply -f - -n $NS
kubectl apply -f deploy/k8s-without-image/ -f deploy/k8s/service.yaml -f deploy/k8s/ingress.yaml -n $NS
kubectl get pods -n $NS -w            # wait for pmf-sequences-… 1/1 Running, then Ctrl-C

# 3. Copy the site into the volume
POD=$(kubectl get pod -n $NS -l app.kubernetes.io/name=pmf-sequences --field-selector status.phase=Running -o jsonpath='{.items[0].metadata.name}')
tar -C app/dist -cf - . | kubectl exec -i $POD -n $NS -- tar -C /usr/share/nginx/html -xf -
kubectl exec $POD -n $NS -- ls /usr/share/nginx/html        # assets  img  index.html  py  sacch.json
```

(Not `kubectl cp`: some versions put the files in a folder named `html` inside the target, and nginx then finds no
`index.html`. If that happened: `kubectl exec $POD -n $NS -- sh -c 'cd /usr/share/nginx/html && mv html/* . && rmdir html'`.)

Then open the address (wait for `kubectl get certificate -n $NS` to say `READY True` the first time).

**Updating.** Build again and copy again; empty the volume first so files of the old build do not pile up:

```sh
(cd app && npm run build)
kubectl exec $POD -n $NS -- sh -c 'rm -rf /usr/share/nginx/html/*'
tar -C app/dist -cf - . | kubectl exec -i $POD -n $NS -- tar -C /usr/share/nginx/html -xf -
```

If you applied `deploy/k8s/deployment.yaml` before, applying this folder replaces that Deployment (same name); the
Service and Ingress stay. If the pod shows `ImagePullBackOff` with `429 Too Many Requests`, Docker Hub is limiting the
cluster's anonymous pulls: wait and retry, or use the Docker route with your own registry.

What has run on a cluster (CERIT-SC, by a user): the pod starts with these mounts and nginx answers, the certificate is
issued, and `kubectl cp` left the files one folder too deep, hence the `tar` above. Not yet run: the `tar` copy as
written here.

## Why it is set up this way

- **nginx-unprivileged, config of our own.** CERIT-SC runs only non-root containers. `nginx.conf` keeps everything
  nginx writes in `/tmp` (the Deployment mounts an `emptyDir` there), so the pod also runs with a read-only root
  filesystem, no capabilities and no privilege escalation, as uid 1000 although the image's user is 101. nginx starts
  without the image's entrypoint scripts and logs errors to stderr; requests are logged by the ingress.
- **Caching.** Files in `assets/` carry a content hash in their name and are cached for a year. The page, the Python
  sandbox and Pyodide's files (whose names stay the same when Pyodide is upgraded) are revalidated each time by their
  ETag: a 304 costs nothing, and a new build shows up at once.
- **Compression.** js, css, json and Pyodide's wasm (9.6 MB, 3.6 MB gzipped) are compressed.
- **Headers.** `nosniff`, a referrer policy, and `frame-ancestors 'self'`: the app's Python sandbox is a frame of the
  same origin, and nobody else may frame it. There is deliberately **no full Content-Security-Policy** at the server:
  the app loads its fonts from jsdelivr and Google Fonts, looks DOIs up at api.crossref.org, and 3Dmol uses `eval`, so
  a strict policy would break it. The sandbox page carries its own strict policy (`app/public/py/sandbox.html`).
- **Probes** use `/healthz`, answered by nginx itself.
- **One replica** is enough; raise `replicas` for availability only.

## What has been checked, and what has not

Checked: `app/` builds (`npm ci && npm run build`); `nginx.conf` passes `nginx -t` and, run as uid 1000 on the real
build, serves it with the headers, types, compression, 304s and 404s above; in Chromium through that nginx the app
starts, the Python sandbox starts in its same-origin frame and runs Python, and a page of another origin is refused
when it tries to frame the app; the three manifests pass `kubernetes-validate --strict` for Kubernetes 1.29, 1.31 and
1.33, and their names, labels and ports agree with each other and with `nginx.conf`.

**Not checked:** the `docker build` itself (it was not possible where this was written; the build stage is the same
two npm commands, and the lock file has the musl bindings Alpine needs), and anything on a cluster. The ingress's
annotations (`kubernetes.io/tls-acme`, `cert-manager.io/cluster-issuer: letsencrypt-prod`, `ingressClassName: nginx`)
are from memory of CERIT-SC's setup: compare `ingress.yaml` with the *Hello World* tutorial
(<https://docs.cerit.io/en/docs/examples/helloworld>) the first time, and follow the tutorial where they differ.

## If something goes wrong

| What you see | Likely cause |
|---|---|
| `ImagePullBackOff` | the package is private and there is no pull secret, or the image name in `deployment.yaml` is wrong |
| `CrashLoopBackOff`, log shows `Permission denied` | something writes outside `/tmp`; `kubectl logs <pod> -n <ns>` names the path |
| Certificate stays `READY False` | the host in `ingress.yaml` is taken or misspelled in one of the three places; `kubectl describe certificate -n <ns>` |
| The page opens but says the browser is not supported | not Chrome/Edge 122 or newer, or the address is `http://` rather than `https://` |
| Python functions never start | Pyodide's files (`/py/pyodide/…`) blocked or cut off on the way; open one in the browser and see |

## Why gmx-cypher (`runner/`) is not here

`runner/` is a local tool by design: it listens on 127.0.0.1 only, every request needs a one-time token, it starts
`gmx` on your trajectories, and it says it cannot be reached from another computer. Putting it on a cluster is a
different project, not a wrapper: an image with GROMACS, your trajectories on shared storage (a ReadWriteMany PVC,
`nfs-csi`), a different way to keep strangers out than the token (the page lets anyone who reaches it run `gmx` and
read the allowed folders), and no `qq` or `gmx-eta` for its cluster tab. Say if you want that, and it can be designed
properly.

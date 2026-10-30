# Kubernetes

Plain manifests + kustomize. Assumes a cluster with **ingress-nginx** and **cert-manager**.
Postgres (with pgvector) and S3 should be managed services; Redis can run in-cluster
(`redis.yaml`) or be managed.

```
namespace.yaml        collabdocs namespace
configmap.yaml        non-secret server settings
secret.example.yaml   template for the collabdocs-server Secret (not applied)
redis.yaml            single-node Redis (OT step log, pub/sub, rate limits)
server.yaml           API + collab server Deployment, Service, HPA, PDB
web.yaml              static frontend (nginx) Deployment + Service
ingress.yaml          docs.example.com → web, api.example.com → API, /collab → WebSocket
migrate/              Prisma `migrate deploy` Job, run before each server rollout
```

## Deploy

```bash
# 1. Build and push images (from the repo root)
docker build -f apps/server/Dockerfile -t ghcr.io/your-org/collabdocs-server:v1 .
docker build -f apps/web/Dockerfile -t ghcr.io/your-org/collabdocs-web:v1 \
  --build-arg VITE_API_URL=https://api.example.com \
  --build-arg VITE_COLLAB_URL=wss://api.example.com/collab .
docker push ghcr.io/your-org/collabdocs-server:v1
docker push ghcr.io/your-org/collabdocs-web:v1

# 2. Set the image tags in kustomization.yaml and migrate/kustomization.yaml
#    (or: cd deploy/k8s && kustomize edit set image collabdocs-server=…:v1)
#    and replace the example hosts in ingress.yaml and WEB_ORIGIN in configmap.yaml.

# 3. Secrets (once)
kubectl create namespace collabdocs
kubectl -n collabdocs create secret generic collabdocs-server --from-env-file=apps/server/.env

# 4. Migrate, then roll out
kubectl apply -k deploy/k8s/migrate
kubectl -n collabdocs wait --for=condition=complete job/collabdocs-migrate --timeout=5m
kubectl apply -k deploy/k8s
```

## Why it's set up this way

- **Redis is required with more than one replica.** Every document's steps are ordered
  through Redis (atomic compare-and-append), which is what lets any replica accept edits
  for any document. Without `REDIS_URL` each pod would run its own authority and
  documents would diverge.
- **Doc-affinity routing.** The collab Ingress hashes on the `?doc=` query parameter the
  client sends, so editors of one document usually share a pod and skip the Redis hop.
  This is only an optimisation: scaling or a pod restart reshuffles the hash, and
  correctness still comes from the step log.
- **Graceful shutdown.** On SIGTERM the server persists every open document and closes
  sockets with code 1012; clients reconnect (to another pod) and replay only the steps
  they missed. `preStop` + `terminationGracePeriodSeconds` give that time to finish.
- **S3 is required in-cluster.** The local-disk storage fallback is per pod, so uploads
  would only exist on whichever replica received them.
- **Migrations run as a Job**, not on server start, so several replicas starting at once
  don't race on `prisma migrate deploy`.

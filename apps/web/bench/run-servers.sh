#!/bin/sh
# Starts N CollabDocs server instances (default 2) sharing Redis + the benchmark DB.
# Instance i listens on HTTP 4i00 and WebSocket 4i01 (i = 1..N).
cd "$(dirname "$0")/../../server"
N=${1:-2}
T=${BENCH_TMP:-/tmp/collabdocs-bench}; mkdir -p "$T"
export DATABASE_URL="postgresql://sakshi@localhost:5432/collabdocs_bench?schema=public"
export COLLAB_JWT_SECRET=bench-secret REDIS_URL=${REDIS_URL-redis://127.0.0.1:6379/5} LOCAL_STORAGE_DIR=$T/storage OPENAI_API_KEY=
for i in $(seq 1 $N); do
  PORT=4${i}00 COLLAB_PORT=4${i}01 INSTANCE_ID=i$i node --import tsx src/index.ts > $T/i$i.log 2>&1 &
  echo $! > $T/i$i.pid
done

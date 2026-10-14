#!/usr/bin/env bash
# Usage: server/scripts/smoke.sh <base-url> <tool> <file>
# Uploads one file through the public /api proxy, waits for the job, downloads the result and deletes the job.
set -euo pipefail
base=$1 tool=$2 file=$3
id=$(curl -sS -f -F "tool=$tool" -F "opts={}" -F "file=@$file" "$base/api/jobs" | sed -E 's/.*"id":"([0-9a-f]+)".*/\1/')
echo "job $id"
for _ in $(seq 1 180); do
  status=$(curl -sS -f "$base/api/jobs/$id")
  case "$status" in
    *'"done"'*) echo "$status"; break ;;
    *'"failed"'*) echo "$status" >&2; exit 1 ;;
  esac
  sleep 1
done
curl -sS -f -o /dev/null -w "download %{http_code} %{size_download} bytes\n" "$base/api/jobs/$id/file"
curl -sS -f -o /dev/null -w "delete %{http_code}\n" -X DELETE "$base/api/jobs/$id"
curl -sS -o /dev/null -w "after delete %{http_code}\n" "$base/api/jobs/$id"

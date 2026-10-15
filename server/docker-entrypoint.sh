#!/bin/sh
# Points clamdscan (the upload scanner's client) at a clamd running somewhere else, e.g. a ClamAV container:
#   CLAMD_HOST=clamav CLAMD_PORT=3310
# An explicit CLAMD_CONFIG wins. Without CLAMD_HOST nothing is generated and scanUpload.js uses its defaults.
set -e

if [ -n "$CLAMD_HOST" ] && [ -z "$CLAMD_CONFIG" ]; then
  conf=/tmp/clamd-client.conf
  printf 'TCPSocket %s\nTCPAddr %s\n' "${CLAMD_PORT:-3310}" "$CLAMD_HOST" > "$conf"
  export CLAMD_CONFIG="$conf"
fi

exec "$@"

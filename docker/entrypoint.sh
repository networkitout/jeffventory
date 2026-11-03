#!/bin/sh
set -eu
umask 077

mkdir -p "$UPLOAD_DIR"
if [ ! -w /data ] || [ ! -w "$UPLOAD_DIR" ]; then
  printf '%s\n' "Jeffventory storage must be writable by container user 1000. Check the data volume permissions." >&2
  exit 1
fi

printf '%s\n' "Applying Jeffventory database migrations..."
node node_modules/prisma/build/index.js migrate deploy
printf '%s\n' "Starting Jeffventory..."
exec "$@"

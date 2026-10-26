#!/usr/bin/env bash
# Exercise the real entrypoint using fake commands; no database or Vault access.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/dist/src"
touch "$WORK/dist/src/main.js"
cat > "$WORK/bin/npx" <<'STUB'
#!/usr/bin/env bash
echo "npx $*" >> "$CALLS"
if [ "$SCENARIO" = "success" ]; then exit 0; fi
if [ "$SCENARIO" = "transient" ]; then
  count=$(wc -l < "$CALLS")
  if [ "$count" -ge 2 ]; then exit 0; fi
  echo 'P1001 database unavailable'
  exit 1
fi
echo "$SCENARIO migration failure"
exit 1
STUB
cat > "$WORK/bin/node" <<'STUB'
#!/usr/bin/env bash
echo "node $*" >> "$CALLS"
if [ "$1" = "-e" ]; then echo 'SKIP'; fi
exit 0
STUB
for command in sleep mkdir; do
  printf '#!/usr/bin/env bash\nexit 0\n' > "$WORK/bin/$command"
done
chmod +x "$WORK/bin/"*

for scenario in P3005 P3009 P3018 P3014 P3004 success transient; do
  export CALLS="$WORK/$scenario.calls" SCENARIO="$scenario"
  : > "$CALLS"
  set +e
  (cd "$WORK" && PATH="$WORK/bin:$PATH" SKIP_SEED=true bash "$ROOT/server/docker-entrypoint.sh") > "$WORK/output" 2>&1
  status=$?
  set -e
  if grep -Eq 'db push|migrate resolve|DROP TABLE|user.count' "$CALLS"; then
    echo "FAIL $scenario: entrypoint attempted automatic schema/history repair"
    exit 1
  fi
  if [ "$scenario" = success ] || [ "$scenario" = transient ]; then
    [ "$status" -eq 0 ] || { cat "$WORK/output"; exit 1; }
    grep -q 'node dist/src/main.js' "$CALLS"
    if [ "$scenario" = transient ]; then
      [ "$(grep -c '^npx prisma migrate deploy$' "$CALLS")" -eq 2 ]
    fi
  else
    [ "$status" -ne 0 ] || { echo "FAIL $scenario: startup continued"; exit 1; }
    [ "$(wc -l < "$CALLS")" -eq 1 ] || { echo "FAIL $scenario: unexpected command after migration failure"; exit 1; }
  fi
  echo "PASS $scenario"
done

#!/usr/bin/env bash
# Deliberately fails — tests stderr capture and non-zero exit handling.
set -euo pipefail

echo "doing some work..."
sleep 0.3
echo "something went wrong on line 42" >&2
exit 3

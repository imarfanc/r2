#!/usr/bin/env bash
# System snapshot — prints a few basic facts about the machine.
set -euo pipefail

echo "=== System snapshot ==="
echo "date     : $(date)"
echo "host     : $(hostname)"
echo "user     : $(whoami)"
echo "kernel   : $(uname -srm)"
echo "pwd      : $(pwd)"
echo
echo "=== Disk (top level) ==="
df -h . | tail -n +1

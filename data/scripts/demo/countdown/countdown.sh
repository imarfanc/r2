#!/usr/bin/env bash
# Streams output slowly — good for testing live log streaming.
set -euo pipefail

for i in 5 4 3 2 1; do
  echo "T-minus $i ..."
  sleep 0.6
done
echo "Liftoff. 🚀"

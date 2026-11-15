#!/usr/bin/env bash
# Build the Q-FOX engine: a shared library for the Python binding plus a
# standalone binary used by the C-level smoke tests.
set -euo pipefail
cd "$(dirname "$0")"
CFLAGS="-O3 -march=native -Wall -Wextra -Wno-unused-parameter -fPIC"
mkdir -p ../build
gcc $CFLAGS -shared qfox.c -o ../build/libqfox.so
gcc $CFLAGS -DQFOX_STANDALONE qfox.c -o ../build/qfox
echo "built ../build/libqfox.so ../build/qfox"

#!/bin/bash
# Patch node_modules gradle files to use absolute node path on macOS Apple Silicon.
# Android Studio's Gradle daemon doesn't inherit terminal PATH.

NODE_BIN="/opt/homebrew/bin/node"
if [ ! -f "$NODE_BIN" ]; then
  exit 0  # Not Apple Silicon Mac, skip
fi

find node_modules -name "*.gradle" -exec grep -l '"node"' {} \; 2>/dev/null | while read f; do
  sed -i '' "s|\"node\"|\"$NODE_BIN\"|g" "$f"
done

echo "[patch-node-path-android] Patched gradle files for Android Studio"

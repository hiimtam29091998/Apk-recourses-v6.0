#!/usr/bin/env bash
# Run inside the root of your existing Apk-recourses-v5.0 repository,
# after extracting KhoangThach_Mobile_v6_HiGHS_WASM_PATCH.zip.
set -euo pipefail
if [[ ! -f app/build.gradle || ! -f .github/workflows/build-apk.yml ]]; then
  echo 'ERROR: Run inside Apk-recourses-v5.0 repository root after unzip.' >&2
  exit 1
fi
rm -f app/src/main/python/optimizer.py app/src/main/python/server.py
# SciPy reference code is now under reference/ and is NOT part of Android.
if grep -E "install ['\"](scipy|numpy)['\"]" app/build.gradle; then
  echo 'ERROR: Android build.gradle still requests SciPy or NumPy.' >&2
  exit 1
fi
printf 'OK: Android runtime uses HiGHS WASM; Python reporting is independent of SciPy.\n'

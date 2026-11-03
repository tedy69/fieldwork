#!/usr/bin/env bash
set -euo pipefail

# Dedicated synthetic fixture. Use product sign-out; never reset app data.
task_device="${1:?Pass the dedicated emulator ID}"
task_adb="${ADB:-adb}"
task_root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"

maestro --device "$task_device" test "$task_root/tests/native/icon-actions.android.yaml"
# Use ordinary Android keyboard input around Maestro's Android typing issue #2718.
"$task_adb" -s "$task_device" shell input text 'Synthetic%sicon-control%sregression%sdraft.'
maestro --device "$task_device" test "$task_root/tests/native/icon-actions-finish.android.yaml"

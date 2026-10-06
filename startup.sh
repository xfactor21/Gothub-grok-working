#!/bin/sh
set -eu
cd /workspace
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-/workspace/toolchains/gradle-home}"
export ANDROID_HOME="${ANDROID_HOME:-/workspace/toolchains/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev > /tmp/xide-dev.log 2>&1 &
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
    exit 0
  fi
  sleep 0.5
done
exit 0

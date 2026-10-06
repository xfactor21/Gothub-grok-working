#!/bin/bash
cd "$(dirname "$0")"
chmod +x Start.sh 2>/dev/null || true
./Start.sh
echo
read -r -p "Press Return to close this window."

#!/bin/bash
# usage: s.sh <name> [h]  -> screenshot (+ visible elements if 2nd arg)
U=5062CC77-7050-48D5-A616-19FBDCDFCE11
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
D=/Users/kli/dev/vitto/qa-artifacts/screenshots/first-time
if [ -n "$1" ] && [ "$1" != "-" ]; then xcrun simctl io $U screenshot $D/$1.png >/dev/null 2>&1; echo "shot $D/$1.png"; fi
if [ -n "$2" ]; then
perl -e 'alarm 60; exec @ARGV' maestro --device $U hierarchy > /Users/kli/dev/vitto/qa/first-time/h.json 2>/dev/null
python3 /Users/kli/dev/vitto/qa/tools/visible.py /Users/kli/dev/vitto/qa/first-time/h.json | grep -vE "Cellular|SSID|battery"
fi

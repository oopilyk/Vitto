#!/bin/bash
# usage: f.sh  (reads flow steps from stdin)
U=5062CC77-7050-48D5-A616-19FBDCDFCE11
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
F=/Users/kli/dev/vitto/qa/first-time/flow.yaml
{ echo "appId: com.getvitto.app"; echo "---"; cat; } > $F
maestro --device $U test $F 2>&1 | grep -vE '^\s*$' | tail -15

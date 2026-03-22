#!/bin/bash
# Run a batch of Runway issues locally via the CLI.
#
# Usage:
#   ./scripts/run-sprint.sh --project wealth-next --cycle <cycle-id>
#   ./scripts/run-sprint.sh --project wealth-next --issues BUI-32,BUI-33

set -e

npm run dev -- run "$@"

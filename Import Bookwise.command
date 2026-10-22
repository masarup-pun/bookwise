#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")" || exit 1
node scripts/import-content.cjs
import_result=$?
printf '\nกด Enter เพื่อปิดหน้าต่าง…'
read -r
exit "$import_result"

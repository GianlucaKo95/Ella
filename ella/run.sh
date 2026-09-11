#!/bin/sh
set -e

CONFIG_PATH=/data/options.json
SUPABASE_URL=$(jq -r '.supabase_url // ""' "$CONFIG_PATH")
SUPABASE_ANON_KEY=$(jq -r '.supabase_anon_key // ""' "$CONFIG_PATH")

cat > /www/runtime-config.js <<EOF
window.__ELLA_CONFIG__ = {
  supabaseUrl: "${SUPABASE_URL}",
  supabaseAnonKey: "${SUPABASE_ANON_KEY}"
};
EOF

exec nginx -g "daemon off;"

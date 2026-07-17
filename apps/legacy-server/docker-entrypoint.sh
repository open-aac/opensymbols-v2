#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

bundle exec rails db:create
bundle exec rails db:migrate

exec bundle exec puma -C config/puma.rb

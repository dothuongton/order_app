#!/bin/sh
set -e

echo "🚀 Starting QR Order App v1.2..."

# Run migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "🔄 Running database migrations on database..."
  node dist/db/migrate.js

  if [ "$AUTO_SEED" = "true" ]; then
    echo "🌱 AUTO_SEED is enabled: Seeding demo users, tables and menu..."
    node dist/db/seed.js
  fi
fi

echo "✨ Starting application on port ${PORT:-8080}..."
exec node dist/server.js

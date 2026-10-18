#!/bin/sh
set -e

echo "🚀 Starting QR Order App v1.2..."

# Run migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "🔄 Running database migrations on $DATABASE_URL..."
  node dist/db/migrate.js || {
    echo "⚠️ Database migration warning. Continuing..."
  }
fi

echo "✨ Starting application on port ${PORT:-8080}..."
exec node dist/server.js

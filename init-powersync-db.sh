#!/bin/sh
set -e

# Create the PowerSync storage database if it doesn't exist
# We use -tc to return 1 if exists, and pipe to grep to decide whether to run CREATE DATABASE
if ! psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tc "SELECT 1 FROM pg_database WHERE datname = 'powersync_storage'" | grep -q 1; then
    echo "Creating database powersync_storage..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE powersync_storage"
else
    echo "Database powersync_storage already exists."
fi

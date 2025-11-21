#!/bin/bash

# Check if a commit message was provided
if [ -z "$1" ]; then
  echo "Usage: ./update_repo.sh \"Your commit message\""
  echo "Defaulting to 'Auto update'"
  COMMIT_MSG="Auto update"
else
  COMMIT_MSG="$1"
fi

echo "🚀 Starting update process..."

# Add all changes
git add .

# Commit changes
git commit -m "$COMMIT_MSG"

# Push to main branch
echo "⬆️ Pushing to GitHub..."
git push origin main

echo "✅ Update complete!"

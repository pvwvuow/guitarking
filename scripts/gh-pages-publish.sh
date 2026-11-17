#!/bin/bash
# Build the static export and publish ./out to the gh-pages branch.
# Usage: bash /home/z/my-project/scripts/gh-pages-publish.sh
set -euo pipefail
REPO=/home/z/my-project/guitarking-repo
GHP=/tmp/ghp-src

cd "$REPO"
SRC=$(git rev-parse --short HEAD)
# the pages build moves src/app/api aside (no server routes under export)
API_DIR=src/app/api
API_STASH=/tmp/api-aside-$$
if [ -d "$API_DIR" ]; then
  mv "$API_DIR" "$API_STASH"
fi
restore_api() {
  if [ -d "$API_STASH" ] && [ ! -d "$REPO/$API_DIR" ]; then
    mv "$API_STASH" "$REPO/$API_DIR"
  fi
}
trap restore_api EXIT

bun run build:pages >/tmp/pages-build.log 2>&1 || { tail -30 /tmp/pages-build.log; exit 1; }
restore_api
trap - EXIT
SIZE=$(du -sh out | cut -f1)
[ -f out/index.html ] || { echo "out/index.html missing"; exit 1; }
echo "build ok ($SRC): $SIZE"

git fetch origin gh-pages >/dev/null 2>&1 || true
git worktree remove --force "$GHP" >/dev/null 2>&1 || rm -rf "$GHP"
git worktree prune >/dev/null 2>&1
git worktree add --detach "$GHP" origin/gh-pages >/dev/null 2>&1
find "$GHP" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r out/. "$GHP"/
# without .nojekyll, GitHub Pages runs Jekyll and drops every _next/* path
touch "$GHP/.nojekyll"
cd "$GHP"
git add -A
git commit -q -m "pages build from $SRC" || echo "no changes to publish"
# push with the token as a basic-auth password (x-oauth-basic) so git
# never tries to prompt; never print the URL
TOK=$(git config --get remote.origin.url | sed -E 's#https://([^@]+)@github.com.*#\1#')
PUSH_URL="https://$TOK:x-oauth-basic@github.com/pvwvuow/guitarking.git"
GIT_TERMINAL_PROMPT=0 git push -q "$PUSH_URL" HEAD:gh-pages || {
  [ "${GH_PUSH:-1}" = "1" ] && exit 1
  echo "push skipped (GH_PUSH=0)"
}
cd "$REPO"
git worktree remove --force "$GHP"
echo "gh-pages pushed (source commit $SRC)"

#!/bin/bash
# Sends a Slack notification after every git commit.
# Called by Claude Code's PostToolUse hook on every Bash tool call.
# Exits silently if the command wasn't a git commit.

NODE="/c/Program Files/nodejs/node"
REPO="c:/Client-Acquisition"

# Extract the bash command from the hook's stdin JSON
INPUT=$(cat)
CMD=$("$NODE" -e "
  let d = '';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try { process.stdout.write(JSON.parse(d).tool_input.command || ''); }
    catch(e) { process.exit(0); }
  });
" <<< "$INPUT" 2>/dev/null || echo "")

# Only fire on git commit commands
if ! echo "$CMD" | grep -q "git commit"; then
  exit 0
fi

HASH=$(git -C "$REPO" log -1 --pretty=format:"%h" 2>/dev/null || echo "")
SUBJ=$(git -C "$REPO" log -1 --pretty=format:"%s" 2>/dev/null || echo "")

if [ -z "$HASH" ]; then
  exit 0
fi

# If SLACK_WEBHOOK_URL wasn't injected by Claude Code, read it from settings.local.json
if [ -z "$SLACK_WEBHOOK_URL" ]; then
  SLACK_WEBHOOK_URL=$("$NODE" -e "
    const fs = require('fs');
    try {
      const s = fs.readFileSync('$REPO/.claude/settings.local.json', 'utf8');
      process.stdout.write(JSON.parse(s).env.SLACK_WEBHOOK_URL || '');
    } catch(e) {}
  " 2>/dev/null)
fi

if [ -z "$SLACK_WEBHOOK_URL" ]; then
  exit 0
fi

# Use node for the HTTP POST — avoids Windows curl SSL issues
COMMIT_HASH="$HASH" COMMIT_SUBJ="$SUBJ" SLACK_WEBHOOK_URL="$SLACK_WEBHOOK_URL" "$NODE" -e "
  const https = require('https');
  const h = process.env.COMMIT_HASH || '';
  const s = process.env.COMMIT_SUBJ || '';
  const link = 'https://github.com/joshhorsley92/Client-Acquisition/commit/' + h;
  const text = '📌 *Client-Acquisition CRM — new commit by Joe Zolinski*\n\`' + h + '\` ' + s + '\n' + link;
  const body = JSON.stringify({ text });
  const url = new URL(process.env.SLACK_WEBHOOK_URL);
  const req = https.request({
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  });
  req.write(body);
  req.end();
" 2>/dev/null

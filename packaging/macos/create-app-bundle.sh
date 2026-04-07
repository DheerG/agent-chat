#!/bin/bash
# Creates a macOS .app bundle from the agent-chat binary.
# Usage: ./create-app-bundle.sh <path-to-binary> [output-dir]

set -euo pipefail

BINARY="${1:?Usage: $0 <path-to-agent-chat-binary> [output-dir]}"
OUTPUT_DIR="${2:-.}"
APP_NAME="AgentChat"
BUNDLE_ID="com.agentchat.app"
VERSION="0.1.0"

APP_DIR="${OUTPUT_DIR}/${APP_NAME}.app"
CONTENTS="${APP_DIR}/Contents"
MACOS="${CONTENTS}/MacOS"
RESOURCES="${CONTENTS}/Resources"

# Clean previous
rm -rf "${APP_DIR}"

# Create structure
mkdir -p "${MACOS}" "${RESOURCES}"

# Copy binary
cp "${BINARY}" "${MACOS}/agent-chat"
chmod +x "${MACOS}/agent-chat"

# Create launcher script (starts server + opens browser)
cat > "${MACOS}/${APP_NAME}" << 'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
"${DIR}/agent-chat" serve &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null" EXIT
wait $SERVER_PID
LAUNCHER
chmod +x "${MACOS}/${APP_NAME}"

# Create Info.plist
cat > "${CONTENTS}/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

echo "Created ${APP_DIR}"
echo "To run: open ${APP_DIR}"

#!/bin/sh
# AgentChat installer
# Usage: curl -fsSL https://raw.githubusercontent.com/DheerG/agent-chat/main/install.sh | sh
#
# Environment variables:
#   VERSION      Install a specific version (default: latest)
#   INSTALL_DIR  Install directory (default: /usr/local/bin or ~/.local/bin)

set -e

REPO="DheerG/agent-chat"
VERSION="${VERSION:-latest}"

# --- Detect platform ---
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) ;;
  *)
    echo "Error: AgentChat currently supports macOS only."
    echo "Detected OS: $OS"
    echo "For other platforms, see: https://github.com/$REPO/releases"
    exit 1
    ;;
esac

case "$ARCH" in
  arm64)  FILE="agent-chat-macos-arm64.tar.gz" ;;
  x86_64) FILE="agent-chat-macos-x86_64.tar.gz" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

# --- Determine install directory ---
if [ -z "${INSTALL_DIR:-}" ]; then
  if [ -w "/usr/local/bin" ] 2>/dev/null; then
    INSTALL_DIR="/usr/local/bin"
  else
    INSTALL_DIR="$HOME/.local/bin"
  fi
fi

mkdir -p "$INSTALL_DIR"

# --- Build download URL ---
if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/$REPO/releases/latest/download/$FILE"
else
  URL="https://github.com/$REPO/releases/download/$VERSION/$FILE"
fi

# --- Download and install ---
echo "Installing AgentChat..."
echo "  Platform:  macOS ($ARCH)"
echo "  Version:   $VERSION"
echo "  Target:    $INSTALL_DIR/agent-chat"
echo ""

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading $FILE..."
if ! curl -fsSL --retry 3 -o "$TMPDIR/$FILE" "$URL"; then
  echo ""
  echo "Error: Download failed."
  echo "URL: $URL"
  echo ""
  echo "If the version doesn't exist yet, check:"
  echo "  https://github.com/$REPO/releases"
  exit 1
fi

echo "Extracting..."
tar -xzf "$TMPDIR/$FILE" -C "$TMPDIR"

if [ ! -f "$TMPDIR/agent-chat" ]; then
  echo "Error: Expected 'agent-chat' binary not found in archive."
  exit 1
fi

chmod +x "$TMPDIR/agent-chat"
mv "$TMPDIR/agent-chat" "$INSTALL_DIR/agent-chat"

echo ""
echo "✓ AgentChat installed to $INSTALL_DIR/agent-chat"
echo ""

# --- PATH check ---
if ! command -v agent-chat >/dev/null 2>&1; then
  echo "⚠  $INSTALL_DIR is not in your PATH."
  echo ""
  echo "Add it to your shell profile:"
  echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
  echo ""
  echo "Or run directly: $INSTALL_DIR/agent-chat"
else
  echo "Run 'agent-chat' to start."
fi

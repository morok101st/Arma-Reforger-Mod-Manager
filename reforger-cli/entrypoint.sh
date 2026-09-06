#!/bin/sh
set -eu

REFORGER_INSTALL_DIR="${REFORGER_INSTALL_DIR:-/opt/reforger-server}"
STEAMCMD_DIR="${STEAMCMD_DIR:-$REFORGER_INSTALL_DIR/steamcmd}"
SRCDS_APPID="${SRCDS_APPID:-1874900}"
STEAMCMD_URL="${STEAMCMD_URL:-https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz}"
REFORGER_UPDATE_TIMEOUT_SECONDS="${REFORGER_UPDATE_TIMEOUT_SECONDS:-600}"
REFORGER_UPDATE_ON_START="${REFORGER_UPDATE_ON_START:-true}"

mkdir -p "$STEAMCMD_DIR" "$REFORGER_INSTALL_DIR" "$REFORGER_INSTALL_DIR/steamapps"
export HOME="$REFORGER_INSTALL_DIR"

if [ ! -x "$STEAMCMD_DIR/steamcmd.sh" ]; then
  echo "Installing SteamCMD into $STEAMCMD_DIR"
  curl -fsSL -o /tmp/steamcmd_linux.tar.gz "$STEAMCMD_URL"
  tar -xzf /tmp/steamcmd_linux.tar.gz -C "$STEAMCMD_DIR"
fi

if [ "$REFORGER_UPDATE_ON_START" = "true" ]; then
  echo "Updating Arma Reforger Dedicated Server app $SRCDS_APPID into $REFORGER_INSTALL_DIR"
  if ! timeout "$REFORGER_UPDATE_TIMEOUT_SECONDS" "$STEAMCMD_DIR/steamcmd.sh" \
    +force_install_dir "$REFORGER_INSTALL_DIR" \
    +login anonymous \
    +app_update "$SRCDS_APPID" validate \
    +app_update 1007 \
    +quit; then
    if [ ! -x "$REFORGER_INSTALL_DIR/ArmaReforgerServer" ]; then
      echo "SteamCMD failed and no existing ArmaReforgerServer installation is available" >&2
      exit 1
    fi
    echo "SteamCMD update failed or timed out; continuing with existing ArmaReforgerServer installation" >&2
  fi
fi

mkdir -p "$REFORGER_INSTALL_DIR/.steam/sdk32" "$REFORGER_INSTALL_DIR/.steam/sdk64"
if [ -f "$STEAMCMD_DIR/linux32/steamclient.so" ]; then
  cp "$STEAMCMD_DIR/linux32/steamclient.so" "$REFORGER_INSTALL_DIR/.steam/sdk32/steamclient.so"
fi
if [ -f "$STEAMCMD_DIR/linux64/steamclient.so" ]; then
  cp "$STEAMCMD_DIR/linux64/steamclient.so" "$REFORGER_INSTALL_DIR/.steam/sdk64/steamclient.so"
fi

if [ ! -x "$REFORGER_INSTALL_DIR/ArmaReforgerServer" ]; then
  echo "ArmaReforgerServer was not installed correctly" >&2
  exit 1
fi

echo "Arma Reforger Dedicated Server is ready. Starting metadata service."
exec python3 /usr/local/bin/reforger-metadata-service

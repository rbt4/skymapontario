#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${1:-rbt4/skymapontario}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIGNING_DIR="${SKYMAP_SIGNING_DIR:-$ROOT/.private/skymap-signing}"
KEYSTORE="$SIGNING_DIR/skymap-release.jks"
ALIAS="${SKYMAP_KEY_ALIAS:-skymap}"

for command in keytool openssl gh base64; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

gh auth status >/dev/null 2>&1 || {
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
}

mkdir -p "$SIGNING_DIR"
chmod 700 "$SIGNING_DIR"

if [ -e "$KEYSTORE" ]; then
  echo "Refusing to overwrite existing release keystore: $KEYSTORE" >&2
  exit 1
fi

read -r -s -p "Release keystore password: " STORE_PASSWORD
echo
read -r -s -p "Repeat release keystore password: " STORE_PASSWORD_CONFIRM
echo
[ "$STORE_PASSWORD" = "$STORE_PASSWORD_CONFIRM" ] || {
  echo "Keystore passwords do not match" >&2
  exit 1
}
[ "${#STORE_PASSWORD}" -ge 16 ] || {
  echo "Use a keystore password of at least 16 characters" >&2
  exit 1
}

read -r -s -p "Release key password: " KEY_PASSWORD
echo
read -r -s -p "Repeat release key password: " KEY_PASSWORD_CONFIRM
echo
[ "$KEY_PASSWORD" = "$KEY_PASSWORD_CONFIRM" ] || {
  echo "Key passwords do not match" >&2
  exit 1
}
[ "${#KEY_PASSWORD}" -ge 16 ] || {
  echo "Use a key password of at least 16 characters" >&2
  exit 1
}

keytool -genkeypair -noprompt \
  -keystore "$KEYSTORE" \
  -storetype JKS \
  -storepass "$STORE_PASSWORD" \
  -alias "$ALIAS" \
  -keypass "$KEY_PASSWORD" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=SkyMap Ontario,O=RBT4,C=CA"
chmod 600 "$KEYSTORE"

KEYSTORE_B64="$(base64 < "$KEYSTORE" | tr -d '\r\n')"
CERT_SHA256="$(keytool -exportcert -keystore "$KEYSTORE" -storepass "$STORE_PASSWORD" -alias "$ALIAS" \
  | openssl x509 -inform DER -noout -fingerprint -sha256 \
  | cut -d= -f2 | tr -d ':[:space:]' | tr '[:lower:]' '[:upper:]')"

printf '%s' "$KEYSTORE_B64" | gh secret set SKYMAP_KEYSTORE_B64 --repo "$REPOSITORY"
printf '%s' "$STORE_PASSWORD" | gh secret set SKYMAP_KEYSTORE_PASSWORD --repo "$REPOSITORY"
printf '%s' "$ALIAS" | gh secret set SKYMAP_KEY_ALIAS --repo "$REPOSITORY"
printf '%s' "$KEY_PASSWORD" | gh secret set SKYMAP_KEY_PASSWORD --repo "$REPOSITORY"
printf '%s' "$CERT_SHA256" | gh secret set SKYMAP_SIGNING_CERT_SHA256 --repo "$REPOSITORY"

unset KEYSTORE_B64 STORE_PASSWORD STORE_PASSWORD_CONFIRM KEY_PASSWORD KEY_PASSWORD_CONFIRM

echo
printf 'Production signing configured for %s.\n' "$REPOSITORY"
printf 'Certificate SHA-256: %s\n' "$CERT_SHA256"
printf 'Keystore backup: %s\n' "$KEYSTORE"
echo "Back up the keystore now. Losing it permanently ends the current Android update chain."

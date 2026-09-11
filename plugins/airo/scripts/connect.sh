#!/bin/sh
set -eu
umask 077
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$arch" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) echo '지원하지 않는 CPU입니다.' >&2; exit 1 ;; esac
case "$os-$arch" in
  darwin-arm64) bridge_url='https://airo.dev-heptivision.com/downloads/airo-codex-0.2.1-darwin-arm64.tar.gz'; bridge_sha='1af6dd02d268488ad8b7eb17e5c9d2c79dad1cd68e67899d68e7e17a8edc0292'; codex_url='https://registry.npmjs.org/@openai/codex/-/codex-0.154.0-darwin-arm64.tgz'; codex_sha='2a98662d79316a59993c7233e3e25a1aa1d42da4b45904585d33a5a7da1cade1'; codex_relative='package/vendor/aarch64-apple-darwin/bin/codex' ;;
  darwin-x64) bridge_url='https://airo.dev-heptivision.com/downloads/airo-codex-0.2.1-darwin-x64.tar.gz'; bridge_sha='8646fce8213e8668a9744fa9c48541b37a51d308eb2e8cb5d3c34b18745c6d56'; codex_url='https://registry.npmjs.org/@openai/codex/-/codex-0.154.0-darwin-x64.tgz'; codex_sha='92c493533c53c433c4d94252251daba4f379ccba06a9964d260abb47a535dce1'; codex_relative='package/vendor/x86_64-apple-darwin/bin/codex' ;;
  linux-x64) bridge_url='https://airo.dev-heptivision.com/downloads/airo-codex-0.2.1-linux-x64.tar.gz'; bridge_sha='2bcfc388cbb8414d88a35bcd7f28078eea793d99847514c4b3e07bb4180f0812'; codex_url='https://registry.npmjs.org/@openai/codex/-/codex-0.154.0-linux-x64.tgz'; codex_sha='e27c83a49e6031685ee7f956c12aad5f16484d3a80181dd3fea930fb96b3832b'; codex_relative='package/vendor/x86_64-unknown-linux-musl/bin/codex' ;;
  linux-arm64) bridge_url='https://airo.dev-heptivision.com/downloads/airo-codex-0.2.1-linux-arm64.tar.gz'; bridge_sha='014f571c9ceed62a1d2c6403f5c884a28e69b14c288240566e807ae556a77378'; codex_url='https://registry.npmjs.org/@openai/codex/-/codex-0.154.0-linux-arm64.tgz'; codex_sha='a2315b5f64bfeaff79b71e0d35505ba8c22cc1e96cab9dc950b614c804105b24'; codex_relative='package/vendor/aarch64-unknown-linux-musl/bin/codex' ;;
  *) echo '지원하지 않는 운영체제입니다.' >&2; exit 1 ;;
esac
cache="$HOME/.airo/runtime/0.2.1-$os-$arch"
mkdir -p "$cache"
verify() { if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$1" | cut -d ' ' -f 1); else actual=$(shasum -a 256 "$1" | cut -d ' ' -f 1); fi; [ "$actual" = "$2" ]; }
fetch_archive() { if [ ! -f "$1" ] || ! verify "$1" "$3"; then curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --output "$1.part" "$2"; verify "$1.part" "$3" || { echo '설치 파일 검증 실패' >&2; rm -f "$1.part"; exit 1; }; mv "$1.part" "$1"; fi; }
fetch_archive "$cache/bridge.tar.gz" "$bridge_url" "$bridge_sha"
fetch_archive "$cache/codex.tar.gz" "$codex_url" "$codex_sha"
tar -xzf "$cache/bridge.tar.gz" -C "$cache"
tar -xzf "$cache/codex.tar.gz" -C "$cache"
chmod u+x "$cache/airo-codex" "$cache/$codex_relative"
exec "$cache/airo-codex" --start --codex "$cache/$codex_relative"

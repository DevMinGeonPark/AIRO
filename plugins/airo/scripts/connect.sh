#!/bin/sh
set -eu
umask 077
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$arch" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) echo '지원하지 않는 CPU입니다.' >&2; exit 1 ;; esac
case "$os-$arch" in
  darwin-arm64) bridge_url='https://airo.dev-heptivision.com/downloads/airo-codex-0.2.0-darwin-arm64.tar.gz'; bridge_sha='fcbed895f45fd3805a6197ef007c5b8c67ecaf23f0186181713707bba0086a99'; codex_url='https://registry.npmjs.org/@openai/codex/-/codex-0.154.0-darwin-arm64.tgz'; codex_sha='2a98662d79316a59993c7233e3e25a1aa1d42da4b45904585d33a5a7da1cade1'; codex_relative='package/vendor/aarch64-apple-darwin/bin/codex' ;;
  darwin-x64) bridge_url='https://airo.dev-heptivision.com/downloads/airo-codex-0.2.0-darwin-x64.tar.gz'; bridge_sha='fe756c9e3ed1568531f6839a95fd5fdb36e1e8be7d4fd5ab61376420ca16aa12'; codex_url='https://registry.npmjs.org/@openai/codex/-/codex-0.154.0-darwin-x64.tgz'; codex_sha='92c493533c53c433c4d94252251daba4f379ccba06a9964d260abb47a535dce1'; codex_relative='package/vendor/x86_64-apple-darwin/bin/codex' ;;
  linux-x64) bridge_url='https://airo.dev-heptivision.com/downloads/airo-codex-0.2.0-linux-x64.tar.gz'; bridge_sha='9e1ecdd2fb1bd1f0fb2b4c0d639b7963ab18d274d37de1619baf7dc7efcfc2f7'; codex_url='https://registry.npmjs.org/@openai/codex/-/codex-0.154.0-linux-x64.tgz'; codex_sha='e27c83a49e6031685ee7f956c12aad5f16484d3a80181dd3fea930fb96b3832b'; codex_relative='package/vendor/x86_64-unknown-linux-musl/bin/codex' ;;
  linux-arm64) bridge_url='https://airo.dev-heptivision.com/downloads/airo-codex-0.2.0-linux-arm64.tar.gz'; bridge_sha='2dce6270997ff68c128cddab37d5383d39b2ba56d57561025f2658e17f627fc5'; codex_url='https://registry.npmjs.org/@openai/codex/-/codex-0.154.0-linux-arm64.tgz'; codex_sha='a2315b5f64bfeaff79b71e0d35505ba8c22cc1e96cab9dc950b614c804105b24'; codex_relative='package/vendor/aarch64-unknown-linux-musl/bin/codex' ;;
  *) echo '지원하지 않는 운영체제입니다.' >&2; exit 1 ;;
esac
cache="$HOME/.airo/runtime/0.2.0-$os-$arch"
mkdir -p "$cache"
verify() { if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$1" | cut -d ' ' -f 1); else actual=$(shasum -a 256 "$1" | cut -d ' ' -f 1); fi; [ "$actual" = "$2" ]; }
fetch_archive() { if [ ! -f "$1" ] || ! verify "$1" "$3"; then curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --output "$1.part" "$2"; verify "$1.part" "$3" || { echo '설치 파일 검증 실패' >&2; rm -f "$1.part"; exit 1; }; mv "$1.part" "$1"; fi; }
fetch_archive "$cache/bridge.tar.gz" "$bridge_url" "$bridge_sha"
fetch_archive "$cache/codex.tar.gz" "$codex_url" "$codex_sha"
tar -xzf "$cache/bridge.tar.gz" -C "$cache"
tar -xzf "$cache/codex.tar.gz" -C "$cache"
chmod u+x "$cache/airo-codex" "$cache/$codex_relative"
exec "$cache/airo-codex" --start --codex "$cache/$codex_relative"

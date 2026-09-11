import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const version='0.2.1', codexVersion='0.154.0';
const platforms=[['darwin-arm64','bun-darwin-arm64','aarch64-apple-darwin'],['darwin-x64','bun-darwin-x64','x86_64-apple-darwin'],['linux-x64','bun-linux-x64-baseline','x86_64-unknown-linux-musl'],['linux-arm64','bun-linux-arm64','aarch64-unknown-linux-musl'],['win32-x64','bun-windows-x64-baseline','x86_64-pc-windows-msvc']];
const output=resolve('public/downloads'), temp=resolve('.private/plugin-build');
await mkdir(output,{recursive:true});await mkdir(temp,{recursive:true});
const run=(cmd,args)=>{const result=spawnSync(cmd,args,{stdio:'inherit'});if(result.status!==0)throw Error(`${cmd} failed`);};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest={version,codexVersion,platforms:{}};
for(const [platform,target] of platforms){
  const exe=platform.startsWith('win32')?'airo-codex.exe':'airo-codex';
  const dir=resolve(temp,platform);await mkdir(dir,{recursive:true});
  run('bun',['build','--compile',`--target=${target}`,'--define','AIRO_COMPILED=true','--outfile',resolve(dir,exe),'plugins/airo/scripts/bridge.mjs']);
  const name=`airo-codex-${version}-${platform}.tar.gz`;
  run('tar',['-czf',resolve(output,name),'-C',dir,exe]);
  const meta=await(await fetch(`https://registry.npmjs.org/@openai%2fcodex/${codexVersion}-${platform}`)).json();
  if(!meta.dist?.tarball?.startsWith('https://registry.npmjs.org/'))throw Error('Unexpected runtime origin');
  const bytes=Buffer.from(await(await fetch(meta.dist.tarball)).arrayBuffer());
  const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
  if(integrity!==meta.dist.integrity)throw Error('Official runtime integrity mismatch');
  const listing=spawnSync('tar',['-tzf','-'],{input:bytes,encoding:'utf8',maxBuffer:1048576});
  const binaries=listing.stdout.split('\n').filter(path=>/^package\/vendor\/[a-z0-9_-]+\/(bin|codex)\/codex(\.exe)?$/.test(path));
  if(listing.status!==0||binaries.length!==1)throw Error('Official Codex binary not found');
  manifest.platforms[platform]={bridgeUrl:`https://airo.dev-heptivision.com/downloads/${name}`,bridgeSha256:digest(await readFile(resolve(output,name))),codexUrl:meta.dist.tarball,codexSha256:digest(bytes),codexPath:binaries[0]};
}
await writeFile('plugins/airo/assets/runtime.json',JSON.stringify(manifest,null,2)+'\n');
await copyFile('public/brand/airo-mark-swift-gpt.png','plugins/airo/assets/icon.png');
let cases='';
for(const [platform,p] of Object.entries(manifest.platforms).filter(([p])=>!p.startsWith('win32'))){cases+=`  ${platform}) bridge_url='${p.bridgeUrl}'; bridge_sha='${p.bridgeSha256}'; codex_url='${p.codexUrl}'; codex_sha='${p.codexSha256}'; codex_relative='${p.codexPath}' ;;\n`;}
await writeFile('plugins/airo/scripts/connect.sh',`#!/bin/sh
set -eu
umask 077
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$arch" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) echo '지원하지 않는 CPU입니다.' >&2; exit 1 ;; esac
case "$os-$arch" in
${cases}  *) echo '지원하지 않는 운영체제입니다.' >&2; exit 1 ;;
esac
cache="$HOME/.airo/runtime/${version}-$os-$arch"
mkdir -p "$cache"
verify() { if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$1" | cut -d ' ' -f 1); else actual=$(shasum -a 256 "$1" | cut -d ' ' -f 1); fi; [ "$actual" = "$2" ]; }
fetch_archive() { if [ ! -f "$1" ] || ! verify "$1" "$3"; then curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --output "$1.part" "$2"; verify "$1.part" "$3" || { echo '설치 파일 검증 실패' >&2; rm -f "$1.part"; exit 1; }; mv "$1.part" "$1"; fi; }
fetch_archive "$cache/bridge.tar.gz" "$bridge_url" "$bridge_sha"
fetch_archive "$cache/codex.tar.gz" "$codex_url" "$codex_sha"
tar -xzf "$cache/bridge.tar.gz" -C "$cache"
tar -xzf "$cache/codex.tar.gz" -C "$cache"
chmod u+x "$cache/airo-codex" "$cache/$codex_relative"
exec "$cache/airo-codex" --start --codex "$cache/$codex_relative"
`,{mode:0o755});
const win=manifest.platforms['win32-x64'];
await writeFile('plugins/airo/scripts/connect.ps1',`$ErrorActionPreference = 'Stop'
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') { throw '이 Windows 패키지는 x64용입니다.' }
$airoCache = Join-Path $env:USERPROFILE '.airo/runtime/${version}-win32-x64'
New-Item -ItemType Directory -Force -Path $airoCache | Out-Null
function Get-VerifiedArchive($Path, $Url, $Hash) {
  if (!(Test-Path -LiteralPath $Path) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() -ne $Hash) {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile "$Path.part"
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath "$Path.part").Hash.ToLowerInvariant() -ne $Hash) { Remove-Item -LiteralPath "$Path.part"; throw '설치 파일 검증 실패' }
    Move-Item -Force -LiteralPath "$Path.part" -Destination $Path
  }
}
Get-VerifiedArchive (Join-Path $airoCache 'bridge.tar.gz') '${win.bridgeUrl}' '${win.bridgeSha256}'
Get-VerifiedArchive (Join-Path $airoCache 'codex.tar.gz') '${win.codexUrl}' '${win.codexSha256}'
tar -xzf (Join-Path $airoCache 'bridge.tar.gz') -C $airoCache
if ($LASTEXITCODE -ne 0) { throw '설치 파일을 열지 못했습니다.' }
tar -xzf (Join-Path $airoCache 'codex.tar.gz') -C $airoCache
if ($LASTEXITCODE -ne 0) { throw 'Codex 실행 파일을 열지 못했습니다.' }
& (Join-Path $airoCache 'airo-codex.exe') --start --codex (Join-Path $airoCache '${win.codexPath}')
if ($LASTEXITCODE -ne 0) { throw 'Codex 연결을 시작하지 못했습니다.' }
`);
console.log('Verified bridge installers built for',Object.keys(manifest.platforms).join(', '));

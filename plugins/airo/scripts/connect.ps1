$ErrorActionPreference = 'Stop'
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') { throw '이 Windows 패키지는 x64용입니다.' }
$airoCache = Join-Path $env:USERPROFILE '.airo/runtime/0.2.0-win32-x64'
New-Item -ItemType Directory -Force -Path $airoCache | Out-Null
function Get-VerifiedArchive($Path, $Url, $Hash) {
  if (!(Test-Path -LiteralPath $Path) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() -ne $Hash) {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile "$Path.part"
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath "$Path.part").Hash.ToLowerInvariant() -ne $Hash) { Remove-Item -LiteralPath "$Path.part"; throw '설치 파일 검증 실패' }
    Move-Item -Force -LiteralPath "$Path.part" -Destination $Path
  }
}
Get-VerifiedArchive (Join-Path $airoCache 'bridge.tar.gz') 'https://airo.dev-heptivision.com/downloads/airo-codex-0.2.0-win32-x64.tar.gz' '4c7f0f9c69a369286898c757e6573521125d3ae406c272f24988a459d3b09021'
Get-VerifiedArchive (Join-Path $airoCache 'codex.tar.gz') 'https://registry.npmjs.org/@openai/codex/-/codex-0.154.0-win32-x64.tgz' '27eedae55e37ed1da4078b36a6ef9e4ffe8546a60fd6df5ee6408fdd16aff8ea'
tar -xzf (Join-Path $airoCache 'bridge.tar.gz') -C $airoCache
if ($LASTEXITCODE -ne 0) { throw '설치 파일을 열지 못했습니다.' }
tar -xzf (Join-Path $airoCache 'codex.tar.gz') -C $airoCache
if ($LASTEXITCODE -ne 0) { throw 'Codex 실행 파일을 열지 못했습니다.' }
& (Join-Path $airoCache 'airo-codex.exe') --start --codex (Join-Path $airoCache 'package/vendor/x86_64-pc-windows-msvc/bin/codex.exe')
if ($LASTEXITCODE -ne 0) { throw 'Codex 연결을 시작하지 못했습니다.' }

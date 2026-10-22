$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid manifest version' }
$files = @('manifest.json', 'background.js', 'content.js', 'posts.js', 'page-bridge.js', 'popup.html', 'popup.js', 'README.md', 'PRIVACY.md', 'CHANGELOG.md')
$files += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'icons') -File | ForEach-Object { 'icons/' + $_.Name }
$files += 'assets/logo.svg'
foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $file) -PathType Leaf)) { throw "Missing package file: $file" }
}
foreach ($script in @('background.js', 'content.js', 'posts.js', 'page-bridge.js', 'popup.js')) {
  & node --check (Join-Path $projectRoot $script)
  if ($LASTEXITCODE -ne 0) { throw "Syntax error: $script" }
}
$releaseDir = Join-Path $projectRoot 'release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$destination = Join-Path $releaseDir "X-Chat-Translator-$version.zip"
if (Test-Path -LiteralPath $destination) { throw "Package already exists: $destination" }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($destination, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $projectRoot $file), $file, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose() }
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$destination.sha256", "$hash  $([IO.Path]::GetFileName($destination))`n")
Write-Output "$destination`nSHA256: $hash"

param(
  [Parameter(Mandatory = $true)]
  [string]$Installer
)

$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path $Installer).Path
$before = Get-Date
Start-Process -FilePath $installerPath -ArgumentList '/S' -Wait

$searchRoots = @(
  (Join-Path $env:LOCALAPPDATA 'Programs'),
  $env:ProgramFiles,
  ${env:ProgramFiles(x86)}
) | Where-Object { $_ -and (Test-Path $_) }

$app = $searchRoots |
  ForEach-Object { Get-ChildItem $_ -Recurse -File -ErrorAction SilentlyContinue } |
  Where-Object { $_.Name -in @('Bandi.exe', 'bandi-desktop.exe') -and $_.LastWriteTime -ge $before.AddMinutes(-1) } |
  Select-Object -First 1
if (-not $app) { throw '安装完成后未找到 Bandi 可执行文件' }

$process = Start-Process -FilePath $app.FullName -PassThru
Start-Sleep -Seconds 8
if ($process.HasExited) { throw "安装后的 Bandi 启动失败，退出码 $($process.ExitCode)" }
Stop-Process -Id $process.Id -Force
$process.WaitForExit()

$dataRoot = Join-Path $env:APPDATA 'com.bandi.desktop'
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$marker = Join-Path $dataRoot 'installer-smoke.marker'
Set-Content -Path $marker -Value 'preserve-user-data'

$uninstaller = Get-ChildItem $app.Directory.FullName -Filter 'uninstall*.exe' -File | Select-Object -First 1
if (-not $uninstaller) { throw '未找到 NSIS 卸载程序' }
Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait
if (Test-Path $app.FullName) { throw '卸载后应用本体仍然存在' }
if (-not (Test-Path $marker)) { throw '卸载不应删除 Bandi 用户数据' }

Write-Host "Windows installer smoke passed: $($app.FullName)"

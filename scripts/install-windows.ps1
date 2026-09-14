# Windows 용 claude-fleet 자동 시작 설치 스크립트 (macOS 의 install-macos.sh 에 대응)
# - .fleet-token 이 있으면 허브를, fleet-agent.config.json 이 있으면 에이전트를
#   작업 스케줄러(로그온 시 자동 시작 + 죽으면 1분 뒤 재시작)에 등록하고 바로 시작한다.
# 사용:  npm run setup 을 먼저 마친 뒤
#        powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
# 해제:  powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 uninstall
# 상태:  Get-ScheduledTask -TaskName 'ClaudeFleet*' | Get-ScheduledTaskInfo
param([string]$Mode = 'install')
$ErrorActionPreference = 'Stop'

$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Repo
New-Item -ItemType Directory -Force -Path (Join-Path $Repo 'logs') | Out-Null

$Node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $Node) { Write-Error 'node.exe 를 찾을 수 없습니다. Node.js 18+ 를 설치하세요: https://nodejs.org'; exit 1 }

$HubTask   = 'ClaudeFleetHub'
$AgentTask = 'ClaudeFleetAgent'

$HubScript   = Join-Path $Repo 'server\server.js'
$AgentScript = Join-Path $Repo 'agent\agent.js'

function Remove-One($name, $script) {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "해제: $name"
  }
  # 작업을 멈춰도 powershell 래퍼만 죽고 자식 node 는 남아 포트(8787)를 계속 잡는다 → 직접 정리
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*$script*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "종료: 남아 있던 node (PID $($_.ProcessId))" }
}

if ($Mode -eq 'uninstall') {
  Remove-One $HubTask $HubScript
  Remove-One $AgentTask $AgentScript
  Write-Host '자동 시작 등록을 해제했습니다.'
  exit 0
}

function Register-One($name, $script, $log) {
  # 창 없이 node 를 띄우고 출력은 logs\*.log 에 이어 쓴다
  # (Windows PowerShell 5.1 의 *>> 는 UTF-16 으로 기록해 로그가 깨지므로 UTF-8 로 명시)
  $cmd = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; & '$Node' '$script' 2>&1 | Out-File -FilePath '$log' -Append -Encoding utf8"
  $action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
             -Argument "-NoProfile -WindowStyle Hidden -Command `"$cmd`"" -WorkingDirectory $Repo
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
              -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable `
              -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Remove-One $name $script
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
    -Description 'claude-fleet 자동 시작 (scripts/install-windows.ps1)' | Out-Null
  Start-ScheduledTask -TaskName $name
  Write-Host "등록 완료: $name  (로그: logs\$(Split-Path $log -Leaf))"
}

$installed = $false
if (Test-Path (Join-Path $Repo '.fleet-token')) {
  Register-One $HubTask $HubScript (Join-Path $Repo 'logs\hub.log')
  $installed = $true
}
if (Test-Path (Join-Path $Repo 'fleet-agent.config.json')) {
  Register-One $AgentTask $AgentScript (Join-Path $Repo 'logs\agent.log')
  $installed = $true
}

if (-not $installed) {
  Write-Host '설정 파일이 없습니다. 먼저 npm run setup 을 실행하세요.'
  Write-Host '  (허브: .fleet-token 생성 / 에이전트: fleet-agent.config.json 생성)'
  exit 1
}

Write-Host ''
Write-Host '완료! 이제 로그온하면 자동으로 시작되고, 프로세스가 죽어도 1분 뒤 재시작됩니다.'
Write-Host "상태 확인:  Get-ScheduledTask -TaskName 'ClaudeFleet*' | Get-ScheduledTaskInfo"
Write-Host ''
Write-Host '⚠ 노트북이 잠들면 허브도 멈춥니다. 설정 → 시스템 → 전원에서 "전원 연결 시 절전 모드: 안 함" 으로 두세요.'
Write-Host '📱 폰·외부 접속 주소:  npm run tunnel -- --tailscale   (Tailscale Funnel, 한 번 켜면 재부팅 후에도 유지)'

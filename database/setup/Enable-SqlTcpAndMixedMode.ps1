<#
.SYNOPSIS
  Phase 4a (manual, elevated): enable TCP/IP on loopback only and switch SQL Server
  to Mixed Mode so the Node.js `mssql` driver can connect as mh02_app.

.DESCRIPTION
  MUST be run by you in an elevated (Run as administrator) PowerShell. Claude's
  session is not elevated and does not run this script.

  Changes (registry of the default instance MSSQL17.MSSQLSERVER):
    - MSSQLServer\LoginMode               = 2   (Mixed Mode; 1 = Windows only today)
    - SuperSocketNetLib\Tcp\Enabled       = 1
    - SuperSocketNetLib\Tcp\ListenOnAllIPs= 0   (listen only on addresses enabled below)
    - Tcp\IPn Enabled = 1 ONLY for 127.0.0.1 and ::1, 0 for every other address
    - Tcp\IPAll TcpPort = 1433, TcpDynamicPorts = ''
  Named Pipes and Shared Memory are left as they are. Nothing is exposed to the
  network: with ListenOnAllIPs=0 and only loopback enabled, port 1433 is reachable
  from this computer only, and no firewall rule is created or needed.

  Dry run by default: it prints current and target values and changes nothing.
    -Apply     writes the registry values (after saving a backup file).
    -Restart   restarts the SQL Server service (required for the changes to take
               effect; it disconnects every session, so close SSMS first).
    -Rollback  restores the values saved by a previous -Apply (path of the backup file).

.EXAMPLE
  powershell -File database\setup\Enable-SqlTcpAndMixedMode.ps1                # dry run
  powershell -File database\setup\Enable-SqlTcpAndMixedMode.ps1 -Apply -Restart
#>
[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Restart,
    [string]$Rollback
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (($Apply -or $Restart -or $Rollback) -and -not $isAdmin) {
    throw 'Run this in an elevated PowerShell (Run as administrator).'
}

$instanceId = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL').MSSQLSERVER
if (-not $instanceId) { throw 'Default instance MSSQLSERVER was not found.' }
$serverKey = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceId\MSSQLServer"
$tcpKey = "$serverKey\SuperSocketNetLib\Tcp"
$loopback = @('127.0.0.1', '::1')

# --- rollback -------------------------------------------------------------------
if ($Rollback) {
    $saved = Get-Content $Rollback -Raw | ConvertFrom-Json
    foreach ($item in $saved) { Set-ItemProperty -Path $item.Path -Name $item.Name -Value $item.Value }
    Write-Host "Restored $($saved.Count) registry values from $Rollback. Restart the SQL Server service to take effect."
    return
}

# --- plan ---------------------------------------------------------------------------
$plan = New-Object System.Collections.Generic.List[object]
function Add-Plan([string]$Path, [string]$Name, $Target, [string]$Type = 'DWord') {
    $current = (Get-ItemProperty -Path $Path -Name $Name -ErrorAction SilentlyContinue).$Name
    $plan.Add([pscustomobject]@{ Path = $Path; Name = $Name; Value = $current; Target = $Target; Type = $Type })
}
Add-Plan $serverKey 'LoginMode' 2
Add-Plan $tcpKey 'Enabled' 1
Add-Plan $tcpKey 'ListenOnAllIPs' 0
foreach ($k in Get-ChildItem $tcpKey | Where-Object { $_.PSChildName -like 'IP*' -and $_.PSChildName -ne 'IPAll' }) {
    $addr = (Get-ItemProperty $k.PSPath).IpAddress
    Add-Plan $k.PSPath 'Enabled' $(if ($loopback -contains $addr) { 1 } else { 0 })
}
Add-Plan "$tcpKey\IPAll" 'TcpPort' '1433' 'String'
Add-Plan "$tcpKey\IPAll" 'TcpDynamicPorts' '' 'String'

Write-Host "Instance: $instanceId   (admin: $isAdmin)"
foreach ($p in $plan) {
    $mark = if ("$($p.Value)" -eq "$($p.Target)") { 'ok   ' } else { 'CHANGE' }
    Write-Host ("  {0}  {1}\{2}: {3} -> {4}" -f $mark, ($p.Path -replace '^.*Microsoft SQL Server\\MSSQL\d+\.MSSQLSERVER\\', ''), $p.Name, $p.Value, $p.Target)
}

if (-not $Apply) {
    Write-Host 'DRY RUN: nothing was changed. Re-run with -Apply (and -Restart).'
    return
}

# --- backup + apply ---------------------------------------------------------------
$backup = Join-Path $PSScriptRoot ("sql-network-backup-{0:yyyyMMdd-HHmmss}.json" -f (Get-Date))
$plan | Select-Object Path, Name, Value | ConvertTo-Json | Set-Content -Path $backup -Encoding UTF8
Write-Host "Backup of previous values: $backup  (restore with -Rollback '<file>')"
foreach ($p in $plan) {
    Set-ItemProperty -Path $p.Path -Name $p.Name -Value $p.Target -Type $p.Type
}
Write-Host 'Registry values written.'

if ($Restart) {
    Write-Host 'Restarting MSSQLSERVER (all sessions are disconnected) ...'
    Restart-Service -Name MSSQLSERVER -Force
    Start-Sleep -Seconds 5
    Get-Service MSSQLSERVER | Format-Table Name, Status -AutoSize | Out-String | Write-Host
    $listening = Get-NetTCPConnection -LocalPort 1433 -State Listen -ErrorAction SilentlyContinue
    if ($listening) {
        Write-Host ('Listening on: ' + (($listening | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ', '))
        if ($listening | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }) {
            Write-Warning 'Port 1433 is listening on a non-loopback address. Review the Tcp settings.'
        }
    } else {
        Write-Warning 'Nothing is listening on 1433 yet. Check the SQL Server error log.'
    }
} else {
    Write-Host 'Changes take effect only after the SQL Server service restarts (use -Restart, or restart it yourself).'
}

<#
.SYNOPSIS
  Phase 4a: create the least-privilege application login/user and the local
  .env.local, without ever showing the password.

.DESCRIPTION
  - Runs P4A_01_create_app_login.sql with sqlcmd using Windows Authentication
    (you must be a SQL Server sysadmin; Windows administrator rights are NOT needed).
  - The password is generated here (cryptographically random, 32 characters, only
    characters that are safe for sqlcmd and T-SQL), is passed to sqlcmd through an
    environment variable (never the command line), and is written only to
    .env.local (restricted to the current Windows user). It is never printed.
  - If .env.local already contains DB_PASSWORD it is reused, so the file and the
    login always agree. -RotatePassword generates a new one and updates both.
  - Dry run unless -Apply is given.

.EXAMPLE
  powershell -File database\setup\Initialize-AppLogin.ps1            # dry run
  powershell -File database\setup\Initialize-AppLogin.ps1 -Apply
#>
[CmdletBinding()]
param(
    [string]$SqlServer = 'localhost',
    [string]$EnvFile = '',
    [switch]$RotatePassword,
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
# ($PSScriptRoot is not reliable inside param() defaults on Windows PowerShell 5.1.)
if ([string]::IsNullOrEmpty($EnvFile)) {
    $EnvFile = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) '.env.local'
}
$sqlScript = Join-Path $PSScriptRoot 'P4A_01_create_app_login.sql'
if (-not (Test-Path $sqlScript)) { throw "Missing $sqlScript" }
if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) { throw 'sqlcmd was not found on PATH.' }

function New-AppPassword {
    # Letters and digits plus a few symbols that are safe in sqlcmd, T-SQL and .env files
    # (no quote, $, %, #, backtick, backslash or space).
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_.!*+='
    $bytes = New-Object 'byte[]' 40
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $chars = foreach ($b in $bytes[0..31]) { $alphabet[$b % $alphabet.Length] }
    # Guarantee all character classes so CHECK_POLICY (complexity) is satisfied.
    $pw = -join $chars
    return ('Aa9-' + $pw.Substring(4))
}

function Get-EnvValue([string]$Path, [string]$Key) {
    if (-not (Test-Path $Path)) { return $null }
    foreach ($line in Get-Content $Path) {
        if ($line -match "^\s*$Key\s*=(.*)$") { return $Matches[1].Trim() }
    }
    return $null
}

$existing = Get-EnvValue $EnvFile 'DB_PASSWORD'
$password = $existing
$generated = $false
if ([string]::IsNullOrEmpty($password) -or $RotatePassword) {
    $password = New-AppPassword
    $generated = $true
}

Write-Host "SQL Server        : $SqlServer"
Write-Host "Env file          : $EnvFile"
Write-Host ("Password          : " + $(if ($generated) { 'will be generated' } else { 'reuse DB_PASSWORD from the env file' }) + ' (never printed)')
Write-Host ("Rotate existing   : " + $RotatePassword.IsPresent)

if (-not $Apply) {
    Write-Host 'DRY RUN: nothing was changed. Re-run with -Apply.'
    return
}

$env:MH02_APP_PASSWORD = $password
$env:MH02_ROTATE = $(if ($RotatePassword) { '1' } else { '0' })
try {
    $output = & sqlcmd -S $SqlServer -E -C -b -i $sqlScript 2>&1
    if ($LASTEXITCODE -ne 0) {
        # Output never contains the password (sqlcmd does not echo scripts).
        throw ("sqlcmd failed:`n" + ($output -join "`n"))
    }
    $output | ForEach-Object { Write-Host "  $_" }
}
finally {
    Remove-Item Env:\MH02_APP_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\MH02_ROTATE -ErrorAction SilentlyContinue
}

# --- write / update .env.local -------------------------------------------------
if (-not (Test-Path $EnvFile)) {
    $template = @(
        '# MH02 local development configuration. NEVER commit this file. Server-side only:',
        '# no NEXT_PUBLIC_ prefix, so nothing here is ever sent to the browser.',
        'DB_SERVER=127.0.0.1',
        'DB_PORT=1433',
        'DB_NAME=db_asset_report',
        'DB_USER=mh02_app',
        'DB_PASSWORD=',
        'DB_ENCRYPT=true',
        '# Local development uses a self-signed certificate. Set to false on a server with a trusted certificate.',
        'DB_TRUST_SERVER_CERTIFICATE=true',
        '',
        '# Photo settings (design decision P4); the storage root is an assumption for local development.',
        'PHOTO_STORAGE_ROOT=./.storage/photos',
        'PHOTO_MAX_BYTES=10485760',
        'PHOTO_QUARANTINE_DAYS=90',
        '',
        'MH02_ENV=development'
    )
    Set-Content -Path $EnvFile -Value $template -Encoding UTF8
}
$lines = Get-Content $EnvFile
$found = $false
$lines = $lines | ForEach-Object {
    if ($_ -match '^\s*DB_PASSWORD\s*=') { $found = $true; "DB_PASSWORD=$password" } else { $_ }
}
if (-not $found) { $lines += "DB_PASSWORD=$password" }
Set-Content -Path $EnvFile -Value $lines -Encoding UTF8
# Restrict the file to the current user.
& icacls $EnvFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

Write-Host "Done. DB_PASSWORD is stored in $EnvFile (not shown here)."
Write-Host 'Next: follow database/setup/PHASE4A_GUIDE.md (TCP/IP + Mixed Mode need an elevated PowerShell).'

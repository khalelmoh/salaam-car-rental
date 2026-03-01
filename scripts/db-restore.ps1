param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

pg_restore --clean --if-exists --no-owner --no-privileges `
  -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE `
  $BackupFile

if ($LASTEXITCODE -ne 0) {
  throw "Restore failed."
}

Write-Host "Restore completed from: $BackupFile"

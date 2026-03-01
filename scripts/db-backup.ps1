param(
  [string]$OutDir = "backups"
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$file = Join-Path $OutDir "salaam-$timestamp.dump"
pg_dump -F c -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE -f $file
if ($LASTEXITCODE -ne 0) {
  throw "Backup failed."
}

Write-Host "Backup created: $file"

param(
  [switch]$Production
)

$userPgPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'User')
if (-not $userPgPassword) {
  throw "PGPASSWORD is not set in user environment. Set it with: [Environment]::SetEnvironmentVariable('PGPASSWORD','your_password','User')"
}

$env:PGPASSWORD = $userPgPassword
if ($Production) {
  $env:NODE_ENV = 'production'
}

node --env-file=.env backend/server/main.js

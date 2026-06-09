# Dot-source self-heal secrets into the current session (local + optional Render sync source).
$secretsFile = Join-Path (Join-Path $PSScriptRoot '..') '.cursor/self-heal-secrets.env'
if (-not (Test-Path $secretsFile)) {
  return
}

Get-Content $secretsFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  $eq = $line.IndexOf('=')
  if ($eq -lt 1) { return }
  $key = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim()
  if ($key) { Set-Item -Path "env:$key" -Value $value }
}

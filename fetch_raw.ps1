param(
  [string]$BaseUrl = "https://YOUR_API_BASE_URL",
  [string]$ApiKey  = "YOUR_API_KEY",
  [int]$Limit = 5,
  [int]$Offset = 0,
  [string]$OutFile = "raw.json"
)

$url = "$BaseUrl/v1/topics/export?limit=$Limit&offset=$Offset"

$response = Invoke-WebRequest -Uri $url -Headers @{ "x-api-key" = $ApiKey } -Method GET
$response.Content | Set-Content -Encoding utf8 $OutFile

Write-Host "Saved raw response to $OutFile"

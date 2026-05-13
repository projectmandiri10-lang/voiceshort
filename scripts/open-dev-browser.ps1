param(
  [string]$Url = "http://localhost:5174",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 5174,
  [int]$TimeoutSeconds = 45
)

function Test-PortOpen {
  param(
    [string]$TargetHost,
    [int]$TargetPort
  )

  $client = New-Object System.Net.Sockets.TcpClient
  $asyncResult = $null
  try {
    $asyncResult = $client.BeginConnect($TargetHost, $TargetPort, $null, $null)
    if (-not $asyncResult.AsyncWaitHandle.WaitOne(250)) {
      return $false
    }

    $client.EndConnect($asyncResult)
    return $true
  } catch {
    return $false
  } finally {
    if ($asyncResult -ne $null) {
      $asyncResult.AsyncWaitHandle.Close()
    }
    $client.Close()
  }
}

function Start-ChromeOrDefault {
  param([string]$TargetUrl)

  $chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )

  foreach ($chromePath in $chromeCandidates) {
    if ($chromePath -and (Test-Path $chromePath)) {
      Start-Process -FilePath $chromePath -ArgumentList @("--new-window", $TargetUrl)
      return
    }
  }

  try {
    Start-Process -FilePath "chrome.exe" -ArgumentList @("--new-window", $TargetUrl)
  } catch {
    Start-Process $TargetUrl
  }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  if (Test-PortOpen -TargetHost $HostName -TargetPort $Port) {
    Start-ChromeOrDefault -TargetUrl $Url
    exit 0
  }
  Start-Sleep -Milliseconds 250
}

Start-ChromeOrDefault -TargetUrl $Url

$ErrorActionPreference = 'Stop'
$chrome = $env:POCHI_LOCAL_CHROME_PATH
if (-not $chrome) { $chrome = 'chrome.exe' }
Start-Process -FilePath $chrome -ArgumentList "--profile-directory=Default $env:POCHI_LOCAL_CHROME_START_PARAMS"

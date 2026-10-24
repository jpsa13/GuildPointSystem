param([Parameter(Mandatory=$true)][string]$ClientPath)
$ErrorActionPreference='Stop'
$exe=Join-Path ([IO.Path]::GetFullPath($ClientPath)) 'RF_Online_4gb.bin'
$matchesClient=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'RF_Online_4gb.bin' -and $_.ExecutablePath -eq $exe })
if($matchesClient.Count -ne 1){throw 'Abra exatamente um cliente Stage Era 4 GB nessa pasta.'}
$secure=Read-Host 'Token de pareamento criado na secao Quests do site local' -AsSecureString
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$previous=$env:QUEST_MONITOR_TOKEN
try {
    $env:QUEST_MONITOR_TOKEN=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    & python (Join-Path $PSScriptRoot 'tools/monitor_site.py') --pid $matchesClient[0].ProcessId --client $exe
    if($LASTEXITCODE){throw 'Monitor encerrado com erro; preserve a fila em outputs e confira o pareamento.'}
} finally {
    $env:QUEST_MONITOR_TOKEN=$previous
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

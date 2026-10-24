param([Parameter(Mandatory=$true)][string]$ClientExecutable)
$ErrorActionPreference='Stop'
$testRepo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$testBundle=Join-Path $testRepo 'app/rf-ui-portatil'
$testScratch=Join-Path $testRepo ('outputs/portable-test-'+[Guid]::NewGuid().ToString('N'))
$testClient=Join-Path $testScratch 'game'
New-Item -ItemType Directory -Path $testClient -Force | Out-Null
$testExe=Join-Path $testClient 'RF_Online_4gb.bin'
function Assert-Test([bool]$condition,[string]$message) { if(-not $condition){throw $message} }
function Expect-Rejection([scriptblock]$action,[string]$expected) {
    $testCaught=$false
    try { & $action } catch {
        $testCaught=$true
        if($_.Exception.Message -notlike "*$expected*"){throw}
    }
    Assert-Test $testCaught "Expected refusal: $expected"
}
# Use only a disposable folder; never install into the supplied client directory.
Set-Content -LiteralPath $testExe -Value 'incompatible fixture'
Expect-Rejection { & "$testBundle/Instalar.ps1" -ClientPath $testClient } 'Cliente incompativel'
Assert-Test (-not (Test-Path "$testClient/dinput8.dll")) 'Incompatible client was changed'
Assert-Test ((Get-FileHash -LiteralPath $ClientExecutable).Hash -eq '8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379') 'Test requires known client build'
Copy-Item -LiteralPath $ClientExecutable -Destination $testExe -Force
$testOriginalClientHash=(Get-FileHash -LiteralPath $ClientExecutable).Hash
& "$testBundle/Instalar.ps1" -ClientPath $testClient -ValidateOnly
Assert-Test (-not (Test-Path "$testClient/dinput8.dll")) 'ValidateOnly installed files'
$testTampered=Join-Path $testScratch 'tampered-package'
New-Item -ItemType Directory -Path "$testTampered/payload" -Force | Out-Null
foreach($testFile in @('Instalar.ps1','manifest.json')) { Copy-Item -LiteralPath "$testBundle/$testFile" -Destination "$testTampered/$testFile" }
Get-ChildItem -LiteralPath "$testBundle/payload" -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination "$testTampered/payload/$($_.Name)" }
Set-Content -LiteralPath "$testTampered/payload/dinput8.dll" -Value 'corrupted package fixture'
Expect-Rejection { & "$testTampered/Instalar.ps1" -ClientPath $testClient -ValidateOnly } 'Pacote corrompido'
Set-Content -LiteralPath "$testClient/version.dll" -Value 'other mod'
$testConflictHash=(Get-FileHash "$testClient/version.dll").Hash
Expect-Rejection { & "$testBundle/Instalar.ps1" -ClientPath $testClient } 'Outra versao/mod'
Assert-Test ((Get-FileHash "$testClient/version.dll").Hash -eq $testConflictHash) 'Unknown mod overwritten'
Remove-Item -LiteralPath "$testClient/version.dll"
# Test rollback by failing exactly one payload copy, without touching the real client.
function Copy-Item {
    param([string]$LiteralPath,[string]$Destination,[switch]$Force)
    if([IO.Path]::GetFileName($LiteralPath) -eq 'version.dll' -and (Split-Path $LiteralPath -Parent) -like '*payload') {
        throw 'SIMULATED_COPY_FAILURE'
    }
    Microsoft.PowerShell.Management\Copy-Item -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
}
Expect-Rejection { & "$testBundle/Instalar.ps1" -ClientPath $testClient } 'SIMULATED_COPY_FAILURE'
Assert-Test (-not (Test-Path "$testClient/dinput8.dll")) 'Partial installation survived rollback'
Assert-Test (-not (Test-Path "$testClient/version.dll")) 'Failed payload survived rollback'
Remove-Item Function:\Copy-Item
Set-Content -LiteralPath "$testClient/rf-ui.ini" -Value '[personal settings]'
Set-Content -LiteralPath "$testClient/CerberusBags.ini" -Value '[Bags] user settings'
$testRfIniHash=(Get-FileHash "$testClient/rf-ui.ini").Hash
$testBagsIniHash=(Get-FileHash "$testClient/CerberusBags.ini").Hash
& "$testBundle/Instalar.ps1" -ClientPath $testClient
Assert-Test ((Get-FileHash "$testClient/rf-ui.ini").Hash -eq $testRfIniHash) 'rf-ui settings overwritten'
Assert-Test ((Get-FileHash "$testClient/CerberusBags.ini").Hash -eq $testBagsIniHash) 'Bags settings overwritten'
foreach($testDll in @('dinput8.dll','version.dll')) {
    Assert-Test ((Get-FileHash "$testClient/$testDll").Hash -eq (Get-FileHash "$testBundle/payload/$testDll").Hash) 'Installed DLL hash mismatch'
}
& "$testBundle/Instalar.ps1" -ClientPath $testClient
Assert-Test ((Get-FileHash -LiteralPath $ClientExecutable).Hash -eq $testOriginalClientHash) 'Original executable changed'
Write-Output 'PASS: incompatible build, validation-only, corrupted payload, unknown proxy, rollback, successful install, repeat install and INI preservation.'
Write-Output "Test fixture preserved outside the ZIP: $testScratch"

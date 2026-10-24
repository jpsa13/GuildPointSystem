$ErrorActionPreference='Stop'
$fs=New-Object -ComObject Scripting.FileSystemObject
$compiler=$fs.GetFile([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../outputs/bagnon-tools/w64devkit/bin/g++.exe'))).ShortPath
New-Item -ItemType Directory -Path "$PSScriptRoot/build","$PSScriptRoot/package" -Force | Out-Null
$oldTemp=$env:TEMP; $oldTmp=$env:TMP
Push-Location -LiteralPath $PSScriptRoot
try {
    $env:TEMP=$fs.GetFolder("$PSScriptRoot/build").ShortPath; $env:TMP=$env:TEMP
    $flags=@('-m32','-std=c++17','-O2','-Wall','-Wextra','-static-libgcc','-static-libstdc++')
    & $compiler @flags tests/test_reader.cpp -o build/test_reader.exe
    if($LASTEXITCODE){throw 'Reader test compilation failed'}
    & ./build/test_reader.exe
    if($LASTEXITCODE){throw 'Reader tests failed'}
    & $compiler @flags -municode src/monitor.cpp -ladvapi32 -o package/CerberusQuests.exe
    if($LASTEXITCODE){throw 'Monitor compilation failed'}
    & ./package/CerberusQuests.exe --self-test
    if($LASTEXITCODE){throw 'Memory access self-test failed'}
    $actual=(& ./package/CerberusQuests.exe --hash ./package/CerberusQuests.exe)
    $expected=(Get-FileHash ./package/CerberusQuests.exe -Algorithm SHA256).Hash.ToLowerInvariant()
    if($actual -ne $expected){throw 'Hash verification failed'}
    Write-Output "PASS: compiler, reader, guarded memory and SHA256. Candidate SHA256=$actual"
} finally {
    Pop-Location; $env:TEMP=$oldTemp; $env:TMP=$oldTmp
}

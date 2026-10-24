[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ClientPath,
    [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
$client = (Get-Item -LiteralPath $ClientPath -ErrorAction Stop).FullName
if (-not (Test-Path -LiteralPath $client -PathType Container)) { throw 'Informe a pasta do cliente.' }
$client = [IO.Path]::GetFullPath($client).TrimEnd('\')
$payload = Join-Path $PSScriptRoot 'payload'
$names = @('dinput8.dll','version.dll','rf-ui.ini','CerberusBags.ini')
$expectedClient = '8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379'
$exe = Join-Path $client 'RF_Online_4gb.bin'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf) -or
    (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne $expectedClient) {
    throw 'Cliente incompativel: exige o RF_Online_4gb.bin Stage Era validado. Nenhum arquivo foi alterado.'
}
function Assert-Closed {
    $prefix = $client + '\'
    foreach ($process in Get-Process) {
        $path = $null
        try { $path = $process.Path } catch {}
        if ($path -and $path.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) {
            throw "Feche o jogo, launcher e outros processos da pasta do cliente: $($process.ProcessName)."
        }
        if (-not $path -and $process.ProcessName -match '^(RF_Online|RFOnline|RFOClient|RFLauncher|CERBERUS-GAMES)') {
            throw 'Nao foi possivel verificar um processo do jogo. Feche o jogo e launcher antes de instalar.'
        }
    }
}
Assert-Closed
$manifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') | ConvertFrom-Json
if ($manifest.Count -ne $names.Count) { throw 'Manifesto incompleto.' }
foreach ($name in $names) {
    $entry = @($manifest | Where-Object { $_.file -ceq $name })
    if ($entry.Count -ne 1 -or $entry[0].sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw "Entrada invalida: $name" }
    $source = Join-Path $payload $name
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $entry[0].sha256) { throw "Pacote corrompido: $name" }
    $target = Join-Path $client $name
    if (Test-Path -LiteralPath $target) {
        $item = Get-Item -LiteralPath $target -Force
        if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Destino invalido: $name" }
        if ($name -like '*.dll' -and (Get-FileHash -LiteralPath $target).Hash -ne $entry[0].sha256) {
            throw "Outra versao/mod usa $name. Resolva o conflito antes de instalar; nada foi substituido."
        }
    }
}
foreach ($name in @('d3d9.dll','winmm.dll','dsound.dll','Bagnon.dll','Bagnon-2.dll','Bagnon-3.dll','Bagnon-4.dll','Bagnon-5.dll')) {
    if (Test-Path -LiteralPath (Join-Path $client $name)) { throw "Outro proxy/mod encontrado: $name. Resolva o conflito antes de instalar." }
}
if ($ValidateOnly) { Write-Output 'PASS: pacote, cliente e conflitos verificados. Nenhum arquivo foi alterado.'; return }
$backup = Join-Path $PSScriptRoot ('backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup | Out-Null
$saved = @()
foreach ($name in $names) {
    $path = Join-Path $client $name
    if (Test-Path -LiteralPath $path) {
        $hash = (Get-FileHash -LiteralPath $path).Hash
        Copy-Item -LiteralPath $path -Destination (Join-Path $backup $name)
        if ((Get-FileHash -LiteralPath (Join-Path $backup $name)).Hash -ne $hash) { throw "Backup nao confere: $name" }
        $saved += [pscustomobject]@{file=$name;sha256=$hash}
    }
}
ConvertTo-Json -InputObject @($saved) | Set-Content -LiteralPath (Join-Path $backup 'backup-manifest.json') -Encoding UTF8
$written = @()
try {
    Assert-Closed
    foreach ($name in $names) {
        $target = Join-Path $client $name
        if ($name -like '*.ini' -and (Test-Path -LiteralPath $target)) { continue }
        $written += $name
        Copy-Item -LiteralPath (Join-Path $payload $name) -Destination $target -Force
        $expected = ($manifest | Where-Object file -eq $name).sha256
        if ((Get-FileHash -LiteralPath $target).Hash -ne $expected) { throw "Copia nao confere: $name" }
    }
} catch {
    foreach ($name in $written) {
        $target = Join-Path $client $name
        if (@($saved | Where-Object file -eq $name).Count -eq 1) {
            Copy-Item -LiteralPath (Join-Path $backup $name) -Destination $target -Force
        } elseif (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target
        }
    }
    throw
}
Write-Output "Instalado rf-ui 0.4.4 + CerberusBags 0.1.4. INIs existentes preservados. Backup: $backup"
Write-Output 'Ative RFOnline 4gb no launcher e abra o jogo normalmente. Este script nao inicia o jogo.'

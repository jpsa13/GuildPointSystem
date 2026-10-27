$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime='C:\Windows\Temp\guild-equipment-pr-validation'
$logs=Join-Path $PSScriptRoot 'evidencias/unification-20261026'
if(!(Get-NetTCPConnection -State Listen -LocalPort 15433 -ErrorAction SilentlyContinue)){throw 'Inicie o PostgreSQL local 15433 antes do site.'}
New-Item -ItemType Directory -Path $logs -Force | Out-Null
if(!(Get-NetTCPConnection -State Listen -LocalPort 18084 -ErrorAction SilentlyContinue)) {
    $privateConfig=Get-Content (Join-Path $runtime 'preparacao/application-isolado.yml')
    $credentials=@{}
    foreach($key in @('username','password','secret')) {
        $line=$privateConfig | Where-Object {$_ -match ('^\s+'+$key+':')} | Select-Object -First 1
        if(!$line){throw "Configuração privada incompleta: $key"}
        $credentials[$key]=(($line -split ':',2)[1].Trim().Trim('"').Trim("'"))
    }
    $source=Join-Path $repo 'backend/target/app-0.0.1-SNAPSHOT.jar'
    $work=Join-Path $runtime 'gearscore-pr-backend'
    $dest=Join-Path $work 'target/app-0.0.1-SNAPSHOT.jar'
    if(!(Test-Path -LiteralPath $source)){throw 'Compile o backend desta cópia antes de iniciar.'}
    if(Test-Path -LiteralPath $dest){Copy-Item -LiteralPath $dest -Destination ($dest+'.before-start') -Force}
    Copy-Item -LiteralPath $source -Destination $dest -Force
    if((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $dest).Hash){throw 'Falha ao copiar JAR'}
    $argsJava=@('-Djava.io.tmpdir=C:/Windows/Temp/guild-equipment-pr-validation','-Djdk.net.unixdomain.tmpdir=C:/Windows/Temp/guild-equipment-pr-validation/socket-tcp-only','-jar','target/app-0.0.1-SNAPSHOT.jar',
        '--spring.config.location=file:../preparacao/application-isolado.yml','--spring.config.import=','--spring.profiles.active=isolado,quests-local','--spring.profiles.include=',
        '--spring.datasource.url=jdbc:postgresql://127.0.0.1:15433/guild_gearscore_pr_test_20261025',"--spring.datasource.username=$($credentials.username)","--spring.datasource.password=$($credentials.password)",
        '--spring.flyway.url=jdbc:postgresql://127.0.0.1:15433/guild_gearscore_pr_test_20261025',"--spring.flyway.user=$($credentials.username)","--spring.flyway.password=$($credentials.password)",'--spring.flyway.locations=classpath:db/migration',
        '--server.address=127.0.0.1','--server.port=18084','--guild.discord.bot.token=','--guild.discord.bot.guild-id=',"--guild.jwt.secret=$($credentials.secret)",
        '--guild.cors.allowed-origins=http://127.0.0.1:15177','--guild.oauth.frontend-url=http://127.0.0.1:15177','--guild.upload.base-path=./target/roster-preview-uploads',
        '--guild.schedule.test-alert.enabled=false','--guild.quests.live-enabled=true','--guild.quests.simulation-enabled=false')
    $backend=Start-Process -FilePath (Join-Path $runtime 'jdk/bin/java.exe') -WindowStyle Hidden -PassThru -WorkingDirectory $work -ArgumentList $argsJava -RedirectStandardOutput (Join-Path $logs 'backend.log') -RedirectStandardError (Join-Path $logs 'backend.err.log')
    @{pid=$backend.Id;port=18084;frontend=15177;source='GuildPointSystem-gearscore-pr'} | ConvertTo-Json | Set-Content (Join-Path $logs 'processes.json')
    $credentials.Clear()
    $argsJava=$null
}
if(!(Get-NetTCPConnection -State Listen -LocalPort 15177 -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -WindowStyle Hidden -WorkingDirectory (Join-Path $repo 'frontend') -ArgumentList @('node_modules/vite/bin/vite.js','--config','vite.unified-local.config.ts') -RedirectStandardOutput (Join-Path $logs 'frontend.log') -RedirectStandardError (Join-Path $logs 'frontend.err.log')
}
Write-Output 'Site unificado: http://127.0.0.1:15177 — backend 18084. Confira os logs de inicialização.'

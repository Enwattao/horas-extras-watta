# instalar-iconos.ps1
# Ejecutar desde la carpeta del proyecto: .\instalar-iconos.ps1

$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$android = Join-Path $base "android\app\src\main\res"

if (-not (Test-Path $android)) {
    Write-Host "ERROR: Carpeta android no encontrada. Ejecuta primero 'npx cap add android'" -ForegroundColor Red
    exit 1
}

$iconos = @{
    "mipmap-mdpi"    = "mipmap-mdpi-ic_launcher.png"
    "mipmap-hdpi"    = "mipmap-hdpi-ic_launcher.png"
    "mipmap-xhdpi"   = "mipmap-xhdpi-ic_launcher.png"
    "mipmap-xxhdpi"  = "mipmap-xxhdpi-ic_launcher.png"
    "mipmap-xxxhdpi" = "mipmap-xxxhdpi-ic_launcher.png"
}

foreach ($carpeta in $iconos.Keys) {
    $src  = Join-Path $base "android-icons\$($iconos[$carpeta])"
    $dest = Join-Path $android "$carpeta\ic_launcher.png"
    $destRound = Join-Path $android "$carpeta\ic_launcher_round.png"

    New-Item -ItemType Directory -Force -Path (Join-Path $android $carpeta) | Out-Null

    if (Test-Path $src) {
        Copy-Item $src $dest -Force
        Copy-Item $src $destRound -Force
        Write-Host "OK: $carpeta" -ForegroundColor Green
    } else {
        Write-Host "AVISO: No encontrado $src" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Iconos instalados. Ahora en Android Studio:" -ForegroundColor Cyan
Write-Host "  Build -> Build APK(s)" -ForegroundColor White

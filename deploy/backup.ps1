# Respaldo de la base. Ejecutar desde la raíz del repo:  powershell -File deploy\backup.ps1
# Guarda un .sql.gz por día en C:\arriero-backups y conserva 14. Copia esa carpeta
# también a otro disco o a la nube: un respaldo en el mismo PC no protege del PC.
$dir = "C:\arriero-backups"
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir ("arriero-" + (Get-Date -Format "yyyy-MM-dd-HHmm") + ".sql.gz")
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml exec -T db sh -c "pg_dump -U postgres despacho | gzip" > $file
if ((Get-Item $file).Length -lt 1000) { Write-Error "El respaldo salió vacío"; exit 1 }
Get-ChildItem $dir -Filter "arriero-*.sql.gz" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item
Write-Host "Respaldo listo: $file"

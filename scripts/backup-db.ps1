# Sao lưu database PRODUCTION trước khi push migration (bước 0.5, bản Windows
# của scripts/backup-db.sh — không cần Docker, không cần Git Bash).
#
# Cách dùng (PowerShell, trong thư mục langnghe-web):
#   npm run backup:prod
# Script hỏi mật khẩu database production (không lưu lại), dump 3 schema
# public, auth, storage ra %USERPROFILE%\langnghe-backups\ rồi kiểm tra file.
#
# Cần pg_dump 17 (production chạy Postgres 17): cài "Command Line Tools" từ
# bộ cài PostgreSQL 17 của EnterpriseDB.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$ProjectRef = 'vgoymfnwimgypvmpozvf'
$PoolerHost = 'aws-0-ap-south-1.pooler.supabase.com'
$BackupDir = Join-Path $HOME 'langnghe-backups'

# Tìm pg_dump 17 trở lên trong C:\Program Files\PostgreSQL\<phiên bản>\bin.
$bin = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
  Where-Object { [int]($_.Name -replace '\D.*$', '') -ge 17 } |
  Sort-Object { [int]($_.Name -replace '\D.*$', '') } -Descending |
  Select-Object -First 1
if (-not $bin) {
  Write-Error 'Không tìm thấy PostgreSQL 17 trong C:\Program Files\PostgreSQL. Cài "Command Line Tools" của PostgreSQL 17 trước.'
}
$pgDump = Join-Path $bin.FullName 'bin\pg_dump.exe'
$pgRestore = Join-Path $bin.FullName 'bin\pg_restore.exe'

New-Item -ItemType Directory -Force $BackupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $BackupDir "langnghe-prod-$stamp.dump"

$secure = Read-Host "Mật khẩu database production ($ProjectRef)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  # Mật khẩu đi qua biến môi trường của riêng tiến trình này, không nằm trong
  # lệnh hay URL (nên không cần mã hoá ký tự đặc biệt).
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $url = "postgresql://postgres.$ProjectRef@${PoolerHost}:5432/postgres"

  Write-Host "Đang sao lưu production vào $out ..."
  & $pgDump $url --format=custom --no-owner --no-privileges `
    --schema=public --schema=auth --schema=storage --file=$out
  if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump lỗi (mã $LASTEXITCODE). File sao lưu không dùng được." }
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# Kiểm tra: file đọc được và có dữ liệu các bảng chính.
$list = & $pgRestore --list $out
if ($LASTEXITCODE -ne 0) { Write-Error 'pg_restore không đọc được file sao lưu.' }
$tables = ($list | Select-String 'TABLE DATA').Count
foreach ($t in 'public users', 'public products', 'public orders', 'auth users') {
  if (-not ($list | Select-String "TABLE DATA $t ")) { Write-Error "File sao lưu thiếu dữ liệu bảng $t." }
}

$sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 2)
Write-Host ''
Write-Host "Xong: $out"
Write-Host "Dung lượng: $sizeMb MB, dữ liệu của $tables bảng."
Write-Host 'Giữ file này ngoài repo; không gửi cho ai (có email và dữ liệu khách hàng).'

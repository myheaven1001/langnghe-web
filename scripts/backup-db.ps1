# Sao lưu DỮ LIỆU database trước khi push migration (bước 0.5, bản Windows).
#
# Cách dùng (chạy được từ C:\dev\b2b hoặc langnghe-web):
#   npm run backup:prod        sao lưu production
#   npm run backup:staging     sao lưu staging (để thử script)
#
# Xuất mọi bảng của schema public, auth, storage ra CSV trong
# %USERPROFILE%\langnghe-backups\langnghe-<môi trường>-<ngày giờ>\ bằng Node
# (scripts/backup-db.mjs). KHÔNG dùng pg_dump: Windows Smart App Control chặn
# pg_dump.exe/pg_restore.exe (libpq.dll không có chữ ký số, mã 0xC0E90002).
# Chỉ sao lưu dữ liệu; cấu trúc bảng dựng lại từ supabase/migrations/.
#
# Mật khẩu database: hỏi lần đầu rồi lưu mã hoá (scripts/db-password.ps1).
param(
  [ValidateSet('staging', 'production')] [string]$Target = 'production'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'db-password.ps1')

$info = $script:DbTargets[$Target]
$BackupDir = Join-Path $HOME 'langnghe-backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$short = if ($Target -eq 'production') { 'prod' } else { 'staging' }
$out = Join-Path $BackupDir "langnghe-$short-$stamp"

try {
  # Mật khẩu đi qua biến môi trường của riêng tiến trình này, không nằm
  # trong dòng lệnh.
  $env:PGPASSWORD = Get-DbPassword $Target

  Write-Host "Đang sao lưu $($info.Label) vào $out ..."
  # PowerShell 5.1 coi mọi dòng stderr của lệnh ngoài là lỗi và dừng script
  # khi ErrorActionPreference = Stop — tạm đổi để tự đọc mã thoát.
  $ErrorActionPreference = 'Continue'
  $nodeArgs = @((Join-Path $PSScriptRoot 'backup-db.mjs'), $info.Ref, $script:DbPoolerHost, $out)
  $log = & node @nodeArgs 2>&1 | ForEach-Object { "$_" } | Out-String
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host $log
if ($code -eq 3) {
  Remove-DbPassword $Target
  Write-Error "Sai mật khẩu $($info.Label). Đã xoá mật khẩu đã lưu — chạy lại để nhập mật khẩu đúng."
}
if ($code -ne 0) {
  Write-Error "Sao lưu lỗi (mã $code). Bản sao lưu không dùng được."
}
Write-Host 'Giữ thư mục này ngoài repo; không gửi cho ai (có email và dữ liệu khách hàng).'

# Đẩy migration trong supabase/migrations lên staging hoặc production.
#   npm run db:push:staging
#   npm run db:push:prod
# Luôn chạy thử (--dry-run) trước để liệt kê migration sẽ chạy, rồi mới hỏi
# có chạy thật không. Production: nhắc sao lưu trước (npm run backup:prod).
# Mật khẩu: xem scripts/db-password.ps1.
param(
  [Parameter(Mandatory)] [ValidateSet('staging', 'production')] [string]$Target
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'db-password.ps1')

$url = Get-DbUrl $Target (Get-DbPassword $Target)
$label = $script:DbTargets[$Target].Label

Write-Host "`n== Chạy thử trên $label ==" -ForegroundColor Cyan
# Supabase CLI in cả thông báo thường ra stderr; PowerShell 5.1 sẽ coi đó là
# lỗi và dừng script nếu ErrorActionPreference = Stop — tạm đổi để tự đọc mã thoát.
$ErrorActionPreference = 'Continue'
$dry = & npx supabase db push --db-url $url --dry-run 2>&1 | ForEach-Object { "$_" } | Out-String
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
Write-Host $dry
if ($code -ne 0) {
  if ($dry -match 'password authentication failed') {
    Remove-DbPassword $Target
    Write-Error "Sai mật khẩu $label. Đã xoá mật khẩu đã lưu — chạy lại lệnh để nhập mật khẩu đúng."
  }
  Write-Error "Chạy thử lỗi (mã $code). Chưa có gì thay đổi."
}
if ($dry -match 'up to date') {
  Write-Host "$label đã có đủ migration, không có gì để chạy." -ForegroundColor Green
  exit 0
}

if ($Target -eq 'production') {
  Write-Host 'PRODUCTION: đã chạy "npm run backup:prod" cho lần này chưa?' -ForegroundColor Yellow
}
$answer = Read-Host "Chạy thật các migration trên lên $label? Gõ 'co' để tiếp tục"
if ($answer -ne 'co') {
  Write-Host 'Đã huỷ. Chưa có gì thay đổi.'
  exit 0
}

& npx supabase db push --db-url $url --yes
if ($LASTEXITCODE -ne 0) { Write-Error "db push lỗi (mã $LASTEXITCODE)." }
Write-Host "Xong: migration đã chạy trên $label." -ForegroundColor Green

# Xoá mật khẩu database đã lưu (sau khi đổi mật khẩu trên Supabase).
#   npm run db:forget-passwords
[Console]::OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'db-password.ps1')
Remove-DbPassword 'staging'
Remove-DbPassword 'production'
Write-Host 'Lần chạy db:push / backup:prod tiếp theo sẽ hỏi lại mật khẩu.'

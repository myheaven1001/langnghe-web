# Mật khẩu database Supabase lưu trên máy này (dùng chung cho db-push.ps1 và
# backup-db.ps1), để không phải gõ lại mỗi lần.
#
# Lưu ở %USERPROFILE%\.langnghe\db-<staging|production>.secret, mã hoá bằng
# Windows DPAPI (ConvertFrom-SecureString không kèm khoá): chỉ đúng user Windows
# này trên đúng máy này giải mã được. File nằm ngoài repo.
# Đổi mật khẩu trên Supabase xong thì chạy: npm run db:forget-passwords

$script:DbTargets = @{
  staging    = @{ Ref = 'alxaicpqwjszejmxplvh'; Label = 'STAGING' }
  production = @{ Ref = 'vgoymfnwimgypvmpozvf'; Label = 'PRODUCTION' }
}
$script:DbPoolerHost = 'aws-0-ap-south-1.pooler.supabase.com'
$script:DbSecretDir = Join-Path $HOME '.langnghe'

function Get-DbSecretPath([string]$Target) {
  Join-Path $script:DbSecretDir "db-$Target.secret"
}

# Trả về mật khẩu dạng chuỗi. Chưa lưu thì hỏi rồi lưu (đã mã hoá).
function Get-DbPassword([string]$Target) {
  $info = $script:DbTargets[$Target]
  if (-not $info) { throw "Target phải là staging hoặc production, không phải '$Target'." }
  $path = Get-DbSecretPath $Target

  if (Test-Path $path) {
    $secure = (Get-Content $path -Raw).Trim() | ConvertTo-SecureString
  }
  else {
    $secure = Read-Host "Mật khẩu database $($info.Label) ($($info.Ref)) — nhập một lần, sẽ được lưu mã hoá" -AsSecureString
    New-Item -ItemType Directory -Force $script:DbSecretDir | Out-Null
    $secure | ConvertFrom-SecureString | Set-Content -Path $path -Encoding ASCII
    Write-Host "Đã lưu mật khẩu $($info.Label) (mã hoá) vào $path"
  }

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# Xoá mật khẩu đã lưu (sai mật khẩu, hoặc vừa đổi trên Supabase).
function Remove-DbPassword([string]$Target) {
  $path = Get-DbSecretPath $Target
  if (Test-Path $path) {
    Remove-Item $path
    Write-Host "Đã xoá mật khẩu $Target đã lưu."
  }
}

function Get-DbUrl([string]$Target, [string]$Password) {
  $ref = $script:DbTargets[$Target].Ref
  $pw = [uri]::EscapeDataString($Password)
  "postgresql://postgres.${ref}:${pw}@$($script:DbPoolerHost):5432/postgres"
}

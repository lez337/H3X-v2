param([string]$Repository = '')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object Windows.Forms.Form
$form.Text = 'H3X Searcher Setup'
$form.Size = New-Object Drawing.Size(460,280)
$form.StartPosition = 'CenterScreen'
$form.BackColor = [Drawing.Color]::FromArgb(9,11,12)
$form.ForeColor = [Drawing.Color]::White
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$title = New-Object Windows.Forms.Label
$title.Text = 'H3X  SEARCHER'
$title.Font = New-Object Drawing.Font('Segoe UI',17,[Drawing.FontStyle]::Bold)
$title.Location = New-Object Drawing.Point(24,19)
$title.Size = New-Object Drawing.Size(380,32)
$form.Controls.Add($title)
$hint = New-Object Windows.Forms.Label
$hint.Text = 'GitHub release repository (owner/name)'
$hint.Location = New-Object Drawing.Point(25,66)
$hint.Size = New-Object Drawing.Size(390,20)
$form.Controls.Add($hint)
$repoBox = New-Object Windows.Forms.TextBox
$repoBox.Location = New-Object Drawing.Point(25,88)
$repoBox.Size = New-Object Drawing.Size(400,25)
$repoBox.Text = $Repository
$form.Controls.Add($repoBox)
$status = New-Object Windows.Forms.Label
$status.Text = 'Choose a published release repository to install or repair.'
$status.ForeColor = [Drawing.Color]::FromArgb(160,176,180)
$status.Location = New-Object Drawing.Point(25,183)
$status.Size = New-Object Drawing.Size(400,45)
$form.Controls.Add($status)
function Add-Button([string]$text,[int]$x,[scriptblock]$action) {
  $button = New-Object Windows.Forms.Button
  $button.Text = $text
  $button.Location = New-Object Drawing.Point($x,133)
  $button.Size = New-Object Drawing.Size(120,36)
  $button.BackColor = [Drawing.Color]::FromArgb(32,39,42)
  $button.ForeColor = [Drawing.Color]::White
  $button.FlatStyle = 'Flat'
  $button.Add_Click($action)
  $form.Controls.Add($button)
}
function Get-ReleaseInstaller {
  $repo = $repoBox.Text.Trim()
  if ($repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'Enter a GitHub repository as owner/name.' }
  $api = "https://api.github.com/repos/$repo/releases/latest"
  $release = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent'='H3X-Searcher-Setup'; 'Accept'='application/vnd.github+json' } -TimeoutSec 30
  $asset = $release.assets | Where-Object { $_.name -match '^H3X-Searcher-Setup-.*-x64\.exe$' } | Select-Object -First 1
  $checksums = $release.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' } | Select-Object -First 1
  if (-not $asset -or -not $checksums) { throw 'Latest release needs the installer and SHA256SUMS.txt assets.' }
  $status.Text = "Downloading $($release.tag_name)..."
  $form.Refresh()
  $folder = Join-Path ([IO.Path]::GetTempPath()) ('H3X-Setup-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $folder | Out-Null
  $installer = Join-Path $folder $asset.name
  $sumfile = Join-Path $folder 'SHA256SUMS.txt'
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer -TimeoutSec 600
  Invoke-WebRequest -Uri $checksums.browser_download_url -OutFile $sumfile -TimeoutSec 60
  $line = Get-Content -LiteralPath $sumfile | Where-Object { $_ -match [regex]::Escape($asset.name) } | Select-Object -First 1
  if (-not $line -or $line -notmatch '^([a-fA-F0-9]{64})\s+\*?(.+)$') { throw 'No valid SHA-256 entry for this installer.' }
  if ($matches[2].Trim() -ne $asset.name) { throw 'Checksum filename mismatch.' }
  $expected = $matches[1].ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { throw 'Installer checksum mismatch.' }
  return $installer
}
$installAction = { try { $installer = Get-ReleaseInstaller; $status.Text='Verified. Launching installer...'; Start-Process -FilePath $installer } catch { $status.Text=$_.Exception.Message } }
Add-Button 'Install' 25 $installAction
Add-Button 'Repair / Update' 155 $installAction
Add-Button 'Uninstall' 285 {
  try {
    $entries = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
    $entry = Get-ItemProperty -Path $entries -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'H3X Searcher' } | Select-Object -First 1
    if (-not $entry) { throw 'H3X Searcher is not installed.' }
    $command = if ($entry.QuietUninstallString) { $entry.QuietUninstallString } else { $entry.UninstallString }
    if ($command -notmatch '^\s*"([^"]+\.exe)"\s*(.*)$') { throw 'Uninstall command could not be verified.' }
    $exe = $matches[1]; $arguments = $matches[2]
    if (-not (Test-Path -LiteralPath $exe)) { throw 'Uninstaller executable was not found.' }
    Start-Process -FilePath $exe -ArgumentList $arguments
    $status.Text='Uninstaller launched.'
  } catch { $status.Text=$_.Exception.Message }
}
[void]$form.ShowDialog()

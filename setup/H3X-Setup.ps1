param([string]$Repository = '', [string]$PreviewPath = '', [switch]$PreviewInstalled, [switch]$VerifyDownload, [string]$VerificationPath = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$configPath = Join-Path $PSScriptRoot 'setup-config.json'
$version = '0.1.0'
if (Test-Path (Join-Path $PSScriptRoot '../package.json')) { $version = (Get-Content (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version }
if (Test-Path -LiteralPath $configPath) {
    $config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if(!$Repository){$Repository=$config.repository};$version=$config.version
}
if(!$Repository){$Repository='lez337/H3X-v2'}
function Find-Installation {
    $keys = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
    Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'H3X Searcher' } | Select-Object -First 1
}
$script:entry = Find-Installation
if ($PreviewInstalled) { $script:entry = [pscustomobject]@{ DisplayVersion=$version; InstallLocation='C:\Users\You\AppData\Local\Programs\H3X Searcher' } }
$form = New-Object Windows.Forms.Form
$form.Text = 'H3X / SETUP'
$form.ClientSize = New-Object Drawing.Size(600,682)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'None'
$form.AutoScaleMode = 'Dpi'
$form.BackColor = [Drawing.Color]::FromArgb(8,8,8)
$form.ForeColor = [Drawing.Color]::White
$form.Font = New-Object Drawing.Font('Segoe UI',9)
$form.Add_Paint({ param($sender,$e) $e.Graphics.DrawRectangle([Drawing.Pens]::DimGray,0,0,$sender.ClientSize.Width-1,$sender.ClientSize.Height-1) })
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class H3XWindowDrag {
 [DllImport("user32.dll")] public static extern bool ReleaseCapture();
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
 [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);
}
'@
$drag = { param($sender,$e) if ($e.Button -eq [Windows.Forms.MouseButtons]::Left) { [void][H3XWindowDrag]::ReleaseCapture(); [void][H3XWindowDrag]::SendMessage($form.Handle,0xA1,[IntPtr]2,[IntPtr]::Zero) } }
$form.Add_MouseDown($drag)
function Label([string]$text,[int]$x,[int]$y,[int]$w,[int]$h,[int]$size=9,[bool]$bold=$false) {
    $label = New-Object Windows.Forms.Label
    $label.Text=$text; $label.SetBounds($x,$y,$w,$h);$label.TextAlign='MiddleCenter'
    $style = if($bold){[Drawing.FontStyle]::Bold}else{[Drawing.FontStyle]::Regular}
    $label.Font=New-Object Drawing.Font('Segoe UI',$size,$style,[Drawing.GraphicsUnit]::Point)
    $label.ForeColor=[Drawing.Color]::FromArgb(156,156,156)
    $form.Controls.Add($label)
    return $label
}
function Button([string]$text,[int]$x,[int]$y,[int]$w,[int]$h,[bool]$primary=$false) {
    $button=New-Object Windows.Forms.Button
    $button.Text=$text; $button.SetBounds($x,$y,$w,$h)
    $button.FlatStyle='Flat'; $button.FlatAppearance.BorderColor=[Drawing.Color]::FromArgb(52,52,52)
    $button.BackColor=[Drawing.Color]::FromArgb(17,17,17); $button.ForeColor=[Drawing.Color]::White
    $button.Cursor=[Windows.Forms.Cursors]::Hand;$button.UseVisualStyleBackColor=$false
    if($primary){$button.BackColor=[Drawing.Color]::White;$button.ForeColor=[Drawing.Color]::Black;$button.Font=New-Object Drawing.Font('Segoe UI',10,[Drawing.FontStyle]::Bold)}
    $form.Controls.Add($button)
    return $button
}
$caption=Label 'H3X / SETUP' 20 8 200 25 9 $true
$caption.TextAlign='MiddleLeft'; $caption.Add_MouseDown($drag)
$close=Button ([string][char]0x00D7) 554 6 38 32
$close.AccessibleName='Close setup'; $close.Add_Click({if(!$script:job){$form.Close()}})
$platform=Label 'WINDOWS / x64' 60 67 480 24 8
$picture=New-Object Windows.Forms.PictureBox
$picture.SetBounds(239,105,122,122); $picture.SizeMode='Zoom'
$iconPath=Join-Path $PSScriptRoot 'setup-icon.png'
if(!(Test-Path -LiteralPath $iconPath)){$iconPath=Join-Path $PSScriptRoot '../build/setup-icon.png'}
if(Test-Path -LiteralPath $iconPath){
    $picture.Image=[Drawing.Image]::FromFile($iconPath)
    $iconHandle=([Drawing.Bitmap]$picture.Image).GetHicon()
    $form.Icon=([Drawing.Icon]::FromHandle($iconHandle)).Clone()
    [void][H3XWindowDrag]::DestroyIcon($iconHandle)
}
$form.Controls.Add($picture)
$title=Label 'H3X SEARCHER' 30 247 540 48 25 $true
$title.ForeColor=[Drawing.Color]::White
$installed=Label '' 60 295 480 24 10
$subtitle=Label '' 60 318 480 24 9
$repoBox=New-Object Windows.Forms.TextBox
$repoBox.SetBounds(60,348,480,24); $repoBox.Text=$Repository
$repoBox.BackColor=[Drawing.Color]::FromArgb(18,18,18);$repoBox.ForeColor=[Drawing.Color]::White;$repoBox.BorderStyle='FixedSingle'
$repoBox.AccessibleName='GitHub repository, owner/name';$form.Controls.Add($repoBox)
$repoHint=Label 'GitHub repository: owner/name' 60 328 480 20 8
$repoBox.Visible=!$Repository; $repoHint.Visible=!$Repository
if(!$Repository){$subtitle.Visible=$false}
$primary=Button 'Install H3X Searcher' 60 382 480 53 $true
$uninstall=Button 'Uninstall' 60 446 480 43
$uninstall.Add_Paint({
    param($sender,$e)
    if(!$sender.Enabled){
        $e.Graphics.Clear($sender.BackColor)
        $e.Graphics.DrawRectangle([Drawing.Pens]::DimGray,0,0,$sender.Width-1,$sender.Height-1)
        [Windows.Forms.TextRenderer]::DrawText($e.Graphics,$sender.Text,$sender.Font,$sender.ClientRectangle,[Drawing.Color]::FromArgb(110,110,110),([Windows.Forms.TextFormatFlags]::HorizontalCenter -bor [Windows.Forms.TextFormatFlags]::VerticalCenter))
    }
})
$track=New-Object Windows.Forms.Panel
$track.SetBounds(60,522,480,5);$track.BackColor=[Drawing.Color]::FromArgb(34,34,34)
$fill=New-Object Windows.Forms.Panel
$fill.SetBounds(0,0,0,5);$fill.BackColor=[Drawing.Color]::White
$track.Controls.Add($fill);$form.Controls.Add($track)
$status=Label '' 60 542 480 28 9
$status.ForeColor=[Drawing.Color]::White
$details=Label 'Your saved workspace and settings are kept.' 40 575 520 20 8
$location=Label '' 35 595 530 22 8
$location.AutoEllipsis=$true
$footerText=if($Repository){"$Repository    /    setup $version"}else{"H3X SEARCHER    /    setup $version"}
$footer=Label $footerText 40 642 520 24 8
$script:job=$null
function Refresh-Installation {
    if($script:entry){
        $installed.Text="Installed $($script:entry.DisplayVersion)";$subtitle.Text='Repair files or download the latest update.'
        $primary.Text='Repair / Update';$uninstall.Enabled=$true;$status.Text='H3X Searcher is installed'
        $location.Text=$script:entry.InstallLocation
    }else{
        $installed.Text='Your investigation workspace';$subtitle.Text='Install H3X Searcher on this computer.'
        $primary.Text='Install H3X Searcher';$uninstall.Enabled=$false;$status.Text='Ready to install'
        $location.Text='H3X stays closed when setup finishes.'
    }
}
Refresh-Installation
# Keep network and installation work off the UI thread.
$worker={
    param($mode,$repo,$command)
    $ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $folder=$null
    function Report($message,$percent){[pscustomobject]@{message=$message;percent=$percent}}
    try{
        if($mode -eq 'uninstall'){
            if($command -notmatch '^\s*"([^\"]+\.exe)"\s*(.*)$'){throw 'Uninstall command could not be verified.'}
            $exe=$matches[1];$arguments=$matches[2]
            if(!(Test-Path -LiteralPath $exe)){throw 'Uninstaller was not found.'}
            if($arguments -notmatch '(^|\s)/S(\s|$)'){$arguments="$arguments /S"}
            Report 'Uninstalling H3X Searcher...' 35
            $process=Start-Process -FilePath $exe -ArgumentList $arguments -PassThru -Wait -WindowStyle Hidden
            if($process.ExitCode -ne 0){throw "Uninstall ended with code $($process.ExitCode)."}
            Report 'H3X Searcher was uninstalled' 100
        }else{
            if($repo -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$'){throw 'Enter your GitHub repository as owner/name.'}
            Report 'Checking the latest release...' 5
            $release=Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{'User-Agent'='H3X-Setup';'Accept'='application/vnd.github+json'} -TimeoutSec 30
            if($release.draft -or $release.prerelease){throw 'Setup requires a published stable release.'}
            $tag=[string]$release.tag_name
            if($tag -notmatch '^v?(\d+\.\d+\.\d+)$'){throw 'The latest release needs a stable version tag.'}
            $name="H3X-Searcher-Setup-$($matches[1])-x64.exe"
            $asset=$release.assets|Where-Object {$_.name -eq $name}|Select-Object -First 1
            $sums=$release.assets|Where-Object {$_.name -eq 'SHA256SUMS.txt'}|Select-Object -First 1
            if(!$asset -or !$sums){throw 'The release needs its installer and SHA256SUMS.txt.'}
            foreach($file in @($asset,$sums)){
                $expected="https://github.com/$repo/releases/download/$([Uri]::EscapeDataString($tag))/$($file.name)"
                if($file.browser_download_url -cne $expected){throw 'Unexpected release download URL.'}
            }
            $folder=Join-Path ([IO.Path]::GetTempPath()) ('H3X-Setup-'+[guid]::NewGuid().ToString('N'))
            [void](New-Item -ItemType Directory -Path $folder)
            $installer=Join-Path $folder $name;$sumfile=Join-Path $folder 'SHA256SUMS.txt'
            Report "Downloading H3X $tag..." 15
            Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $installer -TimeoutSec 600
            Invoke-WebRequest -UseBasicParsing -Uri $sums.browser_download_url -OutFile $sumfile -TimeoutSec 60
            Report 'Verifying the download...' 70
            $hash=$null
            foreach($line in (Get-Content -LiteralPath $sumfile)){
                if($line -match '^([a-fA-F0-9]{64})\s+\*?(.+)$' -and $matches[2] -ceq $name){$hash=$matches[1];break}
            }
            if(!$hash -or (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ine $hash){throw 'Installer verification failed. Nothing was installed.'}
            if((Get-Item -LiteralPath $installer).Length -ne $asset.size){throw 'Installer size did not match the release. Nothing was installed.'}
            if($mode -eq 'verify'){
                [pscustomobject]@{message='Download verified';percent=100;verified=$true;version=$tag;asset=$name;sha256=$hash}
                return
            }
            Report 'Installing H3X Searcher...' 85
            $process=Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
            if($process.ExitCode -ne 0){throw "Setup ended with code $($process.ExitCode)."}
            Report 'Installation complete. H3X is ready.' 100
        }
    }catch{[pscustomobject]@{message=$_.Exception.Message;percent=0;failed=$true}}
    finally{
        if($folder){
            Get-ChildItem -LiteralPath $folder -File | Remove-Item -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $folder -ErrorAction SilentlyContinue
        }
    }
}
if($VerifyDownload){
    try{
        $results=@(& $worker 'verify' $Repository '')
        $verified=$results|Where-Object {$_.verified}|Select-Object -Last 1
        if(!$verified){throw ($results|Select-Object -Last 1).message}
        if(!$VerificationPath){throw 'A verification report path is required.'}
        $verified|ConvertTo-Json|Set-Content -LiteralPath $VerificationPath -Encoding UTF8
        exit 0
    }catch{
        if($VerificationPath){@{verified=$false;message=$_.Exception.Message}|ConvertTo-Json|Set-Content -LiteralPath $VerificationPath -Encoding UTF8}
        Write-Error $_
        exit 1
    }finally{if($picture.Image){$picture.Image.Dispose()};$form.Dispose()}
}
function Start-SetupJob([string]$mode){
    if($script:job){return}
    $repo=$repoBox.Text.Trim()
    $command=if($script:entry.QuietUninstallString){$script:entry.QuietUninstallString}else{$script:entry.UninstallString}
    $primary.Enabled=$false;$uninstall.Enabled=$false;$repoBox.Enabled=$false;$close.Enabled=$false
    $fill.Width=0;$status.Text='Preparing...';$details.Text='Please keep setup open until this finishes.'
    $script:job=Start-Job -ScriptBlock $worker -ArgumentList $mode,$repo,$command
}
$primary.Add_Click({Start-SetupJob 'install'})
$uninstall.Add_Click({
    if([Windows.Forms.MessageBox]::Show('Uninstall H3X Searcher? Your workspace and settings will be kept.','H3X / SETUP','YesNo','Question') -eq 'Yes'){Start-SetupJob 'uninstall'}
})
$timer=New-Object Windows.Forms.Timer
$timer.Interval=150
$timer.Add_Tick({
    if(!$script:job){return}
    foreach($result in @(Receive-Job -Job $script:job)){
        $status.Text=$result.message;$fill.Width=[int](480*$result.percent/100)
        if($result.failed){$details.Text='Check your connection and release repository, then try again.'}
    }
    if($script:job.State -in @('Completed','Failed','Stopped')){
        if($script:job.State -eq 'Failed'){$status.Text='Setup could not finish. Please try again.'}
        Remove-Job -Job $script:job -Force;$script:job=$null
        $message=$status.Text;$script:entry=Find-Installation;Refresh-Installation;$status.Text=$message
        $details.Text='Your saved workspace and settings are kept.'
        $primary.Enabled=$true;$repoBox.Enabled=$true;$close.Enabled=$true
    }
})
$form.Add_FormClosing({param($sender,$e) if($script:job){$e.Cancel=$true}})
$timer.Start()
try{
    if($PreviewPath){
        $form.Show();[Windows.Forms.Application]::DoEvents()
        $bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height)
        $form.DrawToBitmap($bitmap,$form.ClientRectangle)
        $bitmap.Save($PreviewPath,[Drawing.Imaging.ImageFormat]::Png);$bitmap.Dispose();$form.Close()
    }else{[void]$form.ShowDialog()}
}finally{$timer.Stop();$timer.Dispose();if($picture.Image){$picture.Image.Dispose()};$form.Dispose()}

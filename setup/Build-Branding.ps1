$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$output = Join-Path $PSScriptRoot '../build'
function New-Banner([int]$width, [int]$height, [string]$name, [bool]$sidebar) {
    $bitmap = New-Object Drawing.Bitmap($width, $height)
    $g = [Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear([Drawing.Color]::FromArgb(12,12,12))
    $pen = New-Object Drawing.Pen([Drawing.Color]::FromArgb(32,32,32))
    for ($x = 0; $x -lt $width; $x += 24) { $g.DrawLine($pen, $x, 0, $x, $height) }
    for ($y = 0; $y -lt $height; $y += 24) { $g.DrawLine($pen, 0, $y, $width, $y) }
    $white = [Drawing.Brushes]::White
    $muted = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(162,162,162))
    $large = New-Object Drawing.Font('Segoe UI', 28, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
    $small = New-Object Drawing.Font('Segoe UI', 10, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    if ($sidebar) {
        $mark = [Drawing.Image]::FromFile((Join-Path $output 'setup-icon.png'))
        $g.DrawImage($mark, 22, 26, 64, 64)
        $mark.Dispose()
        $g.DrawString('H3X', $large, $white, 18, 111)
        $g.DrawString('S E A R C H E R', $small, $muted, 22, 151)
        $g.FillRectangle($white, 22, 187, 32, 2)
        $g.DrawString("YOUR INVESTIGATION`nWORKSPACE", $small, $muted, 22, 209)
        $g.DrawString('WINDOWS / DESKTOP', $small, $muted, 22, 284)
    } else {
        $g.DrawString('H3X', $large, $white, 12, 2)
        $g.DrawString('S E A R C H E R', $small, $muted, 16, 38)
    }
    $bitmap.Save((Join-Path $output $name), [Drawing.Imaging.ImageFormat]::Bmp)
    $small.Dispose(); $large.Dispose(); $muted.Dispose(); $pen.Dispose(); $g.Dispose(); $bitmap.Dispose()
}
New-Banner 164 314 'installerSidebar.bmp' $true
New-Banner 150 57 'installerHeader.bmp' $false

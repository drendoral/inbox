# Regenerates the PNG icons. Run from the repo root in Windows PowerShell:
#   powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1 -OutDir icons
param([string]$OutDir = 'icons')
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

function Color($hex) { return [System.Drawing.ColorTranslator]::FromHtml($hex) }

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# Light bulb, drawn in a 512-unit space centred on x = 256.
function DrawBulb($g) {
  $glass = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glass.AddArc(146, 74, 220, 220, 140, 260)          # round top, from lower-left to lower-right
  $glass.AddBezier(340, 255, 318, 282, 304, 300, 302, 330)
  $glass.AddLine(302, 330, 210, 330)
  $glass.AddBezier(210, 330, 208, 300, 194, 282, 172, 255)
  $glass.CloseFigure()
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF 256, 74), (New-Object System.Drawing.PointF 256, 332),
    (Color '#FFDC4E'), (Color '#F08A1C'))
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $blend.Colors = [System.Drawing.Color[]]@((Color '#FFDC4E'), (Color '#FBB72C'), (Color '#F08A1C'))
  $blend.Positions = [single[]]@(0, 0.45, 1)
  $grad.InterpolationColors = $blend
  $g.FillPath($grad, $glass)

  $base = New-Object System.Drawing.SolidBrush (Color '#E8761C')
  $g.FillPath($base, (RoundRect 206 344 100 20 10))
  $g.FillPath($base, (RoundRect 212 372 88 20 10))
  $g.FillPath($base, (RoundRect 220 400 72 20 10))
  $g.FillPie($base, 236, 410, 40, 34, 0, 180)          # little rounded tip
}

function Draw([int]$size, [bool]$maskable, [string]$file) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.ScaleTransform($size / 512.0, $size / 512.0)

  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  if ($maskable) {
    $g.FillRectangle($white, 0, 0, 512, 512)
    $g.TranslateTransform(256, 256); $g.ScaleTransform(0.74, 0.74); $g.TranslateTransform(-256, -260)
  } else {
    $g.FillPath($white, (RoundRect 16 16 480 480 110))
    $g.TranslateTransform(256, 256); $g.ScaleTransform(0.86, 0.86); $g.TranslateTransform(-256, -260)
  }
  DrawBulb $g

  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

# Bulb only, transparent, for the in-app header.
function DrawLogo([int]$size, [string]$file) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.ScaleTransform($size / 512.0, $size / 512.0)
  $g.TranslateTransform(256, 256); $g.ScaleTransform(1.3, 1.3); $g.TranslateTransform(-256, -260)
  DrawBulb $g
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Draw 512 $false (Join-Path $OutDir 'icon-512.png')
Draw 192 $false (Join-Path $OutDir 'icon-192.png')
Draw 32  $false (Join-Path $OutDir 'favicon-32.png')
Draw 512 $true  (Join-Path $OutDir 'icon-maskable-512.png')
Draw 192 $true  (Join-Path $OutDir 'icon-maskable-192.png')
Draw 180 $true  (Join-Path $OutDir 'apple-touch-icon.png')
DrawLogo 192 (Join-Path $OutDir 'logo.png')
Get-ChildItem $OutDir | Select-Object Name, Length

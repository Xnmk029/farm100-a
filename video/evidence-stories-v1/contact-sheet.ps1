param([string]$Directory,[ValidateSet('normal','stress')][string]$Mode='normal')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$rows = if ($Mode -eq 'normal') {4} else {3}
$bitmap = New-Object System.Drawing.Bitmap(1920, (540 * $rows))
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
try {
  if ($Mode -eq 'normal') {
    for ($i=0; $i -lt 7; $i++) {
      $img=[System.Drawing.Image]::FromFile((Join-Path $Directory ('decoded/scene-' + $i + '.png')))
      try { $graphics.DrawImage($img, (($i % 2) * 960), ([math]::Floor($i / 2) * 540), 960, 540) } finally { $img.Dispose() }
    }
    $name='contact-sheet.jpg'
  } else {
    $indices=@(0,2,4)
    for ($row=0; $row -lt 3; $row++) {
      for ($col=0; $col -lt 2; $col++) {
        $prefix=if ($col -eq 0) {'scene'} else {'stress'}
        $img=[System.Drawing.Image]::FromFile((Join-Path $Directory ('decoded/' + $prefix + '-' + $indices[$row] + '.png')))
        try { $graphics.DrawImage($img, ($col * 960), ($row * 540), 960, 540) } finally { $img.Dispose() }
      }
    }
    $name='compression-comparison.jpg'
  }
  $bitmap.Save((Join-Path $Directory $name), [System.Drawing.Imaging.ImageFormat]::Jpeg)
} finally { $graphics.Dispose(); $bitmap.Dispose() }

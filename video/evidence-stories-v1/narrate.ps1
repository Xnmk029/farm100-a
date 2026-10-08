$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$storyRoot = $PSScriptRoot
$plan = Get-Content -LiteralPath (Join-Path $storyRoot 'plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$audioDir = Join-Path $storyRoot 'public/audio'
New-Item -ItemType Directory -Force -Path $audioDir | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SelectVoice('Microsoft Huihui Desktop')
$speaker.Rate = 1
try {
  foreach ($story in $plan.stories) {
    foreach ($chapter in $story.chapters) {
      $wave = Join-Path $audioDir ($story.id + '-' + $chapter.id + '.wav')
      $speaker.SetOutputToWaveFile($wave)
      $speaker.Speak($chapter.narration)
      $speaker.SetOutputToNull()
      Write-Output ('Narrated ' + $story.id + '/' + $chapter.id)
    }
  }
} finally { $speaker.Dispose() }

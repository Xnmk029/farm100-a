from pathlib import Path
import json, hashlib, zipfile
root=Path.cwd()
release=root/'release/scoring-v2-0.5.4-r2'
evidence=root/'artifacts/scoring-v2'
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
 return h.hexdigest()
proof_folders=['v1-package-regression-r2-retry','ai-review-package-qa-r2']
for folder in proof_folders:
 proof=json.loads((evidence/folder/'packaged-verification.json').read_text(encoding='utf-8'))
 assert proof['pass']
 for item in proof['files']: assert digest(Path(item['file']))==item['sha256'], 'Stale package verification'
proof=json.loads((evidence/'evidence-verification.json').read_text(encoding='utf-8'))
assert proof['pass'] and proof['bundleHash']==digest(evidence/'bundle.json'), 'Stale scoring evidence verification'
files=[(release/'FARM100 Setup 0.5.4-alpha.1.exe','FARM100 Setup 0.5.4-alpha.1.exe'),(root/'docs/BENCHMARK_V2.md','使用说明.md'),(root/'docs/BENCHMARK_V2_AI_REVIEW.md','AI评审说明.md')]
for name in ['bundle.json','manifest.json','rules.json','ledger.json','pilot.json','providers.json','paused-models.json','report.json','report.csv','validation-summary.json','AI-REVIEW-REPORT.md','review-drafts.json','SCORES.md','DIFFICULTY.md']:
 files.append((evidence/name,'evidence/'+name))
for folder in ['references','runs','calls']:
 for p in sorted((evidence/folder).rglob('*')):
  if p.is_file(): files.append((p,'evidence/'+p.relative_to(evidence).as_posix()))
files.append((evidence/'evidence-verification.json','verification/evidence-verification.json'))
for folder in proof_folders:
 files.append((evidence/folder/'packaged-verification.json','verification/'+folder+'.json'))
reviews=json.loads((evidence/'bundle.json').read_text(encoding='utf-8'))['reviews']
assert all(r['reviewer']=='Codex 主评审（AI，用户授权）' for r in reviews), 'Unexpected reviewer in formal evidence'
manifest={name:{'bytes':p.stat().st_size,'sha256':digest(p)} for p,name in files}
archive=release/'FARM100-scoring-v2-preview.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p,name in files:z.write(p,name)
 z.writestr('SHA256SUMS.json',json.dumps(manifest,ensure_ascii=False,indent=2))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert len(z.namelist())==len(files)+1
result={'pass':True,'file':str(archive),'bytes':archive.stat().st_size,'sha256':digest(archive),'entries':len(files)+1,'installer':manifest['FARM100 Setup 0.5.4-alpha.1.exe'],'manualReviews':len(reviews)}
(release/'preview-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result))

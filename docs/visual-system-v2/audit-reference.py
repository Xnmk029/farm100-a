from pathlib import Path
import subprocess, json, hashlib
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[2]
ref=root/'artifacts/visual-reference-20261003/unbox-swe2max-tone'
out=root/'artifacts/visual-reference-20261003/audit'
out.mkdir(parents=True,exist_ok=True)
video=ref/'demos/unbox-swe-2-max-9x16-zh-openbeat.mp4'
times=[0,.3,.6,1.2,2,3,4.5,5,5.5,6,8,12,16,22,28,34,40,44,48,52,55.8]
sheet=Image.new('RGB',(7*270,3*510),'#e6e6ec');draw=ImageDraw.Draw(sheet)
for i,t in enumerate(times):
    f=out/f'{i:02}-{t:g}s.png'
    subprocess.run(['ffmpeg','-y','-v','error','-ss',str(t),'-i',str(video),'-frames:v','1',str(f)],check=True)
    x=(i%7)*270;y=(i//7)*510
    sheet.paste(Image.open(f).resize((270,480)),(x,y));draw.text((x+8,y+486),f'{t:g}s',fill='#111111')
sheet.save(out/'reference-motion-sheet.jpg',quality=94)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
result={'source':str(video),'md5':hashlib.md5(video.read_bytes()).hexdigest(),'sampleSeconds':times,'probe':probe,'method':'decoded timeline samples, not real-time playback or audio review'}
assert result['md5']=='949a4c16dcfcabb6871ac5bbc7671a1c'
(out/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'pass':True,'md5':result['md5'],'sheet':str(out/'reference-motion-sheet.jpg')}))

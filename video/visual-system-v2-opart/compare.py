"""Make review boards from the supplied reference and local sampled frames."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
project = root.parent.parent
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 24)
small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
panels = [
    ('用户参考 / 原始设计图', project / 'artifacts/visual-reference-20261003/unbox-swe2max-tone/mockups/direction-c/c2-titlecard-V14-f2634.png'),
    ('v2 / 原样机', root.parent / 'visual-system-v2/output/portrait/0080.png'),
    ('v2.1 / 像素欧普修订', root / 'output/portrait/0080.png'),
]
board = Image.new('RGB', (1680, 1070), '#E7E9EE')
draw = ImageDraw.Draw(board)
for i, (label, file) in enumerate(panels):
    x = 20 + i * 553
    draw.text((x + 8, 14), label, fill='#171827', font=font)
    im = Image.open(file).convert('RGB').resize((540, 960), Image.Resampling.LANCZOS)
    board.paste(im, (x, 54))
draw.text((28, 1030), '保留完整构图等比缩放；不同内容仅比较风格。v2.1 为独立实现，非参考原引擎。', fill='#697184', font=small)
board.save(root / 'output/style-comparison.jpg', quality=94)

board = Image.new('RGB', (1960, 650), '#E7E9EE')
draw = ImageDraw.Draw(board)
for i, (label, file) in enumerate([
    ('v2 / 工程线稿', root.parent / 'visual-system-v2/output/landscape/0750.png'),
    ('v2.1 / 像素材质 + 浅空间', root / 'output/landscape/0750.png'),
]):
    x = 10 + i * 980
    draw.text((x + 12, 14), label, fill='#171827', font=font)
    board.paste(Image.open(file).convert('RGB').resize((960, 540), Image.Resampling.LANCZOS), (x, 54))
draw.text((24, 615), '同一时间 12.5 秒 / 同一相机与几何 / 只比较视觉体系修订', fill='#697184', font=small)
board.save(root / 'output/space-comparison.jpg', quality=94)

board = Image.new('RGB', (1944, 1160), '#E7E9EE')
draw = ImageDraw.Draw(board)
times = [.8, 2.2, 4, 6.9, 8.6, 10.5, 12.5, 15.3, 17.5]
for i, t in enumerate(times):
    x, y = (i % 3) * 648, (i // 3) * 386
    draw.text((x + 12, y + 6), f'{t:.1f} s / MP4 解码帧', fill='#171827', font=small)
    frame = Image.open(root / f'output/decoded/{i:02d}.png').convert('RGB').resize((640, 360), Image.Resampling.LANCZOS)
    board.paste(frame, (x + 4, y + 26))
board.save(root / 'output/decoded-contact.jpg', quality=94)
print('Saved style-comparison.jpg, space-comparison.jpg, decoded-contact.jpg')

# python3 tools/sheet.py out.png [--crop N] [--cols N] [--cell N] img1.png img2.png ...
# Labelled grid. --crop N shows only the top-left N×N px of each image, magnified (inspect detail).
import sys, os
from PIL import Image, ImageDraw, ImageFont
args = sys.argv[1:]
def opt(k, d):
    if k in args:
        i = args.index(k); v = args[i + 1]; del args[i:i + 2]; return int(v)
    return d
crop = opt('--crop', 0); cols = opt('--cols', 4); cell = opt('--cell', 300)
out, files = args[0], args[1:]
lab = 22
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * (cell + lab)), (24, 24, 28))
d = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except Exception: font = ImageFont.load_default()
for i, f in enumerate(files):
    im = Image.open(f).convert('RGBA')
    bg = Image.new('RGBA', im.size, (128, 128, 128, 255))
    for y in range(0, im.size[1], 16):
        for x in range(0, im.size[0], 16):
            if (x // 16 + y // 16) % 2: bg.paste((170, 170, 170, 255), (x, y, x + 16, y + 16))
    im = Image.alpha_composite(bg, im).convert('RGB')
    if crop: im = im.crop((0, 0, crop, crop)).resize((cell - 4, cell - 4), Image.NEAREST if crop * 2 <= cell else Image.LANCZOS)
    else: im = im.resize((cell - 4, cell - 4), Image.LANCZOS)
    x, y = (i % cols) * cell, (i // cols) * (cell + lab)
    sheet.paste(im, (x + 2, y + 2))
    d.text((x + 4, y + cell + 2), os.path.splitext(os.path.basename(f))[0][:40], fill=(230, 230, 230), font=font)
sheet.save(out)

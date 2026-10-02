# python3 tools/sheet.py out.png img1.png img2.png ... -> labelled grid
import sys, os
from PIL import Image, ImageDraw, ImageFont
out, files = sys.argv[1], sys.argv[2:]
cols = int(os.environ.get('COLS', 4)); cell = int(os.environ.get('CELL', 300)); lab = 26
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * (cell + lab)), (24, 24, 28))
d = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
except Exception: font = ImageFont.load_default()
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((cell - 8, cell - 8), Image.LANCZOS)
    x, y = (i % cols) * cell, (i // cols) * (cell + lab)
    sheet.paste(im, (x + 4, y + 4))
    d.text((x + 6, y + cell - 2), os.path.splitext(os.path.basename(f))[0], fill=(230, 230, 230), font=font)
sheet.save(out)

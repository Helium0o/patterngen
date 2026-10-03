"""ideas/out/*.png (from `node ideas/prototypes.mjs`) -> ideas/renders/*.jpg + 3 titled contact sheets in ideas/sheets/.
Needs Pillow (pip install pillow). Run from the repo root: python3 ideas/make-sheets.py"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT, RENDERS, SHEETS = (os.path.join(HERE, d) for d in ('out', 'renders', 'sheets'))
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT.replace('Sans.ttf', 'Sans-Bold.ttf') if bold else FONT, size)
    except OSError:
        return ImageFont.load_default()


def sheet(name, title, items, cols, cell=300):
    sub = "Working prototypes rendered with texturelib's engines (ideas/prototypes.mjs), not yet in the library"
    lab = 46
    rows = (len(items) + cols - 1) // cols
    W, H = cols * (cell + 16) + 16, 92 + rows * (cell + lab + 14)
    img = Image.new('RGB', (W, H), (20, 20, 24))
    d = ImageDraw.Draw(img)
    d.text((16, 14), title, fill=(240, 240, 240), font=font(28, True))
    d.text((16, 52), sub, fill=(150, 150, 160), font=font(15))
    for k, (f, label, note) in enumerate(items):
        x, y = 16 + (k % cols) * (cell + 16), 92 + (k // cols) * (cell + lab + 14)
        im = Image.open(os.path.join(OUT, f + '.png')).convert('RGB').resize((cell, cell), Image.LANCZOS)
        img.paste(im, (x, y))
        d.text((x, y + cell + 5), label, fill=(235, 235, 235), font=font(16))
        d.text((x, y + cell + 25), note, fill=(150, 150, 160), font=font(12))
    path = os.path.join(SHEETS, name + '.jpg')
    img.save(path, quality=86, optimize=True)
    print(os.path.relpath(path), img.size)


os.makedirs(RENDERS, exist_ok=True)
os.makedirs(SHEETS, exist_ok=True)
for f in sorted(os.listdir(OUT)):
    if f.endswith('.png'):
        Image.open(os.path.join(OUT, f)).convert('RGB').save(os.path.join(RENDERS, f[:-4] + '.jpg'), quality=88, optimize=True)

sheet('ideas-1-knit-crochet-weave', 'Knitting, crochet & weaving ideas', [
    ('knitted-word', 'Knitted words', 'works today: text -> Fair Isle chart'),
    ('lace-knit', 'Eyelet lace knit', 'holes see-through (alpha)'),
    ('brioche', 'Two-colour brioche', 'tall plump rib, two yarns'),
    ('filet-crochet', 'Filet crochet', 'chart: filled blocks / open mesh'),
    ('woven-letters', 'Woven letters (jacquard)', 'satin vs sateen from a text mask'),
    ('damask', 'Damask', 'same idea, ogee + rosette mask'),
    ('ikat', 'Ikat', 'dye bundles shifted per thread'),
    ('carbon-fibre', 'Carbon fibre', 'works today: twill settings'),
], 4)
sheet('ideas-2-ornament-formulas', 'Ornament & formula ideas', [
    ('hitomezashi', 'Hitomezashi sashiko', 'a few random bits per row/column'),
    ('sashiko-shippo', 'Sashiko shippo', 'running stitch on overlapping circles'),
    ('kumiko-asanoha', 'Kumiko asanoha', 'wooden lattice, hemp-leaf'),
    ('guilloche', 'Guilloche', 'banknote engraving waves'),
    ('paper-marbling', 'Paper marbling', 'tine strokes z = a*l/(d+l)'),
    ('wallpaper-p4m', 'Wallpaper group p4m', 'motif folded by mirrors'),
    ('wallpaper-p4', 'Wallpaper group p4', 'same motif, rotations only'),
    ('quasicrystal', 'Quasicrystal', 'sum of cos over 7 directions'),
    ('op-art-waves', 'Op-art waves', 'Bridget Riley-style'),
    ('superformula', 'Superformula motifs', 'Gielis shapes, random per cell'),
], 5, 280)
sheet('ideas-3-materials', 'Material ideas', [
    ('diamond-plate', 'Diamond / tread plate', 'raised lens bars on brushed metal'),
    ('perforated-metal', 'Perforated metal', 'holes see-through (alpha)'),
    ('knurling', 'Knurling', 'two groove sets -> pyramids'),
    ('fur-lic', 'Fur (LIC)', 'noise smeared along a flow field'),
    ('water-caustics', 'Water caustics', 'two warped cell networks'),
], 5, 280)

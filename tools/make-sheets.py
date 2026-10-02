# python3 tools/make-sheets.py  -> previews/sheets/*.png  (each swatch shown tiled 2x2 to prove seamlessness)
import json, os, subprocess
from PIL import Image, ImageDraw, ImageFont
os.makedirs('previews/sheets', exist_ok=True)
meta = json.loads(subprocess.check_output(['node', '-e', "import('./src/index.js').then(m=>console.log(JSON.stringify(m.listPatterns().map(p=>({id:p.id,name:p.name,category:p.category})))))"]))
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = ImageFont.truetype(FONT, 17) if os.path.exists(FONT) else ImageFont.load_default()
small = ImageFont.truetype(FONT, 13) if os.path.exists(FONT) else ImageFont.load_default()
title_f = ImageFont.truetype(FONT.replace('Sans.ttf', 'Sans-Bold.ttf'), 30) if os.path.exists(FONT) else font

def tile2(path, cell):
    im = Image.open(path).convert('RGB').resize((cell // 2, cell // 2), Image.LANCZOS)
    t = Image.new('RGB', (cell, cell))
    for y in range(2):
        for x in range(2): t.paste(im, (x * cell // 2, y * cell // 2))
    return t

def sheet(name, title, items, cols=5, cell=300, tiled=True):
    lab = 44
    rows = (len(items) + cols - 1) // cols
    W, H = cols * (cell + 16) + 16, 70 + rows * (cell + lab + 16)
    img = Image.new('RGB', (W, H), (20, 20, 24))
    d = ImageDraw.Draw(img)
    d.text((16, 18), title, fill=(240, 240, 240), font=title_f)
    for i, (path, label, sub) in enumerate(items):
        x = 16 + (i % cols) * (cell + 16); y = 70 + (i // cols) * (cell + lab + 16)
        sw = tile2(path, cell) if tiled else Image.open(path).convert('RGB').resize((cell, cell), Image.LANCZOS)
        img.paste(sw, (x, y))
        d.text((x, y + cell + 4), label, fill=(235, 235, 235), font=font)
        if sub: d.text((x, y + cell + 24), sub, fill=(150, 150, 160), font=small)
    img.save(f'previews/sheets/{name}.png', optimize=True)
    print(name, img.size)

cats = {'woven': 'Woven textiles', 'knit': 'Knits', 'textile': 'Textile surfaces & dyes', 'geometric': 'Geometric & print', 'organic': 'Organic & materials'}
for c, t in cats.items():
    items = [(f"previews/{m['id']}.png", m['id'], m['name'][:34]) for m in meta if m['category'] == c]
    sheet(c, f'{t} — {len(items)} patterns (each swatch tiled 2×2: no seams)', items)
vs = sorted(os.listdir('previews/variants'))
sheet('variants', f'Parameter variants — {len(vs)} examples (tiled 2×2)', [(f'previews/variants/{v}', v[:-4], '') for v in vs], cols=6, cell=250)
maps = ['denim', 'cable-knit', 'quilted', 'bricks', 'leather', 'knit', 'corduroy', 'voronoi-cells']
items = []
for m in maps:
    for k in ['color', 'height', 'normal']: items.append((f'previews/maps/{m}-{k}.png', f'{m}', k))
sheet('material-maps', 'Material maps: colour / height / normal (all tileable)', items, cols=6, cell=220, tiled=False)
# overview: one swatch per pattern, untiled, compact
allp = [(f"previews/{m['id']}.png", m['id'], '') for m in meta]
sheet('overview', f'texturelib — all {len(allp)} patterns', allp, cols=8, cell=180, tiled=False)

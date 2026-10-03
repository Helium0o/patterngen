# python3 tools/make-sheets.py (npm run sheets; needs Pillow: pip install pillow)
# Reads the PNGs from previews/png/ (made by tools/render-all.mjs) and writes the committed previews:
#   previews/<id>.jpg, previews/presets/<id>.jpg, previews/maps/*.jpg  (transparency shown on a checkerboard)
#   previews/sheets/*.jpg  contact sheets (category sheets tile each swatch 2x2 to prove seamlessness)
import json, os, subprocess
from PIL import Image, ImageDraw, ImageFont
for d in ['previews/sheets', 'previews/presets', 'previews/maps']: os.makedirs(d, exist_ok=True)
SRC = 'previews/png'
meta = json.loads(subprocess.check_output(['node', '-e', "import('./src/index.js').then(m=>console.log(JSON.stringify({p:m.listPatterns().map(p=>({id:p.id,name:p.name,category:p.category})),r:m.PRESETS.map(r=>({id:r.id,name:r.name,pattern:r.pattern}))})))"]))
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def F(size, bold=False):
    path = FONT.replace('Sans.ttf', 'Sans-Bold.ttf') if bold else FONT
    return ImageFont.truetype(path, size) if os.path.exists(path) else ImageFont.load_default()
font, small, title_f = F(17), F(13), F(30, True)

def checker(size):
    bg = Image.new('RGB', size, (200, 200, 200))
    d = ImageDraw.Draw(bg)
    for y in range(0, size[1], 12):
        for x in range(0, size[0], 12):
            if (x // 12 + y // 12) % 2: d.rectangle([x, y, x + 11, y + 11], fill=(235, 235, 235))
    return bg

def load(path, cell, tiled):
    im = Image.open(path).convert('RGBA')
    half = cell // 2 if tiled else cell
    im = im.resize((half, half), Image.LANCZOS)
    t = Image.new('RGBA', (cell, cell))
    for y in range(cell // half):
        for x in range(cell // half): t.paste(im, (x * half, y * half))
    base = checker((cell, cell)).convert('RGBA')
    return Image.alpha_composite(base, t).convert('RGB')

def sheet(name, title, items, cols=5, cell=300, tiled=True):
    lab = 44
    rows = (len(items) + cols - 1) // cols
    W, H = cols * (cell + 16) + 16, 70 + rows * (cell + lab + 16)
    img = Image.new('RGB', (W, H), (20, 20, 24))
    d = ImageDraw.Draw(img)
    d.text((16, 18), title, fill=(240, 240, 240), font=title_f)
    for i, (path, label, sub) in enumerate(items):
        x = 16 + (i % cols) * (cell + 16); y = 70 + (i // cols) * (cell + lab + 16)
        img.paste(load(path, cell, tiled), (x, y))
        d.text((x, y + cell + 4), label, fill=(235, 235, 235), font=font)
        if sub: d.text((x, y + cell + 24), sub, fill=(150, 150, 160), font=small)
    img.save(f'previews/sheets/{name}.jpg', quality=86, optimize=True, progressive=True)
    print(name, img.size)

cats = {'woven': 'Woven textiles', 'knit': 'Knits', 'textile': 'Textile surfaces & dyes', 'geometric': 'Geometric & print', 'organic': 'Organic & materials'}
for c, t in cats.items():
    items = [(f"{SRC}/{m['id']}.png", m['id'], m['name'][:36]) for m in meta['p'] if m['category'] == c]
    sheet(c, f'{t} — {len(items)} patterns (each swatch tiled 2×2: no seams)', items)
pres = meta['r']
for k in range(0, len(pres), 42):
    chunk = pres[k:k + 42]
    sheet(f'presets-{k // 42 + 1}', f'Presets {k + 1}–{k + len(chunk)} of {len(pres)} (render(id, {{ preset }}))', [(f"{SRC}/presets/{r['id']}.png", r['id'], r['pattern']) for r in chunk], cols=7, cell=220, tiled=False)
maps = sorted({f.rsplit('-', 1)[0] for f in os.listdir(f'{SRC}/maps')})
items = []
for m in maps:
    for k in ['color', 'height', 'normal']: items.append((f'{SRC}/maps/{m}-{k}.png', m, k))
sheet('material-maps', 'Material maps: colour / height / normal (renderMaps, all tileable)', items, cols=6, cell=200, tiled=False)
allp = [(f"{SRC}/{m['id']}.png", m['id'], '') for m in meta['p']]
sheet('overview', f'texturelib — all {len(allp)} patterns (defaults)', allp, cols=8, cell=180, tiled=False)

# individual JPEG previews (384 px patterns, 256 px presets/maps), transparency over a checkerboard
def jpeg(src, dst, size):
    im = Image.open(src).convert('RGBA').resize((size, size), Image.LANCZOS)
    Image.alpha_composite(checker((size, size)).convert('RGBA'), im).convert('RGB').save(dst, quality=88, optimize=True, progressive=True)
for m in meta['p']: jpeg(f"{SRC}/{m['id']}.png", f"previews/{m['id']}.jpg", 384)
for r in pres: jpeg(f"{SRC}/presets/{r['id']}.png", f"previews/presets/{r['id']}.jpg", 256)
for f in os.listdir(f'{SRC}/maps'): jpeg(f'{SRC}/maps/{f}', 'previews/maps/' + f.replace('.png', '.jpg'), 256)
print('jpeg previews written')

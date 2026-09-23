# Converts every JPG/PNG texture under public/textures to WebP (and deletes the
# original), so scenes load a fraction of the bytes. Normal maps keep more
# quality: compression artefacts show up as bumps.
# usage: python3 scripts/webp.py
import pathlib
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'textures'
before = after = 0
for f in sorted([*root.rglob('*.jpg'), *root.rglob('*.png')]):
    q = 92 if 'nor' in f.stem else 82
    out = f.with_suffix('.webp')
    im = Image.open(f)
    im = im.convert('RGBA' if im.mode in ('RGBA', 'LA') else 'RGB')
    im.save(out, 'WEBP', quality=q, method=6)
    before += f.stat().st_size
    after += out.stat().st_size
    f.unlink()
print(f'webp: {before/1e6:.1f} MB → {after/1e6:.1f} MB')

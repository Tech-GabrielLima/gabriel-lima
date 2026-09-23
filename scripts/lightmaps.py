# Post-processes baked lightmaps for the web: a light edge-aware denoise
# (normalized convolution over baked texels only, so islands don't bleed into
# empty space) and conversion to WebP.
# usage: python3 scripts/lightmaps.py <in.png> <out.webp> [radius]
import sys
import numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
radius = float(sys.argv[3]) if len(sys.argv) > 3 else 1.2
im = Image.open(src).convert('RGBA')
a = np.asarray(im).astype(np.float32) / 255
rgb, mask = a[..., :3], (a[..., 3:] > 0.5).astype(np.float32)


def blur(x):
    chans = [np.asarray(Image.fromarray((c * 65535).astype(np.uint16) if False else (np.clip(c, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255 for c in np.moveaxis(x, -1, 0)]
    return np.stack(chans, -1)


num = blur(rgb * mask)
den = blur(np.repeat(mask, 3, -1))
out = np.where(den > 1e-3, num / np.maximum(den, 1e-3), rgb)
# Keep the margin Blender already dilated; only smooth where it baked.
out = np.where(mask > 0, out, rgb)
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(dst, quality=92, method=6)
print('lightmap', dst, im.size)

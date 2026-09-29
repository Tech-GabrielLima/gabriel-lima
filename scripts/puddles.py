# Generates public/textures/puddles.jpg: a tileable roughness mask for the wet
# alley floor. Dark = standing water (mirror), light = rough dry asphalt.
# Water collects along the gutters at the walls (u≈0, u≈1) and in random dips.
import numpy as np
from PIL import Image, ImageFilter

W, H = 256, 1024  # u across the alley, v along it
rng = np.random.default_rng(3)

def tile_noise(scale):
    g = rng.random((H // scale, W // scale))
    img = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255

n = tile_noise(64) * 0.55 + tile_noise(16) * 0.3 + tile_noise(4) * 0.15
u = np.linspace(0, 1, W)[None, :]
gutter = np.exp(-((u - 0.0) / 0.1) ** 2) + np.exp(-((u - 1.0) / 0.1) ** 2)
wet = np.clip((n - 0.52) * 6 + gutter * 0.9, 0, 1)
rough = 0.85 - wet * 0.8
img = Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))
img.convert('RGB').save('public/textures/puddles.webp', 'WEBP', quality=90)
print('puddles ok', img.size)

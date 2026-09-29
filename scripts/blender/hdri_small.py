# Downsamples HDRIs that only light reflections (never seen as a background)
# to 512×256, in place. usage: blender -b -P hdri_small.py -- a.hdr [b.hdr ...]
import bpy, sys
for path in sys.argv[sys.argv.index('--') + 1:]:
    img = bpy.data.images.load(path)
    if img.size[0] <= 512:
        continue
    img.scale(512, 256)
    img.filepath_raw = path
    img.file_format = 'HDR'
    img.save()
    print('HDRI', path, img.size[:])

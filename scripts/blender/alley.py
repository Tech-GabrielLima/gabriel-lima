# Assembles scene 03 (the alley) from the Poly Haven "Hidden Alley" kit and
# exports it for the web. Static set only: everything the visitor interacts with
# (shutters, cameras, neon, the BEL·900 tower) is added at runtime, positioned
# by the `anchor_*` empties exported here.
#
# usage: npm run blender -- scripts/blender/alley.py -- <cache_dir> <out.glb> <anchors.json>
#
# Coordinates below are glTF/three.js (x right, y up, z towards the camera).
# The alley runs along -z between two facades at x = ±HALF.

import bpy, sys, math, os, json
from mathutils import Vector

CACHE, OUT, ANCHORS = sys.argv[sys.argv.index('--') + 1:][:3]
HALF = 3.0           # half the alley's width (m)
MODULE = 3.0         # facade module width/height (m)
COLUMNS = 11         # modules per facade → 33 m of alley
FLOORS = 4

# Ground-floor module index → project door (ROTEIRO §2, Cena 03). Doors alternate
# sides so the camera zig-zags down the alley.
DOORS_RIGHT = {1: 'flight', 3: 'raft', 5: 'ledger', 7: 'cuda'}
DOORS_LEFT = {2: 'hale', 4: 'match', 6: 'nabla', 8: 'obras'}
FEATURED = {'flight', 'raft', 'match'}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def load(slug):
    """Imports a cached Poly Haven glTF; returns its objects keyed by base name."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(CACHE, slug, f'{slug}.gltf'))
    lib = {}
    for o in set(bpy.data.objects) - before:
        base = o.name.split('.')[0].rstrip('0123456789').rstrip('_')
        lib.setdefault(base, o)
    return lib


def to_blender(x, y, z):
    return Vector((x, -z, y))


placed = bpy.data.collections.new('alley')
scene.collection.children.link(placed)


def place(src, x, y, z, yaw=0.0, scale=(1, 1, 1), name=None):
    """Linked duplicate of `src` at glTF position (x,y,z), rotated `yaw` degrees about +Y."""
    o = src.copy()  # shares mesh data → instanced on export
    o.name = name or src.name
    o.location = to_blender(x, y, z)
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (0, 0, math.radians(yaw))
    o.scale = (scale[0], scale[2], scale[1])
    placed.objects.link(o)
    return o


anchors = {}


def anchor(name, x, y, z, yaw=0.0):
    """A runtime mount point, written to the anchors JSON (glTF coords, yaw in degrees)."""
    anchors[name] = {'pos': [round(x, 4), round(y, 4), round(z, 4)], 'yaw': yaw}


kit = load('modular_urban_apartments_facade')

# Upper-floor window rhythm per column; each wall_window_T has a matching window_T.
UPPER = ['centered_large', 'centered_small', 'centered_double', 'offset_small', 'centered_small', 'centered_large']


def facade(side):
    """side=+1: right wall at x=+HALF facing -x. side=-1: left wall facing +x."""
    yaw = -90 if side > 0 else 90
    doors = DOORS_RIGHT if side > 0 else DOORS_LEFT
    x = side * HALF
    for i in range(COLUMNS):
        # Module origin is its right edge; after the yaw it spans [z0-3, z0] (right) or [z0, z0+3] (left).
        z0 = -MODULE * i if side > 0 else -MODULE * (i + 1)
        zc = z0 - 1.5 if side > 0 else z0 + 1.5
        # Ground floor: a door opening for projects, a window elsewhere.
        if i in doors:
            kind = 'door_centered_large' if doors[i] in FEATURED else 'door_centered_small'
            place(kit[f'wall_{kind}'], x, 0, z0, yaw)
            # Opening centre in module-local x: large [-2.54,-0.46], small [-2.24,-0.76] → both -1.5.
            anchor(f'anchor_door_{doors[i]}', x, 0, zc, yaw)
        else:
            t = UPPER[(i * 5 + (side > 0)) % len(UPPER)]
            place(kit[f'wall_window_{t}'], x, 0, z0, yaw)
            place(kit[f'window_{t}'], x, 0, z0, yaw)
        if i not in doors:  # the plinth would block the shutter's gap
            place(kit['base_standard'], x, 0, z0, yaw)
        place(kit['cornice_standard_standard'], x, MODULE, z0, yaw)
        for f in range(1, FLOORS):
            t = UPPER[(i * 3 + f * 2 + (side > 0)) % len(UPPER)]
            place(kit[f'wall_window_{t}'], x, MODULE * f, z0, yaw)
            place(kit[f'window_{t}'], x, MODULE * f, z0, yaw)
        place(kit['crown_standard_standard'], x, MODULE * FLOORS, z0, yaw)


facade(+1)
facade(-1)

# --- props (glTF coords; yaw so each faces into the alley) -------------------
def prop(slug, x, y, z, yaw=0.0, scale=1.0):
    lib = load(slug)
    root = [o for o in lib.values() if o.parent is None]
    for o in root:
        place(o, x, y, z, yaw, (scale, scale, scale), name=f'{slug}')


END = -MODULE * COLUMNS
prop('modular_fire_escape', HALF - 0.75, 7.6, -12.0, -90)
prop('modular_fire_escape', -HALF + 0.75, 4.6, -24.0, 90)
prop('street_lamp_01', -HALF + 0.45, 0, -9.3, 90)
prop('street_lamp_01', HALF - 0.45, 0, -27.3, -90)
prop('fire_hydrant', HALF - 0.5, 0, 0.8, -60)
prop('metal_trash_can', HALF - 0.55, 0, -8.9, -80)
prop('metal_trash_can', -HALF + 0.6, 0, -17.8, 110)
prop('exterior_aircon_unit', HALF - 0.35, 4.2, -15.2, -90)
prop('exterior_aircon_unit', -HALF + 0.35, 7.3, -5.8, 90)
prop('exterior_aircon_unit', -HALF + 0.35, 4.3, -29.0, 90)
prop('utility_box_01', -HALF + 0.12, 1.0, -1.2, 90)
prop('modular_metal_gutter', HALF - 0.05, 0, -2.2, -90)
prop('concrete_road_barrier', 0.9, 0, END - 0.4, 8)
prop('old_tyre', -HALF + 0.7, 0, -12.2, 30)
prop('spray_paint_bottles_02', -HALF + 0.5, 0, -25.9, 70)

# Runtime anchors: interactive pieces and camera marks.
anchor('anchor_camera_right', HALF - 0.05, 3.25, -6.0, -90)
anchor('anchor_camera_left', -HALF + 0.05, 3.25, -20.0, 90)
anchor('anchor_lamp_left', -HALF + 0.45, 0, -9.3, 90)
anchor('anchor_lamp_right', HALF - 0.45, 0, -27.3, -90)
anchor('anchor_manhole', 0.6, 0, -28.0)
anchor('anchor_tower', 0, 0, END - 4.0)

# Drop the kit's source objects: only the placed duplicates are exported.
for o in list(scene.objects):
    if o.name not in placed.objects:
        bpy.data.objects.remove(o)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
# Keep the assembled set for the lighting bake (scripts/blender/alley_bake.py).
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(OUT), 'alley.blend'))
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_active_collection=False,
    export_extras=False,
    export_yup=True,
    export_apply=False,
    export_gpu_instances=False,
)
with open(ANCHORS, 'w') as f:
    json.dump({'half': HALF, 'length': MODULE * COLUMNS, 'floors': FLOORS, 'module': MODULE, 'anchors': anchors}, f, indent=2)
print('ALLEY_OK', len(placed.objects), 'objects →', OUT)

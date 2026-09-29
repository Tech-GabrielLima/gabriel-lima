# Bakes the alley's static lighting (ROTEIRO §4: "a luz bakeada") in Cycles and
# exports the lit set. Runs after alley.py, on the .blend it saved.
#
# usage: npm run blender -- scripts/blender/alley_bake.py -- <alley.blend> <anchors.json> <out_dir> [samples]
#
# Outputs, in <out_dir>:
#   alley_lit.glb           the set joined into one mesh, TEXCOORD_1 = lightmap UVs
#   alley_lightmap.png      irradiance on the set (sRGB-encoded)
#   ground_lightmap.png     irradiance on the alley floor (UVs: see GROUND below)
#
# Lights mirror the runtime scene (src/scenes/alley/Alley.tsx): the two sodium
# lamps, the GL neon, the tower's windows, the bulb tree and a cold night sky.
# What stays dynamic in the browser: the flashlight and the doors' own light.

import bpy, bmesh, sys, os, json, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
BLEND, ANCHORS, OUT = args[:3]
SAMPLES = int(args[3]) if len(args) > 3 else 256
SIZE = 2048

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
data = json.load(open(ANCHORS))
A = data['anchors']
HALF, LENGTH = data['half'], data['length']

# Floor bounds in glTF coords, shared with the runtime (layout.ts GROUND).
GROUND = {'x0': -HALF - 0.2, 'x1': HALF + 0.2, 'z0': 8.0, 'z1': -(LENGTH + 14.0)}


def B(x, y, z):
    """glTF (y-up) → Blender (z-up)."""
    return Vector((x, -z, y))


def inward(a):
    r = math.radians(a['yaw'])
    return math.sin(r), math.cos(r)


# --- 0. slim every unique mesh before instancing is lost ------------------------
# Instanced, the kit is cheap; joined for one lightmap, every copy becomes real
# geometry. Flat plaster walls collapse to a handful of faces (planar dissolve);
# props get a per-kind collapse ratio. Done once per mesh datablock.
COLLAPSE = {
    'window_': 0.45, 'fire_hydrant': 0.15, 'street_lamp': 0.12, 'concrete_road_barrier': 0.04,
    'exterior_aircon_unit': 0.15, 'metal_trash_can': 0.35, 'modular_metal_gutter': 0.3,
    'crown_': 0.5, 'spray_paint': 0.2, 'utility_box': 0.3, 'old_tyre': 0.5, 'wall_door': 0.4,
}


def kind(o):
    return o.name.split('.')[0].rstrip('0123456789').rstrip('_')


done = {}
before = sum(len(o.data.polygons) for o in scene.objects if o.type == 'MESH')
for o in [o for o in scene.objects if o.type == 'MESH']:
    if o.data.name in done:
        o.data = done[o.data.name]
        continue
    k = kind(o)
    tmp = bpy.data.objects.new('tmp', o.data)
    scene.collection.objects.link(tmp)
    if k.startswith('wall_window') or k.startswith('wall_standard'):
        mod = tmp.modifiers.new('d', 'DECIMATE')
        mod.decimate_type = 'DISSOLVE'
        mod.angle_limit = math.radians(1)
        mod.delimit = {'UV', 'MATERIAL'}
    else:
        ratio = next((r for p, r in COLLAPSE.items() if k.startswith(p)), None)
        if ratio is None:
            done[o.data.name] = o.data
            bpy.data.objects.remove(tmp)
            continue
        mod = tmp.modifiers.new('d', 'DECIMATE')
        mod.ratio = ratio
    dg = bpy.context.evaluated_depsgraph_get()
    slim = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    done[o.data.name] = slim
    o.data = slim
after = sum(len(o.data.polygons) for o in scene.objects if o.type == 'MESH')
print(f'SLIM {before} → {after} faces')

# --- 1. one mesh, one lightmap -------------------------------------------------
meshes = [o for o in scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.join()
set_obj = bpy.context.view_layer.objects.active
set_obj.name = 'alley_set'
me = set_obj.data
print('SET faces', len(me.polygons))

# The kit's own UVs stay first (TEXCOORD_0); the lightmap UVs are added second.
render_uv = me.uv_layers[0]
lm = me.uv_layers.new(name='lightmap')
me.uv_layers.active = lm
render_uv.active_render = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0015, area_weight=0.0, correct_aspect=True)
bpy.ops.object.mode_set(mode='OBJECT')

# --- 2. the floor and the tower (runtime geometry the light must know about) ----
gm = bpy.data.meshes.new('ground')
bm = bmesh.new()
g = GROUND
vs = [bm.verts.new(B(x, 0, z)) for x, z in [(g['x0'], g['z0']), (g['x1'], g['z0']), (g['x1'], g['z1']), (g['x0'], g['z1'])]]
bm.faces.new(vs)
uv = bm.loops.layers.uv.new('lightmap')
for f in bm.faces:
    for loop in f.loops:
        co = loop.vert.co  # Blender coords: x, -z(gltf)
        loop[uv].uv = ((co.x - g['x0']) / (g['x1'] - g['x0']), (-co.y - g['z0']) / (g['z1'] - g['z0']))
bm.to_mesh(gm)
bm.free()
ground = bpy.data.objects.new('ground', gm)
scene.collection.objects.link(ground)
gmat = bpy.data.materials.new('ground_mat')
gmat.use_nodes = True
gmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.2, 0.22, 1)
gmat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
gm.materials.append(gmat)

tz = A['anchor_tower']['pos'][2]
bpy.ops.mesh.primitive_cube_add(size=1, location=B(0, 20, tz - 5))
tower = bpy.context.active_object
tower.scale = (16, 10, 40)
tmat = bpy.data.materials.new('tower_mat')
tmat.use_nodes = True
tmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.03, 0.035, 0.045, 1)
tower.data.materials.append(tmat)


def emitter(name, loc, size, color, strength, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], 1)
    m = bpy.data.materials.new(name + '_mat')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = strength
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs[0])
    o.data.materials.append(m)
    o.visible_camera = False
    return o


# The tower's lit windows spill onto the end of the alley.
emitter('tower_glow', B(0, 20, tz + 0.05), (16, 36), (1.0, 0.82, 0.6), 0.9, rot=(math.radians(90), 0, 0))


# --- 3. lights -----------------------------------------------------------------
def point(name, loc, color, watts, radius=0.05):
    l = bpy.data.lights.new(name, 'POINT')
    l.color = color
    l.energy = watts
    l.shadow_soft_size = radius
    o = bpy.data.objects.new(name, l)
    o.location = loc
    scene.collection.objects.link(o)


def hexrgb(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


for k in ('anchor_lamp_left', 'anchor_lamp_right'):
    a = A[k]
    nx, nz = inward(a)
    point(k, B(a['pos'][0] + nx * 0.55, 3.62, a['pos'][2] + nz * 0.55), hexrgb('#ffab5c'), 260, 0.08)
point('neon_gl', B(-HALF + 0.9, 4.7, -3.1), hexrgb('#ff9a4a'), 90, 0.4)
point('bulb_tree', B(0, 4.6, -19.5), hexrgb('#ffcf8a'), 70, 0.6)

world = bpy.data.worlds.new('night')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (*hexrgb('#34466e'), 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
scene.world = world

# --- 4. bake -------------------------------------------------------------------
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.render.bake.use_pass_direct = True
scene.render.bake.use_pass_indirect = True
scene.render.bake.use_pass_color = False
scene.render.bake.margin = 6
scene.view_settings.view_transform = 'Standard'


def bake(obj, name, w, h):
    # Transparent until baked: the alpha tells the denoiser which texels are real.
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=True)
    img.generated_color = (0, 0, 0, 0)
    for slot in obj.material_slots:
        m = slot.material
        if not m:
            continue
        m.use_nodes = True
        n = m.node_tree.nodes.new('ShaderNodeTexImage')
        n.image = img
        m.node_tree.nodes.active = n
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    obj.data.uv_layers.active = obj.data.uv_layers['lightmap']
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=6, use_clear=True)
    path = os.path.join(OUT, f'{name}.png')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save_render(path)
    print('BAKED', path)
    # Remove the bake nodes so they aren't exported.
    for slot in obj.material_slots:
        m = slot.material
        if m:
            for n in [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image == img]:
                m.node_tree.nodes.remove(n)


os.makedirs(OUT, exist_ok=True)
bake(ground, 'ground_lightmap', 256, 2048)
bake(set_obj, 'alley_lightmap', SIZE, SIZE)

# --- 5. export the set only ----------------------------------------------------
bpy.ops.object.select_all(action='DESELECT')
set_obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'alley_lit.glb'), export_format='GLB', use_selection=True, export_yup=True)
with open(os.path.join(OUT, 'ground.json'), 'w') as f:
    json.dump(GROUND, f)
print('BAKE_OK')

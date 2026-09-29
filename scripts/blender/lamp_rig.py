# Splits Poly Haven's desk_lamp_arm_01 (a single mesh in its glTF) into an
# articulated chain — base → lower arm → upper arm → head — with each part's
# origin on its joint, so the site can pose it with 2-bone IK (Cena 02: the
# lamp follows the cursor).
#
# usage: npm run blender -- scripts/blender/lamp_rig.py -- <in.gltf> <out.glb>
#
# Joint positions (glTF coords, metres) read off the model; see src/scenes/studio/lamp.ts.

import bpy, sys, os
from mathutils import Vector

SRC, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
J0 = (0.0, 0.07, 0.03)     # base swivel / shoulder
J1 = (0.0, 0.41, 0.285)    # elbow
J2 = (0.0, 0.79, -0.13)    # wrist (head pivot)
SHADE = (0.0, 0.69, -0.19)  # centre of the shade


def B(p):
    return Vector((p[0], -p[2], p[1]))


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
lamp = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = lamp
lamp.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')

groups = {'base': [], 'lower': [], 'upper': [], 'head': []}
j0, j1, j2, shade = B(J0), B(J1), B(J2), B(SHADE)
for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    c = sum(pts, Vector()) / 8
    if c.z < 0.09:
        groups['base'].append(o)
    elif (c - shade).length < 0.14 or (c.z > 0.62 and -c.y < -0.07):
        groups['head'].append(o)
    elif seg_dist(c, j0, j1) < seg_dist(c, j1, j2):
        groups['lower'].append(o)
    else:
        groups['upper'].append(o)

pivots = {'base': j0, 'lower': j0, 'upper': j1, 'head': j2}
joined = {}
for name, objs in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = f'lamp_{name}'
    # Origin on the joint.
    bpy.context.scene.cursor.location = pivots[name]
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    joined[name] = ob
    print('GROUP', name, len(objs), 'parts', len(ob.data.polygons), 'faces')

# Chain: each part is a child of the previous, keeping its world transform.
for child, parent in (('lower', 'base'), ('upper', 'lower'), ('head', 'upper')):
    c, p = joined[child], joined[parent]
    c.parent = p
    c.matrix_parent_inverse = p.matrix_world.inverted()

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True)
print('LAMP_OK')

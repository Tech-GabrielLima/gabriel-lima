# Splits Poly Haven's security_camera_01 (one mesh) into a wall mount that
# stays put and a head that swivels, with the head's origin on the swivel joint.
# In glTF coords the wall plate is at -z and the lens looks towards +z.
#
# usage: npm run blender -- scripts/blender/camera_rig.py -- <in.gltf> <out.glb>

import bpy, sys, os
from mathutils import Vector

SRC, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
HEAD_MIN_Y = 0.085  # glTF metres: parts centred above this are the housing

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
cam = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = cam
cam.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')


def centre(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return sum(pts, Vector()) / 8, pts


head, mount = [], []
for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    c, _ = centre(o)
    (head if c.z > HEAD_MIN_Y else mount).append(o)  # Blender z = glTF y

# Pivot: under the housing, above the swivel — the lowest point of the head, centred on its lowest part.
lowest = min(head, key=lambda o: min(p.z for p in centre(o)[1]))
lc, lp = centre(lowest)
pivot = Vector((lc.x, lc.y, min(p.z for p in lp)))


def join(objs, name, origin):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    bpy.context.scene.cursor.location = origin
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    print('PART', name, len(objs), 'pieces', len(ob.data.polygons), 'faces')
    return ob


m = join(mount, 'camera_mount', Vector((0, 0, 0)))
h = join(head, 'camera_head', pivot)
h.parent = m
h.matrix_parent_inverse = m.matrix_world.inverted()
print('PIVOT gltf', round(pivot.x, 4), round(pivot.z, 4), round(-pivot.y, 4))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True)
print('CAMERA_OK')

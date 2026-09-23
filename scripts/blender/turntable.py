# Renders a model from +X, -X, +Z, -Z (glTF axes) to identify its facing.
# usage: blender -b -P scripts/blender/turntable.py -- <in.gltf> <out_prefix>
import bpy, sys, math
from mathutils import Vector
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
center, size = (lo + hi) / 2, (hi - lo).length
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; scene.cycles.device = 'CPU'
scene.render.resolution_x = scene.render.resolution_y = 360
world = bpy.data.worlds.new('w'); world.use_nodes = True; scene.world = world
world.node_tree.nodes['Background'].inputs[1].default_value = 1.5
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
# Blender is Z-up; glTF +Z (forward) maps to Blender -Y.
views = {'gltf+X': Vector((1, 0, 0)), 'gltf-X': Vector((-1, 0, 0)), 'gltf+Z': Vector((0, -1, 0)), 'gltf-Z': Vector((0, 1, 0))}
for name, d in views.items():
    cam.location = center + (d + Vector((0, 0, 0.25))) * size * 1.4
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = f'{out}_{name}.png'
    bpy.ops.render.render(write_still=True)

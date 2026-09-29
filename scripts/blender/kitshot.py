# Front render of a whole model/kit, for reference.
# usage: blender -b -P scripts/blender/kitshot.py -- <in.gltf> <out.png> [yaw_deg]
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
yaw = math.radians(float(a[2])) if len(a) > 2 else 0.0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
pts = [o.matrix_world @ Vector(c) for o in bpy.context.scene.objects if o.type == 'MESH' for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
c, size = (lo + hi) / 2, (hi - lo)
s = bpy.context.scene
s.render.engine = 'CYCLES'; s.cycles.samples = 24; s.cycles.device = 'CPU'; s.cycles.use_denoising = True
s.render.resolution_x, s.render.resolution_y = 1600, 700
w = bpy.data.worlds.new('w'); w.use_nodes = True; s.world = w
w.node_tree.nodes['Background'].inputs[1].default_value = 1.2
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); s.collection.objects.link(sun)
sun.data.energy = 3; sun.rotation_euler = (math.radians(50), 0, math.radians(30))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(size.x, size.z * 1600 / 700) * 1.05
d = Vector((math.sin(yaw), -math.cos(yaw), 0.0))
cam.location = c + d * 60
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_end = 200
s.render.filepath = out
bpy.ops.render.render(write_still=True)

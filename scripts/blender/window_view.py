# Renders the city seen from the studio's window out of the rooftop_night HDRI
# (a flat LDR image the rain-on-glass shader refracts; see RainGlass.tsx).
# usage: blender -b -P window_view.py -- <hdri> <out_prefix> [yaw_deg ...]
import bpy, sys, math
a = sys.argv[sys.argv.index('--') + 1:]
hdri, out, yaws = a[0], a[1], [float(y) for y in a[2:]] or [0.0]
bpy.ops.wm.read_factory_settings(use_empty=True)
s = bpy.context.scene
s.render.engine = 'CYCLES'
s.cycles.samples = 8
s.render.resolution_x, s.render.resolution_y = 1280, 720
s.view_settings.view_transform = 'Standard'
s.view_settings.exposure = -0.9
PITCH = 97  # look a little above the horizon: sky, the far lights, a strip of roof
w = bpy.data.worlds.new('w'); w.use_nodes = True; s.world = w
nt = w.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(hdri)
nt.links.new(env.outputs[0], nt.nodes['Background'].inputs[0])
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); s.collection.objects.link(cam); s.camera = cam
cam.data.lens_unit = 'FOV'; cam.data.angle = math.radians(72)
for y in yaws:
    cam.rotation_euler = (math.radians(PITCH), 0, math.radians(y))
    s.render.filepath = f'{out}_{int(y)}.png'
    bpy.ops.render.render(write_still=True)

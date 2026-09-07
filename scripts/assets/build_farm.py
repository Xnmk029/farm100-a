"""Original low-poly FARM100 asset library. Blender 4.0+, no external models.
Run: blender --background --python scripts/assets/build_farm.py -- <project root>
All assets share an orthographic camera, materials and world-space scale.
"""
import bpy, math, random, json, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(sys.argv[sys.argv.index('--') + 1])
OUT = ROOT / 'apps/desktop/public/assets/farm-v1'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'assets/source'
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.use_gtao = True
scene.eevee.gtao_distance = 3
scene.eevee.gtao_factor = 1.3
scene.eevee.taa_render_samples = 48
scene.render.resolution_x = scene.render.resolution_y = 320
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
scene.world.color = (.3, .3, .3)

def material(name, color, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = .76
    bs.inputs['Metallic'].default_value = metal
    return m

M = {k: material(k, c) for k,c in {
    'grass':(.29,.43,.14), 'grasslight':(.41,.55,.2), 'grassdark':(.19,.32,.12),
    'soil':(.32,.19,.105), 'furrow':(.22,.12,.066), 'wet':(.18,.115,.077),
    'path':(.61,.47,.29), 'stone':(.36,.4,.38), 'wood':(.36,.21,.115),
    'woodlight':(.62,.4,.19), 'ivory':(.88,.85,.68), 'gold':(.92,.6,.16),
    'wheat':(.77,.47,.09), 'leaf':(.24,.44,.11), 'leaflight':(.43,.61,.16),
    'carrot':(.96,.32,.045), 'pumpkin':(.83,.25,.04), 'red':(.53,.12,.08),
    'roof':(.2,.28,.28), 'water':(.22,.49,.57), 'teal':(.11,.39,.38),
    'dark':(.055,.095,.11), 'blue':(.22,.64,.82), 'purple':(.54,.3,.69),
}.items()}

def finish(obj, mat, name=None):
    obj.data.materials.append(M[mat])
    if name: obj.name = name
    return obj

def cube(loc, scale, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob=bpy.context.object; ob.scale=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod=ob.modifiers.new('soft machined edges','BEVEL');mod.width=bevel;mod.segments=1
        ob.modifiers.new('weighted corners','WEIGHTED_NORMAL')
    return finish(ob,mat)

def ico(loc, scale, mat, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
    ob=bpy.context.object;ob.scale=scale;return finish(ob,mat)

def cylinder(loc, radius, depth, mat, vertices=8, top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if top is None else top, depth=depth, location=loc)
    return finish(bpy.context.object,mat)

def stem(a,b,r,mat):
    a,b=Vector(a),Vector(b);ob=cylinder((a+b)/2,r,(b-a).length,mat)
    ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return ob

def leaf(x,y,z,angle,size,mat='leaf'):
    ob=ico((x+math.cos(angle)*size*.35,y+math.sin(angle)*size*.35,z),(size*.57,size*.16,size*.10),mat)
    ob.rotation_euler=(0,-.45,angle)

def crop(kind, stage):
    rng=random.Random(kind+str(stage)); f=[.14,.36,.65,1][stage]
    if stage==0:
        for x,y in [(-.3,-.15),(.25,.18),(0,.35)]:
            ico((x,y,.035),(.15,.08,.06),'wheat');leaf(x,y,.08,1,.17,'leaflight')
        return
    if kind=='wheat':
        for i in range(9):
            x,y=rng.uniform(-.55,.55),rng.uniform(-.55,.55); h=(.9+rng.random()*.35)*f
            stem((x,y,0),(x+.07,y,h),.025,'wheat' if stage==3 else 'leaf')
            leaf(x,y,h*.5,i, .32*f)
            for j in range(3):
                ob=ico((x+.07,y,h+j*.095*f),(.11*f,.09*f,.14*f),'gold' if stage==3 else 'leaflight')
    elif kind=='carrot':
        for x,y in [(-.38,-.28),(.38,-.28),(0,.35)]:
            cylinder((x,y,.16*f),.22*f,.52*f,'carrot',7,top=.12*f)
            for a in range(5): leaf(x,y,.3*f,a*1.26,.65*f,'leaflight' if a%2 else 'leaf')
    elif kind=='pumpkin':
        for a in range(6):leaf(0,0,.09,a*1.05,.85*f)
        for a in range(8):
            t=a*math.tau/8;ico((math.cos(t)*.27*f,math.sin(t)*.27*f,.4*f),(.3*f,.3*f,.39*f),'pumpkin' if a%2 else 'carrot',2)
        stem((0,0,.65*f),(.09,0,.92*f),.06*f,'wood')
    elif kind=='sunflower':
        for x,y in [(-.32,-.2),(.35,.25)]:
            h=1.7*f;stem((x,y,0),(x,y,h),.055*f,'leaf')
            leaf(x,y,h*.4,0,.6*f);leaf(x,y,h*.6,3,.55*f)
            for a in range(10):
                t=a*math.tau/10;ico((x+math.cos(t)*.29*f,y-.075,h+math.sin(t)*.29*f),(.14*f,.09*f,.14*f),'gold')
            ico((x,y-.1,h),(.24*f,.12*f,.24*f),'wood')
    elif kind=='cactus':
        cylinder((0,0,.65*f),.26*f,1.3*f,'teal',7,top=.21*f)
        ico((0,0,1.3*f),(.21*f,.21*f,.18*f),'leaflight')
        for s in [-1,1]:
            stem((0,0,.5*f),(s*.4*f,0,.5*f),.115*f,'teal')
            stem((s*.4*f,0,.5*f),(s*.4*f,0,(.8+.2*s)*f),.115*f,'teal')
        if stage==3:ico((0,0,1.51),(.14,.14,.12),'carrot')
    elif kind=='bean':
        for x in [-.4,.4]:stem((x,0,0),(x,0,1.5*f),.035,'woodlight')
        for h in [.5,1,1.4]:stem((-.4,0,h*f),(.4,0,h*f),.03,'woodlight')
        for i in range(8):
            z=(i*.16+.15)*f;x=math.sin(i*2)*.3
            leaf(x,0,z,i,.45*f)
            if stage==3:ico((x,-.12,z),(.055,.065,.23),'leaflight')
    elif kind=='tree':
        cylinder((0,0,.5*f),.12*f,1*f,'wood',6)
        for x,y,z,r in [(-.32,0,1.2,.55),(.3,.1,1.3,.65),(0,0,1.8,.6)]:ico((x*f,y*f,z*f),(r*f,r*f,r*f),'leaf' if x<0 else 'leaflight',1)
    elif kind=='crystal':
        for i in range(5):
            x,y=rng.uniform(-.4,.4),rng.uniform(-.4,.4);h=(.5+rng.random())*f
            ob=cylinder((x,y,h*.5),.19*f,h,'purple',5,top=0);ob.rotation_euler[1]=rng.uniform(-.2,.2)

def tile(kind,variant):
    rng=random.Random(variant+52)
    cube((0,0,-.12),(2,2,.24),'soil',.045)
    cube((0,0,-.015),(2,2,.07),kind,.025)
    if kind in ['soil','wet']:
        for x in [-.7,-.35,0,.35,.7]:cube((x,0,.029),(.055,1.85,.025),'furrow')
        for i in range(8):ico((rng.uniform(-.9,.9),rng.uniform(-.9,.9),.04),(.055,.04,.035),'soil')
    if kind=='grass':
        for i in range(20):
            x,y=rng.uniform(-.93,.93),rng.uniform(-.93,.93)
            ob=cylinder((x,y,.08),.055,.17,'grasslight' if i%3 else 'grassdark',3,top=0)
    if kind=='path':
        for i in range(9):ico((rng.uniform(-.8,.8),rng.uniform(-.8,.8),.04),(.14,.08,.05),'woodlight')

def prop(kind):
    if kind=='fence':
        for x in [-.85,.85]: cube((x,0,.5),(.14,.15,1),'woodlight',.025)
        for z in [.3,.7]:cube((0,0,z),(1.9,.1,.12),'woodlight',.015)
    elif kind=='crate':
        cube((0,0,.33),(1,.8,.66),'wood',.05)
        for x in [-.43,.43]:cube((x,-.43,.35),(.09,.1,.75),'woodlight')
        for z in [.15,.42,.64]:cube((0,-.43,z),(.9,.08,.12),'woodlight')
        for x in [-.25,.2]:ico((x,-.05,.73),(.21,.23,.23),'carrot',2)
    elif kind=='tank':
        for x in [-.38,.38]:cube((x,0,.2),(.13,.6,.4),'wood')
        cylinder((0,0,.8),.65,.95,'teal',12)
        for z in [.43,1.18]:cylinder((0,0,z),.67,.075,'ivory',12)
        cylinder((0,0,1.3),.59,.1,'water',12)
        stem((.5,0,.6),(.85,0,.6),.07,'woodlight')
    elif kind=='barn':
        cube((0,0,.76),(2.1,1.65,1.52),'red',.04)
        for x in [-1,1]:cube((x,-.86,.76),(.12,.12,1.5),'ivory')
        cube((0,-.88,.52),(.72,.07,1.04),'wood')
        for x in [-.4,.4]:cube((x,-.93,.57),(.08,.08,1.14),'ivory')
        cube((0,-.93,1.12),(.88,.08,.08),'ivory')
        for s in [-1,1]:
            ob=cube((s*.6,0,1.8),(1.43,1.97,.14),'roof');ob.rotation_euler[1]=s*.52
        cube((.64,.3,2.02),(.25,.25,.65),'stone')
    elif kind=='rock':
        ico((0,0,.24),(.65,.47,.46),'stone');ico((.5,.25,.1),(.25,.2,.2),'stone')
    elif kind=='pine':
        cylinder((0,0,.45),.14,.9,'wood',6)
        for z,r in [(1.0,.8),(1.5,.66),(2,.48)]:cylinder((0,0,z),r,1.2,'grassdark' if z==1 else 'leaf',7,top=.04)

def drone(angle):
    before=set(bpy.data.objects)
    cube((0,0,.12),(.75,.62,.3),'ivory',.11)
    cube((0,-.31,.18),(.52,.07,.18),'dark',.035)
    for x in [-.15,.15]:cube((x,-.355,.19),(.055,.015,.055),'blue',.01)
    cube((0,0,.31),(.23,.3,.06),'teal',.02)
    for x in [-.47,.47]:
        for y in [-.4,.4]:
            stem((x*.6,y*.6,.12),(x,y,.16),.055,'roof')
            cylinder((x,y,.23),.09,.18,'teal',8)
            ob=cube((x,y,.34),(.55,.065,.025),'woodlight',.025);ob.rotation_euler[2]=(x+y)*2
    for x in [-.27,.27]:stem((x,-.15,.01),(x,-.15,-.16),.035,'roof')
    for ob in set(bpy.data.objects)-before:
        x,y=ob.location.x,ob.location.y;t=angle*math.tau/8
        ob.location.x=x*math.cos(t)-y*math.sin(t);ob.location.y=x*math.sin(t)+y*math.cos(t)
        ob.rotation_euler.z+=t

bpy.ops.object.camera_add(location=(8,-8,10.7))
camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.7))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=6;scene.camera=camera
for name,loc,power,size in [('key',(-3,-4,8),1000,5),('fill',(4,1,6),450,5)]:
    bpy.ops.object.light_add(type='AREA',location=loc);ob=bpy.context.object;ob.name=name;ob.data.energy=power;ob.data.shape='DISK';ob.data.size=size
    ob.rotation_euler=(-ob.location).to_track_quat('-Z','Y').to_euler()
fixed=set(bpy.data.objects)
manifest={'version':1,'author':'FARM100 original procedural models','renderer':'Blender 4.0 EEVEE','size':320,'orthoScale':6,'elevationSin':10/math.sqrt(228),'anchor':[.5,.5+.7*(math.sqrt(128)/math.sqrt(228))/6],'assets':{}}

def render(name,build):
    for ob in bpy.data.objects:
        if ob not in fixed:ob.hide_render=True
    before=set(bpy.data.objects);build();objs=set(bpy.data.objects)-before
    col=bpy.data.collections.new(name);scene.collection.children.link(col)
    for ob in objs:
        for old in list(ob.users_collection):old.objects.unlink(ob)
        col.objects.link(ob)
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    manifest['assets'][name]={'file':name+'.png','objects':len(objs)}
    print('ASSET_DONE '+name,flush=True)

for kind in ['grass','soil','wet','path']:
    for v in range(2):render(f'tile-{kind}-{v}',lambda k=kind,v=v:tile(k,v))
for kind in ['wheat','carrot','pumpkin','sunflower','cactus','bean','tree','crystal']:
    for stage in range(4):render(f'{kind}-{stage}',lambda k=kind,s=stage:crop(k,s))
for kind in ['fence','crate','tank','barn','rock','pine']:render(kind,lambda k=kind:prop(k))
for angle in range(8):render(f'drone-{angle}',lambda a=angle:drone(a))
for ob in bpy.data.objects:
    if ob not in fixed:ob.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'farm-library-v1.blend'))
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print('FARM100_ASSETS_COMPLETE',flush=True)

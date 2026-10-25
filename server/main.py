"""Local analytic STEP connector candidate service. Originals never leave this service."""
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
import tempfile, hashlib, math, json, re, subprocess
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED, TopAbs_IN, TopAbs_ON
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.BRepTools import BRepTools
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Cylinder
from OCP.gp import gp_Pnt, gp_Pnt2d
import cadquery as cq

MIN_FACE_AREA_MM2=20
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=['http://127.0.0.1:5173','http://localhost:5173'], allow_methods=['GET','POST'], allow_headers=['*'])

@app.get('/health')
def health(): return {'ready': True, 'engine': 'OpenCascade 7.9'}

def tangent(normal):
    ref = [1,0,0] if abs(normal[0]) < .85 else [0,1,0]
    dot = sum(a*b for a,b in zip(ref,normal)); t=[a-dot*b for a,b in zip(ref,normal)]
    length=math.sqrt(sum(x*x for x in t)); return [x/length for x in t]

def extract_candidates(data: bytes):
    digest=hashlib.sha256(data).hexdigest()
    with tempfile.TemporaryDirectory() as folder:
        path=Path(folder)/'model.step'; path.write_bytes(data)
        reader=STEPControl_Reader()
        if reader.ReadFile(str(path)) != IFSelect_RetDone: raise ValueError('STEP could not be read')
        reader.TransferRoots(); shape=reader.OneShape()
    candidates=[]; seen=set(); face_index=0
    def add(kind, point, normal, evidence, diameter=None, area=None):
        pos=[v/1000 for v in point]
        key=(kind,*(round(v,7) for v in pos),*(round(v,5) for v in normal))
        if key in seen: return
        seen.add(key)
        item={'id':f'n{len(candidates)+1}', 'geometryRevision':digest,'kind':kind,'position':pos,'normal':normal,'tangent':tangent(normal),
              'label': ('Hole opening' if kind=='hole' else 'Planar surface')+f' {len(candidates)+1}', 'reason':evidence,'review':'suggested','method':'step_analytic'}
        if diameter is not None:item['diameterM']=diameter/1000
        if area is not None:item['areaM2']=area/1e6
        candidates.append(item)
    def cylinder_key(cyl):
        axis=list(cyl.Axis().Direction().Coord()); origin=list(cyl.Location().Coord())
        flip=-1 if next((x for x in axis if abs(x)>1e-9),1)<0 else 1; axis=[flip*x for x in axis]
        along=sum(o*a for o,a in zip(origin,axis)); offset=[o-along*a for o,a in zip(origin,axis)]
        return (*(round(a,6) for a in axis),*(round(o,4) for o in offset),round(cyl.Radius(),4))
    # STEP exporters often split one bore into several cylindrical faces, so judge enclosure by total angle per bore.
    spans={}
    pre=TopExp_Explorer(shape,TopAbs_FACE)
    while pre.More():
        f=TopoDS.Face_s(pre.Current()); sf=BRepAdaptor_Surface(f)
        if sf.GetType()==GeomAbs_Cylinder:
            a0,a1,b0,b1=BRepTools.UVBounds_s(f)
            if all(math.isfinite(x) for x in [a0,a1,b0,b1]):
                k=cylinder_key(sf.Cylinder()); spans[k]=spans.get(k,0)+(a1-a0)
        pre.Next()
    faces=[]
    explorer=TopExp_Explorer(shape,TopAbs_FACE)
    while explorer.More():
        face_index+=1
        if face_index>20000: raise ValueError('Model has too many faces for interactive analysis')
        face=TopoDS.Face_s(explorer.Current()); surf=BRepAdaptor_Surface(face); kind=surf.GetType()
        u0,u1,v0,v1=BRepTools.UVBounds_s(face)
        if all(math.isfinite(x) for x in [u0,u1,v0,v1]):
            if kind==GeomAbs_Plane:
                props=GProp_GProps();BRepGProp.SurfaceProperties_s(face,props);area=props.Mass()
                if area>=MIN_FACE_AREA_MM2:
                    normal=list(surf.Plane().Axis().Direction().Coord())
                    if face.Orientation()==TopAbs_REVERSED: normal=[-x for x in normal]
                    faces.append((area,face_index,face,surf,normal,(u0,u1,v0,v1)))
            elif kind==GeomAbs_Cylinder and spans.get(cylinder_key(surf.Cylinder()),0)>=2*math.pi-1e-3:
                cyl=surf.Cylinder();radius=cyl.Radius();axis=list(cyl.Axis().Direction().Coord());origin=list(cyl.Location().Coord())
                midpoint=surf.Value((u0+u1)/2,(v0+v1)/2); center=[origin[i]+axis[i]*(v0+v1)/2 for i in range(3)]
                radial=[(midpoint.Coord()[i]-center[i])/radius for i in range(3)]
                eps=max(.001,min(.05,radius*.01))
                inner=gp_Pnt(*[center[i]+radial[i]*(radius-eps) for i in range(3)])
                outer=gp_Pnt(*[center[i]+radial[i]*(radius+eps) for i in range(3)])
                cavity=BRepClass3d_SolidClassifier(shape,inner,1e-6).State()!=TopAbs_IN and BRepClass3d_SolidClassifier(shape,outer,1e-6).State()==TopAbs_IN
                if cavity:
                    for v,sign in [(v0,-1),(v1,1)]:
                        point=[origin[i]+axis[i]*v for i in range(3)];normal=[sign*x for x in axis]
                        beyond=gp_Pnt(*[point[i]+normal[i]*eps for i in range(3)])
                        if BRepClass3d_SolidClassifier(shape,beyond,1e-6).State()!=TopAbs_IN:
                            add('hole',point,normal,f'Analytic internal cylinder on face {face_index}; open axis endpoint. Fastener and through-hole status require review.',diameter=2*radius)
        explorer.Next()
    # Click points on flat faces, largest faces first and in three passes (centers, then corners, then edge midpoints)
    # so every face gets coverage before the 64-node budget runs out. Points off the face (holes, rounded ends) are skipped.
    faces.sort(key=lambda f:-f[0])
    for label,fractions in [('center',[(.5,.5)]),('corner',[(0,0),(1,0),(0,1),(1,1)]),('edge midpoint',[(.5,0),(.5,1),(0,.5),(1,.5)])]:
        for area,index,face,surf,normal,(u0,u1,v0,v1) in faces:
            for fu,fv in fractions:
                if len(candidates)>=64: break
                u=u0+(u1-u0)*fu;v=v0+(v1-v0)*fv
                if BRepClass_FaceClassifier(face,gp_Pnt2d(u,v),1e-6).State() not in (TopAbs_IN,TopAbs_ON): continue
                add('surface',surf.Value(u,v).Coord(),normal,f'Face {index} {label} click point on an analytic planar face; requires review.',area=area)
    # Prefer actual bore candidates and larger surfaces; keep payload bounded.
    candidates.sort(key=lambda n:(n['kind']!='hole',-n.get('areaM2',0)))
    return {'geometryRevision':digest,'candidates':candidates[:64],'engine':'OpenCascade 7.9','units':'meter'}

@app.post('/analyze')
def analyze(file: UploadFile):
    if not (file.filename or '').lower().endswith(('.step','.stp')):raise HTTPException(400,'Analytic analysis requires STEP/STP')
    data=file.file.read(30*1024*1024+1)
    if not data or len(data)>30*1024*1024:raise HTTPException(413,'Choose a non-empty STEP under 30 MB')
    try:return extract_candidates(data)
    except Exception as exc:raise HTTPException(422,str(exc)[:200])

@app.post('/generate')
def generate_model(payload: dict):
    sku=payload.get('sku')
    if not isinstance(sku,str) or not re.fullmatch(r'[A-Za-z0-9-]+',sku):raise HTTPException(400,'A catalog SKU is required')
    root=Path(__file__).resolve().parents[1]
    # Pre-built models (npm run models:build) are served straight from public/generated.
    manifest_path=root/'public/generated'/sku/'manifest.json'
    if manifest_path.exists() and (root/'public/generated'/sku/'model.step').exists():
        try:
            manifest=json.loads(manifest_path.read_text())
            return {'sku':sku,'name':manifest['product']['name'],'stepUrl':f'/generated/{sku}/model.step','manifest':manifest,'cached':True}
        except Exception:pass
    run=subprocess.run([
        'node','--env-file-if-exists=.env','--env-file-if-exists=.env.local','scripts/generate-model.mjs',sku
    ],cwd=root,capture_output=True,text=True,timeout=180)
    if run.returncode != 0:
        raise HTTPException(500,(run.stderr or run.stdout or 'Generation failed').strip()[-800:])
    try:
        manifest=json.loads((root/'public/generated'/sku/'manifest.json').read_text())
    except Exception as exc:raise HTTPException(500,f'Generation produced no manifest: {exc}')
    return {
        'sku':sku,
        'name':manifest['product']['name'],
        # Served by this service: the dev server only lists public files at startup and would answer with the app's HTML page.
        'stepUrl':f'/geometry/generated-file/{sku}/model.step',
        'manifest':manifest,
    }

@app.get('/generated-file/{sku}/{filename}')
def generated_file(sku: str, filename: str):
    if not re.fullmatch(r'[A-Za-z0-9-]+',sku) or filename not in ('model.step','model.glb','model.stl'):raise HTTPException(404,'Not found')
    path=Path(__file__).resolve().parents[1]/'public'/'generated'/sku/filename
    if not path.exists():raise HTTPException(404,'Not found')
    return FileResponse(path)

@app.post('/custom')
def generate_custom(payload: dict):
    def dimension(key, low, high, required=False):
        value=payload.get(key)
        if value is None:
            if required:raise HTTPException(400,f'{key} is required')
            return None
        if not isinstance(value,(int,float)) or isinstance(value,bool) or not math.isfinite(value) or value<low or value>high:
            raise HTTPException(422,f'{key} must be a number from {low} to {high}')
        return float(value)
    length=dimension('lengthMm',1,2000,required=True)
    width=dimension('widthMm',1,2000,required=True)
    height=dimension('heightMm',.5,500,required=True)
    diameter=dimension('holeDiameterMm',.5,50)
    pitch=dimension('holePitchMm',2,500)
    holes_x=dimension('holesX',0,24)
    holes_y=dimension('holesY',0,24)
    raw_name=payload.get('name')
    shape=payload.get('shape','box')
    if shape not in ('box','cylinder','sphere'):raise HTTPException(422,'shape must be box, cylinder or sphere')
    # A cylinder or sphere is sized by its diameter (lengthMm); a cylinder's thickness is heightMm.
    label={'box':f'{length:g} x {width:g} x {height:g} mm','cylinder':f'{length:g} mm dia x {height:g} mm','sphere':f'{length:g} mm dia'}[shape]
    name=raw_name.strip()[:80] if isinstance(raw_name,str) and raw_name.strip() else f'Custom {shape} {label}'
    slug=hashlib.sha256(json.dumps([shape,length,width,height,diameter,pitch,holes_x,holes_y,name],sort_keys=True).encode()).hexdigest()[:16]
    try:
        if shape=='cylinder':body=cq.Workplane('XY').circle(length/2).extrude(height)
        elif shape=='sphere':body=cq.Workplane('XY').sphere(length/2)
        else:body=cq.Workplane('XY').box(length,width,height)
        if shape=='box' and diameter and holes_x and holes_y and pitch:
            body=body.faces('>Z').workplane().rarray(pitch,pitch,int(holes_x),int(holes_y)).hole(diameter)
        out=Path(__file__).resolve().parents[1]/'public'/'generated'/'custom'/slug
        out.mkdir(parents=True,exist_ok=True)
        path=out/'model.step'
        if not path.exists():
            cq.exporters.export(body,str(path),exportType='STEP')
        mesh_path=out/'model.stl'
        if not mesh_path.exists():
            cq.exporters.export(body,str(mesh_path),exportType='STL')
    except HTTPException:raise
    except Exception as exc:raise HTTPException(422,f'Could not build the body: {str(exc)[:200]}')
    # Served by this service, not from public/: the dev server only lists public files at startup, so a body created now
    # would come back as the app's HTML page instead of the model.
    return {'slug':slug,'name':name,'stepUrl':f'/geometry/custom-file/{slug}/model.step','stlUrl':f'/geometry/custom-file/{slug}/model.stl'}

@app.get('/custom-file/{slug}/{filename}')
def custom_file(slug: str, filename: str):
    if not re.fullmatch(r'[0-9a-f]{16}',slug) or filename not in ('model.step','model.stl'):raise HTTPException(404,'Not found')
    path=Path(__file__).resolve().parents[1]/'public'/'generated'/'custom'/slug/filename
    if not path.exists():raise HTTPException(404,'Not found')
    return FileResponse(path,media_type='model/stl' if filename.endswith('.stl') else 'application/step')

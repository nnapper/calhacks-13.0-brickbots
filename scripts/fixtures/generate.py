"""Independent OpenCascade 7.9 fixture generator. All source units are mm.
Requires cadquery-ocp==7.9.3.1.1; does not require importing CadQuery or VTK.
"""
from pathlib import Path
from math import pi
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRep import BRep_Builder
from OCP.TopoDS import TopoDS_Compound
from OCP.gp import gp_Pnt, gp_Ax2, gp_Ax1, gp_Dir, gp_Trsf, gp_Vec
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.IFSelect import IFSelect_RetDone
out = Path(__file__).resolve().parents[2] / 'public' / 'fixtures'
def save(shape, filename):
    writer=STEPControl_Writer()
    writer.Transfer(shape,STEPControl_AsIs)
    assert writer.Write(str(out / filename)) == IFSelect_RetDone
plate=BRepPrimAPI_MakeBox(gp_Pnt(-50,-30,-3),100,60,6).Shape()
for x in [-35,35]:
    for y in [-15,15]:
        hole=BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x,y,-4),gp_Dir(0,0,1)),4,8).Shape()
        plate=BRepAlgoAPI_Cut(plate,hole).Shape()
save(plate,'plate.step')
base=BRepPrimAPI_MakeBox(gp_Pnt(-50,-30,-3),100,60,6).Shape()
block=BRepPrimAPI_MakeBox(gp_Pnt(-10,-5,-15),20,10,30).Shape()
t=gp_Trsf();t.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(0,0,1)),pi/2);t.SetTranslationPart(gp_Vec(80,20,25))
block=BRepBuilderAPI_Transform(block,t,False).Shape()
builder=BRep_Builder();assembly=TopoDS_Compound();builder.MakeCompound(assembly);builder.Add(assembly,base);builder.Add(assembly,block)
save(assembly,'assembly.step')
print('Generated plate.step and assembly.step')

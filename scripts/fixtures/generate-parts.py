"""Synthetic goBILDA-style test parts for the assembly workspace. All source units are mm, thin axis is Y so parts lie flat.
Every hole is a through hole of diameter 4 mm on the 8 mm grid, so any two of these parts can be snapped together.
Requires cadquery-ocp==7.9.3.1.1. Run from the repo root: PYTHONPATH=. .venv/bin/python scripts/fixtures/generate-parts.py
"""
from pathlib import Path
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.IFSelect import IFSelect_RetDone
from OCP.gp import gp_Pnt, gp_Ax2, gp_Dir

out = Path(__file__).resolve().parents[2] / 'public' / 'fixtures'
PITCH, DIAMETER, THICK = 8, 4, 2.5

def save(shape, filename):
    writer = STEPControl_Writer(); writer.Transfer(shape, STEPControl_AsIs)
    assert writer.Write(str(out / filename)) == IFSelect_RetDone

def drill(shape, centers, axis, length):
    for c in centers:
        origin = gp_Pnt(*[c[i] - axis[i] * length / 2 for i in range(3)])
        shape = BRepAlgoAPI_Cut(shape, BRepPrimAPI_MakeCylinder(gp_Ax2(origin, gp_Dir(*axis)), DIAMETER / 2, length).Shape()).Shape()
    return shape

def flat_plate(cols, rows):
    """cols x rows holes; length along X (cols), width along Z (rows), thickness along Y."""
    w, d = (cols - 1) * PITCH + 8, (rows - 1) * PITCH + 8
    plate = BRepPrimAPI_MakeBox(gp_Pnt(-w / 2, 0, -d / 2), w, THICK, d).Shape()
    centers = [((i - (cols - 1) / 2) * PITCH, THICK / 2, (j - (rows - 1) / 2) * PITCH) for i in range(cols) for j in range(rows)]
    return drill(plate, centers, (0, 1, 0), THICK + 2)

save(flat_plate(5, 3), 'grid-plate-3x5.step')
save(flat_plate(7, 1), 'flat-beam-1x7.step')
save(flat_plate(4, 4), 'grid-plate-4x4.step')

# L-bracket: a horizontal 3x3 leg and a vertical 3x3 leg (rises along +Y), holes in both legs.
leg = 3 * PITCH
horizontal = BRepPrimAPI_MakeBox(gp_Pnt(-leg / 2, 0, -leg / 2), leg, THICK, leg).Shape()
vertical = BRepPrimAPI_MakeBox(gp_Pnt(-leg / 2, 0, -leg / 2), leg, leg + THICK, THICK).Shape()
bracket = BRepAlgoAPI_Fuse(horizontal, vertical).Shape()
grid = [(i - 1) * PITCH for i in range(3)]
# The row nearest the vertical leg is skipped so the holes clear it.
bracket = drill(bracket, [(x, THICK / 2, z) for x in grid for z in grid if z != -PITCH], (0, 1, 0), THICK + 2)
bracket = drill(bracket, [(x, THICK + 4 + 8 * j, -leg / 2 + THICK / 2) for x in grid for j in range(3)], (0, 0, 1), THICK + 2)
save(bracket, 'l-bracket.step')
# Solid wall block with no holes: it can only connect face to face.
save(BRepPrimAPI_MakeBox(gp_Pnt(-24, 0, -2), 48, 24, 4).Shape(), 'wall-block.step')
print('Generated wall-block, grid-plate-3x5, flat-beam-1x7, grid-plate-4x4, l-bracket')

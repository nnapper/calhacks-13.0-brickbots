"""Writes exact bounds and hole centers (mm) of real goBILDA STEP files for the grid-node tests.
Usage: .venv/bin/python scripts/fixtures/grid-truth.py DIR_WITH_UNZIPPED_STEPS"""
import sys, json
from pathlib import Path
from OCP.STEPControl import STEPControl_Reader
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from server.main import extract_candidates
SKUS = ['1126-0001-0001', '1116-0024-0040', '1102-0002-0016', '1116-0056-0056']
out = {}
for sku in SKUS:
    path = Path(sys.argv[1]) / sku / f'{sku}.STEP'
    reader = STEPControl_Reader(); reader.ReadFile(str(path)); reader.TransferRoots()
    box = Bnd_Box(); BRepBndLib.AddOptimal_s(reader.OneShape(), box, False, False)
    lo, hi = box.CornerMin().Coord(), box.CornerMax().Coord()
    holes = sorted({tuple(round(v * 1000, 3) for v in n['position']) + (round(n['diameterM'] * 1000, 3),)
                    for n in extract_candidates(path.read_bytes())['candidates'] if n['kind'] == 'hole'})
    out[sku] = {'boundsMm': {'min': [round(v, 3) for v in lo], 'max': [round(v, 3) for v in hi]},
                'holes': [list(h) for h in holes], 'capped': len(holes) >= 64}
json.dump(out, open('src/assembly/fixtures/grid-truth.json', 'w'), indent=1)
print({k: (v['boundsMm'], len(v['holes']), v['capped']) for k, v in out.items()})

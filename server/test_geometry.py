import unittest
from pathlib import Path
from server.main import extract_candidates
class GeometryTests(unittest.TestCase):
    def test_plate_holes_have_measured_centers_diameters_and_opposing_openings(self):
        result=extract_candidates(Path('public/fixtures/plate.step').read_bytes())
        holes=[n for n in result['candidates'] if n['kind']=='hole']
        self.assertEqual(len(holes),8)
        for n in holes:
            self.assertAlmostEqual(n['diameterM'],.008)
            self.assertAlmostEqual(abs(n['position'][0]),.035)
            self.assertAlmostEqual(abs(n['position'][1]),.015)
            self.assertAlmostEqual(abs(n['position'][2]),.003)
            self.assertEqual(n['review'],'suggested')
            self.assertAlmostEqual(sum(v*v for v in n['normal']),1)
    def test_solid_wall_face_points_lie_exactly_on_its_faces_and_corners(self):
        # wall-block.step is a solid 48 x 24 x 4 mm box spanning x -24..24, y 0..24, z -2..2 mm.
        result=extract_candidates(Path('public/fixtures/wall-block.step').read_bytes())
        faces=[n for n in result['candidates'] if n['kind']=='surface']
        self.assertEqual(len(faces),54)
        lo,hi=[-.024,0,-.002],[.024,.024,.002]
        for n in faces:
            on_boundary=any(abs(n['position'][i]-b)<1e-9 for i in range(3) for b in (lo[i],hi[i]))
            self.assertTrue(on_boundary)
            center=[(lo[i]+hi[i])/2 for i in range(3)]
            self.assertGreater(sum(n['normal'][i]*(n['position'][i]-center[i]) for i in range(3)),0)
            self.assertAlmostEqual(sum(v*v for v in n['normal']),1)
        corners={tuple(round(v,9) for v in n['position']) for n in faces}
        for x in (lo[0],hi[0]):
            for y in (lo[1],hi[1]):
                for z in (lo[2],hi[2]): self.assertIn((round(x,9),round(y,9),round(z,9)),corners)
    def test_invalid_step_rejected(self):
        with self.assertRaises(Exception): extract_candidates(b'not a STEP file')
if __name__=='__main__': unittest.main()

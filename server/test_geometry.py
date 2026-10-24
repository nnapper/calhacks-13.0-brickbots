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
    def test_invalid_step_rejected(self):
        with self.assertRaises(Exception): extract_candidates(b'not a STEP file')
if __name__=='__main__': unittest.main()

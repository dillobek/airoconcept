import unittest

from app.geometry import Label, point_in_polygon, polygon_area, rooms_from_polygons


def rect(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


class GeometryTest(unittest.TestCase):
    def test_area(self):
        self.assertAlmostEqual(polygon_area(rect(0, 0, 5, 4.2)), 21.0)
        self.assertEqual(polygon_area([(0, 0), (1, 1)]), 0.0)

    def test_point_in_polygon(self):
        p = rect(0, 0, 10, 10)
        self.assertTrue(point_in_polygon((5, 5), p))
        self.assertFalse(point_in_polygon((15, 5), p))

    def test_rooms_mm_with_labels(self):
        # Chizma millimetrda: mehmonxona 5000x4200, yotoqxona 4600x4200, kolonna 300x300 (tashlanadi)
        polys = [rect(0, 0, 5000, 4200), rect(5000, 0, 4600, 4200), rect(100, 100, 300, 300), rect(0, 0, 5000, 4200)]
        labels = [Label("Mehmonxona", (2500, 2100)), Label("Yotoqxona", (7300, 2100))]
        rooms = rooms_from_polygons(polys, labels, unit_code=4)
        self.assertEqual(len(rooms), 2, "kolonna va takror kontur tashlanadi")
        self.assertEqual(rooms[0].name, "Mehmonxona")
        self.assertAlmostEqual(rooms[0].area_m2, 21.0, places=2)
        self.assertAlmostEqual(rooms[0].length_m, 5.0)
        self.assertAlmostEqual(rooms[1].width_m, 4.2)

    def test_outer_contour_dropped(self):
        polys = [rect(0, 0, 9600, 7600), rect(0, 0, 5000, 4200), rect(5000, 0, 4600, 4200), rect(0, 4200, 9600, 3400)]
        rooms = rooms_from_polygons(polys, [], unit_code=4)
        self.assertEqual(len(rooms), 3)
        self.assertTrue(all(r.area_m2 < 73 for r in rooms))

    def test_unnamed_rooms(self):
        rooms = rooms_from_polygons([rect(0, 0, 3, 3)], [], unit_code=6)
        self.assertEqual(rooms[0].name, "Xona 1")


if __name__ == "__main__":
    unittest.main()

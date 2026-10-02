import csv
import io
from pathlib import Path
import subprocess
import sys
import unittest
from restore_recompute import calculate, GIB


class ModelTests(unittest.TestCase):
    def test_units_and_decisions(self):
        for bw, ms, decision in [(8, 130, "recompute"), (20, 55, "restore"), (40, 30, "restore")]:
            r = calculate(8192, 131072, bw, 5, 0, 60)
            self.assertEqual(r["kv_bytes"], GIB)
            self.assertEqual(r["restore_ms"], ms)
            self.assertEqual(r["decision"], decision)
            self.assertAlmostEqual(r["crossover_gibps"], 1000 / 55)

    def test_crossover(self):
        exact = calculate(8192, 131072, 1000 / 55, 5, 0, 60)
        self.assertEqual(exact["decision"], "recompute")  # floating reciprocal noise is not a benefit
        for bw, decision in [(20 - 1e-6, "recompute"), (20, "recompute"), (20 + 1e-6, "restore")]:
            r = calculate(1, 1, bw, 5, 5, 60, kv_bytes=GIB)
            self.assertEqual(r["decision"], decision)
            self.assertAlmostEqual(r["restore_ms"], 60, places=4)

    def test_no_finite_positive_crossover(self):
        for prefill in (0, 9, 10):
            r = calculate(1, 1, 40, 5, 5, prefill)
            self.assertIsNone(r["crossover_gibps"])
            self.assertEqual(r["decision"], "recompute")

    def test_queue_and_explicit_size(self):
        r = calculate(2, 128, 1, 1, 2, 3, 4, kv_bytes=GIB)
        self.assertEqual(r["restore_ms"], 1003)
        self.assertEqual(r["recompute_ms"], 7)

    def test_invalid_inputs(self):
        for index, value in [(0, 0), (1, -1), (2, 0), (2, float("nan")),
                             (2, float("inf")), (3, -1), (4, -1), (5, -1), (6, -1)]:
            args = [1, 1, 1, 0, 0, 1, 0]
            args[index] = value
            with self.assertRaises(ValueError):
                calculate(*args)
        for size in (0, -1, float("inf")):
            with self.assertRaises(ValueError):
                calculate(1, 1, 1, 0, 0, 1, kv_bytes=size)

    def test_csv_scan(self):
        tool = Path(__file__).with_name("restore_recompute.py")
        output = subprocess.check_output([sys.executable, str(tool), "--tokens", "2048", "8192",
                                          "--bandwidth-gibps", "8", "40", "--csv"], text=True)
        rows = list(csv.DictReader(io.StringIO(output)))
        self.assertEqual(len(rows), 4)
        self.assertEqual({r["decision"] for r in rows}, {"restore", "recompute"})


if __name__ == "__main__":
    unittest.main()

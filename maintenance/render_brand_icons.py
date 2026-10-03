"""Build raster browser icons from docsteer.favicon; never maintain duplicate artwork."""
from pathlib import Path
import sys
import cairosvg

source, destination = map(Path, sys.argv[1:])
destination.mkdir(parents=True, exist_ok=True)
for size in (32, 180, 192):
    cairosvg.svg2png(url=str(source), write_to=str(destination / f"icon-{size}.png"),
                    output_width=size, output_height=size)

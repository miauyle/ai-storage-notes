"""Render configured SVG variants; filenames hash the actual PNG bytes."""
from hashlib import sha256
from pathlib import Path
import json
import sys
import xml.etree.ElementTree as ET
import cairosvg

source, destination, baseurl = sys.argv[1:]
destination = Path(destination)
destination.mkdir(parents=True, exist_ok=True)
palettes = json.load(sys.stdin)
result = {}
for key, colors in palettes.items():
    svg = ET.parse(source)
    for name, color in zip(("brand", "accent"), colors):
        stops = [node for node in svg.iter() if node.get("data-theme-color") == name]
        if not stops:
            raise ValueError(f"Missing SVG theme marker: {name}")
        for stop in stops:
            stop.set("stop-color", color)
    data = ET.tostring(svg.getroot())
    result[key] = {}
    for name, size in (("icon", 64), ("apple", 180)):
        png = cairosvg.svg2png(bytestring=data, output_width=size, output_height=size)
        filename = f"theme-{size}-{sha256(png).hexdigest()[:12]}.png"
        (destination / filename).write_bytes(png)
        result[key][name] = f"{baseurl}/assets/images/generated-icons/{filename}"
print(json.dumps(result))

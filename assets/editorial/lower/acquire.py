"""Reacquire the reviewed, pinned Commons photographs. Never runs at build/startup."""
import json, urllib.parse, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "assets/editorial/lower"
HEADERS = {"User-Agent": "AIRO-LandingAssets/1.0 (https://airo.dev-heptivision.com)"}
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=40) as response:
        return response.read()
for photo in json.loads((CACHE / "photos.json").read_text()):
    target = ROOT / "public" / photo["image"].lstrip("/")
    if target.exists():
        print("Retained:", photo["id"])
        continue
    title = urllib.parse.unquote(urllib.parse.urlparse(photo["source"]).path.split("/wiki/")[-1])
    query = urllib.parse.urlencode(dict(action="query", format="json", titles=title, prop="imageinfo", iiprop="url|extmetadata", iiurlwidth=1200))
    metadata = json.loads(get("https://commons.wikimedia.org/w/api.php?" + query))
    info = next(iter(metadata["query"]["pages"].values()))["imageinfo"][0]
    (CACHE / (photo["id"] + "-selected-metadata.json")).write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
    target.write_bytes(get(info.get("thumburl", info["url"]).split("?")[0]))
    print("Downloaded:", photo["id"])

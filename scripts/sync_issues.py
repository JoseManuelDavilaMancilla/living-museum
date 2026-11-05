"""Turn approved GitHub issues into map entries on the static site.

Runs inside the site repo (GitHub Actions, see publish-approved.yml), where
this repo IS the data store: entries.json + media/ + per-entry pages in e/.
Idempotent: issues whose gh-<number> entry already exists are skipped.

Sections parsed from the issue body: Title, Story, Year, Location, Credit.
The first attached image (markdown or user-attachments link) is the photo.

Image processing mirrors the server pipeline (app/images.py): EXIF dropped by
re-encode, max 2000px, 480px thumb, JPEG q85.
"""
import io
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

REPO = os.environ.get("GH_REPO", "JoseManuelDavilaMancilla/living-museum")
TOKEN = os.environ.get("GH_TOKEN", "")
ROOT = Path(__file__).resolve().parent.parent
SITE_URL = "https://josemanueldavilamancilla.github.io/living-museum/"

LAT_BOUNDS = (39.3, 41.1)
LNG_BOUNDS = (115.3, 117.6)
MAX_DIM, THUMB_DIM, QUALITY = 2000, 480, 85
Image.MAX_IMAGE_PIXELS = 100_000_000

STORY_PAGE = """<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Living Museum of Beijing</title>
<meta property="og:title" content="{title} · Living Museum of Beijing">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{photo}">
<meta property="og:type" content="article">
<link rel="canonical" href="{canonical}">
<link rel="icon" href="../../img/seal.svg" type="image/svg+xml">
<style>
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Segoe UI",sans-serif;
  background:#FAF7F2; color:#1D1C1A; }}
.card {{ max-width:640px; margin:0 auto; padding:64px 20px 48px; }}
img.photo {{ width:100%; border-radius:18px; box-shadow:0 12px 32px rgba(29,28,26,.14); display:block; }}
.meta {{ display:flex; align-items:center; gap:10px; margin:18px 0 6px; }}
.year {{ background:#F7E7E3; color:#8E2A20; font-size:13px; font-weight:650; padding:3px 10px; border-radius:999px; }}
h1 {{ font-size:26px; letter-spacing:-.02em; margin:0 0 10px; }}
p.story {{ font-size:16px; line-height:1.65; color:#3A3631; white-space:pre-line; margin:0 0 14px; }}
p.credit {{ font-size:13px; color:#A39C94; margin:0 0 26px; }}
a.open {{ display:inline-block; background:#B23A2E; color:#FFF7F2; font-weight:600; font-size:15px;
  padding:12px 20px; border-radius:999px; text-decoration:none; box-shadow:0 6px 16px rgba(142,42,32,.3); }}
.brand {{ display:flex; align-items:center; gap:10px; margin:0 0 20px; color:#1D1C1A; text-decoration:none; }}
.seal {{ width:34px; height:34px; display:grid; place-items:center; background:#B23A2E; color:#FFF7F2;
  border-radius:9px; font-size:19px; font-weight:600; }}
.bname {{ line-height:1.12; font-size:15px; font-weight:650; }}
.bname small {{ display:block; font-size:11.5px; font-weight:500; color:#6E6760; letter-spacing:.06em; }}
</style>
</head>
<body>
<div class="card">
  <a class="brand" href="../../index.html"><span class="seal">京</span>
    <span class="bname">Living Museum of Beijing<small>one city, year by year</small></span></a>
  <img class="photo" src="../../{photo}" alt="{title}">
  <div class="meta"><span class="year">{year}</span></div>
  <h1>{title}</h1>
  <p class="story">{story}</p>
  <p class="credit">{credit}</p>
  <a class="open" href="../../index.html?entry={eid}">Open in the map</a>
</div>
</body>
</html>"""


def api(path: str) -> dict | list:
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "living-museum-sync",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def parse_sections(body: str) -> dict:
    out: dict[str, str] = {}
    parts = re.split(r"^###\s+(.+)$", body, flags=re.MULTILINE)
    for i in range(1, len(parts) - 1, 2):
        out[parts[i].strip().lower()] = parts[i + 1].strip()
    return out


def first_image_url(body: str) -> str | None:
    m = re.search(r"!\[[^\]]*\]\((https?://[^)\s]+)\)", body)
    if m:
        return m.group(1)
    m = re.search(r'<img[^>]+src="(https?://[^"]+)"', body)
    return m.group(1) if m else None


def process_image(raw: bytes) -> tuple[bytes, bytes]:
    img = Image.open(io.BytesIO(raw))
    img.load()
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    def resize_max(im, max_dim):
        w, h = im.size
        scale = max_dim / max(w, h)
        if scale < 1:
            return im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        return im

    def jpeg(im):
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=QUALITY, optimize=True)
        return buf.getvalue()

    return jpeg(resize_max(img, MAX_DIM)), jpeg(resize_max(img, THUMB_DIM))


def has_cjk(text: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in text)


def write_story_page(entry: dict) -> None:
    import html as _html
    pdir = ROOT / "e" / str(entry["id"])
    pdir.mkdir(parents=True, exist_ok=True)
    desc = " ".join(entry["story"].split())
    if len(desc) > 140:
        desc = desc[:137] + "..."
    (pdir / "index.html").write_text(STORY_PAGE.format(
        lang=_html.escape(entry.get("language") or "en"),
        title=_html.escape(entry["title"]),
        desc=_html.escape(desc),
        story=_html.escape(entry["story"]),
        credit=_html.escape(entry.get("credit") or ""),
        photo=entry["photo"],
        year=entry["year"], eid=entry["id"],
        canonical=SITE_URL + "e/" + str(entry["id"]) + "/",
    ))


def main() -> None:
    entries_path = ROOT / "entries.json"
    entries = json.loads(entries_path.read_text()) if entries_path.exists() else []
    known = {str(e["id"]) for e in entries}

    issues = api(f"/repos/{REPO}/issues?labels=approved&state=open&per_page=100")
    published = 0
    for issue in issues:
        if "pull_request" in issue:
            continue
        eid = f"gh-{issue['number']}"
        if eid in known:
            continue

        sec = parse_sections(issue.get("body") or "")
        title = sec.get("title", "").strip() or issue["title"].strip()
        story = sec.get("story", "").strip()
        year_s = re.sub(r"\D", "", sec.get("year", ""))[:4]
        credit = sec.get("credit", "").strip()
        public_contact = sec.get("public contact", "").strip()
        if public_contact.lower() in ("", "none", "no", "-"):
            public_contact = None
        loc = re.findall(r"-?\d+(?:\.\d+)?", sec.get("location", ""))
        img_url = first_image_url(issue.get("body") or "")

        try:
            year = int(year_s)
            lat, lng = float(loc[0]), float(loc[1])
        except (ValueError, IndexError):
            print(f"SKIP {eid}: year/location unparseable", file=sys.stderr)
            continue
        if not (1800 <= year <= 2100):
            print(f"SKIP {eid}: year out of range", file=sys.stderr)
            continue
        if not (LAT_BOUNDS[0] <= lat <= LAT_BOUNDS[1] and LNG_BOUNDS[0] <= lng <= LNG_BOUNDS[1]):
            print(f"SKIP {eid}: location outside Beijing", file=sys.stderr)
            continue
        if not img_url:
            print(f"SKIP {eid}: no photo attachment", file=sys.stderr)
            continue
        if not title or not story:
            print(f"SKIP {eid}: missing title/story", file=sys.stderr)
            continue

        req = urllib.request.Request(img_url, headers={"User-Agent": "living-museum-sync"})
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read()
        photo_b, thumb_b = process_image(raw)

        media = ROOT / "media" / eid
        media.mkdir(parents=True, exist_ok=True)
        (media / "photo.jpg").write_bytes(photo_b)
        (media / "thumb.jpg").write_bytes(thumb_b)

        entry = {
            "id": eid,
            "title": title[:120],
            "story": story[:1200],
            "year": year,
            "lat": lat,
            "lng": lng,
            "photo": f"media/{eid}/photo.jpg",
            "thumb": f"media/{eid}/thumb.jpg",
            "credit": None if credit.lower() == "anonymous" else (credit or None),
            "contact_public": public_contact,
            "language": "zh" if has_cjk(story) else "en",
            "pair_id": None,
            "created_at": issue["created_at"],
        }
        entries.append(entry)
        write_story_page(entry)
        published += 1
        print(f"published {eid}: {entry['title']} ({entry['year']})")

    if published:
        entries_path.write_text(json.dumps(entries, ensure_ascii=False, indent=1))

        # label processed issues as published
        for issue in issues:
            if "pull_request" in issue:
                continue
            eid = f"gh-{issue['number']}"
            if eid in known:
                continue
            req = urllib.request.Request(
                f"https://api.github.com/repos/{REPO}/issues/{issue['number']}/labels",
                data=json.dumps({"labels": ["published"]}).encode(),
                headers={
                    "Authorization": f"Bearer {TOKEN}",
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "living-museum-sync",
                },
                method="POST",
            )
            urllib.request.urlopen(req, timeout=30).read()

    print(f"done: {published} new entries, {len(entries)} total")


if __name__ == "__main__":
    main()

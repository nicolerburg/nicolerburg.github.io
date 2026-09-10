#!/usr/bin/env python3
"""Import soft-toy entry files from an inbox folder into the GitHub Pages site.

Usage:
    python3 tools/import_toys.py
    python3 tools/import_toys.py "/path/to/Soft Toy Inbox"

The default inbox is the normal macOS iCloud Drive location:
    ~/Library/Mobile Documents/com~apple~CloudDocs/Soft Toy Inbox
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = REPO_ROOT / "soft-toys" / "data" / "toys.json"
IMAGE_DIR = REPO_ROOT / "soft-toys" / "images"
DEFAULT_INBOX = Path("~/Library/Mobile Documents/com~apple~CloudDocs/Soft Toy Inbox").expanduser()


def load_collection() -> list[dict]:
    if not DATA_FILE.exists():
        return []
    with DATA_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{DATA_FILE} must contain a JSON list")
    return data


def save_collection(toys: list[dict]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as f:
        json.dump(toys, f, ensure_ascii=False, indent=2)
        f.write("\n")


def validate_entry(entry: dict, manifest: Path) -> None:
    required = ["id", "name", "imageFile", "dateAdded"]
    missing = [key for key in required if not entry.get(key)]
    if missing:
        raise ValueError(f"{manifest.name}: missing required field(s): {', '.join(missing)}")

    date_added = entry.get("dateAdded")
    if not isinstance(date_added, dict) or date_added.get("precision") not in {"day", "month", "year"} or not date_added.get("value"):
        raise ValueError(f"{manifest.name}: dateAdded is invalid")


def import_entries(inbox: Path, keep_source: bool = False) -> int:
    inbox = inbox.expanduser().resolve()
    if not inbox.exists():
        inbox.mkdir(parents=True, exist_ok=True)
        print(f"Created inbox: {inbox}")
        print("Put your .toy-entry.json files and matching .jpg photos there, then run this command again.")
        return 0

    manifests = sorted(inbox.glob("*.toy-entry.json"))
    if not manifests:
        print(f"No .toy-entry.json files found in: {inbox}")
        return 0

    toys = load_collection()
    existing_ids = {toy.get("id") for toy in toys}
    imported_dir = inbox / "_imported"
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    imported = 0
    for manifest in manifests:
        try:
            with manifest.open("r", encoding="utf-8") as f:
                entry = json.load(f)
            validate_entry(entry, manifest)

            if entry["id"] in existing_ids:
                print(f"SKIP  {entry['name']}: id already exists")
                continue

            source_image = inbox / entry["imageFile"]
            if not source_image.exists():
                print(f"WAIT  {entry['name']}: missing photo {entry['imageFile']}")
                continue

            target_image = IMAGE_DIR / entry["imageFile"]
            shutil.copy2(source_image, target_image)

            website_entry = {
                "id": entry["id"],
                "name": entry["name"],
                "officialModel": entry.get("officialModel", ""),
                "image": entry["imageFile"],
                "dateAdded": entry["dateAdded"],
                "funFacts": entry.get("funFacts", []),
            }
            toys.append(website_entry)
            existing_ids.add(entry["id"])
            imported += 1
            print(f"ADD   {entry['name']}")

            if not keep_source:
                imported_dir.mkdir(exist_ok=True)
                shutil.move(str(manifest), str(imported_dir / manifest.name))
                shutil.move(str(source_image), str(imported_dir / source_image.name))

        except (OSError, ValueError, json.JSONDecodeError) as error:
            print(f"ERROR {manifest.name}: {error}")

    if imported:
        save_collection(toys)
        print(f"\nImported {imported} soft toy{'s' if imported != 1 else ''}.")
        print(f"Updated: {DATA_FILE.relative_to(REPO_ROOT)}")
        print("Next: review the site locally if you want, then commit and push with GitHub Desktop.")
    return imported


def main() -> None:
    parser = argparse.ArgumentParser(description="Import iPhone-created soft toy entries into the site.")
    parser.add_argument("inbox", nargs="?", default=str(DEFAULT_INBOX), help="Folder containing .toy-entry.json and matching .jpg files")
    parser.add_argument("--keep-source", action="store_true", help="Do not move imported files into an _imported subfolder")
    args = parser.parse_args()
    import_entries(Path(args.inbox), keep_source=args.keep_source)


if __name__ == "__main__":
    main()

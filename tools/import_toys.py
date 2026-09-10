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


def validate_photo_settings(entry: dict, manifest: Path) -> None:
    photo_display = entry.get("photoDisplay")
    if photo_display is None:
        return
    if not isinstance(photo_display, dict):
        raise ValueError(f"{manifest.name}: photoDisplay must be an object")

    for view_name in ("gallery", "profile"):
        settings = photo_display.get(view_name)
        if settings is None:
            continue
        if not isinstance(settings, dict):
            raise ValueError(f"{manifest.name}: photoDisplay.{view_name} must be an object")

        fit = settings.get("fit")
        if fit is not None and fit not in {"cover", "contain"}:
            raise ValueError(f"{manifest.name}: photoDisplay.{view_name}.fit must be cover or contain")

        for key, minimum, maximum in (("x", 0, 100), ("y", 0, 100), ("zoom", 1, 1.7)):
            if key not in settings:
                continue
            value = settings[key]
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not minimum <= value <= maximum:
                raise ValueError(
                    f"{manifest.name}: photoDisplay.{view_name}.{key} must be between {minimum} and {maximum}"
                )


def validate_flexible_date(value: object, manifest: Path, field_name: str, required: bool = False) -> None:
    if value is None:
        if required:
            raise ValueError(f"{manifest.name}: {field_name} is required")
        return
    if not isinstance(value, dict) or value.get("precision") not in {"day", "month", "year"} or not value.get("value"):
        raise ValueError(f"{manifest.name}: {field_name} is invalid")


def validate_entry(entry: dict, manifest: Path) -> None:
    required = ["id", "name", "imageFile", "dateAdded"]
    missing = [key for key in required if not entry.get(key)]
    if missing:
        raise ValueError(f"{manifest.name}: missing required field(s): {', '.join(missing)}")

    validate_flexible_date(entry.get("dateAdded"), manifest, "dateAdded", required=True)

    collection_status = entry.get("collectionStatus")
    if collection_status is not None:
        if not isinstance(collection_status, dict):
            raise ValueError(f"{manifest.name}: collectionStatus must be an object")
        state = collection_status.get("state", "active")
        if state not in {"active", "lost", "memory"}:
            raise ValueError(f"{manifest.name}: collectionStatus.state must be active, lost, or memory")
        last_known = collection_status.get("lastKnownLocation")
        if last_known is not None and not isinstance(last_known, str):
            raise ValueError(f"{manifest.name}: collectionStatus.lastKnownLocation must be text")
        validate_flexible_date(collection_status.get("endDate"), manifest, "collectionStatus.endDate")

    relatives = entry.get("relatives", [])
    if relatives is not None:
        if not isinstance(relatives, list):
            raise ValueError(f"{manifest.name}: relatives must be a list")
        for index, relative in enumerate(relatives, start=1):
            if not isinstance(relative, dict):
                raise ValueError(f"{manifest.name}: relative #{index} must be an object")
            relationship = relative.get("relationship")
            toy_id = relative.get("toyId")
            if not isinstance(relationship, str) or not relationship.strip():
                raise ValueError(f"{manifest.name}: relative #{index} needs a relationship")
            if not isinstance(toy_id, str) or not toy_id.strip():
                raise ValueError(f"{manifest.name}: relative #{index} needs a toyId")

    for optional_text in ("species", "spawnLocation"):
        value = entry.get(optional_text, "")
        if value is not None and not isinstance(value, str):
            raise ValueError(f"{manifest.name}: {optional_text} must be text")

    validate_photo_settings(entry, manifest)


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
                "species": entry.get("species", ""),
                "spawnLocation": entry.get("spawnLocation", ""),
                "collectionStatus": entry.get("collectionStatus", {"state": "active"}),
                "relatives": entry.get("relatives", []),
                "image": entry["imageFile"],
                "dateAdded": entry["dateAdded"],
                "funFacts": entry.get("funFacts", []),
                "photoDisplay": entry.get("photoDisplay", {}),
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

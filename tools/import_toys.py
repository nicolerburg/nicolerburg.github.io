#!/usr/bin/env python3
"""Import new or edited soft-toy entry manifests into the static website.

The add/edit webpage exports a *.toy-entry.json manifest and, when needed,
new image files. Save all exported files into the Soft Toy Inbox, then run the
existing Import Soft Toys.command file. No third-party Python packages are used.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "soft-toys" / "data" / "toys.json"
IMAGES_DIR = ROOT / "soft-toys" / "images"
DEFAULT_INBOX = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs" / "Soft Toy Inbox"

KNOWN_FIELDS = {
    "id", "name", "officialModel", "model", "brandModel", "image", "photo",
    "gallery", "galleryImages", "galleryPhotos", "species", "spawnLocation", "spawn",
    "dateAdded", "acquiredDate", "joinedDate", "funFacts", "photoDisplay", "relatives",
    "status", "collectionStatus", "lastKnownLocation", "lostDate", "endDate", "memorialDate",
    "rejoinDate", "readdedDate", "reAddDate",
}


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "toy"


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def clean_date(value: Any) -> dict[str, str] | None:
    if not value:
        return None
    if isinstance(value, str):
        if re.fullmatch(r"\d{4}", value):
            return {"precision": "year", "value": value}
        if re.fullmatch(r"\d{4}-\d{2}", value):
            return {"precision": "month", "value": value}
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return {"precision": "day", "value": value}
        return None
    if isinstance(value, dict) and value.get("value"):
        precision = clean_text(value.get("precision")).lower()
        if precision in {"exact", "full", "date"}:
            precision = "day"
        if precision not in {"day", "month", "year"}:
            raw = clean_text(value.get("value"))
            precision = "year" if re.fullmatch(r"\d{4}", raw) else "month" if re.fullmatch(r"\d{4}-\d{2}", raw) else "day"
        return {"precision": precision, "value": clean_text(value.get("value"))}
    return None


def normalize_status(value: Any) -> str:
    # Accept old and new spellings such as in-our-memory, in_our_memory,
    # "In Our Memory", memory, and memorial.
    status = re.sub(r"[^a-z0-9]+", "", clean_text(value).lower())
    if status == "lost":
        return "lost"
    if status in {"memory", "inmemory", "inourmemory", "memorial"}:
        return "memory"
    return "active"


def clean_photo_display(value: Any) -> dict[str, Any]:
    def one(part: Any) -> dict[str, Any]:
        part = part if isinstance(part, dict) else {}
        fit = "contain" if part.get("fit") == "contain" else "cover"
        try:
            x = float(part.get("x", 50))
        except (TypeError, ValueError):
            x = 50
        try:
            y = float(part.get("y", 50))
        except (TypeError, ValueError):
            y = 50
        try:
            zoom = float(part.get("zoom", 1))
        except (TypeError, ValueError):
            zoom = 1
        if fit == "contain":
            zoom = 1
        return {"fit": fit, "x": x, "y": y, "zoom": zoom}

    value = value if isinstance(value, dict) else {}
    return {"gallery": one(value.get("gallery")), "profile": one(value.get("profile"))}


def safe_basename(value: Any) -> str:
    name = Path(clean_text(value)).name
    if name in {"", ".", ".."}:
        return ""
    return name


def load_database() -> tuple[Any, list[dict[str, Any]], str]:
    if not DATA_FILE.exists():
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        return [], [], "array"
    with DATA_FILE.open("r", encoding="utf-8") as handle:
        root = json.load(handle)
    if isinstance(root, list):
        return root, root, "array"
    if isinstance(root, dict):
        toys = root.get("toys")
        if not isinstance(toys, list):
            toys = []
            root["toys"] = toys
        return root, toys, "object"
    raise ValueError("toys.json must contain either an array or an object with a 'toys' array")


def write_database(root: Any) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if DATA_FILE.exists():
        shutil.copy2(DATA_FILE, DATA_FILE.with_suffix(".json.bak"))
    temp = DATA_FILE.with_suffix(".json.tmp")
    with temp.open("w", encoding="utf-8") as handle:
        json.dump(root, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temp.replace(DATA_FILE)


def unique_id(name: str, toys: list[dict[str, Any]]) -> str:
    taken = {clean_text(toy.get("id")) for toy in toys}
    base = slugify(name)
    candidate = base
    counter = 2
    while candidate in taken:
        candidate = f"{base}-{counter}"
        counter += 1
    return candidate


def find_update_index(toys: list[dict[str, Any]], target_id: str) -> int | None:
    for index, toy in enumerate(toys):
        if clean_text(toy.get("id")) == target_id:
            return index
    return None


def source_photo_spec_from_legacy(manifest: dict[str, Any], toy_data: dict[str, Any]) -> dict[str, str]:
    for key in ("imageFile", "imageFilename", "photoFile", "photoFilename"):
        if manifest.get(key):
            return {"kind": "new", "filename": safe_basename(manifest[key])}
    # Some early manifests stored the exported filename directly in image/photo.
    for source in (manifest, toy_data):
        for key in ("image", "photo"):
            value = source.get(key)
            if isinstance(value, str) and value.strip():
                return {"kind": "new", "filename": safe_basename(value)}
    return {"kind": "none"}


def normalize_manifest(raw: dict[str, Any]) -> dict[str, Any]:
    operation = clean_text(raw.get("operation") or "create").lower()
    if operation not in {"create", "update"}:
        operation = "create"

    if isinstance(raw.get("toy"), dict):
        toy = dict(raw["toy"])
    else:
        # Compatibility with the original flat manifest format.
        toy = {key: value for key, value in raw.items() if key not in {"schemaVersion", "operation", "targetId", "exportedAt", "mainPhoto", "galleryPhotos"}}

    main_photo = raw.get("mainPhoto") if isinstance(raw.get("mainPhoto"), dict) else source_photo_spec_from_legacy(raw, toy)
    gallery_photos = raw.get("galleryPhotos") if isinstance(raw.get("galleryPhotos"), list) else []

    return {
        "operation": operation,
        "targetId": clean_text(raw.get("targetId") or toy.get("id")),
        "toy": toy,
        "mainPhoto": main_photo,
        "galleryPhotos": gallery_photos,
    }


def copy_new_image(inbox: Path, filename: str) -> tuple[str, Path]:
    filename = safe_basename(filename)
    if not filename:
        raise FileNotFoundError("An exported image filename was blank")
    source = inbox / filename
    if not source.exists():
        raise FileNotFoundError(f"Missing image file in inbox: {filename}")
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    destination = IMAGES_DIR / filename
    shutil.copy2(source, destination)
    return filename, source


def process_main_photo(spec: Any, inbox: Path, existing: dict[str, Any] | None) -> tuple[str, list[Path]]:
    spec = spec if isinstance(spec, dict) else {}
    kind = clean_text(spec.get("kind")).lower()
    if kind == "new":
        filename, source = copy_new_image(inbox, clean_text(spec.get("filename")))
        return filename, [source]
    if kind == "existing":
        return safe_basename(spec.get("filename")), []
    if kind == "none":
        return "", []
    # Update manifests missing a mainPhoto directive retain the current image.
    return safe_basename(existing.get("image")) if existing else "", []


def process_gallery(specs: Any, inbox: Path) -> tuple[list[str], list[Path]]:
    output: list[str] = []
    consumed: list[Path] = []
    if not isinstance(specs, list):
        return output, consumed
    for item in specs:
        if isinstance(item, str):
            filename = safe_basename(item)
            if filename:
                output.append(filename)
            continue
        if not isinstance(item, dict):
            continue
        kind = clean_text(item.get("kind")).lower()
        filename = safe_basename(item.get("filename"))
        if not filename:
            continue
        if kind == "new":
            copied, source = copy_new_image(inbox, filename)
            output.append(copied)
            consumed.append(source)
        elif kind == "existing":
            output.append(filename)
    # Keep order but remove duplicate filenames.
    return list(dict.fromkeys(output)), list(dict.fromkeys(consumed))


def build_entry(toy_data: dict[str, Any], toy_id: str, image: str, gallery: list[str], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    # Preserve unknown custom keys while treating all supported fields as a complete edit.
    entry = {key: value for key, value in (existing or {}).items() if key not in KNOWN_FIELDS}
    entry["id"] = toy_id
    entry["name"] = clean_text(toy_data.get("name")) or "Unnamed soft toy"

    official_model = clean_text(toy_data.get("officialModel") or toy_data.get("model") or toy_data.get("brandModel"))
    species = clean_text(toy_data.get("species"))
    spawn_location = clean_text(toy_data.get("spawnLocation") or toy_data.get("spawn"))
    date_added = clean_date(toy_data.get("dateAdded") or toy_data.get("acquiredDate") or toy_data.get("joinedDate"))
    status = normalize_status(toy_data.get("status") or toy_data.get("collectionStatus"))
    last_location = clean_text(toy_data.get("lastKnownLocation"))
    lost_date = clean_date(toy_data.get("lostDate"))
    end_date = clean_date(toy_data.get("endDate") or toy_data.get("memorialDate"))
    rejoin_date = clean_date(toy_data.get("rejoinDate") or toy_data.get("readdedDate") or toy_data.get("reAddDate"))

    if official_model:
        entry["officialModel"] = official_model
    if image:
        entry["image"] = image
    if gallery:
        entry["gallery"] = gallery
    if species:
        entry["species"] = species
    if spawn_location:
        entry["spawnLocation"] = spawn_location
    if date_added:
        entry["dateAdded"] = date_added

    entry["status"] = status

    if status == "lost":
        if last_location:
            entry["lastKnownLocation"] = last_location
        if lost_date:
            entry["lostDate"] = lost_date
    elif status == "memory":
        if end_date:
            entry["endDate"] = end_date
    else:
        # A currently active plush can carry a prior end date plus a rejoin date.
        if end_date:
            entry["endDate"] = end_date
        elif rejoin_date and lost_date:
            # Compatibility if an older rejoined entry stored its previous end as lostDate.
            entry["endDate"] = lost_date
        if rejoin_date:
            entry["rejoinDate"] = rejoin_date

    fun_facts = toy_data.get("funFacts")
    if isinstance(fun_facts, list):
        cleaned_facts = [clean_text(item) for item in fun_facts if clean_text(item)]
        if cleaned_facts:
            entry["funFacts"] = cleaned_facts

    relatives = toy_data.get("relatives")
    if isinstance(relatives, list):
        cleaned_relatives = []
        for relative in relatives:
            if not isinstance(relative, dict):
                continue
            relationship = clean_text(relative.get("relationship") or relative.get("relation"))
            target = clean_text(relative.get("toyId") or relative.get("id"))
            if relationship and target:
                cleaned_relatives.append({"relationship": relationship, "toyId": target})
        if cleaned_relatives:
            entry["relatives"] = cleaned_relatives

    entry["photoDisplay"] = clean_photo_display(toy_data.get("photoDisplay"))
    return entry


def archive_files(inbox: Path, paths: list[Path]) -> None:
    archive = inbox / "_imported"
    archive.mkdir(parents=True, exist_ok=True)
    for source in dict.fromkeys(paths):
        if not source.exists():
            continue
        destination = archive / source.name
        if destination.exists():
            counter = 2
            while True:
                candidate = archive / f"{destination.stem}-{counter}{destination.suffix}"
                if not candidate.exists():
                    destination = candidate
                    break
                counter += 1
        shutil.move(str(source), str(destination))


def import_manifest(manifest_path: Path, inbox: Path, toys: list[dict[str, Any]]) -> tuple[str, list[Path]]:
    with manifest_path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    if not isinstance(raw, dict):
        raise ValueError("Manifest root must be a JSON object")

    manifest = normalize_manifest(raw)
    toy_data = manifest["toy"]
    operation = manifest["operation"]
    target_id = manifest["targetId"]

    existing = None
    update_index = None
    if operation == "update":
        if not target_id:
            raise ValueError("Update manifest does not specify targetId")
        update_index = find_update_index(toys, target_id)
        if update_index is None:
            raise ValueError(f"Could not find existing toy with id '{target_id}'")
        existing = toys[update_index]
        toy_id = target_id
    else:
        toy_id = unique_id(clean_text(toy_data.get("name")) or "toy", toys)

    image, image_sources = process_main_photo(manifest["mainPhoto"], inbox, existing)
    gallery, gallery_sources = process_gallery(manifest["galleryPhotos"], inbox)

    # Old create manifests did not have an explicit galleryPhotos property.
    if not manifest["galleryPhotos"] and isinstance(toy_data.get("gallery"), list):
        gallery = [safe_basename(item) for item in toy_data["gallery"] if safe_basename(item)]

    entry = build_entry(toy_data, toy_id, image, gallery, existing)
    if operation == "update":
        toys[update_index] = entry
        action = f"Updated {entry['name']} ({toy_id})"
    else:
        toys.append(entry)
        action = f"Added {entry['name']} ({toy_id})"

    return action, [manifest_path, *image_sources, *gallery_sources]


def main() -> int:
    inbox_arg = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SOFT_TOY_INBOX")
    inbox = Path(inbox_arg).expanduser() if inbox_arg else DEFAULT_INBOX

    print(f"Website: {ROOT}")
    print(f"Inbox:   {inbox}")
    if not inbox.exists():
        print("\nSoft Toy Inbox was not found.")
        print("Create this iCloud Drive folder or pass a different inbox path as the first argument.")
        return 1

    manifests = sorted(inbox.glob("*.toy-entry.json"))
    if not manifests:
        print("\nNo new .toy-entry.json files found. Nothing to import.")
        return 0

    root, toys, _shape = load_database()
    successes: list[tuple[str, list[Path]]] = []
    failures = 0

    for manifest_path in manifests:
        try:
            action, consumed = import_manifest(manifest_path, inbox, toys)
            successes.append((action, consumed))
            print(f"✓ {action}")
        except Exception as exc:  # Keep other manifests importable if one is malformed.
            failures += 1
            print(f"✗ {manifest_path.name}: {exc}")

    if successes:
        write_database(root)
        for _action, consumed in successes:
            archive_files(inbox, consumed)
        print(f"\nSaved {len(successes)} change{'s' if len(successes) != 1 else ''} to {DATA_FILE}")
        print("Processed inbox files were moved into Soft Toy Inbox/_imported.")

    if failures:
        print(f"\n{failures} manifest{'s' if failures != 1 else ''} could not be imported and were left in the inbox.")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

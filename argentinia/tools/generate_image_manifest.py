#!/usr/bin/env python3
"""Generate Argentinia's card image manifest at deploy time.

This script is intentionally standard-library only so GitHub Actions can run it
without npm/pip dependencies. It NEVER makes network requests.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

CATEGORY_FILES = {
    "tierras": "tierras.json",
    "artefactos": "artefactos.json",
    "criaturas": "criaturas.json",
    "instantaneos": "instantaneos.json",
    "conjuros": "conjuros.json",
    "encantamientos": "encantamientos.json",
    "planeswalkers": "planeswalkers.json",
}
EXPECTED_COUNTS = {
    "tierras": 55,
    "artefactos": 44,
    "criaturas": 210,
    "instantaneos": 85,
    "conjuros": 61,
    "encantamientos": 50,
    "planeswalkers": 6,
}
EXPECTED_TOTAL = 511
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="Repository/site root")
    ap.add_argument("--expected-total", type=int, default=EXPECTED_TOTAL)
    ap.add_argument("--allow-count-drift", action="store_true", help="Generate even if category counts differ")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    data_dir = root / "assets" / "data"
    image_dir = root / "assets" / "images" / "cards"
    image_dir.mkdir(parents=True, exist_ok=True)

    cards = []
    counts = {}
    ids = set()
    duplicate_ids = []

    for category, filename in CATEGORY_FILES.items():
        path = data_dir / filename
        if not path.is_file():
            print(f"ERROR: falta {path.relative_to(root)}", file=sys.stderr)
            return 2
        payload = load_json(path)
        if not isinstance(payload, list):
            print(f"ERROR: {path.relative_to(root)} no contiene un array JSON", file=sys.stderr)
            return 2
        counts[category] = len(payload)
        for card in payload:
            if not isinstance(card, dict):
                print(f"ERROR: carta inválida en {filename}", file=sys.stderr)
                return 2
            card_id = str(card.get("id") or "").strip()
            if not card_id:
                print(f"ERROR: carta sin id en {filename}: {card.get('name')}", file=sys.stderr)
                return 2
            if card_id in ids:
                duplicate_ids.append(card_id)
            ids.add(card_id)
            cards.append((category, card))

    total = len(cards)
    if duplicate_ids:
        print(f"ERROR: IDs duplicados: {sorted(set(duplicate_ids))}", file=sys.stderr)
        return 2

    if not args.allow_count_drift:
        if counts != EXPECTED_COUNTS:
            print(f"ERROR: distribución del pool inesperada. Esperado={EXPECTED_COUNTS} Actual={counts}", file=sys.stderr)
            return 3
        if total != args.expected_total:
            print(f"ERROR: total del pool inesperado. Esperado={args.expected_total} Actual={total}", file=sys.stderr)
            return 3

    existing_files = []
    for path in image_dir.rglob("*"):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            existing_files.append(path.relative_to(image_dir).as_posix())
    existing_files.sort()
    existing_set = set(existing_files)

    referenced = []
    missing = []
    cards_without_image_field = []
    for category, card in cards:
        image = card.get("image")
        if not isinstance(image, str) or not image.strip():
            cards_without_image_field.append({
                "id": card.get("id"),
                "name": card.get("name"),
                "category": category,
            })
            continue
        image = image.strip().replace("\\", "/")
        referenced.append(image)
        if image not in existing_set:
            missing.append({
                "id": card.get("id"),
                "name": card.get("name"),
                "category": category,
                "image": image,
            })

    unique_referenced = sorted(set(referenced))
    missing.sort(key=lambda x: (x["category"], str(x["name"]), str(x["id"])))
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    sha = os.environ.get("GITHUB_SHA") or None
    run_id = os.environ.get("GITHUB_RUN_ID") or None

    manifest = {
        "schemaVersion": 1,
        "generatedAt": now,
        "gitSha": sha,
        "githubRunId": run_id,
        "pool": {
            "total": total,
            "categories": counts,
            "uniqueIds": len(ids),
        },
        "images": {
            "directory": "assets/images/cards",
            "existingFileCount": len(existing_files),
            "referencedCardCount": len(referenced),
            "uniqueReferencedFileCount": len(unique_referenced),
            "missingCardCount": len(missing),
            "cardsWithoutImageFieldCount": len(cards_without_image_field),
        },
        "missing": missing,
        "cardsWithoutImageField": cards_without_image_field,
        "files": existing_files,
    }

    manifest_path = image_dir / "cards-image-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    txt_path = image_dir / "missing-card-images.txt"
    txt_lines = [entry["image"] for entry in missing]
    txt_path.write_text(("\n".join(txt_lines) + ("\n" if txt_lines else "")), encoding="utf-8")

    print(f"IMAGE_MANIFEST_OK pool={total} existing={len(existing_files)} missingCards={len(missing)}")
    print(f"Manifest: {manifest_path.relative_to(root)}")
    print(f"TXT: {txt_path.relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

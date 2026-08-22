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
import re
import sys
import unicodedata
from collections import defaultdict
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
    "tierras": 56,
    "artefactos": 54,
    "criaturas": 252,
    "instantaneos": 105,
    "conjuros": 70,
    "encantamientos": 56,
    "planeswalkers": 8,
}

EXPECTED_TOTAL = 601
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}

# 23.13.16 — ownership/naming guard.
# One historical shared illustration is grandfathered because both card names
# genuinely describe the same "Cacerolazo" concept. New cards may not add
# themselves to this shared asset or reuse any other card image.
LEGACY_SHARED_IMAGE_OWNERS = {
    "cacerolazo.png": {"inst_010", "conj_008"},
}

# The 23.13.16 pool is gapless in every family. Any future card must append
# above these maxima and use the canonical filename derived from its own name.
CANONICAL_IMAGE_BASELINE_MAX = {
    "art": 44,
    "conj": 61,
    "crea": 210,
    "ench": 50,
    "inst": 85,
    "pw": 6,
    "tier": 55,
}

# These eleven cards were found during the 23.13.16 requisition with a
# placeholder/borrowed image. Lock their corrected ownership permanently.
CANONICAL_IMAGE_REQUIRED_IDS = {
    "inst_080", "inst_081", "inst_082", "inst_083", "inst_084", "inst_085",
    "conj_059", "conj_060", "conj_061", "crea_210", "art_044",
}


def canonical_card_image_name(card_name: str) -> str:
    normalized = unicodedata.normalize("NFD", str(card_name))
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return f"{normalized}.png"


def parse_card_id(card_id: str):
    match = re.fullmatch(r"([a-z]+)_(\d+)", str(card_id))
    if not match:
        return None, None
    return match.group(1), int(match.group(2))


def validate_image_ownership(cards) -> list[str]:
    errors = []
    owners = defaultdict(list)

    for category, card in cards:
        card_id = str(card.get("id") or "").strip()
        card_name = str(card.get("name") or "").strip()
        image = card.get("image")
        if not isinstance(image, str) or not image.strip():
            continue
        image = image.strip().replace("\\", "/")
        owners[image].append((card_id, card_name, category))

        prefix, number = parse_card_id(card_id)
        future_card = prefix in CANONICAL_IMAGE_BASELINE_MAX and number is not None and number > CANONICAL_IMAGE_BASELINE_MAX[prefix]
        if card_id in CANONICAL_IMAGE_REQUIRED_IDS or future_card:
            expected = canonical_card_image_name(card_name)
            if image != expected:
                errors.append(
                    f'{card_id} "{card_name}" usa image="{image}", esperado="{expected}" '
                    f'({"carta corregida 23.13.16" if card_id in CANONICAL_IMAGE_REQUIRED_IDS else "carta nueva"})'
                )

    for image, entries in sorted(owners.items()):
        if len(entries) <= 1:
            continue
        ids = {entry[0] for entry in entries}
        allowed = LEGACY_SHARED_IMAGE_OWNERS.get(image)
        if allowed is not None and ids == allowed:
            continue
        rendered = ", ".join(f'{card_id} "{name}"' for card_id, name, _ in entries)
        errors.append(f'image="{image}" está reutilizada por: {rendered}')

    return errors


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

    ownership_errors = validate_image_ownership(cards)
    if ownership_errors:
        print("ERROR: auditoría de ownership/nombre de imágenes falló:", file=sys.stderr)
        for item in ownership_errors:
            print(f"  - {item}", file=sys.stderr)
        return 4

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

    print(f"IMAGE_MANIFEST_OK pool={total} existing={len(existing_files)} missingCards={len(missing)} imageOwnership=OK")
    print(f"Manifest: {manifest_path.relative_to(root)}")
    print(f"TXT: {txt_path.relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

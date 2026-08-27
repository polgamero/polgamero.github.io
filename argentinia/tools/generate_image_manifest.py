#!/usr/bin/env python3
"""Generate Argentinia's card image manifest at deploy time.

Standard-library only; no network requests.

The pool cardinality is NOT hardcoded here. The authoritative source is
js/poolContract.js -> CURRENT_POOL_MILESTONE -> POOL_MILESTONES[milestone].
This keeps GitHub Pages validation aligned with the runtime contract when the
card pool grows.
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

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}

# 23.13.16 — ownership/naming guard.
# One historical shared illustration is grandfathered because both card names
# genuinely describe the same "Cacerolazo" concept. New cards may not add
# themselves to this shared asset or reuse any other card image.
LEGACY_SHARED_IMAGE_OWNERS = {
    "cacerolazo.png": {"inst_010", "conj_008"},
}

# The original/requisition baseline is gapless in every family. Any card above
# these maxima must use the canonical filename derived from its own name.
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


def load_pool_contract(root: Path) -> tuple[str, str, int, dict[str, int]]:
    """Read the active pool milestone from js/poolContract.js.

    We intentionally parse the very small declarative contract rather than
    duplicating totals in Python. Fail closed if its shape changes.
    """
    contract_path = root / "js" / "poolContract.js"
    if not contract_path.is_file():
        raise ValueError(f"falta {contract_path.relative_to(root)}")

    text = contract_path.read_text(encoding="utf-8")
    current_match = re.search(
        r"export\s+const\s+CURRENT_POOL_MILESTONE\s*=\s*['\"]([^'\"]+)['\"]\s*;",
        text,
    )
    if not current_match:
        raise ValueError("no se pudo leer CURRENT_POOL_MILESTONE en js/poolContract.js")

    milestone = current_match.group(1)
    milestone_re = re.compile(
        rf"\b{re.escape(milestone)}\s*:\s*makeMilestone\(\s*"
        rf"['\"]([^'\"]+)['\"]\s*,\s*(\d+)\s*,\s*\{{(.*?)\}}\s*\)",
        re.DOTALL,
    )
    milestone_match = milestone_re.search(text)
    if not milestone_match:
        raise ValueError(
            f"CURRENT_POOL_MILESTONE={milestone!r} no tiene un makeMilestone legible"
        )

    version = milestone_match.group(1)
    total = int(milestone_match.group(2))
    category_block = milestone_match.group(3)
    categories = {
        key: int(value)
        for key, value in re.findall(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(\d+)\b", category_block)
    }

    expected_keys = set(CATEGORY_FILES)
    actual_keys = set(categories)
    if actual_keys != expected_keys:
        missing = sorted(expected_keys - actual_keys)
        extra = sorted(actual_keys - expected_keys)
        raise ValueError(
            f"categorías de poolContract incompatibles; faltan={missing} extra={extra}"
        )
    if sum(categories.values()) != total:
        raise ValueError(
            f"poolContract inconsistente: suma categorías={sum(categories.values())} total={total}"
        )

    return milestone, version, total, categories



TOKEN_PRESETS = {
    "treasure": {"name": "Tesoro", "type": "Artefacto — Tesoro"},
    "clue": {"name": "Pista", "type": "Artefacto — Pista"},
    "food": {"name": "Comida", "type": "Artefacto — Comida"},
    "blood": {"name": "Sangre", "type": "Artefacto — Sangre"},
}

def normalize_token_effect(node, card):
    nested = node.get("token") if isinstance(node.get("token"), dict) else {}
    preset_key = str(node.get("tokenPreset") or nested.get("preset") or "").strip().lower()
    if preset_key and preset_key not in TOKEN_PRESETS:
        raise ValueError(f'tokenPreset desconocido: {preset_key}')
    preset = TOKEN_PRESETS.get(preset_key, {})
    merged = {**preset, **nested}
    stats = node.get("tokenStats") if isinstance(node.get("tokenStats"), dict) else {}
    token_type = str(merged.get("type") or node.get("tokenType") or "Criatura — Token")
    is_creature = "Criatura" in token_type or "power" in merged or "power" in stats
    image = merged.get("image", node.get("image"))
    return {
        "tokenName": merged.get("name") or node.get("tokenName") or "Ficha",
        "tokenType": token_type,
        "amount": node.get("amount", 1),
        "power": merged.get("power", stats.get("power", 1 if is_creature else None)),
        "toughness": merged.get("toughness", stats.get("toughness", 1 if is_creature else None)),
        "keywords": merged.get("keywords", node.get("tokenKeywords") or []),
        "image": image.strip().replace("\\", "/") if isinstance(image, str) and image.strip() else None,
    }

def collect_token_effects(cards):
    """Collect every nested create_tokens effect from the active JSON card pool."""
    found = []

    def visit(node, *, category, card, path):
        if isinstance(node, dict):
            if node.get("type") == "create_tokens":
                spec = normalize_token_effect(node, card)
                found.append({
                    "cardId": card.get("id"),
                    "cardName": card.get("name"),
                    "category": category,
                    "path": ".".join(str(part) for part in path),
                    **spec,
                })
            for key, value in node.items():
                visit(value, category=category, card=card, path=path + [key])
        elif isinstance(node, list):
            for index, value in enumerate(node):
                visit(value, category=category, card=card, path=path + [index])

    for category, card in cards:
        visit(card, category=category, card=card, path=[])
    return found


def validate_token_image_ownership(token_effects) -> list[str]:
    """A token art may be shared by producers only when they create the same named token."""
    errors = []
    image_names = defaultdict(set)
    for entry in token_effects:
        if entry.get("image"):
            image_names[entry["image"]].add(f'{entry["tokenName"]}::{entry.get("tokenType") or ""}')
    for image, names in sorted(image_names.items()):
        if len(names) > 1:
            errors.append(
                f'token image="{image}" está reutilizada por conceptos distintos: {sorted(names)}'
            )
    return errors


def iter_card_face_images(cards):
    """Yield front/back image references for physical cards.

    23.16.4: a TDFC owns two independent art assets under the same card id.
    Back-face images participate in canonical naming, ownership and missing-file CI.
    """
    for category, card in cards:
        yield {
            "category": category, "card": card, "cardId": str(card.get("id") or "").strip(),
            "cardName": str(card.get("name") or "").strip(), "face": "front",
            "faceName": str(card.get("name") or "").strip(), "image": card.get("image"),
        }
        dfc = card.get("dfc") if isinstance(card.get("dfc"), dict) else None
        back = dfc.get("backFace") if dfc and isinstance(dfc.get("backFace"), dict) else None
        if dfc and dfc.get("kind") == "transform" and back:
            yield {
                "category": category, "card": card, "cardId": str(card.get("id") or "").strip(),
                "cardName": str(card.get("name") or "").strip(), "face": "back",
                "faceName": str(back.get("name") or "").strip(), "image": back.get("image"),
            }


def validate_image_ownership(cards) -> list[str]:
    errors = []
    owners = defaultdict(list)
    for entry in iter_card_face_images(cards):
        card_id = entry["cardId"]
        card_name = entry["cardName"]
        face_name = entry["faceName"]
        face = entry["face"]
        category = entry["category"]
        image = entry.get("image")
        if not isinstance(image, str) or not image.strip():
            continue
        image = image.strip().replace("\\", "/")
        owners[image].append((card_id, card_name, category, face, face_name))
        prefix, number = parse_card_id(card_id)
        future_card = (
            prefix in CANONICAL_IMAGE_BASELINE_MAX
            and number is not None
            and number > CANONICAL_IMAGE_BASELINE_MAX[prefix]
        )
        # Front keeps the historical 23.13.16 contract; TDFC backs always use the
        # canonical filename derived from the back-face name.
        canonical_required = face == "back" or card_id in CANONICAL_IMAGE_REQUIRED_IDS or future_card
        if canonical_required:
            expected = canonical_card_image_name(face_name)
            if image != expected:
                label = f"{card_id} {face}" if face == "back" else card_id
                errors.append(
                    f'{label} "{face_name}" usa image="{image}", esperado="{expected}" '
                    f'({"cara posterior TDFC" if face == "back" else ("carta corregida 23.13.16" if card_id in CANONICAL_IMAGE_REQUIRED_IDS else "carta nueva")})'
                )

    for image, entries in sorted(owners.items()):
        if len(entries) <= 1:
            continue
        ids = {entry[0] for entry in entries}
        allowed = LEGACY_SHARED_IMAGE_OWNERS.get(image)
        if allowed is not None and ids == allowed and all(entry[3] == "front" for entry in entries):
            continue
        rendered = ", ".join(
            f'{card_id} [{face}] "{face_name}"' for card_id, _card_name, _category, face, face_name in entries
        )
        errors.append(f'image="{image}" está reutilizada por: {rendered}')

    return errors


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="Repository/site root")
    ap.add_argument(
        "--expected-total",
        type=int,
        default=None,
        help="Optional caller assertion. Must equal the active poolContract total.",
    )
    ap.add_argument(
        "--allow-count-drift",
        action="store_true",
        help="Generate even if JSON category counts differ from poolContract (diagnostic only)",
    )
    args = ap.parse_args()

    root = Path(args.root).resolve()
    data_dir = root / "assets" / "data"
    image_dir = root / "assets" / "images" / "cards"
    image_dir.mkdir(parents=True, exist_ok=True)

    try:
        milestone, contract_version, expected_total, expected_counts = load_pool_contract(root)
    except (OSError, ValueError) as exc:
        print(f"ERROR: poolContract inválido: {exc}", file=sys.stderr)
        return 2

    if args.expected_total is not None and args.expected_total != expected_total:
        print(
            "ERROR: --expected-total está desactualizado respecto de js/poolContract.js. "
            f"CLI={args.expected_total} contrato={expected_total} milestone={milestone}. "
            "Actualizá/eliminá el hardcode del workflow.",
            file=sys.stderr,
        )
        return 3

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
        if counts != expected_counts:
            print(
                "ERROR: distribución del pool inesperada. "
                f"Milestone={milestone} Esperado={expected_counts} Actual={counts}",
                file=sys.stderr,
            )
            return 3
        if total != expected_total:
            print(
                "ERROR: total del pool inesperado. "
                f"Milestone={milestone} Esperado={expected_total} Actual={total}",
                file=sys.stderr,
            )
            return 3

    ownership_errors = validate_image_ownership(cards)
    if ownership_errors:
        print("ERROR: auditoría de ownership/nombre de imágenes falló:", file=sys.stderr)
        for item in ownership_errors:
            print(f"  - {item}", file=sys.stderr)
        return 4

    token_effects = collect_token_effects(cards)
    token_ownership_errors = validate_token_image_ownership(token_effects)
    if token_ownership_errors:
        print("ERROR: auditoría de ownership de imágenes de token falló:", file=sys.stderr)
        for item in token_ownership_errors:
            print(f"  - {item}", file=sys.stderr)
        return 5

    existing_files = []
    for path in image_dir.rglob("*"):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            existing_files.append(path.relative_to(image_dir).as_posix())
    existing_files.sort()
    existing_set = set(existing_files)

    referenced = []
    missing = []
    cards_without_image_field = []
    for entry in iter_card_face_images(cards):
        image = entry.get("image")
        if not isinstance(image, str) or not image.strip():
            cards_without_image_field.append({
                "id": entry["cardId"],
                "name": entry["faceName"],
                "category": entry["category"],
                "face": entry["face"],
            })
            continue
        image = image.strip().replace("\\", "/")
        referenced.append(image)
        if image not in existing_set:
            missing.append({
                "id": entry["cardId"],
                "name": entry["faceName"],
                "category": entry["category"],
                "face": entry["face"],
                "image": image,
            })

    unique_referenced = sorted(set(referenced))
    missing.sort(key=lambda x: (x["category"], str(x["name"]), str(x["id"])))

    token_effects_without_image = [entry for entry in token_effects if not entry.get("image")]
    token_referenced = sorted({entry["image"] for entry in token_effects if entry.get("image")})
    missing_token_images = []
    for entry in token_effects:
        image = entry.get("image")
        if image and image not in existing_set:
            missing_token_images.append(dict(entry))
    missing_token_images.sort(key=lambda x: (str(x["tokenName"]), str(x["cardId"]), str(x["path"])))
    unique_token_names = sorted({str(entry.get("tokenName") or "Ficha") for entry in token_effects})

    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    sha = os.environ.get("GITHUB_SHA") or None
    run_id = os.environ.get("GITHUB_RUN_ID") or None

    manifest = {
        "schemaVersion": 1,
        "generatedAt": now,
        "gitSha": sha,
        "githubRunId": run_id,
        "pool": {
            "milestone": milestone,
            "contractVersion": contract_version,
            "total": total,
            "categories": counts,
            "uniqueIds": len(ids),
        },
        "images": {
            "directory": "assets/images/cards",
            "existingFileCount": len(existing_files),
            "referencedCardCount": len(cards) - sum(1 for entry in cards_without_image_field if entry.get("face") == "front"),
            "referencedFaceCount": len(referenced),
            "doubleFacedCardCount": sum(1 for _category, card in cards if isinstance(card.get("dfc"), dict) and card.get("dfc", {}).get("kind") == "transform"),
            "uniqueReferencedFileCount": len(unique_referenced),
            "missingCardCount": len(missing),
            "cardsWithoutImageFieldCount": len(cards_without_image_field),
        },
        "tokenImages": {
            "producerEffectCount": len(token_effects),
            "uniqueTokenNameCount": len(unique_token_names),
            "assignedEffectCount": len(token_effects) - len(token_effects_without_image),
            "unassignedEffectCount": len(token_effects_without_image),
            "uniqueReferencedFileCount": len(token_referenced),
            "missingEffectCount": len(missing_token_images),
            "missingUniqueFileCount": len({entry["image"] for entry in missing_token_images}),
        },
        "missing": missing,
        "cardsWithoutImageField": cards_without_image_field,
        "tokenEffects": token_effects,
        "tokenEffectsWithoutImage": token_effects_without_image,
        "missingTokenImages": missing_token_images,
        "files": existing_files,
    }

    manifest_path = image_dir / "cards-image-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    txt_path = image_dir / "missing-card-images.txt"
    txt_lines = [entry["image"] for entry in missing]
    txt_path.write_text(("\n".join(txt_lines) + ("\n" if txt_lines else "")), encoding="utf-8")

    token_txt_path = image_dir / "missing-token-images.txt"
    token_txt_lines = sorted({entry["image"] for entry in missing_token_images})
    token_txt_path.write_text(("\n".join(token_txt_lines) + ("\n" if token_txt_lines else "")), encoding="utf-8")

    token_unassigned_path = image_dir / "unassigned-token-images.txt"
    token_unassigned_lines = [
        f'{entry["cardId"]} | {entry["cardName"]} | {entry["tokenName"]} | {entry["path"]}'
        for entry in token_effects_without_image
    ]
    token_unassigned_path.write_text(("\n".join(token_unassigned_lines) + ("\n" if token_unassigned_lines else "")), encoding="utf-8")

    print(
        "IMAGE_MANIFEST_OK "
        f"milestone={milestone} pool={total} existing={len(existing_files)} "
        f"missingCards={len(missing)} tokenEffects={len(token_effects)} "
        f"tokenConcepts={len(unique_token_names)} tokenUnassigned={len(token_effects_without_image)} "
        f"missingTokenFiles={len(token_txt_lines)} imageOwnership=OK tokenOwnership=OK"
    )
    print(f"Manifest: {manifest_path.relative_to(root)}")
    print(f"Cards TXT: {txt_path.relative_to(root)}")
    print(f"Tokens TXT: {token_txt_path.relative_to(root)}")
    print(f"Unassigned token TXT: {token_unassigned_path.relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Argentinia visible-copy contract validator (23.13.38).

Goals:
1) every literal gameText()/gameTextHtml() key used by runtime JS exists in gameTexts.js;
2) new strict UI modules cannot add obvious human-visible HTML/textContent literals;
3) the 23.13.38 controlled surfaces are actually wired to Textos del Juego.

Legacy ui.js contains historical literal copy and is grandfathered. New standalone UI modules should
opt in with `// @game-text-surface strict` and use gameText() for all visible words.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

DEF_RE = re.compile(r"^\s*'([^']+)'\s*:\s*definition\(", re.M)
USE_RE = re.compile(r"\b(?:gameText|gameTextHtml)\(\s*['\"]([^'\"]+)['\"]")
STRICT_MARKER = "@game-text-surface strict"
TEXT_NODE_RE = re.compile(r">\s*([^<>{}\n]*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^<>{}\n]*)\s*<")
TEXTCONTENT_LITERAL_RE = re.compile(r"\.textContent\s*=\s*(['\"])([^'\"\n]*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^'\"\n]*)\1")

CONTROLLED_PREFIXES = (
    'ranking.', 'admin.stats.', 'admin.images.', 'combat.map.'
)
CONTROLLED_EXACT = {'encyclopedia.progress', 'admin.debug.col.duration', 'admin.tab.statistics'}


def strip_comments(source: str) -> str:
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    source = re.sub(r"(^|\s)//.*", r"\1", source)
    return source


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='.')
    args = ap.parse_args()
    root = Path(args.root).resolve()
    js_dir = root / 'js'
    catalog_path = js_dir / 'gameTexts.js'
    if not catalog_path.is_file():
        print('ERROR: falta js/gameTexts.js', file=sys.stderr)
        return 2

    catalog_source = catalog_path.read_text(encoding='utf-8')
    definitions = set(DEF_RE.findall(catalog_source))
    if not definitions:
        print('ERROR: no se detectaron definiciones en gameTexts.js', file=sys.stderr)
        return 2

    errors: list[str] = []
    used: dict[str, set[str]] = {}
    referenced_literals: set[str] = set()
    strict_files = 0

    for path in sorted(js_dir.glob('*.js')):
        source = path.read_text(encoding='utf-8')
        if path.name == 'gameTexts.js':
            continue
        for key in USE_RE.findall(source):
            used.setdefault(key, set()).add(path.name)
            if key not in definitions:
                errors.append(f'{path.name}: usa key inexistente {key!r}')
        for quoted in re.findall(r"['\"]([A-Za-z0-9_.-]+)['\"]", source):
            referenced_literals.add(quoted)

        if STRICT_MARKER in source:
            strict_files += 1
            clean = strip_comments(source)
            # Human text between HTML tags in strict modules must arrive through interpolation.
            for match in TEXT_NODE_RE.finditer(clean):
                text = match.group(1).strip()
                if not text or '${' in text:
                    continue
                # Pure arrows/numbers are not words; regex already requires letters.
                errors.append(f'{path.name}: texto HTML visible hardcodeado en superficie strict: {text!r}')
            for match in TEXTCONTENT_LITERAL_RE.finditer(clean):
                full_line = clean[clean.rfind('\n', 0, match.start()) + 1: clean.find('\n', match.end()) if clean.find('\n', match.end()) != -1 else len(clean)]
                if 'style.textContent' in full_line:
                    continue
                errors.append(f'{path.name}: textContent visible hardcodeado en superficie strict: {match.group(2)!r}')

    controlled = sorted(k for k in definitions if k.startswith(CONTROLLED_PREFIXES) or k in CONTROLLED_EXACT)
    for key in controlled:
        if key not in used and key not in referenced_literals:
            errors.append(f'gameTexts.js: key controlada {key!r} no está referenciada por ninguna superficie runtime')

    if strict_files < 2:
        errors.append(f'se esperaban al menos 2 superficies strict; encontradas={strict_files}')

    if errors:
        print('GAME_TEXT_CONTRACT_FAILED', file=sys.stderr)
        for error in errors:
            print(f'  - {error}', file=sys.stderr)
        return 1

    print(f'GAME_TEXT_CONTRACT_OK definitions={len(definitions)} used={len(used)} strictSurfaces={strict_files} controlled={len(controlled)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

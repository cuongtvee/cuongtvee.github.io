#!/usr/bin/env python3
"""Build Aptis Learning Graph v5 by extending the validated core builder."""

from __future__ import annotations

import json
from pathlib import Path

import build_aptis_bank as base

base.EXPECTED_READING = 696
base.EXPECTED_READING_TESTS = 24
base.EXPECTED_READING_TASKS = 120
base.EXPECTED_READING_UNITS = 720
base.EXPECTED_ITEMS = 2696


def main() -> int:
    result = base.main()

    output_dir = Path(base.parse_args().output_dir)
    manifest_path = output_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["status"] = "LEARNING_GRAPH_V5"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return result


if __name__ == "__main__":
    raise SystemExit(main())

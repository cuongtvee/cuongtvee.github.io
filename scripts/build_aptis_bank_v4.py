#!/usr/bin/env python3
"""Build Aptis Learning Graph v4 by extending the validated v3 builder."""

from __future__ import annotations

import json
from pathlib import Path

import build_aptis_bank as base

base.EXPECTED_READING = 580
base.EXPECTED_READING_TESTS = 20
base.EXPECTED_READING_TASKS = 100
base.EXPECTED_READING_UNITS = 600
base.EXPECTED_ITEMS = 2580


def main() -> int:
    result = base.main()

    # The underlying builder remains reusable; only the release label changes here.
    output_dir = Path(base.parse_args().output_dir)
    manifest_path = output_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["status"] = "LEARNING_GRAPH_V4"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return result


if __name__ == "__main__":
    raise SystemExit(main())

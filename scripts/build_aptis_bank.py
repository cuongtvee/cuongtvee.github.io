#!/usr/bin/env python3
"""Build and validate the Aptis static question-bank snapshot from an XLSX file."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

REQUIRED_STATUS = "PUBLISHED_FINAL"
EXPECTED_GRAMMAR = 1000
EXPECTED_VOCABULARY = 1000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--version", default="1.0.0")
    parser.add_argument("--source-sheet-id", default="")
    return parser.parse_args()


def read_rows(workbook_path: Path, sheet_name: str) -> list[dict[str, Any]]:
    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    try:
        if sheet_name not in workbook.sheetnames:
            raise ValueError(f"Missing worksheet: {sheet_name}")
        worksheet = workbook[sheet_name]
        rows = worksheet.iter_rows(values_only=True)
        headers = next(rows)
        index = {str(value): position for position, value in enumerate(headers)}
        output: list[dict[str, Any]] = []
        for row in rows:
            if not row or not row[index["ID"]]:
                continue
            output.append({header: row[position] for header, position in index.items()})
        return output
    finally:
        workbook.close()


def require_fields(row: dict[str, Any], fields: list[str], row_id: str) -> None:
    missing = [field for field in fields if row.get(field) in (None, "")]
    if missing:
        raise ValueError(f"{row_id}: missing fields: {', '.join(missing)}")


def build_grammar(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    required = [
        "ID", "Section", "Item Type", "Topic", "Level", "Question",
        "Option A", "Option B", "Option C", "Correct",
        "Explanation EN", "Explanation VI", "Difficulty", "Status",
    ]
    output = []
    for row in rows:
        row_id = str(row.get("ID"))
        require_fields(row, required, row_id)
        options = [str(row["Option A"]), str(row["Option B"]), str(row["Option C"])]
        correct = str(row["Correct"])
        if correct not in "ABC":
            raise ValueError(f"{row_id}: invalid answer label {correct}")
        if len(set(options)) != 3:
            raise ValueError(f"{row_id}: duplicate answer options")
        if str(row["Status"]) != REQUIRED_STATUS:
            raise ValueError(f"{row_id}: status must be {REQUIRED_STATUS}")
        output.append({
            "id": row_id,
            "section": str(row["Section"]),
            "item_type": str(row["Item Type"]),
            "topic": str(row["Topic"]),
            "level": str(row["Level"]),
            "question": str(row["Question"]),
            "options": options,
            "correct": correct,
            "explanation_en": str(row["Explanation EN"]),
            "explanation_vi": str(row["Explanation VI"]),
            "difficulty": str(row["Difficulty"]),
            "status": str(row["Status"]),
        })
    if len(output) != EXPECTED_GRAMMAR:
        raise ValueError(f"Expected {EXPECTED_GRAMMAR} grammar items, got {len(output)}")
    return output


def build_vocabulary(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    required = [
        "ID", "Section", "Item Type", "Subtype", "Level", "Prompt",
        "Option A", "Option B", "Option C", "Correct", "Correct Value",
        "Explanation EN", "Explanation VI", "Difficulty", "Status",
    ]
    output = []
    for row in rows:
        row_id = str(row.get("ID"))
        require_fields(row, required, row_id)
        item_type = str(row["Item Type"])
        if item_type == "bank_match" and row.get("Group ID") in (None, ""):
            raise ValueError(f"{row_id}: missing fields: Group ID")
        correct = str(row["Correct"])
        option_labels = "ABCDEFGHIJ" if item_type == "bank_match" else "ABC"
        option_count = 10 if item_type == "bank_match" else 3
        options = [str(row[f"Option {label}"]) for label in option_labels[:option_count]]
        if correct not in option_labels[:option_count]:
            raise ValueError(f"{row_id}: invalid answer label {correct}")
        if len(set(options)) != option_count:
            raise ValueError(f"{row_id}: duplicate answer options")
        correct_value = str(row["Correct Value"])
        if options[option_labels.index(correct)] != correct_value:
            raise ValueError(f"{row_id}: answer label does not match Correct Value")
        if str(row["Status"]) != REQUIRED_STATUS:
            raise ValueError(f"{row_id}: status must be {REQUIRED_STATUS}")
        item = {
            "id": row_id,
            "section": str(row["Section"]),
            "item_type": item_type,
            "subtype": str(row["Subtype"]),
            "group_id": "" if row.get("Group ID") in (None, "") else str(row["Group ID"]),
            "level": str(row["Level"]),
            "prompt": str(row["Prompt"]),
            "correct": correct,
            "correct_value": correct_value,
            "explanation_en": str(row["Explanation EN"]),
            "explanation_vi": str(row["Explanation VI"]),
            "difficulty": str(row["Difficulty"]),
            "status": str(row["Status"]),
        }
        if item_type == "bank_match":
            item["bank_options"] = options
        else:
            item["options"] = options
        output.append(item)
    if len(output) != EXPECTED_VOCABULARY:
        raise ValueError(f"Expected {EXPECTED_VOCABULARY} vocabulary items, got {len(output)}")
    return output


def write_json(path: Path, value: Any) -> bytes:
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)
    return payload


def main() -> int:
    args = parse_args()
    if not args.input.exists():
        raise FileNotFoundError(args.input)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    grammar = build_grammar(read_rows(args.input, "GRAMMAR_1000"))
    vocabulary = build_vocabulary(read_rows(args.input, "VOCABULARY_1000"))

    grammar_bytes = write_json(args.output_dir / "grammar.json", grammar)
    vocabulary_bytes = write_json(args.output_dir / "vocabulary.json", vocabulary)
    revision = hashlib.sha256(grammar_bytes + vocabulary_bytes).hexdigest()[:16]
    source_sha256 = hashlib.sha256(args.input.read_bytes()).hexdigest()

    manifest = {
        "version": args.version,
        "status": REQUIRED_STATUS,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "revision": revision,
        "source_sha256": source_sha256,
        "source_sheet_id": args.source_sheet_id,
        "grammar_count": len(grammar),
        "vocabulary_count": len(vocabulary),
    }
    write_json(args.output_dir / "manifest.json", manifest)

    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

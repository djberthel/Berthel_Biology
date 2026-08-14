#!/usr/bin/env python3
"""Build the browser-ready study bank from the workbook's canonical sheets.

The workbook also contains a derived ``Unified`` sheet.  It is intentionally
ignored here: parsing the canonical ``Glossary`` and ``WordParts`` sheets once
prevents duplicate and stale aggregate rows from reaching the website.
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"main": MAIN_NS, "rel": DOC_REL_NS, "pkg": PKG_REL_NS}

PLACEHOLDERS = {"", "9", "n/a", "na", "none", "null", "—", "-"}


def normalize(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_key(value: object) -> str:
    return normalize(value).casefold()


def column_index(cell_reference: str) -> int:
    letters = re.match(r"[A-Z]+", cell_reference.upper())
    if not letters:
        raise ValueError(f"Invalid cell reference: {cell_reference}")
    result = 0
    for character in letters.group(0):
        result = result * 26 + (ord(character) - 64)
    return result - 1


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    values: list[str] = []
    for item in root.findall("main:si", NS):
        text = "".join(node.text or "" for node in item.findall(".//main:t", NS))
        values.append(text)
    return values


def workbook_sheet_paths(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target_by_id = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in relationships.findall("pkg:Relationship", NS)
    }

    result: dict[str, str] = {}
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        name = sheet.attrib["name"]
        relationship_id = sheet.attrib[f"{{{DOC_REL_NS}}}id"]
        target = target_by_id[relationship_id].lstrip("/")
        result[name] = target if target.startswith("xl/") else f"xl/{target}"
    return result


def cell_text(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//main:t", NS))

    value_node = cell.find("main:v", NS)
    if value_node is None or value_node.text is None:
        return ""
    raw = value_node.text

    if cell_type == "s":
        return shared_strings[int(raw)]
    if cell_type == "b":
        return "TRUE" if raw == "1" else "FALSE"
    return raw


def read_sheet(
    archive: zipfile.ZipFile,
    sheet_path: str,
    shared_strings: list[str],
) -> list[list[str]]:
    root = ET.fromstring(archive.read(sheet_path))
    rows: list[list[str]] = []
    for row in root.findall("main:sheetData/main:row", NS):
        values: list[str] = []
        for cell in row.findall("main:c", NS):
            index = column_index(cell.attrib.get("r", "A1"))
            while len(values) <= index:
                values.append("")
            values[index] = normalize(cell_text(cell, shared_strings))
        rows.append(values)
    return rows


def records_from_rows(rows: list[list[str]]) -> list[dict[str, str]]:
    if not rows:
        return []
    headers = [normalize(value) for value in rows[0]]
    records: list[dict[str, str]] = []
    for row in rows[1:]:
        record = {
            header: normalize(row[index] if index < len(row) else "")
            for index, header in enumerate(headers)
            if header
        }
        if any(record.values()):
            records.append(record)
    return records


def valid_content(value: object) -> bool:
    return normalized_key(value) not in PLACEHOLDERS


def require_unique(entries: list[dict[str, str]], field: str, label: str) -> None:
    locations: dict[str, int] = {}
    duplicates: list[str] = []
    for index, entry in enumerate(entries, start=2):
        key = normalized_key(entry[field])
        if key in locations:
            duplicates.append(
                f"{entry[field]!r} (rows {locations[key]} and {index})"
            )
        else:
            locations[key] = index
    if duplicates:
        raise ValueError(f"Duplicate {label}: " + "; ".join(duplicates))


def build_bank(workbook_path: Path) -> dict[str, object]:
    with zipfile.ZipFile(workbook_path) as archive:
        shared_strings = read_shared_strings(archive)
        sheet_paths = workbook_sheet_paths(archive)
        missing_sheets = {"Glossary", "WordParts"} - set(sheet_paths)
        if missing_sheets:
            raise ValueError(
                "Workbook is missing canonical sheet(s): "
                + ", ".join(sorted(missing_sheets))
            )

        glossary = records_from_rows(
            read_sheet(archive, sheet_paths["Glossary"], shared_strings)
        )
        word_parts = records_from_rows(
            read_sheet(archive, sheet_paths["WordParts"], shared_strings)
        )

    vocabulary: list[dict[str, str]] = []
    rejected_vocabulary: list[str] = []
    for row in glossary:
        term = normalize(row.get("Term"))
        definition = normalize(row.get("Definition"))
        if not valid_content(term) or not valid_content(definition):
            rejected_vocabulary.append(f"ID {row.get('ID', '?')}")
            continue
        vocabulary.append(
            {
                "id": normalize(row.get("ID")),
                "section": normalize(row.get("Section")),
                "term": term,
                "definition": definition,
            }
        )

    etymology: list[dict[str, str]] = []
    rejected_etymology: list[str] = []
    for row in word_parts:
        part = normalize(row.get("Etymology"))
        meaning = normalize(row.get("Meaning"))
        if not valid_content(part) or not valid_content(meaning):
            rejected_etymology.append(f"ID {row.get('ID', '?')}")
            continue
        etymology.append(
            {
                "id": normalize(row.get("ID")),
                "section": normalize(row.get("Section")),
                "part": part,
                "meaning": meaning,
                "examples": normalize(row.get("Examples")),
            }
        )

    if rejected_vocabulary or rejected_etymology:
        rejected = rejected_vocabulary + rejected_etymology
        raise ValueError("Rows with missing or placeholder content: " + ", ".join(rejected))

    require_unique(vocabulary, "term", "vocabulary terms")
    require_unique(etymology, "part", "word parts")

    return {
        "schemaVersion": 1,
        "source": workbook_path.name,
        "counts": {
            "vocabulary": len(vocabulary),
            "etymology": len(etymology),
            "total": len(vocabulary) + len(etymology),
        },
        "vocabulary": vocabulary,
        "etymology": etymology,
    }


def main() -> int:
    repository_root = Path(__file__).resolve().parents[1]
    workbook_path = (
        Path(sys.argv[1]).resolve()
        if len(sys.argv) > 1
        else repository_root / "Vocab_Ety_Master_List.xlsx"
    )
    output_path = (
        Path(sys.argv[2]).resolve()
        if len(sys.argv) > 2
        else repository_root / "data" / "biology-bank.json"
    )

    bank = build_bank(workbook_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(bank, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    counts = bank["counts"]
    print(
        f"Built {output_path}: "
        f"{counts['vocabulary']} vocabulary + "
        f"{counts['etymology']} word parts = {counts['total']} entries"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

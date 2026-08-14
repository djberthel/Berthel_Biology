#!/usr/bin/env python3
"""Build the audited browser bank from the DP-aligned content files.

The content files group concise definitions under the 40 topics in the
IB Diploma Programme Biology subject brief (first assessment 2025). This
script validates that content before flattening it into the JSON used by the
website. The spreadsheet is a human-readable audit export of these files.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


FRAMEWORK_URL = (
    "https://ibo.org/globalassets/new-structure/recognition/pdfs/"
    "dp_sciences_biology_subject-brief_jan_2022_e.pdf"
)

EXPECTED_TOPICS = [
    ("A1.1", "Water", "SL/HL"),
    ("A1.2", "Nucleic acids", "SL/HL"),
    ("A2.1", "Origins of cells", "HL"),
    ("A2.2", "Cell structure", "SL/HL"),
    ("A2.3", "Viruses", "HL"),
    ("A3.1", "Diversity of organisms", "SL/HL"),
    ("A3.2", "Classification and cladistics", "HL"),
    ("A4.1", "Evolution and speciation", "SL/HL"),
    ("A4.2", "Conservation of biodiversity", "SL/HL"),
    ("B1.1", "Carbohydrates and lipids", "SL/HL"),
    ("B1.2", "Proteins", "SL/HL"),
    ("B2.1", "Membranes and membrane transport", "SL/HL"),
    ("B2.2", "Organelles and compartmentalization", "SL/HL"),
    ("B2.3", "Cell specialization", "SL/HL"),
    ("B3.1", "Gas exchange", "SL/HL"),
    ("B3.2", "Transport", "SL/HL"),
    ("B3.3", "Muscle and motility", "HL"),
    ("B4.1", "Adaptation to environment", "SL/HL"),
    ("B4.2", "Ecological niches", "SL/HL"),
    ("C1.1", "Enzymes and metabolism", "SL/HL"),
    ("C1.2", "Cell respiration", "SL/HL"),
    ("C1.3", "Photosynthesis", "SL/HL"),
    ("C2.1", "Chemical signalling", "HL"),
    ("C2.2", "Neural signalling", "SL/HL"),
    ("C3.1", "Integration of body systems", "SL/HL"),
    ("C3.2", "Defence against disease", "SL/HL"),
    ("C4.1", "Populations and communities", "SL/HL"),
    ("C4.2", "Transfer of energy and matter", "SL/HL"),
    ("D1.1", "DNA replication", "SL/HL"),
    ("D1.2", "Protein synthesis", "SL/HL"),
    ("D1.3", "Mutations and gene editing", "SL/HL"),
    ("D2.1", "Cell and nuclear division", "SL/HL"),
    ("D2.2", "Gene expression", "HL"),
    ("D2.3", "Water potential", "SL/HL"),
    ("D3.1", "Reproduction", "SL/HL"),
    ("D3.2", "Inheritance", "SL/HL"),
    ("D3.3", "Homeostasis", "SL/HL"),
    ("D4.1", "Natural selection", "SL/HL"),
    ("D4.2", "Sustainability and change", "SL/HL"),
    ("D4.3", "Climate change", "SL/HL"),
]

PLACEHOLDERS = {"", "9", "n/a", "na", "none", "null", "—", "-"}


def normalize(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_key(value: object) -> str:
    return normalize(value).casefold()


def word_count(value: str) -> int:
    return len(re.findall(r"\b[\w′’-]+\b", value, flags=re.UNICODE))


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def require_text(value: object, label: str) -> str:
    clean = normalize(value)
    if normalized_key(clean) in PLACEHOLDERS:
        raise ValueError(f"{label} is missing or contains a placeholder")
    return clean


def require_https(value: object, label: str) -> str:
    clean = require_text(value, label)
    if not clean.startswith("https://"):
        raise ValueError(f"{label} must use an https URL: {clean!r}")
    return clean


def require_unique(entries: list[dict[str, Any]], field: str, label: str) -> None:
    locations: dict[str, str] = {}
    duplicates: list[str] = []
    for entry in entries:
        key = normalized_key(entry[field])
        if key in locations:
            duplicates.append(f"{entry[field]!r} ({locations[key]} and {entry['id']})")
        else:
            locations[key] = entry["id"]
    if duplicates:
        raise ValueError(f"Duplicate {label}: " + "; ".join(duplicates))


def build_bank(repository_root: Path) -> dict[str, Any]:
    content_dir = repository_root / "content"
    topic_files = [content_dir / f"dp_terms_{letter}.json" for letter in "abcd"]
    topics: list[dict[str, Any]] = []
    for path in topic_files:
        payload = load_json(path)
        if not isinstance(payload, list):
            raise ValueError(f"{path.name} must contain a JSON array")
        topics.extend(payload)

    actual_framework = [
        (
            normalize(topic.get("code")),
            normalize(topic.get("topic")),
            normalize(topic.get("level")),
        )
        for topic in topics
    ]
    if actual_framework != EXPECTED_TOPICS:
        raise ValueError(
            "DP topic order, names, or levels do not match the official 40-topic framework"
        )

    vocabulary: list[dict[str, Any]] = []
    topic_summary: list[dict[str, Any]] = []
    for topic in topics:
        code = require_text(topic.get("code"), "topic code")
        theme = require_text(topic.get("theme"), f"{code} theme")
        topic_name = require_text(topic.get("topic"), f"{code} topic")
        level = require_text(topic.get("level"), f"{code} level")
        source_title = require_text(topic.get("sourceTitle"), f"{code} source title")
        source_url = require_https(topic.get("sourceUrl"), f"{code} source URL")
        terms = topic.get("terms")
        if not isinstance(terms, list) or len(terms) < 10:
            raise ValueError(f"{code} must contain at least 10 substantive terms")

        for sequence, source_entry in enumerate(terms, start=1):
            term = require_text(source_entry.get("term"), f"{code} term {sequence}")
            definition = require_text(
                source_entry.get("definition"), f"{code} definition {sequence}"
            )
            entry_source_title = normalize(source_entry.get("sourceTitle")) or source_title
            entry_source_url = normalize(source_entry.get("sourceUrl")) or source_url
            entry_source_url = require_https(
                entry_source_url, f"{code} {term!r} source URL"
            )
            definition_words = word_count(definition)
            if not 5 <= definition_words <= 32:
                raise ValueError(
                    f"{code} {term!r} definition has {definition_words} words; expected 5–32"
                )
            if not definition[0].isupper() or definition[-1] not in ".!?":
                raise ValueError(
                    f"{code} {term!r} definition must be a complete sentence: {definition!r}"
                )
            vocabulary.append(
                {
                    "id": f"{code}-{sequence:02d}",
                    "code": code,
                    "section": f"{code} · {topic_name}",
                    "theme": theme,
                    "topic": topic_name,
                    "level": level,
                    "term": term,
                    "definition": definition,
                    "sourceTitle": entry_source_title,
                    "sourceUrl": entry_source_url,
                }
            )

        topic_summary.append(
            {
                "code": code,
                "theme": theme,
                "topic": topic_name,
                "level": level,
                "count": len(terms),
            }
        )

    require_unique(vocabulary, "term", "DP terms")
    require_unique(vocabulary, "definition", "DP definitions")

    word_parts_payload = load_json(content_dir / "word_parts.json")
    source_title = require_text(
        word_parts_payload.get("sourceTitle"), "word-parts source title"
    )
    source_url = require_https(
        word_parts_payload.get("sourceUrl"), "word-parts source URL"
    )
    raw_word_parts = word_parts_payload.get("entries")
    if not isinstance(raw_word_parts, list) or len(raw_word_parts) < 50:
        raise ValueError("word_parts.json must contain at least 50 entries")

    etymology: list[dict[str, Any]] = []
    for sequence, source_entry in enumerate(raw_word_parts, start=1):
        part = require_text(source_entry.get("part"), f"word part {sequence}")
        meaning = require_text(source_entry.get("meaning"), f"{part} meaning")
        examples = require_text(source_entry.get("examples"), f"{part} examples")
        etymology.append(
            {
                "id": f"WP-{sequence:03d}",
                "section": "Biological word parts",
                "part": part,
                "meaning": meaning,
                "examples": examples,
                "ambiguityGroup": normalize(source_entry.get("ambiguityGroup")),
                "sourceTitle": source_title,
                "sourceUrl": source_url,
            }
        )

    require_unique(etymology, "part", "word parts")

    counts = {
        "topics": len(topic_summary),
        "vocabulary": len(vocabulary),
        "etymology": len(etymology),
        "total": len(vocabulary) + len(etymology),
    }
    return {
        "schemaVersion": 2,
        "framework": {
            "title": "IB Diploma Programme Biology",
            "firstAssessment": 2025,
            "topicCount": 40,
            "url": FRAMEWORK_URL,
        },
        "source": "content/dp_terms_*.json + content/word_parts.json",
        "audit": {
            "questionModel": "definition-to-term",
            "contentStatus": "curated-and-validated",
        },
        "counts": counts,
        "topics": topic_summary,
        "vocabulary": vocabulary,
        "etymology": etymology,
    }


def main() -> int:
    repository_root = Path(__file__).resolve().parents[1]
    output_path = (
        Path(sys.argv[1]).resolve()
        if len(sys.argv) > 1
        else repository_root / "data" / "biology-bank.json"
    )
    if len(sys.argv) > 2:
        raise ValueError("Usage: python3 scripts/build_data.py [output.json]")

    bank = build_bank(repository_root)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(bank, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    counts = bank["counts"]
    print(
        f"Built {output_path}: {counts['vocabulary']} DP terms across "
        f"{counts['topics']} topics + {counts['etymology']} word parts = "
        f"{counts['total']} verified entries"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

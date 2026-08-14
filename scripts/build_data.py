#!/usr/bin/env python3
"""Build the browser-ready 1,000-question DP Biology practice bank."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


FRAMEWORK_URL = (
    "https://ibo.org/globalassets/new-structure/recognition/pdfs/"
    "dp_sciences_biology_subject-brief_jan_2022_e.pdf"
)
TOPIC_FILES = (
    "dp_terms_a.json",
    "dp_terms_b.json",
    "dp_terms_c.json",
    "dp_terms_d.json",
)
LETTERS = ("A", "B", "C", "D")
QUESTIONS_PER_TOPIC = 25
SCENARIO_QUESTIONS_PER_TOPIC = 10
COMPARISON_QUESTIONS_PER_TOPIC = 8
MATCHED_PAIR_QUESTIONS_PER_TOPIC = 7

EXPECTED_TOPICS = (
    ("A1.1", "Unity and diversity", "Water", "SL/HL"),
    ("A1.2", "Unity and diversity", "Nucleic acids", "SL/HL"),
    ("A2.1", "Unity and diversity", "Origins of cells", "HL"),
    ("A2.2", "Unity and diversity", "Cell structure", "SL/HL"),
    ("A2.3", "Unity and diversity", "Viruses", "HL"),
    ("A3.1", "Unity and diversity", "Diversity of organisms", "SL/HL"),
    ("A3.2", "Unity and diversity", "Classification and cladistics", "HL"),
    ("A4.1", "Unity and diversity", "Evolution and speciation", "SL/HL"),
    ("A4.2", "Unity and diversity", "Conservation of biodiversity", "SL/HL"),
    ("B1.1", "Form and function", "Carbohydrates and lipids", "SL/HL"),
    ("B1.2", "Form and function", "Proteins", "SL/HL"),
    ("B2.1", "Form and function", "Membranes and membrane transport", "SL/HL"),
    ("B2.2", "Form and function", "Organelles and compartmentalization", "SL/HL"),
    ("B2.3", "Form and function", "Cell specialization", "SL/HL"),
    ("B3.1", "Form and function", "Gas exchange", "SL/HL"),
    ("B3.2", "Form and function", "Transport", "SL/HL"),
    ("B3.3", "Form and function", "Muscle and motility", "HL"),
    ("B4.1", "Form and function", "Adaptation to environment", "SL/HL"),
    ("B4.2", "Form and function", "Ecological niches", "SL/HL"),
    ("C1.1", "Interaction and interdependence", "Enzymes and metabolism", "SL/HL"),
    ("C1.2", "Interaction and interdependence", "Cell respiration", "SL/HL"),
    ("C1.3", "Interaction and interdependence", "Photosynthesis", "SL/HL"),
    ("C2.1", "Interaction and interdependence", "Chemical signalling", "HL"),
    ("C2.2", "Interaction and interdependence", "Neural signalling", "SL/HL"),
    ("C3.1", "Interaction and interdependence", "Integration of body systems", "SL/HL"),
    ("C3.2", "Interaction and interdependence", "Defence against disease", "SL/HL"),
    ("C4.1", "Interaction and interdependence", "Populations and communities", "SL/HL"),
    ("C4.2", "Interaction and interdependence", "Transfer of energy and matter", "SL/HL"),
    ("D1.1", "Continuity and change", "DNA replication", "SL/HL"),
    ("D1.2", "Continuity and change", "Protein synthesis", "SL/HL"),
    ("D1.3", "Continuity and change", "Mutations and gene editing", "SL/HL"),
    ("D2.1", "Continuity and change", "Cell and nuclear division", "SL/HL"),
    ("D2.2", "Continuity and change", "Gene expression", "HL"),
    ("D2.3", "Continuity and change", "Water potential", "SL/HL"),
    ("D3.1", "Continuity and change", "Reproduction", "SL/HL"),
    ("D3.2", "Continuity and change", "Inheritance", "SL/HL"),
    ("D3.3", "Continuity and change", "Homeostasis", "SL/HL"),
    ("D4.1", "Continuity and change", "Natural selection", "SL/HL"),
    ("D4.2", "Continuity and change", "Sustainability and change", "SL/HL"),
    ("D4.3", "Continuity and change", "Climate change", "SL/HL"),
)

SCENARIO_TEMPLATES = (
    "A student records this finding: {description} Which term most precisely identifies the concept?",
    "A biological concept is defined as follows: {description} Which term matches the definition?",
    "Evidence from an investigation supports this conclusion: {description} Which term best completes the conclusion?",
    "Which term most precisely labels this biological description? {description}",
    "A student is given this definition: {description} Which term is the best match?",
    "Which concept best accounts for this biological feature? {description}",
    "An unfamiliar biological example is described as follows: {description} Which term gives the most specific classification?",
)

MATCHED_PAIR_TEMPLATES = (
    "which option correctly matches a concept with its biological definition?",
    "which row contains a scientifically accurate concept–definition pair?",
    "which concept–definition pairing is correct?",
    "select the only accurately matched concept and description.",
    "which option pairs a biological term with its correct meaning?",
    "which pairing would be scientifically valid in a DP Biology glossary?",
    "which term and definition belong together?",
)

MISSING_CONTEXT_PATTERNS = (
    re.compile(
        r"\b(?:graph|diagram|figure|image|table|chart|micrograph|illustration)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:graph|diagram|figure|image|table|chart|micrograph|illustration|visual)\s+"
        r"(?:above|below|shown|provided|displayed|presented|pictured)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:above|below|shown|provided|displayed|presented|pictured)\s+"
        r"(?:graph|diagram|figure|image|table|chart|micrograph|illustration|visual)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:annotate|label|inspect|examine|study|refer to)\s+(?:the|this|a)\s+"
        r"(?:graph|diagram|figure|image|table|chart|micrograph|illustration|visual|model)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:statement|property)\s+below\b", re.IGNORECASE),
    re.compile(r"\bstudent checks revision table\b", re.IGNORECASE),
    re.compile(r"\bannotations? (?:are|is) proposed for a biological model\b", re.IGNORECASE),
    re.compile(
        r"\b(?:data|results|values?|trend|pattern)\s+"
        r"(?:shown|displayed|presented|plotted|provided)\b",
        re.IGNORECASE,
    ),
)

STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
    "is", "it", "of", "on", "or", "that", "the", "this", "to", "with", "which",
}


def normalize(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_key(value: Any) -> str:
    return normalize(value).casefold()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def require_text(value: Any, label: str) -> str:
    text = normalize(value)
    if not text:
        raise ValueError(f"Missing {label}")
    return text


def require_https(value: Any, label: str) -> str:
    url = require_text(value, label)
    if not url.startswith("https://"):
        raise ValueError(f"{label} must use HTTPS: {url!r}")
    return url


def tokens(value: str) -> set[str]:
    return {
        token
        for token in re.sub(r"[^a-z0-9\s-]", " ", normalized_key(value)).split()
        if len(token) > 1 and token not in STOP_WORDS
    }


def similarity(left: dict[str, str], right: dict[str, str]) -> float:
    left_tokens = tokens(f"{left['term']} {left['definition']}")
    right_tokens = tokens(f"{right['term']} {right['definition']}")
    union = left_tokens | right_tokens
    overlap = left_tokens & right_tokens
    return len(overlap) / len(union) if union else 0.0


def term_appears_in_text(term: str, text: str) -> bool:
    term_text = normalize(term)
    compact_term = re.sub(r"\W", "", normalized_key(term_text))
    if len(compact_term) > 3:
        return normalized_key(term_text) in normalized_key(text)
    pattern = re.compile(rf"(?<!\w){re.escape(term_text)}(?!\w)", re.IGNORECASE)
    return bool(pattern.search(normalize(text)))


def question_description(definition: str, hidden_term: str) -> str:
    result = normalize(definition)
    if term_appears_in_text(hidden_term, result):
        raise ValueError(
            f"Definition for {hidden_term!r} reveals the keyed term and must be rewritten"
        )
    return result


def requires_missing_context(stem: str) -> bool:
    return any(pattern.search(stem) for pattern in MISSING_CONTEXT_PATTERNS)


def place_correct(correct: str, distractors: list[str], target_letter: str) -> list[str]:
    if len(distractors) != 3:
        raise ValueError("Each question requires exactly three distractors")
    choices: list[str] = []
    distractor_index = 0
    for letter in LETTERS:
        if letter == target_letter:
            choices.append(correct)
        else:
            choices.append(distractors[distractor_index])
            distractor_index += 1
    if len({normalized_key(choice) for choice in choices}) != 4:
        raise ValueError(f"Repeated choices generated: {choices!r}")
    return choices


def ranked_distractors(terms: list[dict[str, str]], correct_index: int) -> list[dict[str, str]]:
    correct = terms[correct_index]
    candidates = [entry for index, entry in enumerate(terms) if index != correct_index]
    return sorted(
        candidates,
        key=lambda entry: (-similarity(correct, entry), normalized_key(entry["term"])),
    )


def scenario_question(
    topic: dict[str, Any],
    terms: list[dict[str, str]],
    term_index: int,
    question_number: int,
    global_index: int,
) -> dict[str, Any]:
    correct_entry = terms[term_index]
    description = question_description(correct_entry["definition"], correct_entry["term"])
    ranked = [
        entry
        for entry in ranked_distractors(terms, term_index)
        if not term_appears_in_text(entry["term"], description)
    ]
    if len(ranked) < 3:
        raise ValueError(
            f"{topic['code']} {correct_entry['term']} does not have three unmentioned distractors"
        )
    distractor_entries = ranked[:3]
    correct = correct_entry["term"]
    target_letter = LETTERS[global_index % len(LETTERS)]
    stem = SCENARIO_TEMPLATES[term_index % len(SCENARIO_TEMPLATES)].format(
        description=description
    )
    definition = correct_entry["definition"].rstrip(".")
    rationale = f"{correct} is correct because it refers to {definition[0].lower() + definition[1:]}."
    choices = place_correct(
        correct,
        [entry["term"] for entry in distractor_entries],
        target_letter,
    )
    return {
        "id": f"{topic['code']}-Q{question_number:02d}",
        "code": topic["code"],
        "theme": topic["theme"],
        "topic": topic["topic"],
        "level": topic["level"],
        "format": "scenario",
        "skill": "application",
        "stem": stem,
        "choices": choices,
        "answer": target_letter,
        "correctText": correct,
        "rationale": rationale,
        "concepts": [correct],
        "choiceConcepts": choices,
        "sourceTitle": topic["sourceTitle"],
        "sourceUrl": topic["sourceUrl"],
    }


def comparison_question(
    topic: dict[str, Any],
    terms: list[dict[str, str]],
    comparison_index: int,
    question_number: int,
    global_index: int,
) -> dict[str, Any]:
    term_count = len(terms)
    pair_offset = comparison_index * 2
    first_index = (
        SCENARIO_QUESTIONS_PER_TOPIC
        + pair_offset
        + pair_offset // term_count
    ) % term_count
    second_index = (first_index + 1) % term_count
    if second_index == first_index:
        second_index = (second_index + 1) % term_count
    first = terms[first_index]
    second = terms[second_index]
    ranked = [
        entry
        for entry in ranked_distractors(terms, first_index)
        if entry["term"] != second["term"]
    ]
    third = ranked[comparison_index % len(ranked)]
    choice_terms = [first["term"], second["term"], third["term"]]
    first_description = question_description(first["definition"], first["term"])
    second_description = question_description(second["definition"], second["term"])
    stem = (
        f"Statement I: {first_description} "
        f"Statement II: {second_description} "
        "Which option correctly identifies statements I and II?"
    )
    correct = f"I: {first['term']}; II: {second['term']}"
    distractors = [
        f"I: {second['term']}; II: {first['term']}",
        f"I: {first['term']}; II: {third['term']}",
        f"I: {third['term']}; II: {second['term']}",
    ]
    target_letter = LETTERS[global_index % len(LETTERS)]
    choices = place_correct(correct, distractors, target_letter)
    return {
        "id": f"{topic['code']}-Q{question_number:02d}",
        "code": topic["code"],
        "theme": topic["theme"],
        "topic": topic["topic"],
        "level": topic["level"],
        "format": "paired-evidence",
        "skill": "analysis",
        "stem": stem,
        "choices": choices,
        "answer": target_letter,
        "correctText": correct,
        "rationale": (
            f"Statement I describes {first['term']}; statement II describes {second['term']}."
        ),
        "concepts": [first["term"], second["term"]],
        "choiceConcepts": choice_terms,
        "sourceTitle": topic["sourceTitle"],
        "sourceUrl": topic["sourceUrl"],
    }


def matched_pair_question(
    topic: dict[str, Any],
    terms: list[dict[str, str]],
    match_index: int,
    question_number: int,
    global_index: int,
) -> dict[str, Any]:
    term_count = len(terms)
    indices = []
    cursor = (match_index * 3 + 2) % term_count
    while len(indices) < 4:
        candidate = cursor % term_count
        if candidate not in indices:
            indices.append(candidate)
        cursor += 2
    first, second, third, fourth = (terms[index] for index in indices)
    correct = f"{first['term']} — {first['definition']}"
    distractors = [
        f"{second['term']} — {third['definition']}",
        f"{third['term']} — {fourth['definition']}",
        f"{fourth['term']} — {second['definition']}",
    ]
    target_letter = LETTERS[global_index % len(LETTERS)]
    choices = place_correct(correct, distractors, target_letter)
    return {
        "id": f"{topic['code']}-Q{question_number:02d}",
        "code": topic["code"],
        "theme": topic["theme"],
        "topic": topic["topic"],
        "level": topic["level"],
        "format": "matched-pair",
        "skill": "analysis",
        "stem": (
            f"For the topic {topic['topic']}, "
            f"{MATCHED_PAIR_TEMPLATES[match_index % len(MATCHED_PAIR_TEMPLATES)]}"
        ),
        "choices": choices,
        "answer": target_letter,
        "correctText": correct,
        "rationale": (
            f"{first['term']} is correctly matched: {first['definition']} "
            "The other options pair terms with descriptions of different concepts."
        ),
        "concepts": [entry["term"] for entry in (first, second, third, fourth)],
        "choiceConcepts": [entry["term"] for entry in (first, second, third, fourth)],
        "sourceTitle": topic["sourceTitle"],
        "sourceUrl": topic["sourceUrl"],
    }


def load_topics(repository_root: Path) -> list[dict[str, Any]]:
    content_dir = repository_root / "content"
    loaded: dict[str, dict[str, Any]] = {}
    seen_terms: set[str] = set()
    seen_definitions: set[str] = set()

    for filename in TOPIC_FILES:
        payload = load_json(content_dir / filename)
        if not isinstance(payload, list):
            raise ValueError(f"{filename} must contain a JSON array")
        for raw_topic in payload:
            code = require_text(raw_topic.get("code"), f"{filename} topic code")
            if code in loaded:
                raise ValueError(f"Repeated topic code: {code}")
            topic = {
                "code": code,
                "theme": require_text(raw_topic.get("theme"), f"{code} theme"),
                "topic": require_text(raw_topic.get("topic"), f"{code} topic"),
                "level": require_text(raw_topic.get("level"), f"{code} level"),
                "sourceTitle": require_text(raw_topic.get("sourceTitle"), f"{code} source title"),
                "sourceUrl": require_https(raw_topic.get("sourceUrl"), f"{code} source URL"),
                "terms": [],
            }
            raw_terms = raw_topic.get("terms")
            if not isinstance(raw_terms, list) or len(raw_terms) < 10:
                raise ValueError(f"{code} must contain at least ten substantive concepts")
            for sequence, raw_entry in enumerate(raw_terms, start=1):
                term = require_text(raw_entry.get("term"), f"{code} term {sequence}")
                definition = require_text(
                    raw_entry.get("definition"), f"{code} definition {sequence}"
                )
                term_key = normalized_key(term)
                definition_key = normalized_key(definition)
                if term_key in seen_terms:
                    raise ValueError(f"Repeated DP term: {term}")
                if definition_key in seen_definitions:
                    raise ValueError(f"Repeated DP definition: {definition}")
                seen_terms.add(term_key)
                seen_definitions.add(definition_key)
                topic["terms"].append({"term": term, "definition": definition})
            loaded[code] = topic

    expected_codes = [row[0] for row in EXPECTED_TOPICS]
    if set(loaded) != set(expected_codes):
        missing = sorted(set(expected_codes) - set(loaded))
        extra = sorted(set(loaded) - set(expected_codes))
        raise ValueError(f"Framework topic mismatch; missing={missing}, extra={extra}")

    ordered: list[dict[str, Any]] = []
    for code, theme, topic_name, level in EXPECTED_TOPICS:
        topic = loaded[code]
        actual = (topic["theme"], topic["topic"], topic["level"])
        expected = (theme, topic_name, level)
        if actual != expected:
            raise ValueError(f"{code} framework mismatch: {actual!r} != {expected!r}")
        ordered.append(topic)
    return ordered


def validate_questions(questions: list[dict[str, Any]], topics: list[dict[str, Any]]) -> None:
    if len(questions) != 1000:
        raise ValueError(f"Expected 1,000 questions; generated {len(questions)}")
    ids = [question["id"] for question in questions]
    stems = [normalized_key(question["stem"]) for question in questions]
    if len(set(ids)) != len(ids):
        raise ValueError("Question IDs must be unique")
    if len(set(stems)) != len(stems):
        raise ValueError("Question stems must be unique")

    per_topic = Counter(question["code"] for question in questions)
    if any(per_topic[topic["code"]] != QUESTIONS_PER_TOPIC for topic in topics):
        raise ValueError(f"Every topic must have {QUESTIONS_PER_TOPIC} questions: {per_topic}")

    answer_balance = Counter(question["answer"] for question in questions)
    if answer_balance != Counter({letter: 250 for letter in LETTERS}):
        raise ValueError(f"Answer letters are not balanced: {answer_balance}")

    covered_concepts = {
        normalized_key(concept)
        for question in questions
        for concept in question["concepts"]
    }
    source_concepts = {
        normalized_key(entry["term"])
        for topic in topics
        for entry in topic["terms"]
    }
    if covered_concepts != source_concepts:
        raise ValueError("The generated bank does not cover every source concept")

    for question in questions:
        if requires_missing_context(question["stem"]):
            raise ValueError(
                f"{question['id']} depends on missing visual or external context: "
                f"{question['stem']}"
            )
        if re.search(r"\b(?:this concept|the corresponding form)\b", question["stem"], re.IGNORECASE):
            raise ValueError(f"{question['id']} contains an unresolved placeholder")
        choices = question["choices"]
        if len(choices) != 4 or len({normalized_key(choice) for choice in choices}) != 4:
            raise ValueError(f"{question['id']} must have four distinct choices")
        if question["answer"] not in LETTERS:
            raise ValueError(f"{question['id']} has an invalid answer letter")
        keyed = choices[LETTERS.index(question["answer"])]
        if keyed != question["correctText"]:
            raise ValueError(f"{question['id']} answer key does not match correctText")
        if question["skill"] not in {"application", "analysis"}:
            raise ValueError(f"{question['id']} has an invalid skill label")
        if question["format"] not in {"scenario", "paired-evidence", "matched-pair"}:
            raise ValueError(f"{question['id']} has an invalid question format")
        require_https(question["sourceUrl"], f"{question['id']} source URL")


def build_bank(repository_root: Path) -> dict[str, Any]:
    topics = load_topics(repository_root)
    questions: list[dict[str, Any]] = []
    topic_summaries: list[dict[str, Any]] = []

    for topic in topics:
        terms = topic["terms"]
        topic_questions: list[dict[str, Any]] = []
        for term_index in range(SCENARIO_QUESTIONS_PER_TOPIC):
            topic_questions.append(
                scenario_question(
                    topic,
                    terms,
                    term_index,
                    len(topic_questions) + 1,
                    len(questions) + len(topic_questions),
                )
            )
        for comparison_index in range(COMPARISON_QUESTIONS_PER_TOPIC):
            topic_questions.append(
                comparison_question(
                    topic,
                    terms,
                    comparison_index,
                    len(topic_questions) + 1,
                    len(questions) + len(topic_questions),
                )
            )
        for match_index in range(MATCHED_PAIR_QUESTIONS_PER_TOPIC):
            topic_questions.append(
                matched_pair_question(
                    topic,
                    terms,
                    match_index,
                    len(topic_questions) + 1,
                    len(questions) + len(topic_questions),
                )
            )
        if len(topic_questions) != QUESTIONS_PER_TOPIC:
            raise ValueError(f"{topic['code']} generated {len(topic_questions)} questions")
        questions.extend(topic_questions)
        topic_summaries.append(
            {
                "code": topic["code"],
                "theme": topic["theme"],
                "topic": topic["topic"],
                "level": topic["level"],
                "conceptCount": len(terms),
                "questionCount": len(topic_questions),
            }
        )

    validate_questions(questions, topics)
    sl_hl = sum(question["level"] == "SL/HL" for question in questions)
    hl_only = sum(question["level"] == "HL" for question in questions)
    source_concepts = sum(len(topic["terms"]) for topic in topics)
    return {
        "schemaVersion": 3,
        "framework": {
            "title": "IB Diploma Programme Biology",
            "firstAssessment": 2025,
            "topicCount": 40,
            "url": FRAMEWORK_URL,
        },
        "source": "content/dp_terms_*.json",
        "audit": {
            "status": "generated-and-validated",
            "questionStyle": "original Paper 1A-inspired practice",
            "questionsPerTopic": QUESTIONS_PER_TOPIC,
            "answerChoicesPerQuestion": 4,
            "selfContainedStems": True,
            "requiresExternalVisuals": False,
        },
        "counts": {
            "questions": len(questions),
            "topics": len(topic_summaries),
            "sourceConcepts": source_concepts,
            "slHlQuestions": sl_hl,
            "hlOnlyQuestions": hl_only,
        },
        "topics": topic_summaries,
        "questions": questions,
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
        f"Built {output_path}: {counts['questions']} original questions across "
        f"{counts['topics']} topics from {counts['sourceConcepts']} audited concepts"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

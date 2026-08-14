# Berthel’s Biology

A static IB Diploma Programme Biology practice site published with GitHub Pages. The library contains 1,000 original multiple-choice questions across the 40-topic framework for first assessment 2025, with explicit SL/HL or HL-only labels.

## Project structure

- `index.html` contains the accessible page structure.
- `assets/styles.css` contains the responsive visual system.
- `assets/quiz-core.js` samples the validated question library, balances answer letters, and summarizes every response state.
- `assets/app.js` connects the quiz logic to the page.
- `content/dp_terms_*.json` contains the reviewed DP terminology, grouped by the four themes and 40 official topics.
- `content/word_parts.json` retains the curated biological roots for reference.
- `Vocab_Ety_Master_List.xlsx` remains the filterable terminology audit workbook.
- `data/biology-bank.json` is the generated browser-ready 1,000-question practice bank.

The DP terminology JSON files are canonical concept sources. The browser question bank is rebuilt deterministically from them, preventing stale questions or duplicated concepts from returning.

## Content model

- 1,000 original multiple-choice questions: 25 for each of 40 topics
- 400 scenario-based application questions
- 320 paired-evidence analysis questions
- 280 concept–description matching questions
- Self-contained text: no question depends on an unseen graph, image, table, diagram, or model
- Four same-topic or concept-linked choices per question
- Exactly 250 stored answer keys for each letter A–D
- 850 SL/HL questions and 150 questions from the six HL-only topics

## Updating the bank

After editing a file in `content/`, rebuild and validate the site:

```bash
npm run build:data
npm test
```

The data builder rejects framework drift, missing values, duplicate terms, duplicate stems, repeated choices, unbalanced answer keys, missing sources, incomplete topic coverage, unresolved generated placeholders, and wording that depends on a missing visual. The test suite regenerates and checks all 1,000 questions across six option arrangements, then verifies the correct, incorrect, and unanswered result states.

## Local preview

Serve the repository over HTTP so the browser can load the JSON module and study bank:

```bash
npm run dev
```

Then open `http://localhost:4173`.

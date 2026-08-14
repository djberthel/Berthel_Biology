# Berthel’s Biology

A static IB Diploma Programme Biology terminology review site published with GitHub Pages. The content follows the 40-topic framework for first assessment 2025 and includes explicit SL/HL or HL-only labels.

## Project structure

- `index.html` contains the accessible page structure.
- `assets/styles.css` contains the responsive visual system.
- `assets/quiz-core.js` contains data-independent quiz generation and validation.
- `assets/app.js` connects the quiz logic to the page.
- `content/dp_terms_*.json` contains the reviewed DP terminology, grouped by the four themes and 40 official topics.
- `content/word_parts.json` contains the curated biological roots and ambiguity exclusions.
- `Vocab_Ety_Master_List.xlsx` is a filterable audit workbook with coverage, sources, and QA results.
- `data/biology-bank.json` is the generated browser-ready study bank.

The JSON files in `content/` are canonical. The workbook and browser bank are synchronized exports; this prevents stale spreadsheet aggregates and duplicated aliases from returning.

## Content model

- 673 DP Biology terms across all 40 topics
- 106 curated biological word parts
- Definitions are question prompts; concise terms are the choices
- Mixed sets use a 75:25 ratio of DP terms to word parts
- Synonymous word roots are tagged so they cannot appear as competing answers
- Every definition is 5–32 words, source-linked, unique, and written as a complete sentence

## Updating the bank

After editing a file in `content/`, rebuild and validate the site:

```bash
npm run build:data
npm test
```

The data builder rejects framework drift, missing values, placeholders, duplicate terms, duplicate definitions, invalid source links, and definitions outside the length standard. The test suite generates all 779 possible questions across six seeded distractor arrangements (4,674 checked instances), and verifies one keyed answer and four distinct choices every time.

## Local preview

Serve the repository over HTTP so the browser can load the JSON module and study bank:

```bash
npm run dev
```

Then open `http://localhost:4173`.

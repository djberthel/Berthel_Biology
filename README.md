# Berthel’s Biology

A static biology vocabulary and etymology review site published with GitHub Pages.

## Project structure

- `index.html` contains the accessible page structure.
- `assets/styles.css` contains the responsive visual system.
- `assets/quiz-core.js` contains data-independent quiz generation and validation.
- `assets/app.js` connects the quiz logic to the page.
- `Vocab_Ety_Master_List.xlsx` remains the editable source workbook.
- `data/biology-bank.json` is the validated browser-ready study bank.

The workbook’s `Glossary` and `WordParts` sheets are canonical. The `Unified` sheet is a derived aggregate and is deliberately ignored so its duplicated or stale rows cannot enter the website.

## Updating the bank

After editing the workbook, rebuild and validate the site:

```bash
npm run build:data
npm test
```

The data builder rejects missing values, placeholder cells, and repeated terms before it overwrites the browser-ready bank.

## Local preview

Serve the repository over HTTP so the browser can load the JSON module and study bank:

```bash
npm run dev
```

Then open `http://localhost:4173`.

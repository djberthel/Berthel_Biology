import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createStudyQuiz,
  makeCustomPrompt,
  normalizeCustomQuiz,
  normalizedKey,
  summarizeQuiz,
} from "../assets/quiz-core.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFile(path.join(repositoryRoot, relativePath), "utf8");

const [html, styles, bankText] = await Promise.all([
  readText("index.html"),
  readText("assets/styles.css"),
  readText("data/biology-bank.json"),
]);
const bank = JSON.parse(bankText);

assert.equal(bank.counts.vocabulary, 500, "expected all 500 canonical vocabulary entries");
assert.equal(bank.counts.etymology, 300, "expected all 300 canonical word parts");
assert.equal(bank.counts.total, 800, "expected the verified 800-entry bank");
assert.equal(bank.vocabulary.length, bank.counts.vocabulary);
assert.equal(bank.etymology.length, bank.counts.etymology);

const vocabularyKeys = bank.vocabulary.map((entry) => normalizedKey(entry.term));
const etymologyKeys = bank.etymology.map((entry) => normalizedKey(entry.part));
assert.equal(new Set(vocabularyKeys).size, vocabularyKeys.length, "vocabulary terms must be unique");
assert.equal(new Set(etymologyKeys).size, etymologyKeys.length, "word parts must be unique");

for (const entry of bank.vocabulary) {
  assert.ok(entry.term && entry.definition, `vocabulary entry ${entry.id} is complete`);
  assert.notEqual(normalizedKey(entry.term), "9", "placeholder terms are rejected");
  assert.notEqual(normalizedKey(entry.definition), "9", "placeholder definitions are rejected");
}
for (const entry of bank.etymology) {
  assert.ok(entry.part && entry.meaning, `word part ${entry.id} is complete`);
  assert.notEqual(normalizedKey(entry.part), "9", "placeholder word parts are rejected");
  assert.notEqual(normalizedKey(entry.meaning), "9", "placeholder meanings are rejected");
}

assert.equal(
  bank.vocabulary.some((entry) => entry.term.includes("Recombinant DNA DNA")),
  false,
  "the corrupted Unified-sheet row must never reach the site",
);
assert.equal(
  bank.vocabulary.filter((entry) => entry.term === "Recombinant DNA").length,
  1,
  "Recombinant DNA must appear exactly once",
);

function seededRandom(seed = 0x12345678) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

for (const mode of ["mixed", "vocab", "ety"]) {
  const quiz = createStudyQuiz(bank, mode, 100, seededRandom());
  assert.equal(quiz.questions.length, 100, `${mode} quiz length`);
  assert.equal(new Set(quiz.questions.map((question) => question.id)).size, 100, `${mode} questions must be unique`);
  for (const question of quiz.questions) {
    assert.equal(question.options.length, 4);
    assert.equal(
      new Set(question.options.map((option) => normalizedKey(option.text))).size,
      4,
      `${question.id} must have four distinct options`,
    );
    const keyed = question.options.find((option) => option.letter === question.correctLetter);
    assert.equal(keyed?.text, question.correctText, `${question.id} answer key must match the option text`);
  }
}

const studyQuiz = createStudyQuiz(bank, "mixed", 12, seededRandom(42));
studyQuiz.answers = studyQuiz.questions.map((question) => question.correctLetter);
const perfectSummary = summarizeQuiz(studyQuiz);
assert.equal(perfectSummary.correct, 12);
assert.equal(perfectSummary.missed.length, 0);

const customResult = normalizeCustomQuiz({
  title: "Test",
  questions: [{
    stem: "Which option is keyed?",
    choices: ["One", "Two", "Three", "Four"],
    answer: "B",
    rationale: "Two is keyed.",
  }],
}, 1);
assert.equal(customResult.ok, true);

const repeatedCustom = normalizeCustomQuiz({
  questions: [{
    stem: "Repeated options are invalid.",
    choices: ["Same", "Same", "Other", "Another"],
    answer: "A",
  }],
}, 1);
assert.equal(repeatedCustom.ok, false);
assert.match(repeatedCustom.error, /repeated choices/i);
assert.match(makeCustomPrompt(4, "cell membrane"), /exactly 4 questions/i);
assert.match(makeCustomPrompt(1, "cell membrane"), /exactly 1 question with/i);

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML ids must be unique");

for (const relativePath of [
  "assets/styles.css",
  "assets/app.js",
  "assets/quiz-core.js",
  "data/biology-bank.json",
  "Chinstrap_LOgo.jfif",
]) {
  await fs.access(path.join(repositoryRoot, relativePath));
}

assert.doesNotMatch(html, /xlsx\.full|katex|ADMIN_PASSWORD|updates\.json/);
assert.match(html, /role="tablist"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /theme-color" content="#09090a"/);
assert.match(styles, /--bg: #09090a;/);
assert.match(styles, /--accent: #f5f5f4;/);
assert.doesNotMatch(styles, /#75e3ae|#33c887|117, 227, 174|62, 157, 112/i);
assert.equal(
  (styles.match(/{/g) ?? []).length,
  (styles.match(/}/g) ?? []).length,
  "CSS blocks must be balanced",
);

console.log("Validated: 800-entry bank, unique questions/options, custom JSON, and static page structure.");

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  auditQuestionBank,
  createStudyQuiz,
  normalizedKey,
  summarizeQuiz,
} from "../assets/quiz-core.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFile(path.join(repositoryRoot, relativePath), "utf8");

const [html, styles, app, bankText, ...topicTexts] = await Promise.all([
  readText("index.html"),
  readText("assets/styles.css"),
  readText("assets/app.js"),
  readText("data/biology-bank.json"),
  readText("content/dp_terms_a.json"),
  readText("content/dp_terms_b.json"),
  readText("content/dp_terms_c.json"),
  readText("content/dp_terms_d.json"),
]);
const bank = JSON.parse(bankText);
const sourceTopics = topicTexts.flatMap((text) => JSON.parse(text));
const sourceTerms = sourceTopics.flatMap((topic) => topic.terms.map((entry) => entry.term));
const sourceTermsByCode = new Map(sourceTopics.map((topic) => [
  topic.code,
  new Set(topic.terms.map((entry) => normalizedKey(entry.term))),
]));

assert.equal(bank.schemaVersion, 3);
assert.equal(bank.framework.title, "IB Diploma Programme Biology");
assert.equal(bank.framework.firstAssessment, 2025);
assert.equal(bank.framework.topicCount, 40);
assert.match(bank.framework.url, /^https:\/\/ibo\.org\//);
assert.equal(bank.audit.questionStyle, "original Paper 1A-inspired practice");
assert.equal(bank.audit.questionsPerTopic, 25);
assert.equal(bank.audit.answerChoicesPerQuestion, 4);
assert.equal(bank.audit.selfContainedStems, true);
assert.equal(bank.audit.requiresExternalVisuals, false);
assert.equal(bank.counts.questions, 1000);
assert.equal(bank.counts.topics, 40);
assert.equal(bank.counts.sourceConcepts, 673);
assert.equal(bank.counts.slHlQuestions, 850);
assert.equal(bank.counts.hlOnlyQuestions, 150);
assert.equal(bank.questions.length, 1000);
assert.equal(bank.topics.length, 40);
assert.equal(sourceTerms.length, 673);

const topicQuestionCounts = new Map();
for (const question of bank.questions) {
  topicQuestionCounts.set(question.code, (topicQuestionCounts.get(question.code) ?? 0) + 1);
}
for (const topic of bank.topics) {
  assert.equal(topic.questionCount, 25, `${topic.code} declares 25 questions`);
  assert.equal(topicQuestionCounts.get(topic.code), 25, `${topic.code} contains 25 questions`);
}
assert.equal(bank.topics.filter((topic) => topic.level === "HL").length, 6);

const ids = bank.questions.map((question) => question.id);
const stems = bank.questions.map((question) => normalizedKey(question.stem));
assert.equal(new Set(ids).size, ids.length, "question IDs must be unique");
assert.equal(new Set(stems).size, stems.length, "question stems must be unique");

const scenarioQuestions = bank.questions.filter((question) => question.format === "scenario");
const comparisonQuestions = bank.questions.filter((question) => question.format === "paired-evidence");
const matchedPairQuestions = bank.questions.filter((question) => question.format === "matched-pair");
assert.equal(scenarioQuestions.length, 400, "ten application questions are included per topic");
assert.equal(comparisonQuestions.length, 320, "eight paired-evidence questions are included per topic");
assert.equal(matchedPairQuestions.length, 280, "seven concept-matching questions are included per topic");

const answerCounts = new Map(["A", "B", "C", "D"].map((letter) => [letter, 0]));
const missingContextPatterns = [
  /\b(?:graph|diagram|figure|image|table|chart|micrograph|illustration)\b/i,
  /\b(?:graph|diagram|figure|image|table|chart|micrograph|illustration|visual)\s+(?:above|below|shown|provided|displayed|presented|pictured)\b/i,
  /\b(?:above|below|shown|provided|displayed|presented|pictured)\s+(?:graph|diagram|figure|image|table|chart|micrograph|illustration|visual)\b/i,
  /\b(?:annotate|label|inspect|examine|study|refer to)\s+(?:the|this|a)\s+(?:graph|diagram|figure|image|table|chart|micrograph|illustration|visual|model)\b/i,
  /\b(?:statement|property)\s+below\b/i,
  /\bstudent checks revision table\b/i,
  /\bannotations? (?:are|is) proposed for a biological model\b/i,
  /\b(?:data|results|values?|trend|pattern)\s+(?:shown|displayed|presented|plotted|provided)\b/i,
];
for (const question of bank.questions) {
  assert.match(question.id, /^[A-D]\d\.\d-Q\d{2}$/);
  assert.ok(["SL/HL", "HL"].includes(question.level));
  assert.ok(["application", "analysis"].includes(question.skill));
  assert.ok(["scenario", "paired-evidence", "matched-pair"].includes(question.format));
  assert.ok(question.stem.split(/\s+/).length >= 7, `${question.id} has a substantive stem`);
  assert.ok(question.stem.split(/\s+/).length <= 100, `${question.id} stem remains readable`);
  for (const pattern of missingContextPatterns) {
    assert.doesNotMatch(
      question.stem,
      pattern,
      `${question.id} must not depend on a missing visual or external context`,
    );
  }
  assert.doesNotMatch(
    question.stem,
    /\b(?:this concept|the corresponding form)\b/i,
    `${question.id} has no unresolved generated placeholder`,
  );
  assert.equal(question.choices.length, 4, `${question.id} has four choices`);
  assert.equal(
    new Set(question.choices.map(normalizedKey)).size,
    4,
    `${question.id} has four distinct choices`,
  );
  assert.ok(answerCounts.has(question.answer), `${question.id} has a valid answer letter`);
  answerCounts.set(question.answer, answerCounts.get(question.answer) + 1);
  assert.equal(
    question.choices["ABCD".indexOf(question.answer)],
    question.correctText,
    `${question.id} answer key matches its choice`,
  );
  assert.ok(question.rationale.split(/\s+/).length >= 6, `${question.id} has an explanation`);
  assert.match(question.sourceUrl, /^https:\/\//, `${question.id} has an auditable source`);
  const topicTerms = sourceTermsByCode.get(question.code);
  assert.ok(topicTerms, `${question.id} maps to a syllabus topic`);
  for (const concept of question.choiceConcepts) {
    assert.ok(topicTerms.has(normalizedKey(concept)), `${question.id} uses same-topic distractors`);
  }
  if (question.format === "scenario") {
    assert.equal(question.skill, "application");
    assert.equal(question.concepts.length, 1);
    for (const choice of question.choices) {
      assert.equal(
        normalizedKey(question.stem).includes(normalizedKey(choice)),
        false,
        `${question.id} does not reveal an answer choice in its stem`,
      );
    }
  } else if (question.format === "paired-evidence") {
    assert.equal(question.skill, "analysis");
    assert.equal(question.concepts.length, 2);
    assert.match(question.stem, /Statement I:/);
    assert.match(question.stem, /Statement II:/);
  } else {
    assert.equal(question.skill, "analysis");
    assert.equal(question.concepts.length, 4);
    assert.ok(question.choices.every((choice) => choice.includes(" — ")));
  }
}
for (const letter of "ABCD") {
  assert.equal(answerCounts.get(letter), 250, `${letter} is keyed exactly 250 times`);
}

const coveredConcepts = new Set(
  bank.questions.flatMap((question) => question.concepts.map(normalizedKey)),
);
assert.equal(coveredConcepts.size, sourceTerms.length);
for (const term of sourceTerms) {
  assert.ok(coveredConcepts.has(normalizedKey(term)), `missing source concept: ${term}`);
}

function seededRandom(seed = 0x12345678) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

for (const seed of [1, 7, 42, 2025, 8675309, 0xdeadbeef]) {
  const generated = auditQuestionBank(bank, seededRandom(seed));
  assert.equal(generated.length, 1000, `seed ${seed} audits every question`);
  for (const question of generated) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options.map((option) => normalizedKey(option.text))).size, 4);
    const keyed = question.options.find((option) => option.letter === question.correctLetter);
    assert.equal(keyed?.text, question.correctText);
  }
}

for (const [mode, expectedLevel] of [["all", null], ["sl", "SL/HL"], ["hl", "HL"]]) {
  const quiz = createStudyQuiz(bank, mode, 100, seededRandom(1234));
  assert.equal(quiz.questions.length, 100, `${mode} quiz length`);
  assert.equal(new Set(quiz.questions.map((question) => question.id)).size, 100);
  if (expectedLevel) {
    assert.ok(quiz.questions.every((question) => question.level === expectedLevel));
  }
}

const partialQuiz = createStudyQuiz(bank, "all", 4, seededRandom(99));
partialQuiz.answers = [
  partialQuiz.questions[0].correctLetter,
  partialQuiz.questions[1].options.find(
    (option) => option.letter !== partialQuiz.questions[1].correctLetter,
  ).letter,
  null,
  partialQuiz.questions[3].correctLetter,
];
const partialSummary = summarizeQuiz(partialQuiz);
assert.equal(partialSummary.rows.length, 4, "the summary retains every question");
assert.equal(partialSummary.correct, 2);
assert.equal(partialSummary.incorrect, 1);
assert.equal(partialSummary.unanswered, 1);
assert.equal(partialSummary.attempted, 3);
assert.deepEqual(partialSummary.rows.map((row) => row.status), [
  "correct", "incorrect", "unanswered", "correct",
]);

const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(htmlIds).size, htmlIds.length, "HTML ids must be unique");
assert.match(html, /1,000 original Paper 1A-inspired questions/i);
assert.match(html, /data-mode="all" aria-pressed="true"/);
assert.match(html, /theme-color" content="#ffffff"/);
assert.match(html, /styles\.css\?v=4\.1\.0/);
assert.match(html, /app\.js\?v=4\.1\.0/);
assert.match(html, /no external figures are required/i);
assert.match(html, /aria-live="polite"/);
assert.doesNotMatch(html, /custom quiz|customView|customTab|tablist/i);
assert.doesNotMatch(app, /customQuiz|makeCustomPrompt|normalizeCustomQuiz|activateView/i);
assert.match(app, /summary\.rows\.forEach/);
assert.match(app, /is-correct/);
assert.match(app, /is-incorrect/);
assert.match(app, /is-unanswered/);

assert.match(styles, /color-scheme: light;/);
assert.match(styles, /--bg: #ffffff;/);
assert.match(styles, /--text: #111111;/);
assert.match(styles, /--success: #18794e;/);
assert.match(styles, /--error: #b42318;/);
assert.match(styles, /\.review-item\.is-correct/);
assert.match(styles, /\.review-item\.is-incorrect/);
assert.match(styles, /\.review-item\.is-unanswered/);
assert.equal(
  (styles.match(/{/g) ?? []).length,
  (styles.match(/}/g) ?? []).length,
  "CSS blocks must be balanced",
);

for (const relativePath of [
  "assets/styles.css",
  "assets/app.js",
  "assets/quiz-core.js",
  "data/biology-bank.json",
  "content/dp_terms_a.json",
  "content/dp_terms_b.json",
  "content/dp_terms_c.json",
  "content/dp_terms_d.json",
  "Chinstrap_LOgo.jfif",
]) {
  await fs.access(path.join(repositoryRoot, relativePath));
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "berthel-question-test-"));
try {
  const rebuiltPath = path.join(tempDir, "biology-bank.json");
  await execFileAsync("python3", ["scripts/build_data.py", rebuiltPath], { cwd: repositoryRoot });
  const rebuiltText = await fs.readFile(rebuiltPath, "utf8");
  assert.equal(rebuiltText, bankText, "checked-in questions must match the audited source files exactly");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

console.log(
  "Validated: 1,000 self-contained questions, 40 topics, 673 concepts, 4 choices each, and all-question result states.",
);

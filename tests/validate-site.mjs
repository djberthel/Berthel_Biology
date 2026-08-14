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
  makeCustomPrompt,
  normalizeCustomQuiz,
  normalizedKey,
  summarizeQuiz,
} from "../assets/quiz-core.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFile(path.join(repositoryRoot, relativePath), "utf8");

const [html, styles, bankText] = await Promise.all([
  readText("index.html"),
  readText("assets/styles.css"),
  readText("data/biology-bank.json"),
]);
const bank = JSON.parse(bankText);

assert.equal(bank.schemaVersion, 2);
assert.equal(bank.framework.title, "IB Diploma Programme Biology");
assert.equal(bank.framework.firstAssessment, 2025);
assert.equal(bank.framework.topicCount, 40);
assert.match(bank.framework.url, /^https:\/\/ibo\.org\//);
assert.equal(bank.counts.topics, 40, "all 40 official DP Biology topics must be present");
assert.equal(bank.counts.vocabulary, 673, "expected the complete audited DP terminology bank");
assert.equal(bank.counts.etymology, 106, "expected the curated biological word-part bank");
assert.equal(bank.counts.total, 779, "expected the complete audited study bank");
assert.equal(bank.vocabulary.length, bank.counts.vocabulary);
assert.equal(bank.etymology.length, bank.counts.etymology);
assert.equal(bank.topics.length, bank.counts.topics);
assert.equal(bank.topics.reduce((sum, topic) => sum + topic.count, 0), bank.counts.vocabulary);
assert.equal(new Set(bank.topics.map((topic) => topic.code)).size, 40);

const vocabularyKeys = bank.vocabulary.map((entry) => normalizedKey(entry.term));
const definitionKeys = bank.vocabulary.map((entry) => normalizedKey(entry.definition));
const etymologyKeys = bank.etymology.map((entry) => normalizedKey(entry.part));
assert.equal(new Set(vocabularyKeys).size, vocabularyKeys.length, "DP terms must be unique");
assert.equal(new Set(definitionKeys).size, definitionKeys.length, "DP definitions must be unique");
assert.equal(new Set(etymologyKeys).size, etymologyKeys.length, "word parts must be unique");

const wordCount = (value) => String(value).trim().split(/\s+/).filter(Boolean).length;
for (const entry of bank.vocabulary) {
  assert.ok(entry.id && entry.code && entry.theme && entry.topic && entry.level);
  assert.ok(entry.term && entry.definition, `DP entry ${entry.id} is complete`);
  assert.ok(wordCount(entry.definition) >= 5, `${entry.id} definition is substantive`);
  assert.ok(wordCount(entry.definition) <= 32, `${entry.id} definition is concise`);
  assert.match(entry.definition, /^[A-Z]/, `${entry.id} definition starts as a sentence`);
  assert.match(entry.definition, /[.!?]$/, `${entry.id} definition ends as a sentence`);
  assert.match(entry.sourceUrl, /^https:\/\//, `${entry.id} has an auditable source URL`);
  assert.ok(["SL/HL", "HL"].includes(entry.level), `${entry.id} has a valid DP level`);
}
for (const entry of bank.etymology) {
  assert.ok(entry.id && entry.part && entry.meaning && entry.examples);
  assert.match(entry.sourceUrl, /^https:\/\//, `${entry.id} has an auditable source URL`);
}

function entry(term) {
  const result = bank.vocabulary.find((candidate) => candidate.term === term);
  assert.ok(result, `missing high-risk audit entry: ${term}`);
  return result;
}

assert.match(entry("Solute potential").definition, /adding solute makes it more negative/i);
assert.match(entry("Hypertonic solution").definition, /higher effective solute concentration/i);
assert.match(entry("Hypotonic solution").definition, /lower effective solute concentration/i);
assert.match(entry("Antibody").definition, /secreted immunoglobulin/i);
assert.match(entry("Plasma cell").definition, /secrete large quantities of antibody/i);
assert.match(entry("Activation energy").definition, /transition state/i);
assert.match(entry("Epigenetics").definition, /do not alter DNA sequence/i);
assert.doesNotMatch(entry("Glycolysis").definition, /glyphosate/i);
assert.equal(bank.vocabulary.some((candidate) => candidate.term === "ETC (electron transport chain)"), false);
assert.equal(bank.vocabulary.some((candidate) => candidate.term === "cDNA"), false);
assert.equal(bank.vocabulary.some((candidate) => candidate.term === "Alleles"), false);
assert.doesNotMatch(bankText, /essential nutrient that the body cannot synthesize|glyphosate/i);

function seededRandom(seed = 0x12345678) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const vocabById = new Map(bank.vocabulary.map((item) => [`vocab-${item.id}`, item]));
const rootsById = new Map(bank.etymology.map((item) => [`ety-${item.id}`, item]));

for (const seed of [1, 7, 42, 2025, 8675309, 0xdeadbeef]) {
  const questions = auditQuestionBank(bank, seededRandom(seed));
  assert.equal(questions.length, bank.counts.total, `seed ${seed} audits every possible question`);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);

  for (const question of questions) {
    assert.equal(question.options.length, 4, `${question.id} has four options`);
    assert.equal(
      new Set(question.options.map((option) => normalizedKey(option.text))).size,
      4,
      `${question.id} has four distinct options`,
    );
    assert.equal(
      question.options.filter((option) => normalizedKey(option.text) === normalizedKey(question.correctText)).length,
      1,
      `${question.id} has exactly one keyed answer text`,
    );
    const keyed = question.options.find((option) => option.letter === question.correctLetter);
    assert.equal(keyed?.text, question.correctText, `${question.id} key matches its option`);

    if (question.kind === "vocab") {
      const source = vocabById.get(question.id);
      assert.ok(source, `${question.id} maps to a DP source entry`);
      assert.equal(question.prompt, source.definition, `${question.id} uses its definition as the prompt`);
      assert.equal(question.correctText, source.term, `${question.id} uses a concise term as the answer`);
      assert.ok(
        question.options.every((option) => wordCount(option.text) <= 8),
        `${question.id} avoids wordy answer choices`,
      );
      for (const option of question.options) {
        if (normalizedKey(option.text) === normalizedKey(source.term)) continue;
        const distractor = bank.vocabulary.find(
          (candidate) => normalizedKey(candidate.term) === normalizedKey(option.text),
        );
        assert.ok(distractor, `${question.id} distractor maps to a source entry`);
        assert.equal(distractor.theme, source.theme, `${question.id} keeps distractors in the same DP theme`);
        assert.notEqual(
          distractor.topic,
          source.topic,
          `${question.id} excludes same-topic parent, child, and sibling terms`,
        );
      }
    } else {
      const source = rootsById.get(question.id);
      assert.ok(source, `${question.id} maps to a word-part source entry`);
      if (source.ambiguityGroup) {
        const conflictingMeanings = new Set(
          bank.etymology
            .filter((candidate) => candidate.ambiguityGroup === source.ambiguityGroup)
            .map((candidate) => normalizedKey(candidate.meaning)),
        );
        for (const option of question.options) {
          if (normalizedKey(option.text) === normalizedKey(source.meaning)) continue;
          assert.equal(
            conflictingMeanings.has(normalizedKey(option.text)),
            false,
            `${question.id} excludes synonymous root meanings from distractors`,
          );
        }
      }
    }
  }
}

for (const mode of ["mixed", "vocab", "ety"]) {
  const quiz = createStudyQuiz(bank, mode, 100, seededRandom(1234));
  assert.equal(quiz.questions.length, 100, `${mode} quiz length`);
  assert.equal(new Set(quiz.questions.map((question) => question.id)).size, 100);
  if (mode === "mixed") {
    assert.equal(quiz.questions.filter((question) => question.kind === "vocab").length, 75);
    assert.equal(quiz.questions.filter((question) => question.kind === "ety").length, 25);
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
  "content/dp_terms_a.json",
  "content/dp_terms_b.json",
  "content/dp_terms_c.json",
  "content/dp_terms_d.json",
  "content/word_parts.json",
  "Chinstrap_LOgo.jfif",
]) {
  await fs.access(path.join(repositoryRoot, relativePath));
}

assert.doesNotMatch(html, /xlsx\.full|katex|ADMIN_PASSWORD|updates\.json/);
assert.match(html, /role="tablist"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /all 40 DP topics/i);
assert.match(html, /data-mode="vocab" aria-pressed="true"/);
assert.match(html, /theme-color" content="#09090a"/);
assert.match(styles, /--bg: #09090a;/);
assert.match(styles, /--accent: #f5f5f4;/);
assert.doesNotMatch(styles, /#75e3ae|#33c887|117, 227, 174|62, 157, 112/i);
assert.equal(
  (styles.match(/{/g) ?? []).length,
  (styles.match(/}/g) ?? []).length,
  "CSS blocks must be balanced",
);

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "berthel-bank-test-"));
try {
  const rebuiltPath = path.join(tempDir, "biology-bank.json");
  await execFileAsync("python3", ["scripts/build_data.py", rebuiltPath], { cwd: repositoryRoot });
  const rebuiltText = await fs.readFile(rebuiltPath, "utf8");
  assert.equal(rebuiltText, bankText, "checked-in browser data must match the audited source files exactly");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

console.log(
  "Validated: 673 DP terms across 40 topics, 106 roots, and all 779 generated questions across 6 seeds.",
);

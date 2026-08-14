const LETTERS = ["A", "B", "C", "D"];

export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizedKey(value) {
  return normalizeText(value).toLocaleLowerCase("en-US");
}

export function clampQuestionCount(value, maximum = 100) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number.parseInt(text, 10);
  return count >= 1 && count <= maximum ? count : null;
}

export function shuffle(items, random = Math.random) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function sampleWithoutReplacement(items, count, random) {
  return shuffle(items, random).slice(0, Math.min(count, items.length));
}

function balancedAnswerKey(count, random) {
  const repeats = Math.floor(count / LETTERS.length);
  const remainder = count % LETTERS.length;
  const bag = [];

  for (const letter of LETTERS) {
    for (let index = 0; index < repeats; index += 1) bag.push(letter);
  }
  bag.push(...shuffle(LETTERS, random).slice(0, remainder));

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const candidate = shuffle(bag, random);
    const hasLongRun = candidate.some(
      (letter, index) => index >= 3
        && letter === candidate[index - 1]
        && letter === candidate[index - 2]
        && letter === candidate[index - 3],
    );
    if (!hasLongRun) return candidate;
  }
  return shuffle(bag, random);
}

function normalizeQuestion(entry, correctLetter, random) {
  const storedAnswerIndex = LETTERS.indexOf(normalizeText(entry.answer).toUpperCase());
  if (storedAnswerIndex < 0) throw new Error(`${entry.id} has an invalid answer key.`);
  const storedChoices = (entry.choices ?? []).map(normalizeText);
  if (storedChoices.length !== 4 || new Set(storedChoices.map(normalizedKey)).size !== 4) {
    throw new Error(`${entry.id} must have four distinct choices.`);
  }

  const correctText = storedChoices[storedAnswerIndex];
  const distractors = shuffle(
    storedChoices.filter((_, index) => index !== storedAnswerIndex),
    random,
  );
  let distractorIndex = 0;
  const options = LETTERS.map((letter) => ({
    letter,
    text: letter === correctLetter ? correctText : distractors[distractorIndex++],
  }));

  return {
    id: entry.id,
    kind: "practice",
    prompt: normalizeText(entry.stem),
    instruction: entry.format === "paired-evidence"
      ? "Select the option that correctly matches both statements."
      : "Choose the best answer.",
    options,
    correctLetter,
    correctText,
    rationale: normalizeText(entry.rationale),
    section: `${normalizeText(entry.code)} · ${normalizeText(entry.topic)}`,
    level: normalizeText(entry.level),
    levelLabel: entry.level === "HL" ? "HL extension" : "SL/HL core",
    skill: normalizeText(entry.skill),
    format: normalizeText(entry.format),
    sourceTitle: normalizeText(entry.sourceTitle),
    sourceUrl: normalizeText(entry.sourceUrl),
  };
}

function modeQuestions(bank, mode) {
  const questions = Array.isArray(bank?.questions) ? bank.questions : [];
  if (mode === "all") return questions;
  if (mode === "sl") return questions.filter((question) => question.level === "SL/HL");
  if (mode === "hl") return questions;
  if (mode === "hl-extension") {
    return questions.filter((question) => question.level === "HL");
  }
  throw new Error("Unknown study mode.");
}

export function getStudyModeCount(bank, mode) {
  return modeQuestions(bank, mode).length;
}

export function auditQuestionBank(bank, random = Math.random) {
  const questions = modeQuestions(bank, "all");
  return questions.map((entry, index) => normalizeQuestion(
    entry,
    LETTERS[index % LETTERS.length],
    random,
  ));
}

export function createStudyQuiz(bank, mode, requestedCount, random = Math.random) {
  const count = clampQuestionCount(requestedCount, 100);
  if (count === null) throw new Error("Choose between 1 and 100 questions.");
  const available = modeQuestions(bank, mode);
  if (available.length < count) {
    throw new Error(`Only ${available.length} unique questions are available for this mode.`);
  }

  const selected = sampleWithoutReplacement(available, count, random);
  const answerKey = balancedAnswerKey(selected.length, random);
  const questions = selected.map((entry, index) => normalizeQuestion(
    entry,
    answerKey[index],
    random,
  ));

  return {
    source: "dp-practice-bank",
    mode,
    questions,
    answers: Array(questions.length).fill(null),
  };
}

export function summarizeQuiz(quiz) {
  const rows = quiz.questions.map((question, index) => {
    const chosenLetter = quiz.answers[index];
    const chosenOption = question.options.find((option) => option.letter === chosenLetter);
    const isCorrect = chosenLetter === question.correctLetter;
    const status = isCorrect ? "correct" : chosenLetter ? "incorrect" : "unanswered";
    return {
      number: index + 1,
      question,
      chosenLetter,
      chosenText: chosenOption?.text ?? "Not answered",
      isCorrect,
      status,
    };
  });
  const attempted = rows.filter((row) => row.chosenLetter).length;
  const correct = rows.filter((row) => row.isCorrect).length;
  const incorrect = rows.filter((row) => row.status === "incorrect").length;
  const unanswered = rows.filter((row) => row.status === "unanswered").length;
  const total = rows.length;
  return {
    total,
    attempted,
    correct,
    incorrect,
    unanswered,
    percentage: total ? (correct / total) * 100 : 0,
    rows,
    missed: rows.filter((row) => !row.isCorrect),
  };
}

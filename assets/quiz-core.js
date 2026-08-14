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

function tokens(value) {
  const stopWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "in", "into", "is", "it", "of", "on", "or", "that", "the", "this",
    "to", "with",
  ]);
  return normalizedKey(value)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function similarity(left, right) {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  const union = new Set([...leftTokens, ...rightTokens]);
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  const jaccard = union.size ? overlap / union.size : 0;
  const leftWords = Math.max(1, normalizeText(left).split(" ").length);
  const rightWords = Math.max(1, normalizeText(right).split(" ").length);
  const lengthParity = Math.min(leftWords, rightWords) / Math.max(leftWords, rightWords);
  return jaccard * 0.72 + lengthParity * 0.28;
}

function chooseDistractors(pool, correctIndex, random) {
  const correct = pool[correctIndex];
  const correctKey = normalizedKey(correct.answerText);
  const uniqueAnswers = new Map();

  pool.forEach((entry, index) => {
    if (index === correctIndex) return;
    if (
      correct.kind === "vocab"
      && correct.theme
      && (entry.theme !== correct.theme || entry.topic === correct.topic)
    ) return;
    if (
      correct.ambiguityGroup
      && entry.ambiguityGroup
      && correct.ambiguityGroup === entry.ambiguityGroup
    ) return;
    const key = normalizedKey(entry.answerText);
    if (!key || key === correctKey || uniqueAnswers.has(key)) return;
    uniqueAnswers.set(key, {
      answerText: entry.answerText,
      score: similarity(correct.answerText, entry.answerText) + random() * 0.025,
    });
  });

  const candidates = [...uniqueAnswers.values()].sort((left, right) => right.score - left.score);
  if (candidates.length < 3) {
    throw new Error("The selected bank does not contain enough distinct answers for four-option questions.");
  }

  const strongCandidates = candidates.slice(0, Math.min(24, candidates.length));
  return sampleWithoutReplacement(strongCandidates, 3, random).map((entry) => entry.answerText);
}

function buildQuestion(pool, correctIndex, correctLetter, random) {
  const entry = pool[correctIndex];
  const distractors = shuffle(chooseDistractors(pool, correctIndex, random), random);
  let distractorIndex = 0;
  const options = LETTERS.map((letter) => ({
    letter,
    text: letter === correctLetter ? entry.answerText : distractors[distractorIndex++],
  }));

  return {
    id: `${entry.kind}-${entry.id}`,
    kind: entry.kind,
    prompt: entry.prompt,
    instruction: entry.kind === "vocab"
      ? "Which DP Biology term best matches this definition?"
      : "What does this word part most closely mean?",
    options,
    correctLetter,
    correctText: entry.answerText,
    examples: entry.examples ?? "",
    section: entry.section ?? "",
    level: entry.level ?? "",
    topic: entry.topic ?? "",
    sourceTitle: entry.sourceTitle ?? "",
    sourceUrl: entry.sourceUrl ?? "",
  };
}

function normalizeBank(bank) {
  const vocabulary = (bank?.vocabulary ?? []).map((entry) => ({
    id: entry.id,
    kind: "vocab",
    prompt: normalizeText(entry.definition),
    answerText: normalizeText(entry.term),
    section: normalizeText(entry.section),
    level: normalizeText(entry.level),
    topic: normalizeText(entry.topic),
    theme: normalizeText(entry.theme),
    sourceTitle: normalizeText(entry.sourceTitle),
    sourceUrl: normalizeText(entry.sourceUrl),
    ambiguityGroup: "",
  }));
  const etymology = (bank?.etymology ?? []).map((entry) => ({
    id: entry.id,
    kind: "ety",
    prompt: normalizeText(entry.part),
    answerText: normalizeText(entry.meaning),
    examples: normalizeText(entry.examples),
    section: normalizeText(entry.section),
    level: "",
    topic: "Biological word parts",
    theme: "",
    sourceTitle: normalizeText(entry.sourceTitle),
    sourceUrl: normalizeText(entry.sourceUrl),
    ambiguityGroup: normalizedKey(entry.ambiguityGroup),
  }));
  return { vocabulary, etymology };
}

export function auditQuestionBank(bank, random = Math.random) {
  const { vocabulary, etymology } = normalizeBank(bank);
  const buildAll = (pool) => pool.map((entry, index) => buildQuestion(
    pool,
    index,
    LETTERS[index % LETTERS.length],
    random,
  ));
  return [...buildAll(vocabulary), ...buildAll(etymology)];
}

export function createStudyQuiz(bank, mode, requestedCount, random = Math.random) {
  const { vocabulary, etymology } = normalizeBank(bank);
  const count = clampQuestionCount(requestedCount, 100);
  if (count === null) throw new Error("Choose between 1 and 100 questions.");
  if (!vocabulary.length || !etymology.length) throw new Error("The study bank is incomplete.");

  let selected = [];
  if (mode === "vocab") {
    selected = sampleWithoutReplacement(vocabulary, count, random);
  } else if (mode === "ety") {
    selected = sampleWithoutReplacement(etymology, count, random);
  } else if (mode === "mixed") {
    let vocabularyCount = Math.ceil(count * 0.75);
    let etymologyCount = count - vocabularyCount;
    if (vocabularyCount > vocabulary.length) {
      etymologyCount += vocabularyCount - vocabulary.length;
      vocabularyCount = vocabulary.length;
    }
    if (etymologyCount > etymology.length) {
      vocabularyCount += etymologyCount - etymology.length;
      etymologyCount = etymology.length;
    }
    selected = shuffle([
      ...sampleWithoutReplacement(vocabulary, vocabularyCount, random),
      ...sampleWithoutReplacement(etymology, etymologyCount, random),
    ], random);
  } else {
    throw new Error("Unknown study mode.");
  }

  if (selected.length !== count) {
    throw new Error(`Only ${selected.length} unique questions are available for this mode.`);
  }

  const answerKey = balancedAnswerKey(selected.length, random);
  const pools = { vocab: vocabulary, ety: etymology };
  const indexById = {
    vocab: new Map(vocabulary.map((entry, index) => [entry.id, index])),
    ety: new Map(etymology.map((entry, index) => [entry.id, index])),
  };
  const questions = selected.map((entry, index) => buildQuestion(
    pools[entry.kind],
    indexById[entry.kind].get(entry.id),
    answerKey[index],
    random,
  ));

  return {
    source: "study-bank",
    mode,
    questions,
    answers: Array(questions.length).fill(null),
  };
}

export function summarizeQuiz(quiz) {
  const rows = quiz.questions.map((question, index) => {
    const chosenLetter = quiz.answers[index];
    const chosenOption = question.options.find((option) => option.letter === chosenLetter);
    return {
      number: index + 1,
      question,
      chosenLetter,
      chosenText: chosenOption?.text ?? "Not answered",
      isCorrect: chosenLetter === question.correctLetter,
    };
  });
  const attempted = rows.filter((row) => row.chosenLetter).length;
  const correct = rows.filter((row) => row.isCorrect).length;
  const total = rows.length;
  return {
    total,
    attempted,
    correct,
    percentage: total ? (correct / total) * 100 : 0,
    rows,
    missed: rows.filter((row) => !row.isCorrect),
  };
}

export function normalizeCustomQuiz(payload, expectedCount) {
  const count = clampQuestionCount(expectedCount, 100);
  if (count === null) return { ok: false, error: "Choose between 1 and 100 questions." };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "The quiz JSON must be one object." };
  }
  if (!Array.isArray(payload.questions)) {
    return { ok: false, error: "The JSON must include a questions array." };
  }
  if (payload.questions.length !== count) {
    return { ok: false, error: `Expected ${count} questions but found ${payload.questions.length}.` };
  }

  const questions = [];
  for (let index = 0; index < payload.questions.length; index += 1) {
    const source = payload.questions[index] ?? {};
    const prompt = normalizeText(source.stem ?? source.prompt);
    const choices = source.choices ?? source.options;
    const answer = normalizeText(source.answer).toUpperCase();
    if (!prompt) return { ok: false, error: `Question ${index + 1} has no stem.` };
    if (!Array.isArray(choices) || choices.length !== 4) {
      return { ok: false, error: `Question ${index + 1} must have exactly four choices.` };
    }
    const cleanChoices = choices.map(normalizeText);
    if (cleanChoices.some((choice) => !choice)) {
      return { ok: false, error: `Question ${index + 1} contains an empty choice.` };
    }
    if (new Set(cleanChoices.map(normalizedKey)).size !== 4) {
      return { ok: false, error: `Question ${index + 1} contains repeated choices.` };
    }
    if (!LETTERS.includes(answer)) {
      return { ok: false, error: `Question ${index + 1} must use A, B, C, or D as its answer.` };
    }

    const options = LETTERS.map((letter, choiceIndex) => ({
      letter,
      text: cleanChoices[choiceIndex],
    }));
    questions.push({
      id: `custom-${index + 1}`,
      kind: "custom",
      prompt,
      instruction: "Choose the best answer.",
      options,
      correctLetter: answer,
      correctText: options[LETTERS.indexOf(answer)].text,
      rationale: normalizeText(source.rationale),
      examples: "",
      section: "",
    });
  }

  return {
    ok: true,
    data: {
      source: "custom",
      title: normalizeText(payload.title) || "Custom quiz",
      mode: "custom",
      questions,
      answers: Array(questions.length).fill(null),
    },
  };
}

export function makeCustomPrompt(countValue, content) {
  const count = clampQuestionCount(countValue, 100);
  if (count === null) throw new Error("Choose between 1 and 100 questions.");
  const source = normalizeText(content) || "[PASTE YOUR SOURCE CONTENT HERE]";
  const questionLabel = count === 1 ? "question" : "questions";
  return [
    "Create a multiple-choice quiz using only the source content below.",
    "",
    `Generate exactly ${count} ${questionLabel} with exactly four choices each.`,
    "Use one best answer per question, plausible parallel distractors, and no outside facts.",
    "",
    "Return only valid JSON in this structure:",
    "{",
    '  "title": "Short unit title",',
    '  "questions": [',
    "    {",
    '      "stem": "Standalone question",',
    '      "choices": ["Choice A", "Choice B", "Choice C", "Choice D"],',
    '      "answer": "A",',
    '      "rationale": "One concise explanatory sentence"',
    "    }",
    "  ]",
    "}",
    "",
    "SOURCE CONTENT",
    "<<<",
    source,
    ">>>",
  ].join("\n");
}

export function kindLabel(kind) {
  if (kind === "vocab") return "DP term";
  if (kind === "ety") return "Word part";
  return "Custom";
}

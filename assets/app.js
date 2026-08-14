import {
  clampQuestionCount,
  createStudyQuiz,
  getStudyModeCount,
  summarizeQuiz,
} from "./quiz-core.js?v=4.2.0";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const elements = {
  bankStatus: $("#bankStatus"),
  questionCount: $("#questionCount"),
  topicCount: $("#topicCount"),
  hlTopicCount: $("#hlTopicCount"),
  footerBankVersion: $("#footerBankVersion"),
  studyBuilder: $("#studyBuilder"),
  levelSummary: $("#levelSummary"),
  studyCount: $("#studyCount"),
  startStudy: $("#startStudy"),
  studyError: $("#studyError"),
  studyQuiz: $("#studyQuiz"),
  studyResults: $("#studyResults"),
};

const state = {
  bank: null,
  mode: "sl",
  studyQuiz: null,
};

const MODE_LANGUAGE = {
  sl: (count) => `SL course · ${count.toLocaleString()} core questions; HL-only material is excluded.`,
  hl: (count) => `HL course · ${count.toLocaleString()} questions covering the core and all HL extensions.`,
  "hl-extension": (count) => `HL extension · ${count.toLocaleString()} questions from HL-only topics.`,
};

function setStatus(tone, message) {
  elements.bankStatus.dataset.tone = tone;
  $("span:last-child", elements.bankStatus).textContent = message;
}

function showMessage(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function hideMessage(element) {
  element.textContent = "";
  element.hidden = true;
}

function syncQuickCounts() {
  const value = elements.studyCount.value;
  $$('[data-count]').forEach((button) => {
    button.classList.toggle("is-active", button.dataset.count === value);
  });
}

function syncLevelSummary() {
  if (!state.bank) return;
  const count = getStudyModeCount(state.bank, state.mode);
  elements.levelSummary.textContent = MODE_LANGUAGE[state.mode](count);
}

function showStudySetup() {
  elements.studyBuilder.hidden = false;
  elements.studyQuiz.hidden = true;
  elements.studyResults.hidden = true;
  hideMessage(elements.studyError);
  elements.studyBuilder.scrollIntoView({ behavior: "smooth", block: "start" });
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderQuiz(container, quiz, callbacks) {
  let currentIndex = 0;
  container.innerHTML = "";

  const shell = makeElement("section", "quiz-shell");
  shell.setAttribute("aria-label", "DP Biology practice quiz");

  const topbar = makeElement("div", "quiz-topbar");
  const position = makeElement("div", "quiz-position");
  const progressTrack = makeElement("div", "progress-track");
  progressTrack.setAttribute("aria-hidden", "true");
  const progressFill = makeElement("div", "progress-fill");
  progressTrack.appendChild(progressFill);
  const exitButton = makeElement("button", "button button-ghost", "Exit set");
  exitButton.type = "button";
  topbar.append(position, progressTrack, exitButton);

  const body = makeElement("div", "quiz-body");
  const questionMeta = makeElement("div", "question-meta");
  const typeBadge = makeElement("span", "question-badge");
  const answerState = makeElement("span", "question-state");
  questionMeta.append(typeBadge, answerState);
  const prompt = makeElement("h3", "quiz-prompt");
  prompt.tabIndex = -1;
  const instruction = makeElement("p", "quiz-instruction");
  const optionGrid = makeElement("div", "option-grid");
  optionGrid.setAttribute("role", "group");
  optionGrid.setAttribute("aria-label", "Answer choices");
  body.append(questionMeta, prompt, instruction, optionGrid);

  const footer = makeElement("div", "quiz-footer");
  const backButton = makeElement("button", "button button-ghost", "Back");
  backButton.type = "button";
  const finishButton = makeElement("button", "button button-ghost", "Finish now");
  finishButton.type = "button";
  const spacer = makeElement("div", "quiz-footer-spacer");
  const hint = makeElement("span", "quiz-hint", "A–D to answer · Enter to continue or skip");
  const nextButton = makeElement("button", "button button-primary");
  nextButton.type = "button";
  footer.append(backButton, finishButton, spacer, hint, nextButton);

  shell.append(topbar, body, footer);
  container.appendChild(shell);

  const cleanup = () => document.removeEventListener("keydown", handleKeydown);

  function selectAnswer(letter, returnFocus = false) {
    quiz.answers[currentIndex] = letter;
    paint(returnFocus ? letter : null);
  }

  function finish() {
    cleanup();
    callbacks.onFinish();
  }

  function goNext() {
    if (currentIndex >= quiz.questions.length - 1) {
      finish();
      return;
    }
    currentIndex += 1;
    paint();
    prompt.focus({ preventScroll: true });
  }

  function goBack() {
    if (currentIndex === 0) return;
    currentIndex -= 1;
    paint();
    prompt.focus({ preventScroll: true });
  }

  function paint(focusLetter = null) {
    const question = quiz.questions[currentIndex];
    const chosen = quiz.answers[currentIndex];

    position.textContent = `Question ${currentIndex + 1} of ${quiz.questions.length}`;
    progressFill.style.width = `${((currentIndex + 1) / quiz.questions.length) * 100}%`;
    typeBadge.textContent = `${question.section} · ${question.levelLabel} · ${question.skill}`;
    answerState.textContent = chosen ? "Answered" : "Unanswered";
    prompt.textContent = question.prompt;
    instruction.textContent = question.instruction;
    optionGrid.innerHTML = "";

    question.options.forEach((option) => {
      const button = makeElement("button", "option-button");
      button.type = "button";
      button.dataset.letter = option.letter;
      button.setAttribute("aria-pressed", String(chosen === option.letter));
      button.classList.toggle("is-selected", chosen === option.letter);
      const key = makeElement("span", "option-key", option.letter);
      key.setAttribute("aria-hidden", "true");
      const copy = makeElement("span", "option-copy", option.text);
      button.append(key, copy);
      button.addEventListener("click", () => selectAnswer(option.letter, true));
      optionGrid.appendChild(button);
    });

    backButton.disabled = currentIndex === 0;
    nextButton.textContent = currentIndex === quiz.questions.length - 1
      ? "Finish"
      : chosen ? "Next" : "Skip";

    if (focusLetter) {
      $(`[data-letter="${focusLetter}"]`, optionGrid)?.focus({ preventScroll: true });
    }
  }

  function handleKeydown(event) {
    if (container.hidden) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    const key = event.key.toUpperCase();
    if (["A", "B", "C", "D"].includes(key)) {
      event.preventDefault();
      selectAnswer(key, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goBack();
    } else if (event.key === "Enter") {
      event.preventDefault();
      goNext();
    }
  }

  backButton.addEventListener("click", goBack);
  nextButton.addEventListener("click", goNext);
  finishButton.addEventListener("click", finish);
  exitButton.addEventListener("click", () => {
    cleanup();
    callbacks.onExit();
  });
  document.addEventListener("keydown", handleKeydown);
  paint();
}

function resultLanguage(percentage) {
  if (percentage >= 90) {
    return {
      title: "Strong command",
      message: "Review any red items, then increase the set length or include additional course levels.",
    };
  }
  if (percentage >= 75) {
    return {
      title: "Solid foundation",
      message: "Review the incorrect and unanswered items before repeating a set at the same length.",
    };
  }
  if (percentage >= 50) {
    return {
      title: "Developing recall",
      message: "Use the answer summary to identify patterns, then retest those concepts in a shorter set.",
    };
  }
  return {
    title: "Rebuild the base",
    message: "Work through each explanation, then repeat with a shorter set before broadening the topic range.",
  };
}

function renderResults(container, quiz, options) {
  const summary = summarizeQuiz(quiz);
  const language = resultLanguage(summary.percentage);
  container.innerHTML = "";

  const shell = makeElement("section", "results-shell");
  const hero = makeElement("div", "result-hero");
  const orb = makeElement("div", "score-orb");
  const orbInner = makeElement("div");
  orbInner.append(
    makeElement("strong", "", `${Math.round(summary.percentage)}%`),
    makeElement("span", "", "Accuracy"),
  );
  orb.appendChild(orbInner);

  const copy = makeElement("div", "result-copy");
  copy.append(
    makeElement("p", "eyebrow", "Set complete"),
    makeElement("h3", "", language.title),
    makeElement("p", "", language.message),
  );
  const metrics = makeElement("div", "result-metrics");
  [
    [`${summary.correct}/${summary.total}`, "Correct", "is-correct"],
    [String(summary.incorrect), "Incorrect", "is-incorrect"],
    [String(summary.unanswered), "Unanswered", "is-unanswered"],
  ].forEach(([value, label, statusClass]) => {
    const metric = makeElement("div", `result-metric ${statusClass}`);
    metric.append(makeElement("strong", "", value), makeElement("span", "", label));
    metrics.appendChild(metric);
  });
  copy.appendChild(metrics);
  hero.append(orb, copy);
  shell.appendChild(hero);

  const actions = makeElement("div", "result-actions");
  options.actions.forEach((action) => {
    const button = makeElement(
      "button",
      `button ${action.primary ? "button-primary" : "button-ghost"}`,
      action.label,
    );
    button.type = "button";
    button.addEventListener("click", action.onClick);
    actions.appendChild(button);
  });
  shell.appendChild(actions);

  const review = makeElement("section", "review-section");
  const reviewHeading = makeElement("div", "review-heading");
  const headingGroup = makeElement("div");
  headingGroup.append(
    makeElement("p", "step-label", "Answer summary"),
    makeElement("h3", "", "Every question"),
  );
  reviewHeading.append(
    headingGroup,
    makeElement(
      "p",
      "",
      "Green marks correct responses. Red marks incorrect and unanswered questions.",
    ),
  );
  review.appendChild(reviewHeading);

  const list = makeElement("div", "review-list");
  summary.rows.forEach((row) => {
    const statusLabel = row.status === "correct"
      ? "Correct"
      : row.status === "incorrect" ? "Incorrect" : "Unanswered";
    const details = makeElement("details", `review-item is-${row.status}`);
    details.open = row.status !== "correct";
    const summaryLine = document.createElement("summary");
    summaryLine.append(
      makeElement("span", "review-number", String(row.number).padStart(2, "0")),
      makeElement("span", "review-prompt", row.question.prompt),
      makeElement("span", `review-status is-${row.status}`, statusLabel),
    );

    const detail = makeElement("div", "review-detail");
    const chosenClass = row.status === "correct" ? "is-correct" : `is-${row.status}`;
    const chosen = makeElement("div", `answer-panel ${chosenClass}`);
    chosen.append(
      makeElement("strong", "", row.chosenLetter ? `Your answer · ${row.chosenLetter}` : "Your answer"),
      document.createTextNode(row.chosenText),
    );
    const correct = makeElement("div", "answer-panel is-correct");
    correct.append(
      makeElement("strong", "", `Correct answer · ${row.question.correctLetter}`),
      document.createTextNode(row.question.correctText),
    );
    detail.append(chosen, correct);

    if (row.question.rationale) {
      detail.appendChild(makeElement("p", "rationale", row.question.rationale));
    }
    if (row.question.sourceUrl) {
      const sourceLink = makeElement(
        "a",
        "source-link",
        `Reference: ${row.question.sourceTitle || "content source"}`,
      );
      sourceLink.href = row.question.sourceUrl;
      sourceLink.target = "_blank";
      sourceLink.rel = "noreferrer";
      detail.appendChild(sourceLink);
    }

    details.append(summaryLine, detail);
    list.appendChild(details);
  });
  review.appendChild(list);

  shell.appendChild(review);
  container.appendChild(shell);
  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

function launchStudyQuiz(quiz) {
  state.studyQuiz = quiz;
  elements.studyBuilder.hidden = true;
  elements.studyResults.hidden = true;
  elements.studyQuiz.hidden = false;
  renderQuiz(elements.studyQuiz, quiz, {
    onFinish: showStudyResults,
    onExit: showStudySetup,
  });
  elements.studyQuiz.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildNewStudyQuiz() {
  const count = clampQuestionCount(elements.studyCount.value, 100);
  if (count === null) {
    showMessage(elements.studyError, "Choose an integer from 1 to 100.");
    return null;
  }
  if (!state.bank) {
    showMessage(elements.studyError, "The practice bank is not available yet.");
    return null;
  }
  hideMessage(elements.studyError);
  try {
    return createStudyQuiz(state.bank, state.mode, count);
  } catch (error) {
    showMessage(elements.studyError, error.message || "The set could not be built.");
    return null;
  }
}

function showStudyResults() {
  elements.studyQuiz.hidden = true;
  elements.studyResults.hidden = false;
  renderResults(elements.studyResults, state.studyQuiz, {
    actions: [
      {
        label: "Retry same set",
        onClick: () => {
          state.studyQuiz.answers = Array(state.studyQuiz.questions.length).fill(null);
          launchStudyQuiz(state.studyQuiz);
        },
      },
      {
        label: "Generate new set",
        onClick: () => {
          const quiz = buildNewStudyQuiz();
          if (quiz) launchStudyQuiz(quiz);
        },
      },
      { label: "Change settings", primary: true, onClick: showStudySetup },
    ],
  });
}

function validateBank(bank) {
  if (!bank || bank.schemaVersion !== 3 || !Array.isArray(bank.questions)) {
    throw new Error("The practice bank has an invalid structure.");
  }
  if (!Array.isArray(bank.topics) || bank.topics.length !== 40) {
    throw new Error("The practice bank does not cover all 40 topics.");
  }
  if (bank.counts?.questions !== bank.questions.length || bank.questions.length !== 1000) {
    throw new Error("The practice bank must contain exactly 1,000 questions.");
  }
  return bank.questions.length;
}

async function loadBank() {
  try {
    const response = await fetch("data/biology-bank.json?v=4.2.0", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Practice bank request failed (${response.status}).`);
    const bank = await response.json();
    const total = validateBank(bank);
    state.bank = bank;
    elements.questionCount.textContent = total.toLocaleString();
    elements.topicCount.textContent = bank.counts.topics.toLocaleString();
    elements.hlTopicCount.textContent = bank.topics
      .filter((topic) => topic.level === "HL")
      .length
      .toLocaleString();
    $$('[data-mode]', elements.studyBuilder).forEach((button) => {
      const count = getStudyModeCount(bank, button.dataset.mode);
      $("[data-mode-count]", button).textContent = count.toLocaleString();
    });
    syncLevelSummary();
    elements.footerBankVersion.textContent = `Version 4.2 · ${total.toLocaleString()} self-contained questions`;
    elements.startStudy.disabled = false;
    setStatus("ready", `${total.toLocaleString()} self-contained questions ready`);
  } catch (error) {
    setStatus("error", "Practice bank unavailable");
    showMessage(elements.studyError, error.message || "The practice bank could not be loaded.");
  }
}

function wireEvents() {
  $$('[data-mode]', $("#studyMode")).forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      $$('[data-mode]', $("#studyMode")).forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      syncLevelSummary();
    });
  });

  $$('[data-count]').forEach((button) => {
    button.addEventListener("click", () => {
      elements.studyCount.value = button.dataset.count;
      syncQuickCounts();
    });
  });
  elements.studyCount.addEventListener("input", syncQuickCounts);

  elements.startStudy.addEventListener("click", () => {
    const quiz = buildNewStudyQuiz();
    if (quiz) launchStudyQuiz(quiz);
  });
}

wireEvents();
loadBank();

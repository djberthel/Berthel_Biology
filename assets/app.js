import {
  clampQuestionCount,
  createStudyQuiz,
  kindLabel,
  makeCustomPrompt,
  normalizeCustomQuiz,
  summarizeQuiz,
} from "./quiz-core.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const elements = {
  bankStatus: $("#bankStatus"),
  vocabCount: $("#vocabCount"),
  etyCount: $("#etyCount"),
  totalCount: $("#totalCount"),
  footerBankVersion: $("#footerBankVersion"),
  studyBuilder: $("#studyBuilder"),
  studyCount: $("#studyCount"),
  startStudy: $("#startStudy"),
  studyError: $("#studyError"),
  studyQuiz: $("#studyQuiz"),
  studyResults: $("#studyResults"),
  customBuilder: $("#customBuilder"),
  customCount: $("#customCount"),
  customFile: $("#customFile"),
  customSource: $("#customSource"),
  buildPrompt: $("#buildPrompt"),
  generatedPrompt: $("#generatedPrompt"),
  promptOutput: $("#promptOutput"),
  copyPrompt: $("#copyPrompt"),
  customJson: $("#customJson"),
  loadCustom: $("#loadCustom"),
  customError: $("#customError"),
  customQuiz: $("#customQuiz"),
  customResults: $("#customResults"),
};

const state = {
  bank: null,
  mode: "vocab",
  activeView: "study",
  studyQuiz: null,
  customQuiz: null,
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

function activateView(view) {
  state.activeView = view;
  $$("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
}

function syncQuickCounts() {
  const value = elements.studyCount.value;
  $$("[data-count]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.count === value);
  });
}

function showStudySetup() {
  elements.studyBuilder.hidden = false;
  elements.studyQuiz.hidden = true;
  elements.studyResults.hidden = true;
  hideMessage(elements.studyError);
  elements.studyBuilder.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showCustomSetup() {
  elements.customBuilder.hidden = false;
  elements.customQuiz.hidden = true;
  elements.customResults.hidden = true;
  hideMessage(elements.customError);
  elements.customBuilder.scrollIntoView({ behavior: "smooth", block: "start" });
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
  shell.setAttribute("aria-label", callbacks.ariaLabel ?? "Quiz");

  const topbar = makeElement("div", "quiz-topbar");
  const position = makeElement("div", "quiz-position");
  const progressTrack = makeElement("div", "progress-track");
  progressTrack.setAttribute("aria-hidden", "true");
  const progressFill = makeElement("div", "progress-fill");
  progressTrack.appendChild(progressFill);
  const exitButton = makeElement("button", "button button-ghost", callbacks.exitLabel ?? "Exit set");
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
  const hint = makeElement("span", "quiz-hint", "A–D to answer · Enter to continue");
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
    if (!quiz.answers[currentIndex]) return;
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
    const answeredCount = quiz.answers.filter(Boolean).length;

    position.textContent = `Question ${currentIndex + 1} of ${quiz.questions.length}`;
    progressFill.style.width = `${((currentIndex + 1) / quiz.questions.length) * 100}%`;
    typeBadge.textContent = question.kind === "vocab" && question.section
      ? `${question.section}${question.level ? ` · ${question.level}` : ""}`
      : kindLabel(question.kind);
    answerState.textContent = chosen ? "Answered" : "Awaiting answer";
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
    finishButton.disabled = answeredCount === 0;
    nextButton.disabled = !chosen;
    nextButton.textContent = currentIndex === quiz.questions.length - 1 ? "Finish" : "Next";

    if (focusLetter) {
      $(`[data-letter="${focusLetter}"]`, optionGrid)?.focus({ preventScroll: true });
    }
  }

  function handleKeydown(event) {
    if (container.hidden || state.activeView !== callbacks.view) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    const key = event.key.toUpperCase();
    if (["A", "B", "C", "D"].includes(key)) {
      event.preventDefault();
      selectAnswer(key, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goBack();
    } else if (event.key === "Enter" && quiz.answers[currentIndex]) {
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
      message: "Your recall is stable. Increase the set length or switch to mixed review to add interference.",
    };
  }
  if (percentage >= 75) {
    return {
      title: "Solid foundation",
      message: "Review the misses, then repeat at the same length before increasing the set.",
    };
  }
  if (percentage >= 50) {
    return {
      title: "Mixed recall",
      message: "Reduce the set length and retest the missed concepts before broadening the bank again.",
    };
  }
  return {
    title: "Rebuild the base",
    message: "Use a shorter set, inspect each correction, and repeat until guessing stops doing the intellectual labor.",
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
    makeElement("p", "eyebrow", options.eyebrow ?? "Set complete"),
    makeElement("h3", "", options.title ?? language.title),
    makeElement("p", "", options.message ?? language.message),
  );
  const metrics = makeElement("div", "result-metrics");
  [
    [`${summary.correct}/${summary.total}`, "Correct"],
    [`${summary.attempted}/${summary.total}`, "Attempted"],
    [String(summary.missed.length), "To review"],
  ].forEach(([value, label]) => {
    const metric = makeElement("div", "result-metric");
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
    makeElement("p", "step-label", "Corrections"),
    makeElement("h3", "", summary.missed.length ? "Review the misses" : "No corrections needed"),
  );
  reviewHeading.append(
    headingGroup,
    makeElement(
      "p",
      "",
      summary.missed.length
        ? "Open an item to compare your answer with the keyed response."
        : "A suspiciously pleasant outcome. Increase the difficulty.",
    ),
  );
  review.appendChild(reviewHeading);

  if (!summary.missed.length) {
    review.appendChild(makeElement("div", "perfect-note", "Perfect set: every answer was correct."));
  } else {
    const list = makeElement("div", "review-list");
    summary.missed.forEach((row) => {
      const details = makeElement("details", "review-item");
      const summaryLine = document.createElement("summary");
      summaryLine.append(
        makeElement("span", "review-number", String(row.number).padStart(2, "0")),
        makeElement("span", "review-prompt", row.question.prompt),
        makeElement("span", "review-status", row.chosenLetter ? "Incorrect" : "Unanswered"),
      );

      const detail = makeElement("div", "review-detail");
      const chosen = makeElement("div", "answer-panel");
      chosen.append(makeElement("strong", "", "Your answer"), document.createTextNode(row.chosenText));
      const correct = makeElement("div", "answer-panel is-correct");
      correct.append(
        makeElement("strong", "", `Correct · ${row.question.correctLetter}`),
        document.createTextNode(row.question.correctText),
      );
      detail.append(chosen, correct);

      const supportingText = row.question.rationale
        || (row.question.examples ? `Examples: ${row.question.examples}` : row.question.section);
      if (supportingText) detail.appendChild(makeElement("p", "rationale", supportingText));
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
  }

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
    view: "study",
    ariaLabel: "Study bank quiz",
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
    showMessage(elements.studyError, "The study bank is not available yet.");
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

function launchCustomQuiz(quiz) {
  state.customQuiz = quiz;
  elements.customBuilder.hidden = true;
  elements.customResults.hidden = true;
  elements.customQuiz.hidden = false;
  renderQuiz(elements.customQuiz, quiz, {
    view: "custom",
    ariaLabel: quiz.title || "Custom quiz",
    exitLabel: "Return to JSON",
    onFinish: showCustomResults,
    onExit: showCustomSetup,
  });
  elements.customQuiz.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showCustomResults() {
  elements.customQuiz.hidden = true;
  elements.customResults.hidden = false;
  renderResults(elements.customResults, state.customQuiz, {
    eyebrow: state.customQuiz.title || "Custom quiz complete",
    actions: [
      {
        label: "Retry same quiz",
        onClick: () => {
          state.customQuiz.answers = Array(state.customQuiz.questions.length).fill(null);
          launchCustomQuiz(state.customQuiz);
        },
      },
      { label: "Return to JSON", primary: true, onClick: showCustomSetup },
    ],
  });
}

async function preparePrompt() {
  hideMessage(elements.customError);
  const count = clampQuestionCount(elements.customCount.value, 100);
  if (count === null) {
    showMessage(elements.customError, "Choose an integer from 1 to 100.");
    return;
  }

  let source = elements.customSource.value.trim();
  const file = elements.customFile.files?.[0];
  if (!source && file) {
    try {
      source = await file.text();
      elements.customSource.value = source;
    } catch {
      showMessage(elements.customError, "The selected file could not be read as plain text.");
      return;
    }
  }

  try {
    elements.promptOutput.textContent = makeCustomPrompt(count, source);
    elements.generatedPrompt.hidden = false;
    elements.generatedPrompt.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    showMessage(elements.customError, error.message || "The prompt could not be generated.");
  }
}

async function copyGeneratedPrompt() {
  const prompt = elements.promptOutput.textContent;
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    const previous = elements.copyPrompt.textContent;
    elements.copyPrompt.textContent = "Copied";
    window.setTimeout(() => {
      elements.copyPrompt.textContent = previous;
    }, 1200);
  } catch {
    showMessage(elements.customError, "Clipboard access failed. Select the prompt and copy it manually.");
  }
}

function validateCustomJson() {
  hideMessage(elements.customError);
  const count = clampQuestionCount(elements.customCount.value, 100);
  if (count === null) {
    showMessage(elements.customError, "Choose an integer from 1 to 100.");
    return;
  }
  const raw = elements.customJson.value.trim();
  if (!raw) {
    showMessage(elements.customError, "Paste the generated quiz JSON first.");
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    showMessage(elements.customError, `Invalid JSON: ${error.message}`);
    return;
  }

  const result = normalizeCustomQuiz(payload, count);
  if (!result.ok) {
    showMessage(elements.customError, result.error);
    return;
  }
  launchCustomQuiz(result.data);
}

function validateBank(bank) {
  if (!bank || !Array.isArray(bank.vocabulary) || !Array.isArray(bank.etymology)) {
    throw new Error("The study bank has an invalid structure.");
  }
  const counts = bank.counts ?? {};
  if (counts.vocabulary !== bank.vocabulary.length || counts.etymology !== bank.etymology.length) {
    throw new Error("The study bank count metadata is inconsistent.");
  }
  const total = bank.vocabulary.length + bank.etymology.length;
  if (counts.total !== total) throw new Error("The total study bank count is inconsistent.");
  if (!bank.vocabulary.length || !bank.etymology.length) throw new Error("The study bank is empty.");
  return total;
}

async function loadBank() {
  try {
    const response = await fetch("data/biology-bank.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Study bank request failed (${response.status}).`);
    const bank = await response.json();
    const total = validateBank(bank);
    state.bank = bank;
    elements.vocabCount.textContent = bank.counts.vocabulary.toLocaleString();
    elements.etyCount.textContent = bank.counts.etymology.toLocaleString();
    elements.totalCount.textContent = total.toLocaleString();
    if (elements.footerBankVersion) {
      elements.footerBankVersion.textContent = `Version 3.0 · ${total.toLocaleString()}-entry audited DP bank`;
    }
    elements.startStudy.disabled = false;
    setStatus("ready", `${total.toLocaleString()} verified entries`);
  } catch (error) {
    setStatus("error", "Study bank unavailable");
    showMessage(elements.studyError, error.message || "The study bank could not be loaded.");
  }
}

function wireEvents() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.view));
  });

  $$("[data-mode]", $("#studyMode")).forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      $$("[data-mode]", $("#studyMode")).forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
    });
  });

  $$("[data-count]").forEach((button) => {
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

  elements.buildPrompt.addEventListener("click", preparePrompt);
  elements.copyPrompt.addEventListener("click", copyGeneratedPrompt);
  elements.loadCustom.addEventListener("click", validateCustomJson);
}

wireEvents();
activateView("study");
loadBank();

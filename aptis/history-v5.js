(() => {
  "use strict";

  const APP_VERSION = "5.2.0";
  const SCHEMA = "1.1";
  const KEYS = {
    summary: "aptisB2Stats",
    history: "aptisTestHistoryV1",
    sessionId: "aptisSessionIdV1",
    sessionStarted: "aptisSessionStartedAtV1"
  };

  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];
  const parse = (raw, fallback) => {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const now = () => new Date().toISOString();
  const uid = (prefix) =>
    `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

  const MODE_NAMES = {
    core50: "Full Core",
    mini10: "Quick Practice",
    grammar25: "Grammar",
    vocab25: "Vocabulary",
    reading29: "Full Reading",
    readingP1: "Reading Part 1",
    readingP2: "Reading Part 2",
    readingP3: "Reading Part 3",
    readingP4: "Reading Part 4",
    sessionWrong: "Ôn câu sai trong phiên"
  };

  const modeName = (mode) => MODE_NAMES[mode] || mode || "Bài luyện";
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);

  const history = () => {
    const rows = parse(localStorage.getItem(KEYS.history), []);
    return Array.isArray(rows) ? rows : [];
  };

  const saveHistory = (rows) => {
    try {
      localStorage.setItem(KEYS.history, JSON.stringify(rows));
      return true;
    } catch (error) {
      console.error(error);
      alert("Bộ nhớ trình duyệt đã đầy. Kết quả chưa được thêm vào lịch sử; bạn vẫn có thể dùng nút Tải kết quả JSON.");
      return false;
    }
  };

  function sessionId() {
    let id = sessionStorage.getItem(KEYS.sessionId);
    if (!id) {
      id = uid("session");
      sessionStorage.setItem(KEYS.sessionId, id);
      sessionStorage.setItem(KEYS.sessionStarted, now());
    }
    return id;
  }

  function sessionStarted() {
    sessionId();
    return sessionStorage.getItem(KEYS.sessionStarted) || now();
  }

  function downloadJson(data, name) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      anchor.remove();
    }, 1000);
  }

  const safeName = (value) =>
    String(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");

  const resultName = (record) =>
    safeName(`aptis-${record.mode}-${record.reading_test_id || "core"}-${record.submitted_at.replace(/[:.]/g, "-")}.json`);

  let itemMap = null;

  function getItemMap() {
    if (!itemMap) {
      itemMap = new Map(
        [...grammar, ...vocabulary, ...(reading.items || [])].map((item) => [item.id, item])
      );
    }
    return itemMap;
  }

  function sourceIndex(item) {
    if (Number.isInteger(item.__sourceIndex)) return item.__sourceIndex;
    const groupItems = (reading.items || [])
      .filter((candidate) => candidate.group_id === item.group_id)
      .sort((a, b) => a.id.localeCompare(b.id));
    return Math.max(0, groupItems.findIndex((candidate) => candidate.id === item.id));
  }

  function answerValue(item, label) {
    if (!label) return "";
    const labels = "ABCDEFGHIJ";
    const options = item.options || item.bank_options || [];
    const optionIndex = labels.indexOf(label);
    if (optionIndex >= 0 && options[optionIndex] != null) return options[optionIndex];

    const unit = (reading.units || []).find(
      (candidate) =>
        candidate.group_id === item.group_id &&
        String(candidate.label) === String(label)
    );
    return unit?.role_correct_mapping || unit?.text || label;
  }

  function makeRecord() {
    const result = state.results;
    const endedAt = now();
    const elapsed = Math.max(
      0,
      (state.__initialSeconds ?? state.seconds ?? 0) - (state.seconds ?? 0)
    );
    const percent = Math.round((result.correct / result.total) * 100);

    return {
      schema_version: SCHEMA,
      export_type: "aptis_test_result",
      app_version: APP_VERSION,
      bank_version: metadata.version || readingMetadata.version || "5.0.0",
      result_id: uid("result"),
      session_id: sessionId(),
      session_started_at: sessionStarted(),
      started_at: state.__startedAt || endedAt,
      submitted_at: endedAt,
      attempt_type: state.__attemptType || "standard",
      retry_of_result_id: state.__retryOfResultId || null,
      source_result_ids: state.__sourceResultIds || [],
      mode: state.mode,
      mode_label: state.__attemptLabel || modeName(state.mode),
      reading_test_id: state.readingTestId || null,
      grammar_topic: state.__grammarTopic || q("#topicSelect")?.value || "all",
      duration: {
        allowed_seconds: state.__initialSeconds ?? null,
        used_seconds: elapsed,
        remaining_seconds: state.seconds ?? null
      },
      score: {
        correct: result.correct,
        total: result.total,
        percent,
        blank: result.blank
      },
      sections: {
        grammar: { correct: result.gCorrect, total: result.gTotal },
        vocabulary: { correct: result.vCorrect, total: result.vTotal },
        reading: { correct: result.rCorrect, total: result.rTotal }
      },
      answers: result.rows.map(({ it, user, ok }) => ({
        item_id: it.id,
        section: it.section,
        test_id: it.test_id || null,
        group_id: it.group_id || null,
        part: it.part || null,
        topic: it.topic || it.subtype || null,
        prompt: it.question || it.prompt || "",
        user_label: user || null,
        user_value: answerValue(it, user) || null,
        correct_label: it.correct,
        correct_value: it.correct_value || answerValue(it, it.correct),
        is_correct: ok,
        explanation_vi: it.explanation_vi || "",
        explanation_en: it.explanation_en || ""
      }))
    };
  }

  function aggregate(rows) {
    const total = rows.length;
    const questions = rows.reduce((sum, row) => sum + (row.score?.total || 0), 0);
    const correct = rows.reduce((sum, row) => sum + (row.score?.correct || 0), 0);
    return {
      total,
      questions,
      correct,
      average: total
        ? Math.round(rows.reduce((sum, row) => sum + (row.score?.percent || 0), 0) / total)
        : null,
      best: total ? Math.max(...rows.map((row) => row.score?.percent || 0)) : null
    };
  }

  function fmt(iso) {
    try {
      return iso
        ? new Intl.DateTimeFormat("vi-VN", {
            dateStyle: "short",
            timeStyle: "short"
          }).format(new Date(iso))
        : "—";
    } catch {
      return iso || "—";
    }
  }

  function metric(label, value) {
    return `<div class="metric-card card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function currentSessionRows() {
    const id = sessionId();
    return history().filter((record) => record.session_id === id);
  }

  function unresolvedWrongAnswers(records) {
    const latestByItem = new Map();
    [...records]
      .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)))
      .forEach((record) => {
        (record.answers || []).forEach((answer) => {
          latestByItem.set(answer.item_id, {
            ...answer,
            source_result_id: record.result_id
          });
        });
      });
    return [...latestByItem.values()].filter((answer) => !answer.is_correct);
  }

  function renderStats() {
    const all = history();
    const session = currentSessionRows();
    const overall = aggregate(all);
    const sessionAggregate = aggregate(session);
    const tests = reading.tests || [];
    const testCount = Number(readingMetadata.test_count || tests.length);
    const taskCount = Number(readingMetadata.task_count || reading.tasks.length);
    const total = Number(
      metadata.total_item_count || grammar.length + vocabulary.length + reading.items.length
    );

    q("#bankStatsGrid").innerHTML = [
      ["Tổng câu hỏi", total.toLocaleString("vi-VN")],
      ["Grammar", grammar.length.toLocaleString("vi-VN")],
      ["Vocabulary", vocabulary.length.toLocaleString("vi-VN")],
      ["Reading", reading.items.length.toLocaleString("vi-VN")],
      ["Bộ Reading", testCount],
      ["Reading task groups", taskCount]
    ].map((entry) => metric(...entry)).join("");

    q("#sessionStatsGrid").innerHTML = [
      ["Bài trong phiên", sessionAggregate.total],
      ["Điểm trung bình", sessionAggregate.average == null ? "—" : `${sessionAggregate.average}%`],
      ["Điểm cao nhất", sessionAggregate.best == null ? "—" : `${sessionAggregate.best}%`],
      ["Câu đã làm", sessionAggregate.questions.toLocaleString("vi-VN")]
    ].map((entry) => metric(...entry)).join("");

    const sessionWrong = unresolvedWrongAnswers(session);
    const retrySessionButton = q("#retrySessionWrongBtn");
    if (retrySessionButton) {
      retrySessionButton.disabled = sessionWrong.length === 0;
      retrySessionButton.textContent = sessionWrong.length
        ? `Làm lại ${sessionWrong.length} câu còn sai`
        : "Không còn câu sai trong phiên";
      retrySessionButton.onclick = () => retrySessionWrong();
    }

    const modes = [...new Set(all.map((record) => record.mode))];
    q("#modeStatsBody").innerHTML = modes.length
      ? modes.map((mode) => {
          const rows = all.filter((record) => record.mode === mode);
          const summary = aggregate(rows);
          return `<tr><td>${escapeHtml(modeName(mode))}</td><td>${summary.total}</td><td>${summary.average ?? "—"}${summary.average == null ? "" : "%"}</td><td>${summary.questions}</td></tr>`;
        }).join("")
      : `<tr><td colspan="4" class="empty-cell">Chưa có bài đã nộp.</td></tr>`;

    const completedFullReading = new Set(
      all
        .filter((record) => record.mode === "reading29" && record.reading_test_id)
        .map((record) => record.reading_test_id)
    );
    q("#readingCoverageText").textContent =
      `Đã hoàn thành ${completedFullReading.size}/${testCount} bộ Full Reading`;
    q("#readingCoverageBar").style.width =
      `${testCount ? Math.round((completedFullReading.size / testCount) * 100) : 0}%`;

    q("#readingStatsBody").innerHTML = tests.map((test) => {
      const rows = all.filter((record) => record.reading_test_id === test.test_id);
      const summary = aggregate(rows);
      const last = [...rows].sort(
        (a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at))
      )[0];
      return `<tr><td>${escapeHtml(test.test_id)}</td><td>${escapeHtml(test.level)}</td><td>${summary.total}</td><td>${summary.best == null ? "—" : `${summary.best}%`}</td><td>${fmt(last?.submitted_at)}</td></tr>`;
    }).join("");

    const recent = [...all]
      .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))
      .slice(0, 50);

    q("#historyBody").innerHTML = recent.length
      ? recent.map((record) => {
          const wrongCount = (record.answers || []).filter((answer) => !answer.is_correct).length;
          return `<tr>
            <td>${fmt(record.submitted_at)}</td>
            <td>${escapeHtml(record.mode_label || modeName(record.mode))}</td>
            <td>${escapeHtml(record.reading_test_id || "—")}</td>
            <td>${record.score.correct}/${record.score.total} (${record.score.percent}%)</td>
            <td>
              <div class="row-actions">
                <button class="ghost tiny history-retry" data-id="${escapeHtml(record.result_id)}">Làm lại</button>
                <button class="ghost tiny history-wrong" data-id="${escapeHtml(record.result_id)}" ${wrongCount ? "" : "disabled"}>Câu sai${wrongCount ? ` (${wrongCount})` : ""}</button>
                <button class="ghost tiny history-json" data-id="${escapeHtml(record.result_id)}">JSON</button>
              </div>
            </td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="5" class="empty-cell">Chưa có lịch sử làm bài.</td></tr>`;

    qa(".history-json").forEach((button) => {
      button.onclick = () => {
        const record = history().find((row) => row.result_id === button.dataset.id);
        if (record) downloadJson(record, resultName(record));
      };
    });
    qa(".history-retry").forEach((button) => {
      button.onclick = () => {
        const record = history().find((row) => row.result_id === button.dataset.id);
        if (record) retryRecord(record, false);
      };
    });
    qa(".history-wrong").forEach((button) => {
      button.onclick = () => {
        const record = history().find((row) => row.result_id === button.dataset.id);
        if (record) retryRecord(record, true);
      };
    });

    q("#overallSummary").textContent = overall.total
      ? `${overall.total} bài · ${overall.questions.toLocaleString("vi-VN")} câu · trung bình ${overall.average}% · đúng ${overall.correct.toLocaleString("vi-VN")} câu`
      : "Chưa có dữ liệu lịch sử trên thiết bị này.";
    q("#sessionLabel").textContent =
      `Phiên hiện tại: ${session.length} bài · bắt đầu ${fmt(sessionStarted())}`;
  }

  function reviewCard(row, index) {
    const { it, user, ok } = row;
    const userAnswer = user ? answerValue(it, user) : "Chưa trả lời";
    const correctAnswer = it.correct_value || answerValue(it, it.correct);
    const explanation = it.explanation_vi || it.explanation_en || "Chưa có giải thích.";
    return `<article class="review-card card ${ok ? "review-correct" : "review-wrong"}">
      <div class="question-meta">
        <span class="tag">Câu ${index + 1}</span>
        <span class="tag">${escapeHtml(it.section)}</span>
        <span class="tag">${escapeHtml(it.test_id || it.topic || it.subtype || "")}</span>
        <span class="tag review-status">${ok ? "Đúng" : "Sai"}</span>
      </div>
      <h3>${escapeHtml(it.question || it.prompt)}</h3>
      <p><b>Bạn chọn:</b> ${escapeHtml(userAnswer)}</p>
      <p><b>Đáp án đúng:</b> ${escapeHtml(correctAnswer)}</p>
      <p class="explain">${escapeHtml(explanation)}</p>
    </article>`;
  }

  function renderReviewMode(mode) {
    if (!state.results) return;
    const allRows = state.results.rows || [];
    const rows = mode === "wrong" ? allRows.filter((row) => !row.ok) : allRows;
    const host = q("#reviewHost");
    const summary =
      mode === "wrong"
        ? `Đang xem ${rows.length} câu sai hoặc bỏ trống.`
        : `Đang xem toàn bộ ${allRows.length} câu của bài làm.`;

    q("#reviewSummary").textContent = summary;
    q("#reviewAllBtn").setAttribute("aria-pressed", mode === "all" ? "true" : "false");
    q("#reviewBtn").setAttribute("aria-pressed", mode === "wrong" ? "true" : "false");

    host.innerHTML = rows.length
      ? rows.map((row, index) => reviewCard(row, mode === "all" ? index : allRows.indexOf(row))).join("")
      : `<div class="card review-card correct-review"><h3>Không có câu sai.</h3></div>`;
    host.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function itemBlockKey(item) {
    if (item.section === "Reading") return `reading:${item.group_id}`;
    if (item.section === "Vocabulary" && item.bank_options?.length) {
      return `bank:${item.group_id}`;
    }
    return `item:${item.id}`;
  }

  function blocksForAnswers(answerRows) {
    const groups = new Map();
    const order = [];
    let missing = 0;

    answerRows.forEach((answer) => {
      const original = getItemMap().get(answer.item_id);
      if (!original) {
        missing += 1;
        return;
      }
      const item = original.section === "Reading"
        ? { ...original, __sourceIndex: sourceIndex(original) }
        : original;
      const key = itemBlockKey(item);
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key).push(item);
    });

    const blocks = order.map((key) => {
      const items = groups.get(key);
      const first = items[0];

      if (key.startsWith("reading:")) {
        const task = (reading.tasks || []).find(
          (candidate) => candidate.group_id === first.group_id
        );
        if (!task) return null;
        const block = readingTaskBlock(task);
        block.items = items;
        block.count = items.length;
        return block;
      }

      if (key.startsWith("bank:")) {
        return {
          kind: "bank",
          section: "Vocabulary",
          count: items.length,
          items
        };
      }

      return {
        kind: "mcq",
        section: first.section,
        count: 1,
        items: [first]
      };
    }).filter(Boolean);

    return { blocks, missing };
  }

  function retryDuration(questionCount, sourceRecord, wrongOnly) {
    if (!wrongOnly && sourceRecord?.duration?.allowed_seconds) {
      return Number(sourceRecord.duration.allowed_seconds);
    }
    return Math.max(180, questionCount * 60);
  }

  function startAnswerSet(answerRows, options = {}) {
    const { blocks, missing } = blocksForAnswers(answerRows);
    const questionCount = blocks.reduce((sum, block) => sum + block.count, 0);
    if (!questionCount) {
      alert("Không tìm thấy câu hỏi phù hợp trong ngân hàng hiện tại.");
      return;
    }
    if (missing) {
      alert(`${missing} câu trong lịch sử không còn tồn tại trong ngân hàng hiện tại và sẽ được bỏ qua.`);
    }

    clearInterval(state.timer);
    const seconds = retryDuration(questionCount, options.sourceRecord, options.wrongOnly);
    state = {
      mode: options.mode || "sessionWrong",
      blocks,
      index: 0,
      answers: {},
      seconds,
      timer: null,
      submitted: false,
      results: null,
      readingTestId: options.readingTestId || null
    };
    state.__startedAt = now();
    state.__initialSeconds = seconds;
    state.__historySaved = false;
    state.__resultRecord = null;
    state.__attemptType = options.attemptType || "wrong_retry";
    state.__attemptLabel = options.attemptLabel || "Ôn câu sai";
    state.__retryOfResultId = options.retryOfResultId || null;
    state.__sourceResultIds = options.sourceResultIds || [];
    state.__grammarTopic = options.grammarTopic || "all";

    showView("quizView");
    renderBlock();
    startTimer();
  }

  function retryRecord(record, wrongOnly) {
    const sourceAnswers = Array.isArray(record.answers) ? record.answers : [];
    const answers = wrongOnly
      ? sourceAnswers.filter((answer) => !answer.is_correct)
      : sourceAnswers;

    if (!answers.length) {
      alert(wrongOnly ? "Bài này không có câu sai để làm lại." : "Không có dữ liệu câu hỏi để làm lại.");
      return;
    }

    startAnswerSet(answers, {
      mode: record.mode,
      readingTestId: record.reading_test_id,
      grammarTopic: record.grammar_topic,
      attemptType: wrongOnly ? "wrong_retry" : "test_retry",
      attemptLabel: wrongOnly
        ? `Ôn câu sai · ${record.mode_label || modeName(record.mode)}`
        : `Làm lại · ${record.mode_label || modeName(record.mode)}`,
      retryOfResultId: record.result_id,
      sourceResultIds: [record.result_id],
      sourceRecord: record,
      wrongOnly
    });
  }

  function retrySessionWrong() {
    const session = currentSessionRows();
    const answers = unresolvedWrongAnswers(session);
    if (!answers.length) {
      alert("Phiên hiện tại không còn câu sai để làm lại.");
      return;
    }
    startAnswerSet(answers, {
      mode: "sessionWrong",
      attemptType: "session_wrong_retry",
      attemptLabel: "Ôn câu sai trong phiên",
      sourceResultIds: [...new Set(answers.map((answer) => answer.source_result_id).filter(Boolean))],
      wrongOnly: true
    });
  }

  function installEnhancedReadingRenderers() {
    renderReadingP1 = function enhancedReadingP1(block) {
      return `<article class="question-card card">
        <div class="question-meta"><span class="tag">Reading Part 1</span><span class="tag">${esc(block.task.level)}</span><span class="tag">${esc(block.task.title)}</span></div>
        <h2>${esc(block.task.instructions_vi)}</h2>
        <div class="reading-passage">${nl2br(block.task.stimulus_text)}</div>
        <div class="reading-question-list">${block.items.map((item) => `<section class="reading-item"><h3>${sourceIndex(item) + 1}. ${esc(item.prompt)}</h3><div class="options compact">${optionRadios(item, "ABC")}</div></section>`).join("")}</div>
      </article>`;
    };

    renderReadingOrder = function enhancedReadingOrder(block) {
      const units = block.units
        .filter((unit) => unit.unit_type === "sentence")
        .sort((a, b) => a.label.localeCompare(b.label));
      const labels = units.map((unit) => unit.label);
      const options = units.map((unit) => unit.text);
      return `<article class="question-card card">
        <div class="question-meta"><span class="tag">Reading Part 2</span><span class="tag">${esc(block.task.level)}</span><span class="tag">${esc(block.task.title)}</span></div>
        <h2>${esc(block.task.instructions_vi)}</h2>
        <div class="fixed-sentence"><b>Câu đầu:</b> ${esc(block.task.fixed_first_sentence)}</div>
        <div class="sentence-bank">${units.map((unit) => `<div><b>${esc(unit.label)}</b><span>${esc(unit.text)}</span></div>`).join("")}</div>
        <div>${block.items.map((item) => {
          const position = sourceIndex(item) + 2;
          return `<div class="match-row"><b>${position}</b><span>Vị trí ${position}</span>${selectHtml(item, labels, options, block.task.group_id)}</div>`;
        }).join("")}</div>
      </article>`;
    };

    renderReadingOpinion = function enhancedReadingOpinion(block) {
      const units = block.units
        .filter((unit) => unit.unit_type === "opinion")
        .sort((a, b) => a.label.localeCompare(b.label));
      const labels = units.map((unit) => unit.label);
      const options = units.map((unit) => unit.role_correct_mapping);
      return `<article class="question-card card">
        <div class="question-meta"><span class="tag">Reading Part 3</span><span class="tag">${esc(block.task.level)}</span><span class="tag">${esc(block.task.title)}</span></div>
        <h2>${esc(block.task.instructions_vi)}</h2>
        <div class="opinion-grid">${units.map((unit) => `<section><h3>${esc(unit.role_correct_mapping)}</h3><p>${esc(unit.text)}</p></section>`).join("")}</div>
        <div>${block.items.map((item) => `<div class="match-row reading-match"><b>${sourceIndex(item) + 1}</b><span>${esc(item.prompt)}</span>${selectHtml(item, labels, options)}</div>`).join("")}</div>
      </article>`;
    };

    renderReadingHeadings = function enhancedReadingHeadings(block) {
      const intro = block.units.find((unit) => unit.unit_type === "intro");
      const allParagraphs = block.units
        .filter((unit) => unit.unit_type === "paragraph")
        .sort((a, b) => Number(a.label) - Number(b.label));
      const headings = block.units
        .filter((unit) => unit.unit_type === "heading")
        .sort((a, b) => a.label.localeCompare(b.label));
      const labels = headings.map((heading) => heading.label);
      const options = headings.map((heading) => heading.text);
      const itemByParagraph = new Map(
        block.items.map((item) => [String(sourceIndex(item) + 1), item])
      );
      const paragraphs = allParagraphs.filter((paragraph) =>
        itemByParagraph.has(String(paragraph.label))
      );

      return `<article class="question-card card">
        <div class="question-meta"><span class="tag">Reading Part 4</span><span class="tag">${esc(block.task.level)}</span><span class="tag">${esc(block.task.title)}</span></div>
        <h2>${esc(block.task.instructions_vi)}</h2>
        <div class="reading-passage intro"><h3>${esc(block.task.title)}</h3><p>${esc(intro?.text || block.task.stimulus_text)}</p></div>
        <div class="heading-bank">${headings.map((heading) => `<span><b>${esc(heading.label)}</b> · ${esc(heading.text)}</span>`).join("")}</div>
        <div class="paragraph-list">${paragraphs.map((paragraph) => {
          const item = itemByParagraph.get(String(paragraph.label));
          return `<section class="reading-paragraph"><div class="paragraph-head"><h3>Đoạn ${esc(paragraph.label)}</h3>${selectHtml(item, labels, options)}</div><p>${esc(paragraph.text)}</p></section>`;
        }).join("")}</div>
      </article>`;
    };
  }

  function showView(view) {
    ["homeView", "quizView", "resultView", "statsView"].forEach((id) => {
      const element = q(`#${id}`);
      if (element) element.hidden = id !== view;
    });
    if (view === "statsView") renderStats();
    scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportSession() {
    const id = sessionId();
    const rows = history().filter((record) => record.session_id === id);
    if (!rows.length) return alert("Phiên hiện tại chưa có kết quả nào.");
    downloadJson({
      schema_version: SCHEMA,
      export_type: "aptis_session_results",
      exported_at: now(),
      session_id: id,
      session_started_at: sessionStarted(),
      result_count: rows.length,
      results: rows
    }, safeName(`aptis-session-${id}.json`));
  }

  function exportAll() {
    const rows = history();
    if (!rows.length) return alert("Chưa có lịch sử để xuất.");
    downloadJson({
      schema_version: SCHEMA,
      export_type: "aptis_all_results",
      exported_at: now(),
      result_count: rows.length,
      results: rows
    }, `aptis-all-results-${now().slice(0, 10)}.json`);
  }

  async function clearCache() {
    let deleted = 0;
    if ("caches" in window) {
      const keys = await caches.keys();
      const results = await Promise.all(keys.map((key) => caches.delete(key)));
      deleted = results.filter(Boolean).length;
    }
    alert(`Đã xóa ${deleted} browser cache. Lịch sử kết quả vẫn được giữ lại.`);
    location.reload();
  }

  async function clearAll() {
    if (!confirm("Xóa toàn bộ lịch sử, thống kê, phiên hiện tại và browser cache trên thiết bị này? Hành động này không thể hoàn tác.")) {
      return;
    }
    localStorage.removeItem(KEYS.summary);
    localStorage.removeItem(KEYS.history);
    sessionStorage.removeItem(KEYS.sessionId);
    sessionStorage.removeItem(KEYS.sessionStarted);
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    location.reload();
  }

  function replaceButtonListener(selector, handler) {
    const current = q(selector);
    if (!current) return null;
    const replacement = current.cloneNode(true);
    current.replaceWith(replacement);
    replacement.addEventListener("click", handler);
    return replacement;
  }

  function prepareStandardAttempt(mode) {
    state.__startedAt = now();
    state.__initialSeconds = modeSeconds(mode);
    state.__historySaved = false;
    state.__resultRecord = null;
    state.__attemptType = "standard";
    state.__attemptLabel = modeName(mode);
    state.__retryOfResultId = null;
    state.__sourceResultIds = [];
    state.__grammarTopic = q("#topicSelect")?.value || "all";
  }

  function install() {
    if (typeof state === "undefined" || typeof submitQuiz !== "function" || !q("#statsBtn")) {
      return setTimeout(install, 50);
    }

    sessionId();
    installEnhancedReadingRenderers();

    const originalStart = startQuiz;
    startQuiz = function enhancedStartQuiz(mode) {
      const result = originalStart(mode);
      prepareStandardAttempt(mode);
      return result;
    };

    const originalSubmit = submitQuiz;
    submitQuiz = function enhancedSubmitQuiz(auto = false) {
      const wasSubmitted = state.submitted;
      originalSubmit(auto);
      if (!wasSubmitted && state.submitted && state.results && !state.__historySaved) {
        state.__historySaved = true;
        const record = makeRecord();
        state.__resultRecord = record;
        saveHistory([...history(), record]);
        if (q("#reviewSummary")) q("#reviewSummary").textContent = "";
        if (q("#reviewAllBtn")) q("#reviewAllBtn").setAttribute("aria-pressed", "false");
        if (q("#reviewBtn")) q("#reviewBtn").setAttribute("aria-pressed", "false");
      }
    };

    show = showView;

    q("#statsBtn").onclick = () => showView("statsView");
    q("#backHomeBtn").onclick = () => showView("homeView");

    replaceButtonListener("#reviewBtn", () => renderReviewMode("wrong"));
    q("#reviewAllBtn").onclick = () => renderReviewMode("all");
    q("#retryCurrentBtn").onclick = () => {
      if (state.__resultRecord) retryRecord(state.__resultRecord, false);
      else alert("Chưa có kết quả để làm lại.");
    };
    q("#downloadResultBtn").onclick = () => {
      if (state.__resultRecord) downloadJson(state.__resultRecord, resultName(state.__resultRecord));
      else alert("Chưa có kết quả để tải.");
    };

    q("#exportSessionBtn").onclick = exportSession;
    q("#exportAllBtn").onclick = exportAll;
    q("#clearCacheBtn").onclick = clearCache;
    q("#clearAllBtn").onclick = clearAll;

    const counts = {
      bankTotal: Number(metadata.total_item_count || grammar.length + vocabulary.length + reading.items.length),
      bankGrammar: grammar.length,
      bankVocabulary: vocabulary.length,
      bankReading: reading.items.length,
      bankReadingTests: reading.tests.length
    };
    Object.entries(counts).forEach(([id, value]) => {
      const element = q(`#${id}`);
      if (element) element.textContent = Number(value).toLocaleString("vi-VN");
    });

    const randomOption = q("#readingTestSelect option[value='random']");
    if (randomOption) {
      randomOption.textContent =
        `Ngẫu nhiên RT01–RT${String(reading.tests.length).padStart(2, "0")}`;
    }
  }

  install();
})();

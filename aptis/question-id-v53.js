(() => {
  "use strict";

  const APP_VERSION = "5.3.0";
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  const waitForApp = () => new Promise((resolve, reject) => {
    let checks = 0;
    const timer = setInterval(() => {
      checks += 1;
      if (typeof state !== "undefined" && typeof renderBlock === "function" && q("#blockHost")) {
        clearInterval(timer);
        resolve();
      } else if (checks > 400) {
        clearInterval(timer);
        reject(new Error("Aptis app initialization timed out"));
      }
    }, 50);
  });

  function itemLocator(item) {
    const parts = [
      `ID ${item.id}`,
      item.section || null,
      item.test_id || null,
      item.part ? `Part ${item.part}` : null,
      item.group_id || null,
      item.topic || item.subtype || null
    ].filter(Boolean);
    return parts.join(" · ");
  }

  function reportText(item, context = {}) {
    const selected = context.userLabel || context.userValue || "Chưa trả lời";
    const correct = context.correctLabel || context.correctValue || item.correct || "Chưa xác định";
    return [
      "APTIS QUESTION REPORT",
      `Question ID: ${item.id}`,
      `Location: ${itemLocator(item)}`,
      `Bank version: ${globalThis.metadata?.version || globalThis.readingMetadata?.version || "5.0.0"}`,
      `App version: ${APP_VERSION}`,
      `Mode: ${globalThis.state?.mode || "review"}`,
      `Prompt: ${item.question || item.prompt || ""}`,
      `Selected answer: ${selected}`,
      `Recorded correct answer: ${correct}`,
      "Issue type: [wrong answer / ambiguous question / typo / explanation / other]",
      "User note:"
    ].join("\n");
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  async function copyReport(item, context, button) {
    try {
      await copyText(reportText(item, context));
      const old = button.textContent;
      button.textContent = "Đã sao chép";
      button.classList.add("copied");
      setTimeout(() => {
        button.textContent = old;
        button.classList.remove("copied");
      }, 1600);
    } catch (error) {
      console.error(error);
      alert(`Không thể sao chép tự động. Mã câu hỏi: ${item.id}`);
    }
  }

  function makeIdBadge(item, compact = false) {
    const wrap = document.createElement("span");
    wrap.className = compact ? "qid-wrap compact" : "qid-wrap";
    wrap.dataset.questionId = item.id;

    const badge = document.createElement("code");
    badge.className = "qid-badge";
    badge.textContent = item.id;
    badge.title = itemLocator(item);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "qid-copy";
    copy.textContent = "Sao chép ID";
    copy.setAttribute("aria-label", `Sao chép mã câu hỏi ${item.id}`);
    copy.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await copyText(item.id);
      const old = copy.textContent;
      copy.textContent = "Đã chép";
      setTimeout(() => { copy.textContent = old; }, 1200);
    };

    const report = document.createElement("button");
    report.type = "button";
    report.className = "qid-report";
    report.textContent = "Báo lỗi";
    report.setAttribute("aria-label", `Báo lỗi câu hỏi ${item.id}`);
    report.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyReport(item, {}, report);
    };

    wrap.append(badge, copy, report);
    return wrap;
  }

  function appendOnce(target, item, compact = false) {
    if (!target || target.querySelector(`[data-question-id="${CSS.escape(item.id)}"]`)) return;
    target.append(makeIdBadge(item, compact));
  }

  function annotateQuiz() {
    const block = state?.blocks?.[state.index];
    const host = q("#blockHost");
    if (!block || !host) return;

    const items = block.items || [];
    if (!items.length) return;

    if (block.kind === "mcq") {
      appendOnce(q(".question-meta", host), items[0]);
      return;
    }

    if (block.kind === "bank") {
      qa(".match-row", host).forEach((row, index) => {
        if (items[index]) appendOnce(row, items[index], true);
      });
      return;
    }

    if (block.kind === "reading_p1") {
      qa(".reading-item", host).forEach((section, index) => {
        if (items[index]) appendOnce(q("h3", section) || section, items[index], true);
      });
      return;
    }

    if (block.kind === "reading_order" || block.kind === "reading_opinion") {
      qa(".match-row", host).forEach((row, index) => {
        if (items[index]) appendOnce(row, items[index], true);
      });
      return;
    }

    if (block.kind === "reading_headings") {
      qa(".reading-paragraph", host).forEach((section, index) => {
        if (items[index]) appendOnce(q(".paragraph-head", section) || section, items[index], true);
      });
    }
  }

  function answerContext(item) {
    const row = state?.results?.rows?.find((candidate) => candidate.it?.id === item.id);
    if (!row) return {};
    return {
      userLabel: row.user || null,
      correctLabel: item.correct || null,
      userValue: row.user || "Chưa trả lời",
      correctValue: item.correct_value || item.correct || null
    };
  }

  function annotateReview() {
    const host = q("#reviewHost");
    const rows = state?.results?.rows || [];
    if (!host || !rows.length) return;

    qa(".review-card", host).forEach((card) => {
      if (card.dataset.qidAnnotated === "true") return;
      const heading = q("h3", card);
      const prompt = heading?.textContent?.trim();
      const row = rows.find((candidate) =>
        (candidate.it?.question || candidate.it?.prompt || "").trim() === prompt
      );
      if (!row?.it) return;

      card.dataset.qidAnnotated = "true";
      card.dataset.questionId = row.it.id;
      const meta = q(".question-meta", card) || card;
      const controls = makeIdBadge(row.it);
      const reportButton = q(".qid-report", controls);
      reportButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyReport(row.it, answerContext(row.it), reportButton);
      };
      meta.append(controls);
    });
  }

  function install() {
    const originalRenderBlock = renderBlock;
    renderBlock = function renderBlockWithQuestionIds(...args) {
      const result = originalRenderBlock.apply(this, args);
      requestAnimationFrame(annotateQuiz);
      return result;
    };

    const reviewHost = q("#reviewHost");
    if (reviewHost) {
      new MutationObserver(() => requestAnimationFrame(annotateReview)).observe(reviewHost, {
        childList: true,
        subtree: true
      });
    }

    requestAnimationFrame(annotateQuiz);
  }

  waitForApp().then(install).catch((error) => console.error(error));
})();

(() => {
  "use strict";

  const REQUIRED_STATUS = "PUBLISHED_FINAL";
  const REQUIRED_COUNT = 1000;

  async function fetchJson(path, label) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${label}: HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new Error(`${label}: JSON không hợp lệ (${error.message})`);
    }
  }

  function findArray(payload, key) {
    if (Array.isArray(payload)) return payload;

    const candidates = [
      payload?.[key],
      payload?.questions,
      payload?.items,
      payload?.data
    ];
    const result = candidates.find(Array.isArray);
    if (!result) throw new Error(`${key}: không tìm thấy mảng câu hỏi`);
    return result;
  }

  function normalizeItems(payload, key) {
    return findArray(payload, key).map((item) => ({
      ...item,
      status: item.status || item.question_status || REQUIRED_STATUS
    }));
  }

  function validate(manifest, grammar, vocabulary) {
    const questionStatus = manifest.question_status || manifest.status;
    if (questionStatus !== REQUIRED_STATUS) {
      throw new Error(`manifest: question_status=${questionStatus || "missing"}`);
    }

    const grammarCount = Number(manifest.grammar_count ?? manifest.grammarCount ?? grammar.length);
    const vocabularyCount = Number(manifest.vocabulary_count ?? manifest.vocabularyCount ?? vocabulary.length);

    if (grammarCount !== REQUIRED_COUNT || grammar.length !== REQUIRED_COUNT) {
      throw new Error(`grammar: expected ${REQUIRED_COUNT}, got manifest=${grammarCount}, data=${grammar.length}`);
    }
    if (vocabularyCount !== REQUIRED_COUNT || vocabulary.length !== REQUIRED_COUNT) {
      throw new Error(`vocabulary: expected ${REQUIRED_COUNT}, got manifest=${vocabularyCount}, data=${vocabulary.length}`);
    }
  }

  async function start() {
    const [manifest, grammarPayload, vocabularyPayload] = await Promise.all([
      fetchJson("./data/manifest.json", "manifest"),
      fetchJson("./data/grammar.json", "grammar"),
      fetchJson("./data/vocabulary.json", "vocabulary")
    ]);

    const grammar = normalizeItems(grammarPayload, "grammar");
    const vocabulary = normalizeItems(vocabularyPayload, "vocabulary");
    validate(manifest, grammar, vocabulary);

    window.APTIS_DATA = {
      metadata: {
        ...manifest,
        source_version: manifest.version,
        version: "1.0.0",
        status: REQUIRED_STATUS,
        grammarCount: grammar.length,
        vocabularyCount: vocabulary.length
      },
      grammar,
      vocabulary
    };

    const appResponse = await fetch("./app.js?v=7", { cache: "no-store" });
    if (!appResponse.ok) throw new Error(`app.js: HTTP ${appResponse.status}`);

    const original = await appResponse.text();
    const marker = /async function decodeEmbeddedData\(\) \{[\s\S]*?\n\}\nasync function init\(\)/;
    if (!marker.test(original)) throw new Error("app.js: không tìm thấy data loader cần thay thế");

    const patched = original.replace(
      marker,
      "async function decodeEmbeddedData() { return window.APTIS_DATA; }\nasync function init()"
    );

    const script = document.createElement("script");
    script.textContent = `${patched}\n//# sourceURL=aptis-app.js`;
    document.body.appendChild(script);
  }

  start().catch((error) => {
    console.error("Aptis JSON bootstrap failed:", error);
    document.body.innerHTML = `<p style="padding:30px">Không tải được ngân hàng câu hỏi FINAL.<br><small>${String(error.message || error)}</small></p>`;
  });
})();

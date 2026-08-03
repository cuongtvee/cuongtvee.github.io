(() => {
  "use strict";

  async function start() {
    const response = await fetch("./app.js?v=10", { cache: "no-store" });
    if (!response.ok) throw new Error(`app.js: HTTP ${response.status}`);

    let source = await response.text();
    const replacements = [
      [
        'const SHEET_URL = "https://docs.google.com/spreadsheets/d/1R8Gg8of2uZnp7xYPIIWFfH5CpADR5_cYQYSgT8zKxg0/edit?usp=drivesdk";',
        'const SHEET_URL = "https://docs.google.com/spreadsheets/d/1Bjrp_IgqbhYdQmxF3Augs8rkHn-c4tZed-jFVqObNLI/edit?usp=drivesdk";'
      ],
      [
        'reading.tests.length!==10 || reading.items.length!==290 || readingMetadata.item_count!==290',
        'reading.tests.length!==24 || reading.items.length!==696 || readingMetadata.item_count!==696'
      ],
      [
        'Không tải được ngân hàng Aptis v3.',
        'Không tải được ngân hàng Aptis v5.'
      ]
    ];

    for (const [from, to] of replacements) {
      if (!source.includes(from)) throw new Error(`Không tìm thấy marker cần nâng cấp: ${from.slice(0, 70)}`);
      source = source.replace(from, to);
    }

    const script = document.createElement("script");
    script.textContent = `${source}\n//# sourceURL=aptis-app-v5.js`;
    document.body.appendChild(script);
  }

  start().catch((error) => {
    console.error("Aptis v5 runtime failed:", error);
    document.body.innerHTML = `<p style="padding:30px">Không tải được ngân hàng Aptis v5.<br><small>${String(error.message || error)}</small></p>`;
  });
})();

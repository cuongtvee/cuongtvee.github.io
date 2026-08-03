(() => {
  "use strict";
  const fail = (message) => {
    document.body.innerHTML = `<p style="padding:30px">${message}</p>`;
  };
  const waitForBank = () => new Promise((resolve, reject) => {
    let checks = 0;
    const timer = setInterval(() => {
      checks++;
      if (typeof reading !== "undefined" && reading.tests?.length) {
        clearInterval(timer);
        resolve();
      } else if (checks > 400) {
        clearInterval(timer);
        reject(new Error("Bank initialization timed out"));
      }
    }, 50);
  });

  (async () => {
    const response = await fetch("./app.js?v=11", { cache: "no-store" });
    if (!response.ok) throw new Error(`app.js: HTTP ${response.status}`);
    let source = await response.text();
    source = source
      .replace(
        "1R8Gg8of2uZnp7xYPIIWFfH5CpADR5_cYQYSgT8zKxg0",
        "1Bjrp_IgqbhYdQmxF3Augs8rkHn-c4tZed-jFVqObNLI"
      )
      .replace(
        "reading.tests.length!==10 || reading.items.length!==290 || readingMetadata.item_count!==290",
        "reading.tests.length!==24 || reading.items.length!==696 || readingMetadata.item_count!==696"
      )
      .replace(
        "Không tải được ngân hàng Aptis v3.",
        "Không tải được ngân hàng Aptis v5."
      );

    const app = document.createElement("script");
    app.textContent = `${source}\n//# sourceURL=aptis-app-v5.js`;
    document.head.appendChild(app);

    await waitForBank();

    const history = document.createElement("script");
    history.src = "./history-v5.js?v=2";
    history.onerror = () => fail("Không tải được mô-đun lịch sử Aptis v5.2.");
    document.body.appendChild(history);
  })().catch((error) => {
    console.error(error);
    fail(`Không tải được ứng dụng Aptis v5.2.<br><small>${error.message || error}</small>`);
  });
})();

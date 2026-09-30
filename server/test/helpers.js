// Polls a condition instead of a fixed sleep, for asserting on fire-and-forget
// work (logAnalystAction's chain-queued writes, critical-alert emails) whose
// completion time isn't fixed — it depends on how much else the process has
// queued ahead of it, which grows as the suite grows. A fixed setTimeout that
// happens to be long enough today becomes flaky the next time someone adds
// tests; polling with a generous ceiling doesn't.
async function waitUntil(check, { timeout = 3000, interval = 50 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await check();
    if (result) return result;
    await new Promise((r) => setTimeout(r, interval));
  }
  return check();
}

module.exports = { waitUntil };

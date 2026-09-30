// A registry of security features, marked active at the exact point in
// server/app.js where each one is actually mounted. This is more
// trustworthy than a hand-maintained list living in a separate file
// (server/routes/soc.js's old HARDENING_CHECKLIST): if someone deletes the
// app.use(helmet(...)) line, the markActive('helmet', ...) call sitting
// right next to it gets deleted too, by construction — the claim and the
// code it describes can't drift apart the way a disconnected list can.
//
// It is NOT full runtime introspection of Express's internal middleware
// stack (that's fragile across library versions with differently-named
// internal functions) — it's an honest, tightly-coupled "this line of
// app.js actually executed during boot" signal.

const registry = new Map(); // name -> { detail, markedAt }

function markActive(name, detail = '') {
  registry.set(name, { detail, markedAt: new Date().toISOString() });
}

function getActiveFeatures() {
  return Array.from(registry.entries()).map(([name, { detail, markedAt }]) => ({ name, detail, markedAt }));
}

module.exports = { markActive, getActiveFeatures };

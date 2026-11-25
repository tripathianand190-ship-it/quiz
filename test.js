// Smoke test: node test.js
process.env.DATA_DIR = require("os").tmpdir() + "/quizboard-test-" + Date.now();
const assert = require("assert");
const server = require("./server");
server.listen(0, async () => {
  const base = "http://localhost:" + server.address().port;
  const post = (p, b) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(r => r.json());
  try {
    const topics = await (await fetch(base + "/api/topics")).json();
    assert(topics.length === 4, "4 topics");
    const s = await post("/api/start", { topic: "Electrical Basics" });
    assert(s.questions.length === 8 && !("a" in s.questions[0]), "no answers leaked");
    for (const q of s.questions) {
      const r = await post("/api/answer", { session: s.session, id: q.id, choice: 0 });
      assert(typeof r.correct === "boolean");
    }
    const dup = await post("/api/answer", { session: s.session, id: 0, choice: 1 });
    assert(dup.error, "repeat answer rejected");
    const f = await post("/api/finish", { session: s.session, name: "Tester<b>" });
    assert(f.board[0].name === "Testerb", "name sanitized");
    const page = await fetch(base + "/");
    assert(page.status === 200 && (await page.text()).includes("Quiz Board"));
    const trav = await fetch(base + "/%2e%2e/server.js");
    assert(trav.status === 403 || trav.status === 404, "path traversal blocked");
    console.log("All tests passed");
    process.exit(0);
  } catch (e) { console.error("FAILED:", e.message); process.exit(1); }
});

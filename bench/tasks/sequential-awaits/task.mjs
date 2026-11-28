// Awaits that do not depend on each other, written one after the other: the second waits for the first for nothing
// (Solid's ASYNC_WATERFALL; 99, the advisory rows — advice, never an error).
export default {
  title: "An action's awaits: one after the other only when one needs the other",
  types: [
    { name: "what was awaited keeps the backend's types", edit: ["${team.name} (${team.size})", "${team.title} (${team.size})"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "two independent loads awaited one after the other", edit: ["let asked = all([loadUser(7), loadNews()])\n      let [user, news] = await asked", "let user = await loadUser(7)\n      let news = await loadNews()"], advise: "ASYNC_WATERFALL" },
    { name: "an await inside an expression", edit: ["let team = await loadTeam(user.team)", "let team = { name: (await loadTeam(user.team)).name, size: 0 }"], expect: "AWAIT_IN_EXPRESSION" },
    { name: "a failure the action lets out", edit: ["} catch (e) { summary := \"failed\" }", "} finally { took := 1 }"], expect: "UNCAUGHT_ACTION_FAILURE" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    await h.until(async () => /nothing yet/.test(await h.text(page)));
    await page.click(".go");
    h.check("the refresh lands", await h.until(async () => /blue \(4\), 1 news/.test(await h.text(page))), await h.text(page));
    const seen = await page.evaluate(() => window.__backend);
    h.check("the two loads that need nothing of each other were out together (two calls in flight at once)", seen.peak === 2, seen);
    h.check("…and the one that needs the user was asked after it answered", JSON.stringify(seen.asked) === '["user","news","team"]', seen);
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};

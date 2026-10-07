import { test, expect, type Page } from "@playwright/test";
async function clearHelp(page: Page) {
  const b = page.getByRole("button", { name: "Understood. Let’s salvage." });
  await expect(b).toBeVisible();
  await b.click();
  await expect(page.locator("dialog")).toHaveCount(0);
}
async function overflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("two independent browsers complete eight rounds, reconnect, share victory and rematch", async ({
  browser,
}) => {
  const errors: string[] = [];
  const aContext = await browser.newContext(),
    bContext = await browser.newContext();
  const a = await aContext.newPage(),
    b = await bContext.newPage();
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  await a.goto("/");
  await expect(
    a.getByRole("button", { name: "Create salvage crew" }),
  ).toBeDisabled();
  await a.screenshot({ path: "artifacts/desktop-start.png", fullPage: true });
  await a.getByLabel("Your callsign").fill("Elijah");
  await a.getByRole("button", { name: "Create salvage crew" }).click();
  await expect(
    a.getByRole("heading", { name: "Your crew. Your competition." }),
  ).toBeVisible();
  await clearHelp(a);
  const code = await a.locator(".room-code strong").innerText();
  await b.goto(`/room/${code}`);
  await b.getByLabel("Your callsign").fill("Lincoln");
  await b.getByRole("button", { name: "Join salvage crew" }).click();
  await expect(b.locator(".captain")).toHaveCount(2);
  await clearHelp(b);
  await a.screenshot({ path: "artifacts/desktop-lobby.png", fullPage: true });
  await a
    .getByRole("button", { name: "Ready to salvage", exact: true })
    .click();
  await b
    .getByRole("button", { name: "Ready to salvage", exact: true })
    .click();
  await a.getByRole("button", { name: "Launch crew" }).click();
  for (let n = 1; n <= 8; n++) {
    for (const p of [a, b])
      await expect(
        p.locator(`main[data-phase="PLANNING"][data-round="${n}"]`),
      ).toBeVisible({ timeout: 50000 });
    if (n === 1) {
      const input = a.getByRole("spinbutton").first();
      await input.fill("2");
      await input.press("Tab");
      await expect(input).toHaveValue("2");
      await input.fill("0");
      await input.press("Tab");
      await overflow(a);
      await a.screenshot({
        path: "artifacts/desktop-planning.png",
        fullPage: true,
      });
    }
    for (const p of [a, b]) await p.getByRole("spinbutton").first().fill("1");
    await a.getByRole("button", { name: /Lock orders ·/ }).click();
    await expect(
      a.getByRole("button", { name: "✓ Orders locked" }),
    ).toBeDisabled();
    if (n === 1) {
      await a.reload();
      await expect(
        a.getByRole("button", { name: "✓ Orders locked" }),
      ).toBeVisible({ timeout: 10000 });
      await expect(a.locator(".roster-player")).toHaveCount(2);
    }
    await b.getByRole("button", { name: /Lock orders ·/ }).click();
    await expect(
      a.locator(`main[data-phase="REVEAL"][data-round="${n}"]`),
    ).toBeVisible({ timeout: 30000 });
    if (n === 1)
      await a.screenshot({
        path: "artifacts/desktop-reveal.png",
        fullPage: true,
      });
  }
  await expect(
    a.getByRole("heading", { name: "The richest haul." }),
  ).toBeVisible({ timeout: 30000 });
  await expect(a.locator(".results-banner")).toContainText("A shared victory.");
  for (const value of await a.locator(".standing .credit").allTextContents())
    expect(parseInt(value)).toBeGreaterThan(0);
  await a.screenshot({ path: "artifacts/desktop-results.png", fullPage: true });
  await expect(b.locator(".results-banner")).toContainText("Elijah & Lincoln");
  await a
    .getByRole("button", { name: "Ready for rematch", exact: true })
    .click();
  await b
    .getByRole("button", { name: "Ready for rematch", exact: true })
    .click();
  await b.getByRole("button", { name: "Return crew to lobby" }).click();
  await expect(a.locator(".captain")).toHaveCount(2);
  await expect(
    b.getByRole("heading", { name: "Your crew. Your competition." }),
  ).toBeVisible();
  await a
    .getByRole("button", { name: "Ready to salvage", exact: true })
    .click();
  await b
    .getByRole("button", { name: "Ready to salvage", exact: true })
    .click();
  await b.getByRole("button", { name: "Launch crew" }).click();
  await expect(
    a.getByRole("heading", { name: "Pick your battles." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await aContext.close();
  await bContext.close();
});
test("mobile controls, keyboard, reduced motion, direct refresh and host migration", async ({
  browser,
}) => {
  const ac = await browser.newContext({
      viewport: { width: 360, height: 800 },
      reducedMotion: "reduce",
    }),
    bc = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await ac.newPage(),
    b = await bc.newPage();
  await a.goto("/");
  await overflow(a);
  await a.getByLabel("Your callsign").fill("Mobile");
  await a.getByRole("button", { name: "Create salvage crew" }).click();
  await clearHelp(a);
  const code = await a.locator(".room-code strong").innerText();
  await b.goto(`/room/${code}`);
  await b.getByLabel("Your callsign").fill("Crewmate");
  await b.getByRole("button", { name: "Join salvage crew" }).click();
  await clearHelp(b);
  await a.screenshot({ path: "artifacts/mobile-lobby.png", fullPage: true });
  await a
    .getByRole("button", { name: "Ready to salvage", exact: true })
    .click();
  await b
    .getByRole("button", { name: "Ready to salvage", exact: true })
    .click();
  await a.getByRole("button", { name: "Launch crew" }).click();
  await expect(
    a.getByRole("heading", { name: "Pick your battles." }),
  ).toBeVisible();
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await a.setViewportSize(viewport);
    await overflow(a);
  }
  await a.setViewportSize({ width: 360, height: 800 });
  await a.screenshot({ path: "artifacts/mobile-planning.png", fullPage: true });
  await a.getByRole("spinbutton").first().focus();
  await a.keyboard.press("ArrowUp");
  await a.getByRole("button", { name: /Lock orders ·/ }).click();
  await a.reload();
  await expect(
    a.getByRole("button", { name: "✓ Orders locked" }),
  ).toBeVisible();
  await b.getByRole("button", { name: /Lock orders ·/ }).click();
  await expect(
    a.getByRole("heading", { name: "Claims on the table." }),
  ).toBeVisible({ timeout: 30000 });
  await a.screenshot({ path: "artifacts/mobile-reveal.png", fullPage: true });
  await a.getByRole("button", { name: "Leave", exact: true }).click();
  await a.getByRole("button", { name: "Leave and forfeit" }).click();
  await expect(
    b.getByRole("button", { name: "Return crew to lobby" }),
  ).toBeVisible();
  await expect(b.locator(".results-banner")).toContainText(
    "LAST CAPTAIN STANDING",
  );
  await b.screenshot({ path: "artifacts/mobile-results.png", fullPage: true });
  await b.getByRole("button", { name: "Return crew to lobby" }).click();
  await expect(b.locator(".captain")).toHaveCount(1);
  await ac.close();
  await bc.close();
});

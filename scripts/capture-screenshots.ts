/**
 * Captures documentation screenshots from the running Guild Hall server.
 * Usage: bun scripts/capture-screenshots.ts [base-url]
 * Default base URL: http://localhost:5050
 */
import puppeteer from "puppeteer-core";
import { join } from "path";

const BASE_URL = process.argv[2] || "http://localhost:5050";
const OUT_DIR = join(import.meta.dirname, "../docs/screenshots");
const VIEWPORT = { width: 1400, height: 900 };

interface Screenshot {
  name: string;
  url: string;
  /** Scroll down this many pixels before capturing */
  scrollY?: number;
  /** Wait for this selector before capturing */
  waitFor?: string;
  /** Take full-page screenshot instead of viewport */
  fullPage?: boolean;
  /** Extra settle time in ms (default 1500) */
  settleMs?: number;
  /** Click checkboxes matching these selectors before capture */
  clickBefore?: string[];
  /** If the commission list is empty, enable the Completed filter */
  enableCompleted?: boolean;
}

const screenshots: Screenshot[] = [
  {
    name: "gh-home",
    url: "/",
    // Briefing loads via SSE/fetch; wait for actual paragraph text
    settleMs: 8000,
  },
  {
    name: "gh-project",
    url: "/projects/guild-hall?tab=artifacts",
  },
  {
    name: "gh-artifacts",
    url: "/projects/guild-hall?tab=artifacts",
  },
  {
    name: "gh-commissions",
    url: "/projects/guild-hall?tab=commissions",
    settleMs: 2000,
    // If no active commissions, tick Completed to show the list
    enableCompleted: true,
  },
  {
    name: "gh-meetings",
    url: "/projects/guild-hall?tab=meetings",
  },
  {
    name: "gh-artifact-detail",
    url: "/projects/guild-hall/artifacts/commissions/commission-Dalton-20260320-070520.md",
    settleMs: 2000,
  },
  {
    name: "gh-commission-detail",
    url: "/projects/guild-hall/commissions/commission-Dalton-20260320-070520",
    settleMs: 2000,
  },
  {
    name: "gh-meeting-active-top",
    url: "/projects/guild-hall/meetings/audience-Guild-Master-20260320-064457",
    settleMs: 2000,
  },
  {
    name: "gh-meeting-active-bottom",
    url: "/projects/guild-hall/meetings/audience-Guild-Master-20260320-064457",
    settleMs: 2000,
    scrollY: 9999,
  },
];

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  for (const shot of screenshots) {
    const url = `${BASE_URL}${shot.url}`;
    console.log(`Capturing ${shot.name} from ${url}`);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });

    if (shot.waitFor) {
      await page.waitForSelector(shot.waitFor, { timeout: 5000 }).catch(() => {
        console.log(`  (selector ${shot.waitFor} not found, capturing anyway)`);
      });
    }

    // Settle time for fonts, images, and async data
    const settle = shot.settleMs ?? 1500;
    await new Promise((r) => setTimeout(r, settle));

    if (shot.clickBefore) {
      for (const selector of shot.clickBefore) {
        await page.click(selector).catch(() => {
          console.log(`  (click target ${selector} not found)`);
        });
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // If commission list is empty, enable Completed filter
    if (shot.enableCompleted) {
      const isEmpty = await page.evaluate(() => {
        return !!document.querySelector("[class*='emptyMessage'], [class*='empty']")
          || document.body.innerText.includes("No commissions match");
      });
      if (isEmpty) {
        console.log("  Enabling Completed filter (no active commissions)");
        // Find the Completed label and click it
        await page.evaluate(() => {
          const labels = Array.from(document.querySelectorAll("label"));
          const completedLabel = labels.find((l) => l.textContent?.includes("Completed"));
          if (completedLabel) {
            const checkbox = completedLabel.querySelector("input[type='checkbox']");
            if (checkbox) (checkbox as HTMLInputElement).click();
          }
        });
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (shot.scrollY) {
      await page.evaluate((y) => window.scrollTo(0, y), shot.scrollY);
      await new Promise((r) => setTimeout(r, 500));
    }

    const pngPath = join(OUT_DIR, `${shot.name}.png`);
    await page.screenshot({
      path: pngPath,
      fullPage: shot.fullPage ?? false,
    });
    console.log(`  Saved ${pngPath}`);
  }

  await browser.close();

  // Convert PNGs to WebP
  console.log("\nConverting to WebP...");
  const { $ } = await import("bun");
  for (const shot of screenshots) {
    const png = join(OUT_DIR, `${shot.name}.png`);
    const webp = join(OUT_DIR, `${shot.name}.webp`);
    await $`cwebp -q 85 ${png} -o ${webp}`.quiet();
    await $`rm ${png}`.quiet();
    console.log(`  ${shot.name}.webp`);
  }

  console.log("\nDone!");
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});

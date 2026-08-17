import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto('https://notam.aero-logic.org/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Accept' }).click();
await page.waitForTimeout(4000);

const paneExists = await page.locator('.notam-pane').count();
const pathsInNotamPane = await page.locator('.notam-pane path').count();
const pathsInOverlay = await page.locator('.leaflet-overlay-pane > svg path').count();
const stroke = await page.locator('.leaflet-overlay-pane path').first().evaluate((el) => getComputedStyle(el).stroke).catch(() => 'n/a');
console.log('.notam-pane elements:', paneExists);
console.log('paths inside .notam-pane:', pathsInNotamPane);
console.log('paths in default overlay pane:', pathsInOverlay);
console.log('computed stroke of first path:', stroke);
await page.screenshot({ path: process.argv[2] + '/prod-check.png' });
await browser.close();

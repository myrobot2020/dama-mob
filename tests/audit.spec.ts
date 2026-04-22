import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['Pixel 5'] }); // Test as mobile

test('Automated Audit: Verify Cloud Data and UI', async ({ page }) => {
  const PROD_URL = 'https://dama-mob-394934218986.asia-south1.run.app';
  const GCS_AUD_BASE = 'https://storage.googleapis.com/damalight-dama-aud';

  // Log browser console
  page.on('console', msg => console.log(`BROWSER [${msg.type()}]: ${msg.text()}`));
  page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));

  // Increase timeout for cold starts
  page.setDefaultTimeout(60000);

  await page.goto(`${PROD_URL}/browse`, { waitUntil: 'networkidle' });

  // 1. Check Nikaya Select
  const nikayaSelect = page.locator('select').first();
  await expect(nikayaSelect).toBeVisible();

  // If the error message is visible, the test should fail with a clear reason
  const errorMsg = page.locator('text=Could not load items');
  if (await errorMsg.isVisible()) {
    const detail = await page.locator('p').nth(1).textContent();
    throw new Error(`Production Build Failure: Index not loading. Details: ${detail}`);
  }

  await expect(nikayaSelect).not.toBeDisabled();

  // 2. Load SN and check Text
  await nikayaSelect.selectOption('SN');

  // Wait for the SN 1.1 link to appear (it's loaded via index.json)
  const sn11Link = page.locator('a', { hasText: 'SN 1.1' }).first();
  await expect(sn11Link).toBeVisible();
  await sn11Link.click();

  // Verify sutta page content
  await expect(page).toHaveURL(/sutta\/SN%201.1/);

  // The sutta text is inside a <p> in CanonQuote
  const text = page.locator('p', { hasText: /"/ }).first();
  await expect(text).toBeVisible();
  const content = await text.textContent();
  expect(content?.length).toBeGreaterThan(50);
  expect(content).not.toContain('valid=false');

  // 3. Audio UI + availability checks
  await expect(page.locator('text=Teacher audio').first()).toBeVisible();

  // If the UI renders an <audio>, it must point at a real object (not a 404).
  // If the UI hides teacher audio for this sutta, that's acceptable too.
  const audio = page.locator('audio');
  const audioCount = await audio.count();
  if (audioCount > 0) {
    const src = await audio.first().getAttribute('src');
    expect(src, 'Expected <audio src> to be present').toBeTruthy();
    expect(src!).toContain('damalight-dama-aud');
    const res = await page.request.head(src!);
    expect(res.ok(), `Expected 2xx for ${src} but got ${res.status()}`).toBeTruthy();
    expect(res.headers()['content-type'] || '').toContain('audio');
  }

  // Sanity-check that the production audio bucket is reachable and contains known sample MP3s.
  const samples = [
    '097_Anguttara Nikaya Book 11 116 - 1116 by Bhante Hye Dhammavuddho Mahathera.mp3',
    '005_Anguttara Nikaya Book 1D 1184 - 12148 by Bhante Hye Dhammavuddho Mahathera.mp3',
  ];
  for (const name of samples) {
    const url = `${GCS_AUD_BASE}/${encodeURIComponent(name)}`;
    const res = await page.request.head(url);
    expect(res.ok(), `Expected 2xx for ${url} but got ${res.status()}`).toBeTruthy();
    expect(res.headers()['content-type'] || '').toContain('audio');
  }

  // 4. Navigation Check - Next Sutta
  // Since we don't have a "Next" button in the provided SuttaByIdScreen (it's in BottomNav or elsewhere?)
  // Let's check BottomNav
  const bottomNav = page.locator('nav');
  await expect(bottomNav).toBeVisible();
});

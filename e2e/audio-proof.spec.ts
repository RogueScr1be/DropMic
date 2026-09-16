import { expect, test, type Page } from '@playwright/test';

type AudioProof = {
  createdUrls: string[];
  fetchedUrls: string[];
  playbackEvents: string[];
  recorderConstructed: number;
  recorderEvents: string[];
  revokedUrls: string[];
};

type NetworkProof = {
  authRequests: string[];
  blockedRequests: string[];
  flowCompletionRequests: string[];
  quickReadRequests: string[];
  revenueCatRequests: string[];
  storageRequests: string[];
};

const fakeOwnerId = '00000000-0000-4000-8000-000000000001';
const fakeAccessToken = 'playwright-local-access-token';

function fakeSessionBody() {
  const now = new Date().toISOString();
  return {
    access_token: fakeAccessToken,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    refresh_token: 'playwright-local-refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
      aud: 'authenticated',
      created_at: now,
      id: fakeOwnerId,
      is_anonymous: true,
      role: 'authenticated',
      updated_at: now,
      user_metadata: {},
    },
  };
}

function fakeMicFlowState() {
  const now = new Date().toISOString();
  return {
    best_flow: 1,
    created_at: now,
    current_flow: 1,
    last_completed_at: now,
    last_qualified_day: now.slice(0, 10),
    last_rewarded_milestone: 0,
    owner_id: fakeOwnerId,
    saves_available: 3,
    timezone: 'America/Chicago',
    updated_at: now,
  };
}

async function installAudioProof(page: Page, stoppedTracks: string[], networkProof: NetworkProof) {
  await page.exposeFunction('__recordTrackStop', (label: string) => {
    stoppedTracks.push(label);
  });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      return route.continue();
    }
    if (url.pathname.includes('/auth/v1/signup') || url.pathname.includes('/auth/v1/token')) {
      networkProof.authRequests.push(url.pathname);
      return route.fulfill({ body: JSON.stringify(fakeSessionBody()), contentType: 'application/json', status: 200 });
    }
    if (url.pathname.includes('/rest/v1/rpc/record_mic_flow_completion')) {
      networkProof.flowCompletionRequests.push(url.pathname);
      return route.fulfill({
        body: JSON.stringify({ state: fakeMicFlowState(), status: 'credited' }),
        contentType: 'application/json',
        status: 200,
      });
    }
    if (url.pathname.includes('/storage/v1/object')) {
      networkProof.storageRequests.push(url.pathname);
    }
    if (url.pathname.includes('quick-read')) {
      networkProof.quickReadRequests.push(url.pathname);
    }
    if (url.hostname.includes('revenuecat')) {
      networkProof.revenueCatRequests.push(url.hostname);
    }
    networkProof.blockedRequests.push(`${url.hostname}${url.pathname}`);
    return route.fulfill({ body: '{}', contentType: 'application/json', status: 503 });
  });
  await page.addInitScript(() => {
    const proof: AudioProof = {
      createdUrls: [],
      fetchedUrls: [],
      playbackEvents: [],
      recorderConstructed: 0,
      recorderEvents: [],
      revokedUrls: [],
    };
    Object.defineProperty(window, '__audioProof', { configurable: true, value: proof });

    const OriginalMediaRecorder = window.MediaRecorder;
    class ProofMediaRecorder extends OriginalMediaRecorder {
      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        super(stream, options);
        proof.recorderConstructed += 1;
      }

      start(timeslice?: number) {
        proof.recorderEvents.push('start');
        return super.start(timeslice);
      }

      pause() {
        proof.recorderEvents.push('pause');
        return super.pause();
      }

      resume() {
        proof.recorderEvents.push('resume');
        return super.resume();
      }

      stop() {
        proof.recorderEvents.push('stop');
        return super.stop();
      }
    }
    window.MediaRecorder = ProofMediaRecorder as typeof MediaRecorder;

    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = createObjectURL(object);
      proof.createdUrls.push(url);
      return url;
    };

    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      proof.revokedUrls.push(url);
      return revokeObjectURL(url);
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('blob:')) {
        proof.fetchedUrls.push(url);
      }
      return originalFetch(input, init);
    };

    const originalMediaPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play() {
      const src = this.currentSrc || this.getAttribute('src') || '';
      if (src.startsWith('blob:')) {
        proof.playbackEvents.push('play');
      }
      return originalMediaPlay.call(this);
    };

    const originalMediaPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function pause() {
      const src = this.currentSrc || this.getAttribute('src') || '';
      if (src.startsWith('blob:')) {
        proof.playbackEvents.push('pause');
      }
      return originalMediaPause.call(this);
    };

    const originalRemoveAttribute = HTMLMediaElement.prototype.removeAttribute;
    HTMLMediaElement.prototype.removeAttribute = function removeAttribute(qualifiedName: string) {
      if (qualifiedName === 'src') {
        const src = this.currentSrc || this.getAttribute('src') || '';
        if (src.startsWith('blob:')) {
          proof.playbackEvents.push('remove-src');
        }
      }
      return originalRemoveAttribute.call(this, qualifiedName);
    };

    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await originalGetUserMedia(constraints);
      for (const track of stream.getTracks()) {
        const originalStop = track.stop.bind(track);
        track.stop = () => {
          void (window as unknown as { __recordTrackStop?: (label: string) => void }).__recordTrackStop?.(track.kind);
          return originalStop();
        };
      }
      return stream;
    };
  });
}

async function reachDurationSelection(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('age-gate')).toBeVisible({ timeout: 5_000 });
  await page.getByRole('checkbox', { name: 'I confirm I am 13 or older' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('topic-reveal')).toBeVisible({ timeout: 5_000 });
  const solariTileCount = await page.getByTestId(/^solari-tile-/).count();
  expect(solariTileCount).toBeGreaterThanOrEqual(50);
  expect(solariTileCount).toBeLessThanOrEqual(60);
  await expect(page.getByRole('switch', { name: /reveal sound/i })).toHaveCount(0);
  await expect(page.getByText(/drop ready/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Let’s Go!' }).click();
  await expect(page.getByTestId('duration-selection')).toBeVisible();
}

async function startThirtySecondRecording(page: Page) {
  await page.getByRole('radio', { name: '30 seconds' }).click();
  await page.getByRole('button', { name: 'Let’s Go!' }).click();
  await expect(page.getByRole('button', { name: 'Cancel countdown' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 8_000 });
}

async function audioProof(page: Page): Promise<AudioProof> {
  return page.evaluate(() => (window as unknown as { __audioProof: AudioProof }).__audioProof);
}

function createNetworkProof(): NetworkProof {
  return {
    authRequests: [],
    blockedRequests: [],
    flowCompletionRequests: [],
    quickReadRequests: [],
    revenueCatRequests: [],
    storageRequests: [],
  };
}

test('runs the local first-use loop and keeps the recording on-device', async ({ page }) => {
  test.setTimeout(120_000);
  const stoppedTracks: string[] = [];
  const networkProof = createNetworkProof();
  await installAudioProof(page, stoppedTracks, networkProof);
  await reachDurationSelection(page);
  await page.getByRole('button', { name: 'Back to prompt' }).click();
  const selectedPrompt = await page.getByLabel(/^Speaking prompt:/).getAttribute('aria-label');
  await page.getByRole('button', { name: 'Let’s Go!' }).click();
  await startThirtySecondRecording(page);

  await expect(page.getByRole('heading', { name: 'Great Job!' })).toBeVisible({ timeout: 40_000 });
  const recordingUri = await page.getByTestId('recording-uri').textContent();
  expect(recordingUri).toMatch(/^blob:/);
  const recordingMetadata = await page.evaluate(async (uri) => {
    const response = await fetch(uri ?? '');
    const blob = await response.blob();
    return { mimeType: blob.type, size: blob.size };
  }, recordingUri);
  expect(recordingMetadata.size).toBeGreaterThan(0);
  expect(recordingMetadata.mimeType).toMatch(/^audio\//);

  const proof = await audioProof(page);
  expect(proof.recorderConstructed).toBe(1);
  expect(proof.recorderEvents.filter((event) => event === 'stop')).toHaveLength(1);
  expect(proof.createdUrls).toContain(recordingUri);
  expect(proof.fetchedUrls).toContain(recordingUri);
  expect(networkProof.flowCompletionRequests).toHaveLength(1);

  await page.getByRole('button', { name: 'Close completed take' }).click();
  await expect(page.getByTestId('topic-reveal')).toBeVisible();
  await expect(page.getByLabel(/^Speaking prompt:/)).toHaveAttribute('aria-label', selectedPrompt ?? '');
  await expect(page.getByTestId('retained-take-card')).toBeVisible();
  await page.getByRole('button', { name: 'Let’s Go!' }).click();
  await expect(page.getByTestId('duration-selection')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You have a saved take.' })).toBeVisible();
  await expect(page.getByTestId('duration-selection').getByRole('button', { name: 'Let’s Go!' })).toHaveCount(0);
  await page.getByRole('radio', { name: '60 seconds' }).click();
  await page.getByRole('button', { exact: true, name: 'Keep Saved Take and Start' }).click();
  await expect(page.getByRole('button', { name: 'Cancel countdown' })).toBeVisible({ timeout: 8_000 });
  expect((await audioProof(page)).revokedUrls).toHaveLength(0);
  expect((await audioProof(page)).recorderEvents.filter((event) => event === 'stop')).toHaveLength(1);
  expect(networkProof.flowCompletionRequests).toHaveLength(1);
  await page.getByRole('button', { name: 'Cancel countdown' }).click();
  await page.getByRole('button', { name: 'Back to prompt' }).click();
  await expect(page.getByTestId('topic-reveal')).toBeVisible();
  await page.getByRole('button', { name: 'Resume Saved Drop' }).click();
  await expect(page.getByRole('heading', { name: 'Great Job!' })).toBeVisible();
  await expect(page.getByTestId('recording-uri')).toHaveText(recordingUri ?? '');
  expect((await audioProof(page)).revokedUrls).toHaveLength(0);
  expect(networkProof.flowCompletionRequests).toHaveLength(1);

  await page.getByRole('button', { name: 'Play Drop' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(async () => (await audioProof(page)).playbackEvents).toContain('play');
  await page.getByRole('button', { name: 'Close completed take' }).click();
  await expect(page.getByTestId('topic-reveal')).toBeVisible();
  await expect.poll(async () => (await audioProof(page)).playbackEvents).toEqual(expect.arrayContaining(['play', 'pause', 'remove-src']));
  await expect(page.getByRole('button', { name: 'Resume Saved Drop' })).toBeVisible();

  await page.getByRole('button', { name: 'Let’s Go!' }).click();
  await expect(page.getByTestId('duration-selection')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You have a saved take.' })).toBeVisible();
  await expect(page.getByTestId('duration-selection').getByRole('button', { name: 'Let’s Go!' })).toHaveCount(0);
  await page.getByRole('radio', { name: '60 seconds' }).click();
  await page.getByRole('button', { exact: true, name: 'Keep Saved Take and Start' }).click();
  await expect(page.getByRole('button', { name: 'Cancel countdown' })).toBeVisible({ timeout: 8_000 });
  expect((await audioProof(page)).revokedUrls).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel countdown' }).click();

  await expect(page.getByTestId('duration-selection')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You have a saved take.' })).toBeVisible();
  await expect(page.getByTestId('duration-selection').getByRole('button', { name: 'Let’s Go!' })).toHaveCount(0);
  await page.getByRole('button', { exact: true, name: 'Delete Take and Start' }).click();
  await expect(page.getByRole('button', { name: 'Cancel countdown' })).toBeVisible({ timeout: 8_000 });
  expect((await audioProof(page)).revokedUrls).toEqual([recordingUri]);
  expect((await audioProof(page)).playbackEvents).toEqual(expect.arrayContaining(['play', 'pause', 'remove-src']));
  expect(networkProof.flowCompletionRequests).toHaveLength(1);
  expect(networkProof.quickReadRequests).toHaveLength(0);
  expect(networkProof.revenueCatRequests).toHaveLength(0);
  expect(networkProof.storageRequests).toHaveLength(0);
});

test('pauses and resumes one recorder without counting paused wall time', async ({ page }) => {
  test.setTimeout(80_000);
  const stoppedTracks: string[] = [];
  const networkProof = createNetworkProof();
  await installAudioProof(page, stoppedTracks, networkProof);
  await reachDurationSelection(page);
  await startThirtySecondRecording(page);

  await page.waitForTimeout(2_000);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  const pausedRemaining = await page.locator('[aria-live="polite"]').first().textContent();
  await page.waitForTimeout(2_000);
  await expect(page.locator('[aria-live="polite"]').first()).toHaveText(pausedRemaining ?? '');
  await page.getByRole('button', { name: 'Resume' }).click();

  await expect(page.getByRole('heading', { name: 'Great Job!' })).toBeVisible({ timeout: 40_000 });
  const proof = await audioProof(page);
  expect(proof.recorderConstructed).toBe(1);
  expect(proof.recorderEvents).toEqual(['start', 'pause', 'resume', 'stop']);
  expect(proof.createdUrls).toHaveLength(1);
  expect(stoppedTracks).toContain('audio');
  expect(networkProof.flowCompletionRequests).toHaveLength(1);
});

test('cancels directly at the hold threshold and preserves early release', async ({ page }) => {
  test.setTimeout(60_000);
  const stoppedTracks: string[] = [];
  const networkProof = createNetworkProof();
  await installAudioProof(page, stoppedTracks, networkProof);
  await reachDurationSelection(page);
  await startThirtySecondRecording(page);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await page.setViewportSize({ height: 390, width: 650 });
  const pausedColumn = await page.getByTestId('paused-control-column').boundingBox();
  const resumeBox = await page.getByRole('button', { name: 'Resume' }).boundingBox();
  const holdBox = await page.getByTestId('hold-to-cancel').boundingBox();
  expect(pausedColumn?.width).toBeGreaterThanOrEqual(260);
  expect(resumeBox?.width).toBeGreaterThanOrEqual(260);
  expect(holdBox?.width).toBeGreaterThanOrEqual(260);
  await expect(page.getByRole('button', { name: 'Hold to Cancel' })).toHaveCount(1);
  await expect(page.getByText('Confirm Cancel')).toHaveCount(0);

  const hold = page.getByTestId('hold-to-cancel');
  const box = await hold.boundingBox();
  expect(box).not.toBeNull();
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  expect((await audioProof(page)).recorderEvents).toEqual(['start', 'pause']);

  const pausedRemaining = await page.locator('[aria-live="polite"]').first().textContent();
  await expect(page.locator('[aria-live="polite"]').first()).toHaveText(pausedRemaining ?? '');
  expect((await audioProof(page)).recorderEvents).toEqual(['start', 'pause']);

  const fullHold = await hold.boundingBox();
  expect(fullHold).not.toBeNull();
  await hold.hover();
  await page.mouse.down();
  await expect(page.getByText('Keep holding to cancel')).toBeVisible();
  await page.waitForTimeout(1_650);
  await expect(page.getByRole('radio', { name: '30 seconds' })).toBeVisible({ timeout: 8_000 });
  await page.mouse.up();
  const proof = await audioProof(page);
  expect(proof.recorderConstructed).toBe(1);
  expect(proof.recorderEvents).toEqual(['start', 'pause', 'stop']);
  expect(proof.createdUrls).toHaveLength(1);
  expect(proof.revokedUrls).toEqual(proof.createdUrls);
  expect(stoppedTracks).toContain('audio');
  expect(networkProof.flowCompletionRequests).toHaveLength(0);
  expect(networkProof.storageRequests).toHaveLength(0);
  await expect(page.getByRole('heading', { name: 'Great Job!' })).toHaveCount(0);
});

test('background interruption and reload stop active media without completion or Flow', async ({ page }) => {
  test.setTimeout(60_000);
  const stoppedTracks: string[] = [];
  const networkProof = createNetworkProof();
  await installAudioProof(page, stoppedTracks, networkProof);
  await reachDurationSelection(page);
  await startThirtySecondRecording(page);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('heading', { name: 'A pause, not a problem.' })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('heading', { name: 'Great Job!' })).toHaveCount(0);
  expect(stoppedTracks).toContain('audio');

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: 'Try this prompt again' }).click();
  await expect(page.getByTestId('topic-reveal')).toBeVisible({ timeout: 8_000 });
  await page.getByRole('button', { name: 'Let’s Go!' }).click();
  await startThirtySecondRecording(page);
  await page.reload();
  await page.waitForTimeout(1_000);
  expect(stoppedTracks.filter((kind) => kind === 'audio').length).toBeGreaterThanOrEqual(2);
  expect(networkProof.flowCompletionRequests).toHaveLength(0);
  expect(networkProof.storageRequests).toHaveLength(0);
});

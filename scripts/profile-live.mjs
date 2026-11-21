import { spawn } from "child_process";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9223;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((item) => item.type === "page");
        if (page && page.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch {
      // wait
    }
    await sleep(200);
  }
  throw new Error("Could not connect to Chrome page debugging target");
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function runProfile(throttleRate) {
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--disable-gpu-sandbox",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  try {
    const wsUrl = await getWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Performance.enable");

    // Apply CPU throttling
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttleRate });

    await cdp.send("Page.navigate", { url: "http://localhost:3000" });
    await sleep(2500);

    // Click "Open Camera" on landing
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const camBtn = btns.find(b => b.textContent && b.textContent.includes('Open Camera'));
        if (camBtn) camBtn.click();
      })()`,
    });

    // Let camera live loop run for 4 seconds to stabilize
    await sleep(4000);

    // Profile for 5 seconds: measure FPS, frame time, heap delta, long tasks
    const profileScript = `
      new Promise((resolve) => {
        let frameTimes = [];
        let lastTime = performance.now();
        let longTasks = [];
        let observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'longtask') {
              longTasks.push({ duration: entry.duration, startTime: entry.startTime });
            }
          }
        });
        try { observer.observe({ entryTypes: ['longtask'] }); } catch (e) {}

        let startMem = performance.memory ? performance.memory.usedJSHeapSize : 0;
        let running = true;
        let count = 0;

        function onFrame() {
          if (!running) return;
          const now = performance.now();
          const dt = now - lastTime;
          lastTime = now;
          if (dt < 2000) frameTimes.push(dt);
          count++;
          requestAnimationFrame(onFrame);
        }
        requestAnimationFrame(onFrame);

        setTimeout(() => {
          running = false;
          try { observer.disconnect(); } catch (e) {}
          let endMem = performance.memory ? performance.memory.usedJSHeapSize : 0;
          let totalTime = frameTimes.reduce((a, b) => a + b, 0);
          let avgFrameTime = frameTimes.length ? totalTime / frameTimes.length : 0;
          let fps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
          resolve({
            fps: Number(fps.toFixed(1)),
            frameCount: count,
            avgFrameTimeMs: Number(avgFrameTime.toFixed(2)),
            minFrameTimeMs: frameTimes.length ? Number(Math.min(...frameTimes).toFixed(2)) : 0,
            maxFrameTimeMs: frameTimes.length ? Number(Math.max(...frameTimes).toFixed(2)) : 0,
            longTaskCount: longTasks.length,
            longTaskTotalMs: Number(longTasks.reduce((a, b) => a + b.duration, 0).toFixed(2)),
            memDeltaMB: Number(((endMem - startMem) / (1024 * 1024)).toFixed(2)),
            totalHeapMB: Number((endMem / (1024 * 1024)).toFixed(2))
          });
        }, 5000);
      })
    `;

    const res = await cdp.send("Runtime.evaluate", {
      expression: profileScript,
      awaitPromise: true,
      returnByValue: true,
    });

    cdp.close();
    return res.result.value;
  } finally {
    chrome.kill("SIGKILL");
  }
}

async function main() {
  console.log("--- Profiling at 4x CPU Throttling ---");
  const p4x = await runProfile(4);
  console.log(JSON.stringify(p4x, null, 2));

  await sleep(1500);

  console.log("--- Profiling at 6x CPU Throttling ---");
  const p6x = await runProfile(6);
  console.log(JSON.stringify(p6x, null, 2));
}

main().catch((err) => {
  console.error("Profiling error:", err);
  process.exit(1);
});

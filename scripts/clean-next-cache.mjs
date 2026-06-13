import fs from 'node:fs'
import path from 'node:path'

const nextDir = path.join(process.cwd(), '.next')

if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true })
  // #region agent log
  fetch('http://127.0.0.1:7695/ingest/1e3be3ad-2fc7-402c-979b-077222451ae4', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd2ce27' },
    body: JSON.stringify({
      sessionId: 'd2ce27',
      location: 'scripts/clean-next-cache.mjs',
      message: 'removed .next cache',
      data: { hadCache: true },
      timestamp: Date.now(),
      hypothesisId: 'E',
      runId: 'pre-dev',
    }),
  }).catch(() => {})
  // #endregion
}

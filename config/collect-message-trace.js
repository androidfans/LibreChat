/** Usage: node config/collect-message-trace.js [conversationId] > message-trace.jsonl */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

async function main() {
  const conversationId = process.argv[2];
  const directory = process.env.LIBRECHAT_LOG_DIR || path.resolve(__dirname, '../logs');
  const records = new Map();
  const requestIds = new Set();
  const operationIds = new Set();
  for (const name of fs.readdirSync(directory).sort()) {
    if (!/^message-trace-.*\.log(?:\.\d+)?(?:\.gz)?$/.test(name)) {
      continue;
    }
    const file = fs.createReadStream(path.join(directory, name));
    const input = name.endsWith('.gz') ? file.pipe(zlib.createGunzip()) : file;
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      const marker = '[message-trace] ';
      const start = line.indexOf(marker);
      if (start < 0) {
        continue;
      }
      try {
        const record = JSON.parse(line.slice(start + marker.length));
        records.set(JSON.stringify(record), record);
      } catch {
        /* Ignore a partially written last line. */
      }
    }
  }
  const entries = [...records.entries()];
  const matches = (line) => !conversationId || line.includes(conversationId);
  // Include request boundaries and DB acknowledgements even if those lines omit the conversation ID.
  for (const [line, record] of entries) {
    if (matches(line)) {
      if (record.requestId) requestIds.add(record.requestId);
      if (record.originRequestId) requestIds.add(record.originRequestId);
      if (record.operationId) operationIds.add(record.operationId);
    }
  }
  for (const [line, record] of entries.sort((a, b) => a[1].at.localeCompare(b[1].at))) {
    if (matches(line) || requestIds.has(record.requestId) || operationIds.has(record.operationId)) {
      process.stdout.write(`${line}\n`);
    }
  }
}

main().catch((error) => {
  console.error(`Unable to collect message traces: ${error.message}`);
  process.exitCode = 1;
});

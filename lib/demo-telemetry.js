import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultPath = path.resolve(__dirname, '..', 'data', 'demo-telemetry.log');
const receptionistDefaultPath = path.resolve(__dirname, '..', 'data', 'receptionist-telemetry.log');

function resolveTelemetryPath() {
  const custom = process.env.DEMO_TELEMETRY_PATH;
  return custom ? path.resolve(custom) : defaultPath;
}

function resolveReceptionistPath() {
  const custom = process.env.RECEPTIONIST_TELEMETRY_PATH;
  return custom ? path.resolve(custom) : receptionistDefaultPath;
}

async function appendJsonLine(filePath, event) {
  const row = JSON.stringify({
    at: new Date().toISOString(),
    ...event
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${row}\n`, 'utf8');
}

export function isDemoTelemetryEnabled() {
  return String(process.env.DEMO_MODE ?? '').toLowerCase() === 'true';
}

export async function recordDemoTelemetry(event = {}) {
  if (!isDemoTelemetryEnabled()) return;
  try {
    await appendJsonLine(resolveTelemetryPath(), event);
  } catch (err) {
    console.warn('[demo-telemetry] write failed', err?.message || err);
  }
}

export async function readDemoTelemetry({ limit = 100 } = {}) {
  const pathToUse = resolveTelemetryPath();
  try {
    const content = await fs.readFile(pathToUse, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    const slice = limit > 0 ? lines.slice(-limit) : lines;
    return slice.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    console.warn('[demo-telemetry] read failed', err?.message || err);
    return [];
  }
}

export async function clearDemoTelemetry() {
  const pathToUse = resolveTelemetryPath();
  try {
    await fs.unlink(pathToUse);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[demo-telemetry] clear failed', err?.message || err);
    }
  }
}

export async function recordReceptionistTelemetry(event = {}) {
  try {
    await appendJsonLine(resolveReceptionistPath(), event);
  } catch (err) {
    console.warn('[receptionist-telemetry] write failed', err?.message || err);
  }
}

export async function readReceptionistTelemetry({ limit = 100 } = {}) {
  const pathToUse = resolveReceptionistPath();
  try {
    const content = await fs.readFile(pathToUse, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    const slice = limit > 0 ? lines.slice(-limit) : lines;
    return slice.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    console.warn('[receptionist-telemetry] read failed', err?.message || err);
    return [];
  }
}

export async function clearReceptionistTelemetry() {
  const pathToUse = resolveReceptionistPath();
  try {
    await fs.unlink(pathToUse);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[receptionist-telemetry] clear failed', err?.message || err);
    }
  }
}


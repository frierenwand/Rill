import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function connectQueue(config, workerName) {
  if (!workerName) throw new Error('Set the Worker name in wrangler.jsonc before building.');
  const queues = config.queues ??= {};
  const producers = queues.producers ??= [];
  let producer = producers.find(({ binding }) => binding === 'RILL_JOBS');
  if (!producer) producers.push(producer = { binding: 'RILL_JOBS' });
  // Queue names have stricter characters and a 63-character limit.
  const safeName = workerName.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-+/, '') || 'rill';
  const name = safeName === workerName && safeName.length <= 58 ? safeName
    : `${safeName.slice(0, 49)}-${createHash('sha256').update(workerName).digest('hex').slice(0, 8)}`;
  producer.queue ??= `${name}-jobs`;
  const consumers = queues.consumers ??= [];
  if (!consumers.some(({ queue }) => queue === producer.queue)) {
    consumers.push({
      queue: producer.queue,
      max_batch_size: 1,
      max_batch_timeout: 1,
      max_retries: 2,
      max_concurrency: 1,
    });
  }
}

export function prepareDeployment(root = process.cwd()) {
  const path = join(root, 'wrangler.jsonc');
  const { config, error } = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  if (error || !config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Cannot prepare deployment: wrangler.jsonc is not valid JSONC.');
  }
  connectQueue(config, config.name);
  for (const [environment, settings] of Object.entries(config.env ?? {})) {
    connectQueue(settings, settings.name ?? `${config.name}-${environment}`);
  }
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  console.log('Rill background queue configured. Deployment will create or reuse it automatically.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Older installations already run typecheck in the downloaded checkout.
  // Its lifecycle hook upgrades their deployment too, without editing the source config.
  const root = process.cwd();
  if (basename(root) === '.rill-build' && existsSync(join(dirname(root), 'wrangler.jsonc'))) {
    try { prepareDeployment(root); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}

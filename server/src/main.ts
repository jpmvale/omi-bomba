/**
 * O processo: HTTP + WebSocket + relógio + persistência, e desligamento
 * gracioso no SIGTERM — é o que faz uma partida atravessar um deploy.
 */

import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createMemoryStore, type RoomStore } from '@omi-bomba/store';
import { createHub, CLOSE_CODES } from './hub.js';
import { createHttpApp } from './http.js';
import { createPersistence } from './persistence.js';
import { createSigner } from './session.js';
import { attachWebSocket } from './ws.js';

const PORT = Number(process.env.PORT ?? 3000);
const REDIS_URL = process.env.REDIS_URL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const VERSION = process.env.OMI_BOMBA_VERSION ?? 'dev';
const PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * O relógio do processo bate mais rápido que o passo do motor (50 ms): quem
 * decide se o passo venceu é a sala, pelo prazo. Batendo a cada 10 ms o atraso
 * de um passo fica em até 10 ms em vez de até 50.
 */
const CLOCK_MS = 10;
const PERSIST_MS = 1_000;

function sessionSecret(): string {
  const configured = process.env.OMI_BOMBA_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (configured) {
    // Curto demais vira segredo adivinhável: melhor não subir do que assinar fraco.
    console.error('OMI_BOMBA_SESSION_SECRET precisa de pelo menos 32 caracteres');
    process.exit(1);
  }
  if (PRODUCTION) {
    console.error('OMI_BOMBA_SESSION_SECRET é obrigatório em produção');
    process.exit(1);
  }
  console.warn('OMI_BOMBA_SESSION_SECRET ausente: usando segredo efêmero. As sessões morrem a cada reinício.');
  return randomBytes(32).toString('hex');
}

async function main(): Promise<void> {
  const store: RoomStore<unknown> = REDIS_URL
    ? (await import('@omi-bomba/store/redis')).createRedisStore({ url: REDIS_URL, versionKey: 'omi-bomba:version' })
    : createMemoryStore();
  if (!REDIS_URL) console.warn('REDIS_URL ausente: store em memória. As salas morrem com o processo.');

  const persistence = createPersistence({
    store,
    onError: (error) => console.error('falha ao persistir sala:', error),
  });

  const hub = createHub({ persistence, randomSeed: () => randomBytes(16).toString('hex') });

  const restored = await persistence.load();
  for (const room of restored) hub.adopt(room);
  if (restored.length > 0) console.log(`recarregadas ${restored.length} sala(s) do store`);

  const signer = createSigner(sessionSecret());

  const app = createHttpApp({
    hub,
    signer,
    clientPath: fileURLToPath(new URL('../../app/build/', import.meta.url)),
    allowedOrigin: ALLOWED_ORIGIN,
    trustProxy: TRUST_PROXY,
    version: VERSION,
  });

  const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`OmiBomba em http://localhost:${info.port}`);
  });

  const ws = attachWebSocket(server, {
    hub,
    signer,
    allowedOrigin: ALLOWED_ORIGIN,
  });

  const clock = setInterval(() => hub.advance(Date.now()), CLOCK_MS);
  const writer = setInterval(() => void persistence.flush(), PERSIST_MS);

  let leaving = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (leaving) return;
    leaving = true;
    console.log(`${signal}: fechando sockets e persistindo salas`);
    clearInterval(clock);
    clearInterval(writer);
    hub.closeAll(CLOSE_CODES.SERVER_RESTART);
    ws.close();
    await persistence.flush();
    await store.close().catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();

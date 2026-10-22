// End-to-end smoke test: the production web build against a real server, played by two
// browsers. Alice and Bob sign up through the app (which signs them in at once), Alice
// challenges Bob, Bob accepts, and they play the game to a result on the board.
//
//   npm run e2e:smoke                  (from app/; needs uv and Chromium for Playwright)
//
// Options (environment variables):
//   E2E_API_PORT, E2E_WEB_PORT   ports for the server and the web build (8000, 8081)
//   E2E_SKIP_BUILD=1             reuse app/dist instead of exporting the web build again
//   E2E_CHROMIUM=/path           a Chromium binary (default: Playwright's own)
//   E2E_HEADED=1                 show the browsers
//
// Moves are chosen by simple fixed rules, so every run plays the same game: the goats offer
// captures and the tigers take them, which ends the game in a few dozen moves. Each move is
// made by clicking the board, as a person would.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = resolve(APP, '../server');
const API_PORT = Number(process.env.E2E_API_PORT ?? 8000);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 8081);
const API = `http://localhost:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const PASSWORD = 'correct horse battery';
const MAX_PLIES = 300;

const work = mkdtempSync(join(tmpdir(), 'baghchal-e2e-'));
const children = [];
let serverLog = '';

function step(text) {
  console.log(`✓ ${text}`);
}

function run(command, args, options) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('exit', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} exited ${code}`)),
    );
  });
}

async function waitFor(check, what, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ── The server ────────────────────────────────────────────────────────────

const serverEnv = {
  ...process.env,
  BAGHCHAL_ENVIRONMENT: 'development',
  BAGHCHAL_DATABASE_URL: `sqlite+aiosqlite:///${join(work, 'e2e.db')}`,
  BAGHCHAL_MAIL_BACKEND: 'console',
  BAGHCHAL_PUBLIC_BASE_URL: WEB,
  BAGHCHAL_ALLOWED_ORIGINS: JSON.stringify([WEB]),
};

async function startServer() {
  await run('uv', ['run', 'alembic', 'upgrade', 'head'], { cwd: SERVER, env: serverEnv });
  const server = spawn(
    'uv',
    ['run', 'uvicorn', 'baghchal_server.asgi:app', '--port', String(API_PORT)],
    { cwd: SERVER, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  children.push(server);
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverLog += chunk;
    });
  }
  await waitFor(
    () =>
      fetch(`${API}/health/ready`)
        .then((r) => r.ok)
        .catch(() => false),
    'the server to start',
  );
  step(`server running at ${API}`);
}

/** The link in the most recent confirmation email to `username` (printed by the console mailer). */
function verificationLink(username) {
  const at = serverLog.lastIndexOf(`Welcome, ${username}!`);
  const match =
    at === -1 ? null : serverLog.slice(at).match(/https?:\/\/\S+\/verify-email\?token=[\w-]{43}/);
  return match?.[0];
}

// ── The web build ─────────────────────────────────────────────────────────

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
};

async function serveWeb() {
  const root = resolve(APP, 'dist');
  if (process.env.E2E_SKIP_BUILD !== '1') {
    await run('npx', ['expo', 'export', '--platform', 'web'], {
      cwd: APP,
      env: { ...process.env, EXPO_PUBLIC_API_URL: API, EXPO_NO_TELEMETRY: '1' },
    });
  }
  // A static host that serves index.html for app routes, as a CDN rewrite would.
  const web = createServer((request, response) => {
    let file;
    try {
      // Resolved inside root, so "/../" (encoded or not) cannot reach other files.
      file = resolve(root, `.${decodeURIComponent(new URL(request.url, WEB).pathname)}`);
    } catch {
      response.writeHead(400).end(); // malformed percent-encoding
      return;
    }
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(404).end();
      return;
    }
    for (const candidate of [file, join(root, 'index.html')]) {
      try {
        const body = readFileSync(candidate);
        response.writeHead(200, {
          'content-type': TYPES[extname(candidate)] ?? 'application/octet-stream',
        });
        response.end(body);
        return;
      } catch {
        // not this one
      }
    }
    response.writeHead(404).end();
  });
  await new Promise((done) => web.listen(WEB_PORT, 'localhost', done));
  children.push({ kill: () => web.close() });
  step(`web build served at ${WEB}`);
}

// ── Board rules for choosing moves (the server checks every move) ────────

const FILES = 'abcde';
const name = (f, r) => `${FILES[f]}${r + 1}`;
const onBoard = (f, r) => f >= 0 && f < 5 && r >= 0 && r < 5;

/** Every jump line on the board: [from, over, to]. */
const JUMPS = [];
for (let f = 0; f < 5; f++) {
  for (let r = 0; r < 5; r++) {
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    if ((f + r) % 2 === 0) directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    for (const [df, dr] of directions) {
      if (onBoard(f + 2 * df, r + 2 * dr)) {
        JUMPS.push([name(f, r), name(f + df, r + dr), name(f + 2 * df, r + 2 * dr)]);
      }
    }
  }
}

function parseBoard(bfen) {
  const board = new Map();
  bfen
    .split(' ')[0]
    .split('/')
    .forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else board.set(name(f++, 4 - i), ch);
      }
    });
  return board;
}

function capturesAfter(board, move) {
  const next = new Map(board);
  const [from, to] = move.includes('-') ? move.split('-') : [null, move];
  if (from) next.delete(from);
  next.set(to, 'G');
  return JUMPS.filter(
    ([a, over, b]) => next.get(a) === 'T' && next.get(over) === 'G' && !next.has(b),
  ).length;
}

/** Goats offer the most captures they can; tigers capture when they can. Ties: first listed. */
function chooseMove(game) {
  const moves = game.legal_moves;
  if (game.side_to_move === 'tiger') return moves.find((m) => m.includes('x')) ?? moves[0];
  const board = parseBoard(game.position);
  let best = moves[0];
  let most = -1;
  for (const move of moves) {
    const captures = capturesAfter(board, move);
    if (captures > most) [best, most] = [move, captures];
  }
  return best;
}

// ── The players ───────────────────────────────────────────────────────────

const visible = (locator) => locator.filter({ visible: true });

async function signUp(browser, username) {
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', (e) => console.error(`[${username}] page error:`, e.message));
  await page.goto(`${WEB}/sign-up`);
  await visible(page.getByLabel('Username', { exact: true })).fill(username);
  await visible(page.getByLabel('Email', { exact: true })).fill(`${username}@example.com`);
  await visible(page.getByLabel('Password', { exact: true })).fill(PASSWORD);
  await visible(page.getByRole('button', { name: 'Sign up', exact: true })).click();
  await page.waitForURL(/\/make-it-yours/);
  await waitFor(() => verificationLink(username), `${username}'s email`);
  await page.goto(WEB);
  await visible(page.getByRole('heading', { name: 'Play' })).first().waitFor();
  step(`${username} signed up, signed in at once, and was sent the optional email`);
  return page;
}

/** The game as the server sees it, fetched with the player's own session. */
function fetchGame(page, id) {
  return page.evaluate(
    async (url) => (await fetch(url, { credentials: 'include' })).json(),
    `${API}/api/v1/games/${id}`,
  );
}

async function clickPoint(page, point) {
  await visible(page.getByRole('button', { name: new RegExp(`^${point}, `) })).click();
}

async function play(page, game, move) {
  const [from, to] = move.split(/[-x]/);
  if (to === undefined) await clickPoint(page, from);
  else {
    await clickPoint(page, from);
    await clickPoint(page, to);
  }
  await waitFor(
    async () => (await fetchGame(page, game.id)).ply > game.ply,
    `the server to accept ${move}`,
  );
}

async function main() {
  await startServer();
  await serveWeb();
  const browser = await chromium.launch({
    headless: process.env.E2E_HEADED !== '1',
    ...(process.env.E2E_CHROMIUM && { executablePath: process.env.E2E_CHROMIUM }),
  });
  try {
    const alice = await signUp(browser, 'alice');
    const bob = await signUp(browser, 'bob');

    await visible(alice.getByRole('button', { name: 'Challenge bob' })).click();
    await visible(alice.getByRole('radio', { name: '15+10' })).click();
    await visible(alice.getByRole('radio', { name: 'Casual' })).click();
    await visible(alice.getByRole('radio', { name: 'Goats' })).click();
    await visible(alice.getByRole('button', { name: 'Send challenge' })).click();
    await visible(bob.getByText('alice challenges you')).waitFor();
    step('bob received the challenge live');
    await visible(bob.getByRole('button', { name: "Accept alice's challenge" })).click();

    for (const page of [alice, bob]) await page.waitForURL(/\/game\//);
    const id = new URL(alice.url()).pathname.split('/').pop();
    if (new URL(bob.url()).pathname !== `/game/${id}`)
      throw new Error('players are in different games');
    step(`both players are in game ${id}`);

    const players = { goat: alice, tiger: bob };
    let game = await fetchGame(alice, id);
    while (game.status === 'active') {
      if (game.ply >= MAX_PLIES) throw new Error(`no result after ${MAX_PLIES} moves`);
      const page = players[game.side_to_move];
      await play(page, game, chooseMove(game));
      game = await fetchGame(alice, id);
    }
    step(`game over after ${game.ply} moves: ${game.result.winner} won (${game.result.reason})`);

    const [aliceSees, bobSees] = await Promise.all(
      [alice, bob].map((page) => visible(page.getByText(/^You (won|lost)/)).textContent()),
    );
    step(`alice sees "${aliceSees}"; bob sees "${bobSees}"`);
    if (!/^You lost/.test(aliceSees) || !/^You won/.test(bobSees)) {
      throw new Error('the players were not shown the right results');
    }
    const boards = await Promise.all(
      [alice, bob].map((page) =>
        visible(page.getByRole('button', { name: /^[a-e][1-5], (tiger|goat)/ })).evaluateAll(
          (els) =>
            els
              .map((e) => e.getAttribute('aria-label').split(', ').slice(0, 2).join(' '))
              .sort()
              .join(', '),
        ),
      ),
    );
    if (boards[0] !== boards[1]) throw new Error(`the boards differ:\n${boards.join('\n')}`);
    step(`both boards show the final position: ${boards[0]}`);
    console.log('\nEnd-to-end smoke test passed.');
  } finally {
    await browser.close();
  }
}

let failed = false;
try {
  await main();
} catch (error) {
  failed = true;
  console.error(`\n✗ ${error.message}`);
  if (serverLog) console.error(`\nLast server output:\n${serverLog.slice(-3000)}`);
} finally {
  for (const child of children) child.kill();
  rmSync(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

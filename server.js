import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { WebSocketServer, WebSocket } from 'ws';
import { consumeCameraToken, sessionTokenMode } from './session-policy.js';
import { photoExtension, safeFolderName } from './storage-policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 10 * 60 * 1000);

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir, { fallthrough: false, index: false, maxAge: '1h' }));

const sessions = new Map();

function token(bytes = 24) { return crypto.randomBytes(bytes).toString('base64url'); }
function roomCode() { return crypto.randomBytes(5).toString('hex').slice(0, 8).toUpperCase(); }
function tokensEqual(actual, supplied) {
  const expected = Buffer.from(actual);
  const received = Buffer.from(supplied);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
function pruneSessions() {
  const now = Date.now();
  for (const [room, s] of sessions) {
    if (s.expiresAt <= now && !s.camera && !s.controller) sessions.delete(room);
  }
}

app.get('/health', (_req, res) => {
  pruneSessions();
  res.json({ ok: true, sessions: sessions.size, ts: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  const base = process.env.PUBLIC_BASE_URL || `${protocol}://${req.get('host')}`;
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || ''
    });
  }
  res.json({ baseUrl: base.replace(/\/$/, ''), iceServers, sessionTtlMs: SESSION_TTL_MS });
});

app.post('/api/session', (req, res) => {
  pruneSessions();
  let room;
  do { room = roomCode(); } while (sessions.has(room));
  const session = {
    room,
    controllerToken: token(),
    cameraToken: token(),
    cameraTokenConsumed: false,
    tokenMode: sessionTokenMode(req.body?.reusable),
    project: safeFolderName(req.body?.project),
    area: safeFolderName(req.body?.area),
    expiresAt: Date.now() + SESSION_TTL_MS,
    camera: null,
    controller: null
  };
  sessions.set(room, session);
  res.status(201).json({
    room,
    controllerToken: session.controllerToken,
    cameraToken: session.cameraToken,
    tokenMode: session.tokenMode,
    expiresAt: new Date(session.expiresAt).toISOString()
  });
});

app.post('/api/photos', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '20mb' }), (req, res) => {
  const room = String(req.get('x-room') || '').toUpperCase();
  const suppliedToken = String(req.get('x-controller-token') || '');
  const project = safeFolderName(req.get('x-project'));
  const area = safeFolderName(req.get('x-area'));
  const session = sessions.get(room);
  if (!session || Date.now() >= session.expiresAt || !tokensEqual(session.controllerToken, suppliedToken)) return res.status(401).json({ message: 'Sessione non autorizzata.' });
  if (!project || !area || session.project !== project || session.area !== area) return res.status(400).json({ message: 'Area di intervento non valida per la sessione.' });
  if (!req.body?.length) return res.status(400).json({ message: 'Foto non valida.' });
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${photoExtension(req.get('content-type'))}`;
  const folder = path.join(uploadsDir, project, area);
  fs.mkdirSync(folder, { recursive: true, mode: 0o750 });
  fs.writeFileSync(path.join(folder, filename), req.body, { mode: 0o640 });
  res.status(201).json({ url: `/uploads/${encodeURIComponent(project)}/${encodeURIComponent(area)}/${filename}` });
});

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text || text.length > 2048) return res.status(400).send('Invalid text');
  try {
    const png = await QRCode.toBuffer(text, { width: 360, margin: 2, errorCorrectionLevel: 'M' });
    res.type('png').send(png);
  } catch {
    res.status(500).send('QR generation failed');
  }
});

const tlsCert = process.env.TLS_CERT;
const tlsKey = process.env.TLS_KEY;
const server = tlsCert && tlsKey
  ? https.createServer({ cert: fs.readFileSync(tlsCert), key: fs.readFileSync(tlsKey) }, app)
  : http.createServer(app);

const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });

function safeSend(ws, message) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function relayPeer(ws, message) {
  const session = sessions.get(ws.room);
  if (!session) return;
  const peer = ws.role === 'camera' ? session.controller : session.camera;
  safeSend(peer, message);
}

function sendSessionStatus(session) {
  const payload = {
    type: 'session-status',
    camera: Boolean(session.camera),
    controller: Boolean(session.controller),
    expiresAt: new Date(session.expiresAt).toISOString()
  };
  safeSend(session.camera, payload);
  safeSend(session.controller, payload);
}

function authenticateJoin(ws, msg) {
  const room = String(msg.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  const role = msg.role === 'camera' ? 'camera' : msg.role === 'controller' ? 'controller' : null;
  const suppliedToken = String(msg.token || '');
  const session = sessions.get(room);
  if (!room || !role || !session) return { error: 'Sessione non valida o scaduta.' };
  if (Date.now() >= session.expiresAt) return { error: 'Sessione scaduta.' };

  if (role === 'controller') {
    if (!tokensEqual(session.controllerToken, suppliedToken)) {
      return { error: 'Token controller non valido.' };
    }
  } else {
    if (session.tokenMode === 'one-time' && session.cameraTokenConsumed) return { error: 'Token camera già utilizzato. Crea una nuova sessione.' };
    if (!tokensEqual(session.cameraToken, suppliedToken)) {
      return { error: 'Token camera non valido.' };
    }
    consumeCameraToken(session);
    if (session.tokenMode === 'one-time') session.cameraToken = token(); // invalida immediatamente il token condiviso nel QR
  }

  if (session[role] && session[role] !== ws) {
    safeSend(session[role], { type: 'replaced' });
    session[role].close(4001, 'Replaced');
  }
  session[role] = ws;
  ws.room = room;
  ws.role = role;
  return { session };
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data, isBinary) => {
    if (isBinary) return; // media/foto viaggiano sul WebRTC DataChannel
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'join') {
      const auth = authenticateJoin(ws, msg);
      if (auth.error) {
        safeSend(ws, { type: 'error', message: auth.error });
        return ws.close(4003, auth.error);
      }
      safeSend(ws, { type: 'joined', room: ws.room, role: ws.role });
      sendSessionStatus(auth.session);
      return;
    }

    if (!ws.room || !ws.role) return;
    const relayTypes = new Set(['webrtc-offer', 'webrtc-answer', 'ice-candidate']);
    if (relayTypes.has(msg.type)) relayPeer(ws, { ...msg, from: ws.role });
  });

  ws.on('close', () => {
    if (!ws.room || !ws.role) return;
    const session = sessions.get(ws.room);
    if (!session) return;
    if (session[ws.role] === ws) session[ws.role] = null;
    sendSessionStatus(session);
    if (Date.now() >= session.expiresAt && !session.camera && !session.controller) sessions.delete(ws.room);
  });
});

const heartbeat = setInterval(() => {
  pruneSessions();
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeat));
server.listen(port, '0.0.0.0', () => {
  const scheme = tlsCert && tlsKey ? 'https' : 'http';
  console.log(`Remote Camera v2 listening on ${scheme}://0.0.0.0:${port}`);
});

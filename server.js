import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { WebSocketServer, WebSocket } from 'ws';
import archiver from 'archiver';
import { authorizePhotoUpload, createAllowedSessionAreas, createSessionBinding, createSessionStorageBinding } from './session-policy.js';
import { photoProjectStorageName, photoStorageDirectory, safeCaptureId, safeFolderName } from './storage-policy.js';
import { savePhotoFile } from './photo-storage.js';
import { canDownloadProject, consumeDownloadTicket, issueDownloadTicket, projectArchiveName, projectArchiveRoot } from './project-download.js';
import { activePeerCount, CAMERA_ROLE, CENTRAL_ROLE, MOBILE_ROLE, normalizedRole, signalTargetRole } from './session-peers.js';
import { publicStaticOptions } from './static-options.js';
import { mergeWorkspaces, readWorkspace, writeWorkspace } from './workspace-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 10 * 60 * 1000);
const FIELD_SESSION_TTL_MS = Number(process.env.FIELD_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000);

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public'), publicStaticOptions));
const uploadsDir = photoStorageDirectory(process.env.PHOTO_STORAGE_DIR, path.join(__dirname, 'uploads'));
const workspaceFile = path.resolve(process.env.WORKSPACE_STORAGE_FILE || path.join(__dirname, 'data', 'workspace.json'));
app.use('/uploads', express.static(uploadsDir, { fallthrough: false, index: false, maxAge: '1h' }));

const sessions = new Map();
const downloadTickets = new Map();
const mobileCommandTypes = new Set(['capture', 'set-zoom', 'set-torch', 'autofocus', 'set-focus-distance', 'focus-at-point', 'set-flash-mode', 'get-camera-info']);

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
    if (s.expiresAt <= now && !activePeerCount(s)) sessions.delete(room);
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

app.get('/api/workspace', (_req, res) => {
  try { res.json(readWorkspace(workspaceFile)); }
  catch { res.status(500).json({ message: 'Impossibile leggere l’archivio dei progetti.' }); }
});

app.post('/api/workspace/sync', (req, res) => {
  try {
    const workspace = mergeWorkspaces(readWorkspace(workspaceFile), req.body);
    res.json(writeWorkspace(workspaceFile, workspace));
  } catch (error) {
    console.error('Workspace sync failed:', error);
    const message = error?.code === 'EACCES' || error?.code === 'EROFS'
      ? 'Archivio server non scrivibile. Verifica i permessi della cartella data.'
      : 'Impossibile sincronizzare l’archivio dei progetti.';
    res.status(500).json({ message });
  }
});

function saveFieldPhotoMetadata(project, areaName, captureId, url, size) {
  try {
    const workspace = readWorkspace(workspaceFile);
    const area = workspace.areasByProject[project]?.find(item => item.name === areaName);
    if (!area) return;
    area.photos ||= [];
    if (area.photos.some(photo => photo.id === captureId || photo.url === url)) return;
    area.photos.push({ id: captureId, url, size, createdAt: new Date().toISOString() });
    writeWorkspace(workspaceFile, workspace);
  } catch (error) { console.error('Field photo metadata failed:', error); }
}

function findFieldPhotoMetadata(project, areaName, captureId) {
  try {
    return readWorkspace(workspaceFile).areasByProject[project]
      ?.find(item => item.name === areaName)?.photos?.find(photo => photo.id === captureId) || null;
  } catch { return null; }
}

app.post('/api/session', (req, res) => {
  pruneSessions();
  const binding = createSessionBinding(safeFolderName(req.body?.project), safeFolderName(req.body?.area));
  const storageBinding = createSessionStorageBinding(req.body?.workProfile, req.body?.location);
  if (!binding) return res.status(400).json({ message: 'Progetto e area di intervento validi sono obbligatori.' });
  if (!storageBinding) return res.status(400).json({ message: 'Traliccio, faccia e nodo Maradona non validi.' });
  const requestedAreas = createAllowedSessionAreas(binding.project, req.body?.areas, storageBinding.workProfile);
  const activeArea = requestedAreas.find(item => item.name === binding.area) || { name: binding.area, location: storageBinding.location };
  const allowedAreas = requestedAreas.length ? requestedAreas : [activeArea];
  if (!allowedAreas.some(item => item.name === binding.area)) allowedAreas.unshift(activeArea);
  const localMode = req.body?.localMode === true;
  let room;
  do { room = roomCode(); } while (sessions.has(room));
  const session = {
    room,
    controllerToken: token(),
    mobileControllerToken: token(),
    cameraToken: token(),
    project: binding.project,
    area: binding.area,
    workProfile: storageBinding.workProfile,
    location: storageBinding.location,
    allowedAreas,
    localMode,
    savedCaptures: new Map(),
    expiresAt: Date.now() + (localMode ? FIELD_SESSION_TTL_MS : SESSION_TTL_MS),
    camera: null,
    [CENTRAL_ROLE]: null,
    [MOBILE_ROLE]: null,
    activeArea: binding.area
  };
  sessions.set(room, session);
  res.status(201).json({
    room,
    project: session.project,
    area: session.area,
    controllerToken: session.controllerToken,
    mobileControllerToken: session.mobileControllerToken,
    cameraToken: session.cameraToken,
    localMode: session.localMode,
    expiresAt: new Date(session.expiresAt).toISOString()
  });
});

app.post('/api/photos', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '20mb' }), (req, res) => {
  const room = String(req.get('x-room') || '').toUpperCase();
  const suppliedControllerToken = String(req.get('x-controller-token') || '');
  const suppliedCameraToken = String(req.get('x-camera-token') || '');
  const project = safeFolderName(req.get('x-project'));
  const area = safeFolderName(req.get('x-area'));
  const session = sessions.get(room);
  const authorization = authorizePhotoUpload(session, { project, area, controllerToken: suppliedControllerToken, cameraToken: suppliedCameraToken }, tokensEqual);
  if (!authorization) return res.status(401).json({ message: 'Sessione o punto foto non autorizzato.' });
  if (!req.body?.length) return res.status(400).json({ message: 'Foto non valida.' });
  const captureId = safeCaptureId(req.get('x-capture-id'));
  if (!captureId) return res.status(400).json({ message: 'Identificatore scatto non valido.' });
  const persisted = authorization.role === 'camera' ? findFieldPhotoMetadata(project, area, captureId) : null;
  if (persisted) return res.status(200).json({ url: persisted.url });
  const storageSession = authorization.role === 'camera' ? { ...session, area: authorization.area.name, location: authorization.area.location } : session;
  const captureKey = `${session.project}\0${area}\0${captureId}`;
  const previous = session.savedCaptures.get(captureKey);
  if (previous) return res.status(200).json(previous);
  try {
    const saved = savePhotoFile(uploadsDir, storageSession, req.get('content-type'), req.body);
    session.savedCaptures.set(captureKey, saved);
    if (authorization.role === 'camera') saveFieldPhotoMetadata(session.project, area, captureId, saved.url, req.body.length);
    res.status(201).json(saved);
  }
  catch (error) { console.error('Photo storage failed:', error); res.status(500).json({ message: 'Salvataggio foto non riuscito.' }); }
});

function authorizedDownloadProject(req) {
  const project = safeFolderName(req.params.project);
  const room = String(req.get('x-room') || '').toUpperCase();
  const suppliedToken = String(req.get('x-controller-token') || '');
  const session = sessions.get(room);
  return project && canDownloadProject(session, project, suppliedToken, tokensEqual)
    ? { project, storageProject: photoProjectStorageName(session) }
    : null;
}

function streamProjectArchive(res, storageProject) {
  const projectDir = projectArchiveRoot(uploadsDir, storageProject);
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return res.status(404).json({ message: 'Il progetto non contiene foto archiviate.' });
  }

  res.attachment(projectArchiveName(storageProject));
  res.type('application/zip');
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('warning', error => console.warn('Project archive warning:', error));
  archive.on('error', error => { console.error('Project archive failed:', error); res.destroy(error); });
  archive.pipe(res);
  archive.directory(projectDir, storageProject);
  void archive.finalize();
}

app.post('/api/projects/:project/download-ticket', (req, res) => {
  const authorization = authorizedDownloadProject(req);
  if (!authorization) return res.status(401).json({ message: 'Download progetto non autorizzato.' });
  const projectDir = projectArchiveRoot(uploadsDir, authorization.storageProject);
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) return res.status(404).json({ message: 'Il progetto non contiene foto archiviate.' });
  const ticket = issueDownloadTicket(downloadTickets, authorization.storageProject, () => token(24));
  res.json({ url: `/api/project-downloads/${encodeURIComponent(ticket)}` });
});

app.get('/api/project-downloads/:ticket', (req, res) => {
  const project = consumeDownloadTicket(downloadTickets, String(req.params.ticket || ''));
  if (!project) return res.status(401).json({ message: 'Link di download non valido o scaduto.' });
  return streamProjectArchive(res, project);
});

app.post('/api/projects/:project/download', (req, res) => {
  const authorization = authorizedDownloadProject(req);
  if (!authorization) return res.status(401).json({ message: 'Download progetto non autorizzato.' });
  return streamProjectArchive(res, authorization.storageProject);
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
  const peer = ws.role === CAMERA_ROLE ? session[message.targetRole] : session.camera;
  safeSend(peer, message);
}

function eachController(session, message) {
  safeSend(session[CENTRAL_ROLE], message);
  safeSend(session[MOBILE_ROLE], message);
}

function sendSessionStatus(session) {
  const payload = {
    type: 'session-status',
    camera: Boolean(session.camera),
    controller: Boolean(session[CENTRAL_ROLE]),
    mobileController: Boolean(session[MOBILE_ROLE]),
    activeArea: session.activeArea,
    project: session.project,
    areas: session.localMode ? session.allowedAreas.map(area => ({ name: area.name })) : undefined,
    expiresAt: new Date(session.expiresAt).toISOString()
  };
  safeSend(session.camera, payload);
  eachController(session, payload);
}

function authenticateJoin(ws, msg) {
  const room = String(msg.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  const role = normalizedRole(msg.role);
  const suppliedToken = String(msg.token || '');
  const session = sessions.get(room);
  if (!room || !role || !session) return { error: 'Sessione non valida o scaduta.' };
  if (Date.now() >= session.expiresAt) return { error: 'Sessione scaduta.' };

  if (role === CENTRAL_ROLE || role === MOBILE_ROLE) {
    const expectedToken = role === CENTRAL_ROLE ? session.controllerToken : session.mobileControllerToken;
    if (!tokensEqual(expectedToken, suppliedToken)) {
      return { error: 'Token controller non valido.' };
    }
  } else {
    if (!tokensEqual(session.cameraToken, suppliedToken)) {
      return { error: 'Token camera non valido.' };
    }
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
    const session = sessions.get(ws.room);
    if (!session) return;
    const relayTypes = new Set(['webrtc-offer', 'webrtc-answer', 'ice-candidate']);
    if (relayTypes.has(msg.type)) {
      if (ws.role === CAMERA_ROLE) {
        msg.targetRole = signalTargetRole(ws.role, msg.targetRole);
        if (!msg.targetRole) return;
      } else msg.targetRole = ws.role;
      relayPeer(ws, { ...msg, from: ws.role });
    } else if (msg.type === 'session-area' && (ws.role === CENTRAL_ROLE || (ws.role === CAMERA_ROLE && session.localMode))) {
      const area = safeFolderName(msg.area);
      if (!area) return safeSend(ws, { type: 'command-error', message: 'Area di intervento non valida.' });
      const allowedArea = session.allowedAreas.find(item => item.name === area);
      if (session.localMode && !allowedArea) return safeSend(ws, { type: 'command-error', message: 'Punto foto non autorizzato.' });
      const storageBinding = allowedArea || createSessionStorageBinding(session.workProfile, msg.location);
      if (!storageBinding) return safeSend(ws, { type: 'command-error', message: 'Traliccio, faccia e nodo Maradona non validi.' });
      session.area = area;
      session.location = storageBinding.location;
      session.activeArea = area;
      sendSessionStatus(session);
    } else if (msg.type === 'photo-saved' && ws.role === CENTRAL_ROLE) {
      eachController(session, { type: 'photo-saved', area: session.activeArea, photo: msg.photo || null });
    } else if (msg.type === 'controller-command' && ws.role === MOBILE_ROLE) {
      if (!mobileCommandTypes.has(msg.command?.type) || !session.camera) return safeSend(ws, { type: 'command-error', message: 'Comando non disponibile.' });
      if (msg.command.type === 'capture' && !session.activeArea) return safeSend(ws, { type: 'command-error', message: 'Il controller centrale deve selezionare un’area.' });
      safeSend(session.camera, { type: 'camera-command', command: msg.command });
    } else if (msg.type === 'camera-command-result' && ws.role === CAMERA_ROLE) {
      safeSend(session[MOBILE_ROLE], { type: 'command-result', ...msg.result });
    }
  });

  ws.on('close', () => {
    if (!ws.room || !ws.role) return;
    const session = sessions.get(ws.room);
    if (!session) return;
    if (session[ws.role] === ws) session[ws.role] = null;
    sendSessionStatus(session);
    if (Date.now() >= session.expiresAt && !activePeerCount(session)) sessions.delete(ws.room);
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

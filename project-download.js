import path from 'node:path';

export function canDownloadProject(session, project, suppliedToken, tokensEqual, now = Date.now()) {
  return Boolean(
    session &&
    session.project === project &&
    now < session.expiresAt &&
    tokensEqual(session.controllerToken, suppliedToken)
  );
}

export function projectArchiveName(project) {
  return `${project}.zip`;
}

export function projectArchiveRoot(uploadsDir, project) {
  return path.join(uploadsDir, project);
}

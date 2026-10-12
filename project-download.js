import path from 'node:path';

export const DOWNLOAD_TICKET_TTL_MS = 60 * 1000;

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

export function issueDownloadTicket(tickets, project, generateToken, now = Date.now()) {
  for (const [key, record] of tickets) if (now >= record.expiresAt) tickets.delete(key);
  let ticket;
  do { ticket = generateToken(); } while (tickets.has(ticket));
  tickets.set(ticket, { project, expiresAt: now + DOWNLOAD_TICKET_TTL_MS });
  return ticket;
}

export function consumeDownloadTicket(tickets, ticket, now = Date.now()) {
  const record = tickets.get(ticket);
  tickets.delete(ticket);
  return record && now < record.expiresAt ? record.project : '';
}

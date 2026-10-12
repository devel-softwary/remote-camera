import assert from 'node:assert/strict';
import { DOWNLOAD_TICKET_TTL_MS, canDownloadProject, consumeDownloadTicket, issueDownloadTicket, projectArchiveName, projectArchiveRoot } from '../project-download.js';

const session = { project: 'Traliccio A', controllerToken: 'controller-token', expiresAt: 2_000 };
const tokensEqual = (actual, supplied) => actual === supplied;

assert.equal(canDownloadProject(session, 'Traliccio A', 'controller-token', tokensEqual, 1_999), true);
assert.equal(canDownloadProject(session, 'Altro progetto', 'controller-token', tokensEqual, 1_999), false);
assert.equal(canDownloadProject(session, 'Traliccio A', 'wrong-token', tokensEqual, 1_999), false);
assert.equal(canDownloadProject(session, 'Traliccio A', 'controller-token', tokensEqual, 2_000), false);
assert.equal(projectArchiveName('Traliccio A'), 'Traliccio A.zip');
assert.equal(projectArchiveRoot('/srv/uploads', 'Traliccio A'), '/srv/uploads/Traliccio A');

const tickets = new Map();
const ticket = issueDownloadTicket(tickets, 'Traliccio A', () => 'ticket-1', 10_000);
assert.equal(ticket, 'ticket-1');
assert.equal(consumeDownloadTicket(tickets, ticket, 10_000 + DOWNLOAD_TICKET_TTL_MS - 1), 'Traliccio A');
assert.equal(consumeDownloadTicket(tickets, ticket, 10_001), '');
const expiredTicket = issueDownloadTicket(tickets, 'Traliccio A', () => 'ticket-2', 20_000);
assert.equal(consumeDownloadTicket(tickets, expiredTicket, 20_000 + DOWNLOAD_TICKET_TTL_MS), '');

console.log('Project download regression passed');

import fs from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import archiver from 'archiver';
import { MARADONA_WORK_PROFILE, normalizeMaradonaLocation, normalizeWorkProfile } from './public/work-profile.js';

const DEFAULT_TEMPLATE = new URL('./docs/scheda-rilievo-nodo-bullonato-traliccio-acciaio.xlsx', import.meta.url);
const MAX_TEMPLATE_ENTRIES = 100;
const MAX_TEMPLATE_ENTRY_SIZE = 10 * 1024 * 1024;
const PHOTO_SLOTS = [
  { link: 'B16', name: 'B28' }, { link: 'G16', name: 'G28' }, { link: 'L16', name: 'L28' },
  { link: 'B30', name: 'B42' }, { link: 'G30', name: 'G42' }, { link: 'L30', name: 'L42' }
];

function xml(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function endOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

export function readXlsxEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('Modello Excel non valido.');
  const end = endOfCentralDirectory(buffer);
  if (end < 0) throw new Error('Indice del modello Excel non valido.');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (count > MAX_TEMPLATE_ENTRIES) throw new Error('Il modello Excel contiene troppi file.');
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Voce del modello Excel non valida.');
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if ((flags & 1) || ![0, 8].includes(method) || size > MAX_TEMPLATE_ENTRY_SIZE || !name || name.startsWith('/') || name.includes('..')) throw new Error('Contenuto del modello Excel non sicuro.');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('File del modello Excel non valido.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);
    if (data.length !== size) throw new Error('File del modello Excel incompleto.');
    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function replaceCell(sheet, reference, value) {
  const pattern = new RegExp(`<c\\b([^>]*\\br="${reference}"[^>]*)(?:\\s*/>|>[\\s\\S]*?<\\/c>)`);
  const match = sheet.match(pattern);
  if (!match) throw new Error(`Cella ${reference} assente nel modello Excel.`);
  const style = match[1].match(/\bs="(\d+)"/)?.[1];
  const cell = `<c r="${reference}"${style ? ` s="${style}"` : ''} t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
  return sheet.replace(pattern, cell);
}

export function nodeExcelFilename(location) {
  const value = normalizeMaradonaLocation(location);
  return value ? `${value.tower}_${value.face}_${value.node}.xlsx` : '';
}

export function maradonaNodeArea(session, areaName) {
  if (normalizeWorkProfile(session?.workProfile).type !== MARADONA_WORK_PROFILE) return null;
  const area = session?.allowedAreas?.find(item => item.name === areaName)
    || (session?.area === areaName ? { name: areaName, location: session.location } : null);
  const location = normalizeMaradonaLocation(area?.location);
  return area && location ? { name: area.name, location } : null;
}

export function formatSurveyDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Data rilievo non valida.');
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function fillNodeTemplateWorksheet(template, { jobCode = 'XXXX', location, photos = [], surveyDate = new Date() }) {
  const value = normalizeMaradonaLocation(location);
  if (!value) throw new Error('Nodo Maradona non valido.');
  let sheet = String(template || '');
  sheet = replaceCell(sheet, 'C5', jobCode);
  sheet = replaceCell(sheet, 'H5', value.tower);
  sheet = replaceCell(sheet, 'F6', `${value.face} ${value.node.slice(1)}`);
  sheet = replaceCell(sheet, 'K7', formatSurveyDate(surveyDate));
  sheet = replaceCell(sheet, 'N7', 'SMARIG SRL');
  sheet = sheet.replace('sqref="F6"', 'sqref="K6"');
  const hyperlinks = [];
  photos.slice(0, PHOTO_SLOTS.length).forEach((photo, index) => {
    const slot = PHOTO_SLOTS[index];
    sheet = replaceCell(sheet, slot.link, photo.publicUrl);
    sheet = replaceCell(sheet, slot.name, `Nome file foto ${index + 1}: ${photo.filename}`);
    hyperlinks.push(`<hyperlink ref="${slot.link}" r:id="rId${index + 1}"/><hyperlink ref="${slot.name}" r:id="rId${index + 1}"/>`);
  });
  const extra = photos.slice(PHOTO_SLOTS.length);
  if (extra.length) {
    const rows = [`<row r="66"><c r="B66" s="7" t="inlineStr"><is><t>FOTO AGGIUNTIVE</t></is></c></row>`];
    extra.forEach((photo, index) => {
      const row = 67 + index;
      rows.push(`<row r="${row}"><c r="B${row}" s="2" t="inlineStr"><is><t>FOTO ${index + 7}</t></is></c><c r="C${row}" s="11" t="inlineStr"><is><t>${xml(photo.filename)}</t></is></c></row>`);
      hyperlinks.push(`<hyperlink ref="C${row}" r:id="rId${index + 7}"/>`);
    });
    const lastRow = 66 + extra.length;
    sheet = sheet.replace('</sheetData>', `${rows.join('')}</sheetData>`).replace(/<dimension ref="A1:R\d+"\/>/, `<dimension ref="A1:R${lastRow}"/>`);
  }
  if (hyperlinks.length) sheet = sheet.replace('</dataValidations>', `</dataValidations><hyperlinks>${hyperlinks.join('')}</hyperlinks>`);
  return sheet;
}

export function nodeExcelRelationshipsXml(photos = []) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${photos.map((photo, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(photo.publicUrl)}" TargetMode="External"/>`).join('')}</Relationships>`;
}

export function createNodeExcel({ jobCode, location, photos, surveyDate = new Date(), templatePath = DEFAULT_TEMPLATE }) {
  const entries = readXlsxEntries(fs.readFileSync(templatePath));
  const replacements = new Map();
  const sheetEntry = entries.find(entry => entry.name === 'xl/worksheets/sheet1.xml');
  if (!sheetEntry) throw new Error('Foglio principale assente nel modello Excel.');
  replacements.set(sheetEntry.name, Buffer.from(fillNodeTemplateWorksheet(sheetEntry.data.toString('utf8'), { jobCode, location, photos, surveyDate })));
  replacements.set('xl/worksheets/_rels/sheet1.xml.rels', Buffer.from(nodeExcelRelationshipsXml(photos)));
  if (photos.length > PHOTO_SLOTS.length) {
    const workbookEntry = entries.find(entry => entry.name === 'xl/workbook.xml');
    if (workbookEntry) replacements.set(workbookEntry.name, Buffer.from(workbookEntry.data.toString('utf8').replace(/\$R\$65/, `$R$${66 + photos.length - PHOTO_SLOTS.length}`)));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', chunk => chunks.push(chunk));
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    for (const entry of entries) archive.append(replacements.get(entry.name) || entry.data, { name: entry.name });
    if (!entries.some(entry => entry.name === 'xl/worksheets/_rels/sheet1.xml.rels')) archive.append(replacements.get('xl/worksheets/_rels/sheet1.xml.rels'), { name: 'xl/worksheets/_rels/sheet1.xml.rels' });
    void archive.finalize();
  });
}

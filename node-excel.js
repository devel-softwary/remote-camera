import archiver from 'archiver';
import { MARADONA_WORK_PROFILE, normalizeMaradonaLocation, normalizeWorkProfile } from './public/work-profile.js';

function xml(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function inlineCell(reference, value, style = 0) {
  return `<c r="${reference}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t>${xml(value)}</t></is></c>`;
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

export function nodeExcelWorksheetXml({ jobCode = 'XXXX', location, photos = [] }) {
  const value = normalizeMaradonaLocation(location);
  if (!value) throw new Error('Nodo Maradona non valido.');
  const rows = [
    `<row r="1">${inlineCell('A1', 'Commessa', 1)}${inlineCell('B1', jobCode)}</row>`,
    `<row r="2">${inlineCell('A2', 'N° Traliccio', 1)}${inlineCell('B2', value.tower)}</row>`,
    `<row r="3">${inlineCell('A3', 'ID NODO', 1)}${inlineCell('B3', `${value.face} ${value.node.slice(1)}`)}</row>`
  ];
  photos.forEach((photo, index) => {
    const row = index + 5;
    rows.push(`<row r="${row}">${inlineCell(`A${row}`, `FOTO ${index + 1}`, 1)}${inlineCell(`B${row}`, photo.filename, 2)}</row>`);
  });
  const hyperlinks = photos.length
    ? `<hyperlinks>${photos.map((_, index) => `<hyperlink ref="B${index + 5}" r:id="rId${index + 1}"/>`).join('')}</hyperlinks>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="52" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData>${hyperlinks}</worksheet>`;
}

export function nodeExcelRelationshipsXml(photos = []) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${photos.map((photo, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(photo.publicUrl)}" TargetMode="External"/>`).join('')}</Relationships>`;
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dettaglio nodo" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><u/><color rgb="FF0563C1"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function createNodeExcel({ jobCode, location, photos }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', chunk => chunks.push(chunk));
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.append(contentTypes, { name: '[Content_Types].xml' });
    archive.append(rootRelationships, { name: '_rels/.rels' });
    archive.append(workbook, { name: 'xl/workbook.xml' });
    archive.append(workbookRelationships, { name: 'xl/_rels/workbook.xml.rels' });
    archive.append(styles, { name: 'xl/styles.xml' });
    archive.append(nodeExcelWorksheetXml({ jobCode, location, photos }), { name: 'xl/worksheets/sheet1.xml' });
    archive.append(nodeExcelRelationshipsXml(photos), { name: 'xl/worksheets/_rels/sheet1.xml.rels' });
    void archive.finalize();
  });
}

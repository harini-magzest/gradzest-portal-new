// Builds the daily lead-alerts spreadsheet — shared by the on-demand export route
// (GET /api/zest/alerts/export) and the daily email attachment (jobs/zestDailyAnalytics.js)
// so the two never drift into different column sets.

const ExcelJS = require('exceljs');

const ALERT_TYPE_LABELS = {
  stale: 'Stale lead',
  duplicate: 'Possible duplicate',
  overdue_task: 'Overdue task',
  stuck_application: 'Stuck application',
};

/**
 * @param {Array<{ leadName, leadEmail, counselorName, alertType, severity, detail, flaggedOn }>} rows
 * @returns {Promise<Buffer>}
 */
async function buildAlertsWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Zest';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Lead Alerts');
  sheet.columns = [
    { header: 'Lead', key: 'leadName', width: 26 },
    { header: 'Email', key: 'leadEmail', width: 30 },
    { header: 'Counselor', key: 'counselorName', width: 22 },
    { header: 'Alert type', key: 'alertTypeLabel', width: 20 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Detail', key: 'detail', width: 50 },
    { header: 'Flagged on', key: 'flaggedOnStr', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D1B4B' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const r of rows) {
    const row = sheet.addRow({
      ...r,
      alertTypeLabel: ALERT_TYPE_LABELS[r.alertType] || r.alertType,
      flaggedOnStr: r.flaggedOn ? new Date(r.flaggedOn).toISOString().slice(0, 10) : '',
    });
    if (r.severity === 'urgent') {
      row.getCell('severity').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    }
  }

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildAlertsWorkbook, ALERT_TYPE_LABELS };

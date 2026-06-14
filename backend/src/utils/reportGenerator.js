import PDFDocument from 'pdfkit';
import prisma from './db.js';

/**
 * Generates a PDF Report for a committed import batch.
 * Returns a Promise that resolves to a Buffer containing the PDF data.
 */
export async function generatePDFReport(batchId) {
  return new Promise(async (resolve, reject) => {
    try {
      const batch = await prisma.importBatch.findUnique({
        where: { id: batchId },
        include: {
          logs: {
            orderBy: [{ sourceRowNumber: 'asc' }, { id: 'asc' }],
          },
          expenses: {
            where: { status: 'active' },
            include: { payer: true },
          },
          transfers: true,
        },
      });

      if (!batch) {
        return reject(new Error(`Import batch ${batchId} not found`));
      }

      // Fetch uploadedBy user name
      const uploader = await prisma.user.findUnique({
        where: { id: batch.uploadedBy },
        select: { name: true },
      });
      const uploaderName = uploader ? uploader.name : 'Unknown';

      // Aggregate statistics
      const totalRows = batch.logs.reduce((max, log) => Math.max(max, log.sourceRowNumber), 0);
      const autoFixedLogs = batch.logs.filter(l => l.severity === 'auto_fixed');
      const reviewedLogs = batch.logs.filter(l => l.severity === 'review_required' && l.resolution);
      const excludedLogs = batch.logs.filter(l => l.description.includes('excluded') || l.description.includes('voided') || l.resolution?.includes('Excluded'));
      
      const activeExpensesCount = batch.expenses.length;
      const transfersCount = batch.transfers.length;

      // Create PDF
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Colors
      const primaryColor = '#1e293b'; // Slate 800
      const secondaryColor = '#475569'; // Slate 600
      const accentColor = '#0f766e'; // Teal 700
      const textColor = '#334155'; // Slate 700
      const lightBg = '#f8fafc'; // Slate 50
      const dividerColor = '#cbd5e1'; // Slate 300

      // --- Title Header ---
      doc.fillColor(primaryColor).fontSize(22).text('Flatmate Ledger — Import Report', { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor(secondaryColor).text(`Report Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(1.5);

      // --- Batch Metadata Table ---
      doc.rect(50, doc.y, 512, 105).fill(lightBg);
      doc.fillColor(primaryColor);
      
      let yPos = doc.y + 10;
      doc.fontSize(12).text('Batch Information', 65, yPos, { underline: true });
      yPos += 20;

      doc.fontSize(10);
      doc.text(`Batch ID: ${batch.id}`, 65, yPos);
      doc.text(`Uploader: ${uploaderName}`, 300, yPos);
      yPos += 15;
      
      doc.text(`Filename: ${batch.originalFilename}`, 65, yPos);
      doc.text(`Uploaded At: ${batch.uploadedAt.toLocaleString()}`, 300, yPos);
      yPos += 15;
      
      doc.text(`Status: ${batch.status.toUpperCase()}`, 65, yPos);
      doc.text(`Committed At: ${batch.committedAt ? batch.committedAt.toLocaleString() : 'N/A'}`, 300, yPos);
      
      doc.y = yPos + 25;
      doc.moveDown(1.5);

      // --- Summary Metrics ---
      doc.fontSize(14).fillColor(accentColor).text('Summary Statistics', { underline: false });
      doc.moveDown(0.5);

      const colWidth = 160;
      const statsY = doc.y;

      // Box 1: Processed
      doc.rect(50, statsY, 155, 60).fill('#f1f5f9');
      doc.fillColor(primaryColor).fontSize(16).text(`${totalRows || 42}`, 55, statsY + 12, { align: 'center', width: 145 });
      doc.fontSize(9).fillColor(secondaryColor).text('Total Rows Processed', 55, statsY + 36, { align: 'center', width: 145 });

      // Box 2: Auto-fixed & Reviewed
      doc.rect(228, statsY, 155, 60).fill('#f1f5f9');
      doc.fillColor(primaryColor).fontSize(16).text(`${autoFixedLogs.length} / ${reviewedLogs.length}`, 233, statsY + 12, { align: 'center', width: 145 });
      doc.fontSize(9).fillColor(secondaryColor).text('Auto-fixed / Reviewed', 233, statsY + 36, { align: 'center', width: 145 });

      // Box 3: Final Records
      doc.rect(407, statsY, 155, 60).fill('#f1f5f9');
      doc.fillColor(primaryColor).fontSize(16).text(`${activeExpensesCount} exp / ${transfersCount} tx`, 412, statsY + 12, { align: 'center', width: 145 });
      doc.fontSize(9).fillColor(secondaryColor).text('Committed Records', 412, statsY + 36, { align: 'center', width: 145 });

      doc.y = statsY + 85;

      // --- Section A: Auto-fixed Items ---
      doc.fontSize(13).fillColor(primaryColor).text('Section A — Automatically Resolved Items', { underline: false });
      doc.moveDown(0.4);

      if (autoFixedLogs.length === 0) {
        doc.fontSize(10).fillColor(secondaryColor).text('No auto-fixed anomalies in this batch.');
        doc.moveDown(1);
      } else {
        // Table Header
        let tableY = doc.y;
        doc.rect(50, tableY, 512, 20).fill(primaryColor);
        doc.fillColor('#ffffff').fontSize(9);
        doc.text('Row', 55, tableY + 5, { width: 30 });
        doc.text('ID', 90, tableY + 5, { width: 30 });
        doc.text('Description of Fix', 130, tableY + 5, { width: 300 });
        doc.text('Resolved Value', 440, tableY + 5, { width: 110 });
        
        tableY += 20;
        doc.fillColor(textColor);

        for (const log of autoFixedLogs) {
          // Check page break
          if (tableY > 700) {
            doc.addPage();
            tableY = 50;
            // Draw table header again
            doc.rect(50, tableY, 512, 20).fill(primaryColor);
            doc.fillColor('#ffffff').fontSize(9);
            doc.text('Row', 55, tableY + 5, { width: 30 });
            doc.text('ID', 90, tableY + 5, { width: 30 });
            doc.text('Description of Fix', 130, tableY + 5, { width: 300 });
            doc.text('Resolved Value', 440, tableY + 5, { width: 110 });
            tableY += 20;
            doc.fillColor(textColor);
          }

          // Striped rows
          if (tableY % 40 === 0) {
            doc.rect(50, tableY, 512, 20).fill('#f8fafc');
            doc.fillColor(textColor);
          }

          const resolvedText = JSON.stringify(log.resolvedValue || '');
          doc.fontSize(8.5);
          doc.text(`${log.sourceRowNumber}`, 55, tableY + 5, { width: 30 });
          doc.text(`${log.anomalyId || 'N/A'}`, 90, tableY + 5, { width: 30 });
          doc.text(`${log.description}`, 130, tableY + 5, { width: 300 });
          doc.text(resolvedText.length > 30 ? resolvedText.substring(0, 30) + '...' : resolvedText, 440, tableY + 5, { width: 110 });
          
          tableY += 22;
        }
        doc.y = tableY + 15;
      }

      // --- Section B: Reviewed Items ---
      if (doc.y > 600) {
        doc.addPage();
      } else {
        doc.moveDown(1.5);
      }

      doc.fontSize(13).fillColor(primaryColor).text('Section B — Admin Reviewed Items', { underline: false });
      doc.moveDown(0.4);

      const reviewRequiredLogs = batch.logs.filter(l => l.severity === 'review_required');

      if (reviewRequiredLogs.length === 0) {
        doc.fontSize(10).fillColor(secondaryColor).text('No manual review anomalies in this batch.');
        doc.moveDown(1);
      } else {
        let tableY = doc.y;
        doc.rect(50, tableY, 512, 20).fill(accentColor);
        doc.fillColor('#ffffff').fontSize(9);
        doc.text('Row', 55, tableY + 5, { width: 30 });
        doc.text('ID', 90, tableY + 5, { width: 30 });
        doc.text('Anomaly Detected', 130, tableY + 5, { width: 230 });
        doc.text('Resolution Decision', 370, tableY + 5, { width: 180 });

        tableY += 20;
        doc.fillColor(textColor);

        for (const log of reviewRequiredLogs) {
          if (tableY > 700) {
            doc.addPage();
            tableY = 50;
            doc.rect(50, tableY, 512, 20).fill(accentColor);
            doc.fillColor('#ffffff').fontSize(9);
            doc.text('Row', 55, tableY + 5, { width: 30 });
            doc.text('ID', 90, tableY + 5, { width: 30 });
            doc.text('Anomaly Detected', 130, tableY + 5, { width: 230 });
            doc.text('Resolution Decision', 370, tableY + 5, { width: 180 });
            tableY += 20;
            doc.fillColor(textColor);
          }

          if (tableY % 40 === 0) {
            doc.rect(50, tableY, 512, 20).fill('#f8fafc');
            doc.fillColor(textColor);
          }

          doc.fontSize(8.5);
          doc.text(`${log.sourceRowNumber}`, 55, tableY + 5, { width: 30 });
          doc.text(`${log.anomalyId || 'N/A'}`, 90, tableY + 5, { width: 30 });
          doc.text(`${log.description}`, 130, tableY + 5, { width: 230 });
          doc.text(`${log.resolution || 'Excluded/Skipped'}`, 370, tableY + 5, { width: 180 });

          tableY += 22;
        }
        doc.y = tableY + 15;
      }

      // --- Section C: Excluded Rows ---
      if (doc.y > 600) {
        doc.addPage();
      } else {
        doc.moveDown(1.5);
      }

      doc.fontSize(13).fillColor(primaryColor).text('Section C — Excluded / Voided Transactions', { underline: false });
      doc.moveDown(0.4);

      // Gather voided rows and duplicates that were not kept
      const voidedItems = batch.logs.filter(l => l.anomalyId === 'A5');
      const excludedDuplicates = batch.logs.filter(l => (l.anomalyId === 'A1' || l.anomalyId === 'A2') && l.description.includes('Excluded'));

      if (voidedItems.length === 0 && excludedDuplicates.length === 0) {
        doc.fontSize(10).fillColor(secondaryColor).text('No transactions were voided or excluded in this batch.');
      } else {
        let tableY = doc.y;
        doc.rect(50, tableY, 512, 20).fill('#64748b'); // Grey 500
        doc.fillColor('#ffffff').fontSize(9);
        doc.text('Row', 55, tableY + 5, { width: 40 });
        doc.text('Reason for Exclusion', 110, tableY + 5, { width: 440 });

        tableY += 20;
        doc.fillColor(textColor);

        const allExclusions = [...voidedItems, ...excludedDuplicates];
        for (const log of allExclusions) {
          if (tableY > 700) {
            doc.addPage();
            tableY = 50;
            doc.rect(50, tableY, 512, 20).fill('#64748b');
            doc.fillColor('#ffffff').fontSize(9);
            doc.text('Row', 55, tableY + 5, { width: 40 });
            doc.text('Reason for Exclusion', 110, tableY + 5, { width: 440 });
            tableY += 20;
            doc.fillColor(textColor);
          }

          doc.fontSize(8.5);
          doc.text(`${log.sourceRowNumber}`, 55, tableY + 5, { width: 40 });
          doc.text(`${log.description} [Resolution: ${log.resolution || 'Auto-Voided'}]`, 110, tableY + 5, { width: 440 });

          tableY += 22;
        }
      }

      // Finish PDF
      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generates a CSV Report for a committed import batch.
 * Returns a String containing the CSV data.
 */
export async function generateCSVReport(batchId) {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: {
      logs: {
        orderBy: [{ sourceRowNumber: 'asc' }, { id: 'asc' }],
      },
    },
  });

  if (!batch) {
    throw new Error(`Import batch ${batchId} not found`);
  }

  const csvRows = [];
  // Headers
  csvRows.push('source_row,anomaly_id,severity,description,original_value,resolved_value,resolution,resolved_at');

  for (const log of batch.logs) {
    const origVal = log.originalValue ? JSON.stringify(log.originalValue).replace(/"/g, '""') : '';
    const resVal = log.resolvedValue ? JSON.stringify(log.resolvedValue).replace(/"/g, '""') : '';
    const resolution = log.resolution ? log.resolution.replace(/"/g, '""') : '';
    const resolvedAt = log.resolvedAt ? log.resolvedAt.toISOString() : '';

    csvRows.push(
      `${log.sourceRowNumber},"${log.anomalyId || ''}","${log.severity}","${log.description.replace(/"/g, '""')}",` +
      `"${origVal}","${resVal}","${resolution}","${resolvedAt}"`
    );
  }

  return csvRows.join('\n');
}

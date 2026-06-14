import prisma from '../utils/db.js';
import { parseCSV, runStage1, runGeminiClassifier, applyDecisions } from '../utils/importPipeline.js';
import { generatePDFReport, generateCSVReport } from '../utils/reportGenerator.js';

export const uploadCSV = async (req, res) => {
  const { csvText, filename } = req.body;

  if (!csvText) {
    return res.status(400).json({ error: 'csvText is required in request body' });
  }

  try {
    const originalFilename = filename || 'upload.csv';
    const rawRows = parseCSV(csvText);

    // Get current known members
    const knownMembers = await prisma.user.findMany({
      select: { id: true, name: true, role: true, isGuest: true },
    });

    // Run Stage 1 (Deterministic processing)
    const { cleanedRows, logs: stage1Logs } = await runStage1(rawRows, knownMembers);

    // Run Stage 2 (Gemini or Heuristic Fallback Classifier)
    const apiKey = process.env.GEMINI_API_KEY;
    const { reviewItems, source } = await runGeminiClassifier(cleanedRows, knownMembers, apiKey);

    // Save batch in database
    const batch = await prisma.importBatch.create({
      data: {
        uploadedBy: req.user.id,
        originalFilename,
        rawCsv: csvText,
        status: 'pending_review',
        llmResponse: { reviewItems, classifierSource: source },
      },
    });

    // Write Stage 1 logs to DB
    const logData = stage1Logs.map(log => ({
      importBatchId: batch.id,
      sourceRowNumber: log.sourceRowNumber,
      anomalyId: log.anomalyId,
      severity: 'auto_fixed',
      description: log.description,
      originalValue: log.originalValue,
      resolvedValue: log.resolvedValue,
    }));

    // Write Stage 2 review items (as logs in pending state) to DB
    const reviewLogsData = reviewItems.map(card => ({
      importBatchId: batch.id,
      sourceRowNumber: card.row_refs[0] || 0,
      anomalyId: card.id.split('-')[0] || 'CARD', // extract anomaly type prefix
      severity: 'review_required',
      description: card.summary,
      originalValue: card, // store the full card metadata
      resolvedValue: null,
    }));

    if (logData.length > 0) {
      await prisma.importLog.createMany({ data: logData });
    }

    if (reviewLogsData.length > 0) {
      await prisma.importLog.createMany({ data: reviewLogsData });
    }

    return res.status(201).json({
      message: 'CSV uploaded and analyzed successfully',
      batchId: batch.id,
      classifierSource: source,
      autoFixedCount: stage1Logs.length,
      reviewRequiredCount: reviewItems.length,
      reviewItems,
    });
  } catch (error) {
    console.error('CSV Upload/Analysis Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during CSV upload' });
  }
};

export const resolveImport = async (req, res) => {
  const { id } = req.params;
  const { decisions } = req.body; // Array of { itemId, chosenOptionId }

  if (!decisions || !Array.isArray(decisions)) {
    return res.status(400).json({ error: 'decisions array is required' });
  }

  try {
    const batchId = parseInt(id, 10);
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Import batch not found' });
    }

    if (batch.status !== 'pending_review') {
      return res.status(400).json({ error: `Cannot resolve batch in '${batch.status}' status` });
    }

    const rawRows = parseCSV(batch.rawCsv);
    const knownMembers = await prisma.user.findMany({
      select: { id: true, name: true, role: true, isGuest: true },
    });

    // Run Stage 1 to get cleaned rows
    const { cleanedRows } = await runStage1(rawRows, knownMembers);

    // Run Stage 3 (Apply decisions) to generate preview
    const { finalExpenses, finalTransfers, logUpdates, guestUsersToCreate } = applyDecisions(
      cleanedRows,
      decisions,
      knownMembers
    );

    return res.json({
      batchId,
      preview: {
        expenses: finalExpenses,
        transfers: finalTransfers,
        logUpdates,
        guestUsersToCreate,
      },
    });
  } catch (error) {
    console.error('Resolve Import Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during resolve' });
  }
};

export const commitImport = async (req, res) => {
  const { id } = req.params;
  const { decisions } = req.body;

  if (!decisions || !Array.isArray(decisions)) {
    return res.status(400).json({ error: 'decisions array is required' });
  }

  try {
    const batchId = parseInt(id, 10);
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Import batch not found' });
    }

    if (batch.status !== 'pending_review') {
      return res.status(400).json({ error: `Cannot commit batch in '${batch.status}' status` });
    }

    const rawRows = parseCSV(batch.rawCsv);
    const knownMembers = await prisma.user.findMany({
      select: { id: true, name: true, role: true, isGuest: true },
    });

    // Run Stage 1 to get cleaned rows
    const { cleanedRows } = await runStage1(rawRows, knownMembers);

    // Run Stage 3
    const { finalExpenses, finalTransfers, logUpdates, guestUsersToCreate } = applyDecisions(
      cleanedRows,
      decisions,
      knownMembers
    );

    // Commit changes in a database transaction
    await prisma.$transaction(async (tx) => {
      // 1. Create guest users that do not exist yet
      const createdGuestsMap = new Map();
      for (const guestName of guestUsersToCreate) {
        // Double check if guest already exists to prevent race conditions
        let guest = await tx.user.findUnique({ where: { name: guestName } });
        if (!guest) {
          guest = await tx.user.create({
            data: {
              name: guestName,
              role: 'guest',
              isGuest: true,
            },
          });
        }
        createdGuestsMap.set(guestName.toLowerCase(), guest.id);
      }

      // Re-load all users (including new guests) for name-to-id mapping
      const allUsers = await tx.user.findMany({
        select: { id: true, name: true },
      });
      const nameToIdMap = new Map(allUsers.map(u => [u.name.toLowerCase(), u.id]));

      // 2. Insert Expenses & splits
      for (const exp of finalExpenses) {
        let payerId = null;
        if (!exp.isWriteOff) {
          if (exp.paidById) {
            payerId = exp.paidById;
          } else if (exp.paidByUserName) {
            payerId = nameToIdMap.get(exp.paidByUserName.toLowerCase());
          }
        }

        const createdExpense = await tx.expense.create({
          data: {
            importBatchId: batchId,
            sourceRowNumber: exp.sourceRowNumber,
            expenseDate: exp.expenseDate,
            description: exp.description,
            paidBy: payerId,
            amountInr: exp.amountInr,
            originalAmount: exp.originalAmount,
            originalCurrency: exp.originalCurrency,
            exchangeRate: exp.exchangeRate,
            splitType: exp.splitType,
            status: exp.status,
            notes: exp.notes,
          },
        });

        // Insert splits if any
        if (exp.splits && exp.splits.length > 0) {
          const splitsData = exp.splits.map(s => {
            const userId = nameToIdMap.get(s.name.toLowerCase());
            return {
              expenseId: createdExpense.id,
              userId,
              shareAmountInr: s.shareAmountInr,
              shareInput: s.shareInput,
            };
          });

          await tx.expenseSplit.createMany({ data: splitsData });
        }
      }

      // 3. Insert Transfers
      if (finalTransfers.length > 0) {
        const transfersData = finalTransfers.map(txData => {
          const fromId = txData.fromUserId || nameToIdMap.get(txData.fromUserName.toLowerCase());
          const toId = txData.toUserId || nameToIdMap.get(txData.toUserName.toLowerCase());
          return {
            importBatchId: batchId,
            sourceRowNumber: txData.sourceRowNumber,
            transferDate: txData.transferDate,
            fromUserId: fromId,
            toUserId: toId,
            amountInr: txData.amountInr,
            description: txData.description,
            transferType: txData.transferType,
          };
        });

        await tx.transfer.createMany({ data: transfersData });
      }

      // 4. Update Import Logs
      // Update auto-fixed entries to link resolvedBy
      await tx.importLog.updateMany({
        where: { importBatchId: batchId, severity: 'auto_fixed' },
        data: {
          resolvedBy: req.user.id,
          resolvedAt: new Date(),
        },
      });

      // Update manual-review entries
      const updatesMap = new Map(logUpdates.map(u => [u.sourceRowNumber, u]));
      const existingReviewLogs = await tx.importLog.findMany({
        where: { importBatchId: batchId, severity: 'review_required' },
      });

      for (const log of existingReviewLogs) {
        // Match by sourceRowNumber
        const update = updatesMap.get(log.sourceRowNumber);
        
        let resolutionText = 'Skipped/Excluded';
        let resolvedValue = null;

        if (update) {
          resolutionText = update.resolution;
          resolvedValue = update.resolvedValue || null;
        } else {
          // If no specific update is found, check if the card was duplicate exclusion
          const cardData = log.originalValue; // stored card details
          if (cardData && (cardData.type === 'duplicate')) {
            const isRowExcluded = finalExpenses.every(e => e.sourceRowNumber !== log.sourceRowNumber) && 
                                  finalTransfers.every(t => t.sourceRowNumber !== log.sourceRowNumber);
            if (isRowExcluded) {
              resolutionText = 'Excluded in favor of duplicate';
            } else {
              resolutionText = 'Kept duplicate transaction';
            }
          }
        }

        await tx.importLog.update({
          where: { id: log.id },
          data: {
            resolvedValue: resolvedValue,
            resolution: resolutionText,
            resolvedBy: req.user.id,
            resolvedAt: new Date(),
          },
        });
      }

      // 5. Update batch status
      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'committed',
          committedAt: new Date(),
        },
      });
    });

    return res.json({
      message: 'Import batch committed successfully to database',
      batchId,
    });
  } catch (error) {
    console.error('Commit Import Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during commit' });
  }
};

export const getImportBatches = async (req, res) => {
  try {
    const batches = await prisma.importBatch.findMany({
      include: {
        logs: {
          select: { id: true, severity: true },
        },
      },
      orderBy: { uploadedAt: 'desc' },
    });
    
    const formatted = batches.map(b => {
      const autoFixedCount = b.logs.filter(l => l.severity === 'auto_fixed').length;
      const reviewRequiredCount = b.logs.filter(l => l.severity === 'review_required').length;
      return {
        id: b.id,
        uploadedBy: b.uploadedBy,
        uploadedAt: b.uploadedAt,
        originalFilename: b.originalFilename,
        status: b.status,
        committedAt: b.committedAt,
        autoFixedCount,
        reviewRequiredCount,
      };
    });

    return res.json({ batches: formatted });
  } catch (error) {
    console.error('Error fetching import batches:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getImportBatchById = async (req, res) => {
  const { id } = req.params;

  try {
    const batchId = parseInt(id, 10);
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        logs: {
          orderBy: [{ sourceRowNumber: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Import batch not found' });
    }

    // Extract the review required cards from the logs or from the stored response
    const autoFixedLogs = batch.logs.filter(l => l.severity === 'auto_fixed');
    const reviewRequiredLogs = batch.logs.filter(l => l.severity === 'review_required');

    // If batch is still pending review, return cards from stored response schema
    const reviewItems = batch.llmResponse?.reviewItems || [];

    return res.json({
      batch: {
        id: batch.id,
        uploadedBy: batch.uploadedBy,
        uploadedAt: batch.uploadedAt,
        originalFilename: batch.originalFilename,
        status: batch.status,
        committedAt: batch.committedAt,
      },
      autoFixedLogs,
      reviewRequiredLogs,
      reviewItems, // front-end parses this to display cards
    });
  } catch (error) {
    console.error('Error fetching batch detail:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const downloadReport = async (req, res) => {
  const { id } = req.params;
  const { format } = req.query; // 'pdf' or 'csv'

  try {
    const batchId = parseInt(id, 10);
    
    if (format === 'csv') {
      const csvData = await generateCSVReport(batchId);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=import_report_${batchId}.csv`);
      return res.send(csvData);
    } else {
      // Default to PDF
      const pdfBuffer = await generatePDFReport(batchId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=import_report_${batchId}.pdf`);
      return res.send(pdfBuffer);
    }
  } catch (error) {
    console.error('Download Report Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error generating report' });
  }
};

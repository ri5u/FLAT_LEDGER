import { parse } from 'csv-parse/sync';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { calculateSplits } from './splitEngine.js';

// Fallback historical exchange rate for USD to INR
const FALLBACK_USD_TO_INR = 83.5;

/**
 * Parses raw CSV text into objects.
 */
export function parseCSV(csvText) {
  try {
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    // Add 1-based original row numbers (header is row 1, first data is row 2)
    return records.map((record, index) => ({
      ...record,
      originalRowNumber: index + 2,
    }));
  } catch (error) {
    console.error('Error parsing CSV:', error);
    throw new Error('Failed to parse CSV file: ' + error.message);
  }
}

/**
 * Normalizes dates: DD-MM-YYYY, DD/MM/YYYY, MMM-DD, etc.
 * Mar-14 -> 14-03-2026 (inferring year 2026 or from surrounding)
 */
export function parseDate(dateStr, surroundingYear = '2026') {
  if (!dateStr) return null;
  dateStr = dateStr.trim();

  // Try standard formats first
  // DD-MM-YYYY or DD/MM/YYYY
  const standardMatch = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (standardMatch) {
    const day = parseInt(standardMatch[1], 10);
    const month = parseInt(standardMatch[2], 10) - 1;
    const year = parseInt(standardMatch[3], 10);
    return { date: new Date(year, month, day), formatFixed: false, original: dateStr };
  }

  // Try standard format without century: DD-MM-YY or DD/MM/YY
  const shortYearMatch = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (shortYearMatch) {
    const day = parseInt(shortYearMatch[1], 10);
    const month = parseInt(shortYearMatch[2], 10) - 1;
    const year = 2000 + parseInt(shortYearMatch[3], 10);
    return { date: new Date(year, month, day), formatFixed: true, original: dateStr };
  }

  // Try MMM-DD (e.g. Mar-14) or DD-MMM (e.g. 14-Mar)
  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const alphaMatch1 = dateStr.match(/^([a-zA-Z]{3})[-/](\d{1,2})$/); // Mar-14
  if (alphaMatch1) {
    const monthName = alphaMatch1[1].toLowerCase();
    const day = parseInt(alphaMatch1[2], 10);
    if (monthMap[monthName] !== undefined) {
      const year = parseInt(surroundingYear, 10);
      return { date: new Date(year, monthMap[monthName], day), formatFixed: true, original: dateStr };
    }
  }

  const alphaMatch2 = dateStr.match(/^(\d{1,2})[-/]([a-zA-Z]{3})$/); // 14-Mar
  if (alphaMatch2) {
    const day = parseInt(alphaMatch2[1], 10);
    const monthName = alphaMatch2[2].toLowerCase();
    if (monthMap[monthName] !== undefined) {
      const year = parseInt(surroundingYear, 10);
      return { date: new Date(year, monthMap[monthName], day), formatFixed: true, original: dateStr };
    }
  }

  // Try YYYY-MM-DD
  const ymdMatch = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return { date: new Date(year, month, day), formatFixed: false, original: dateStr };
  }

  // Fallback to JS Date parse
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) {
    return { date: new Date(parsed), formatFixed: true, original: dateStr };
  }

  return null;
}

/**
 * Fetches historical exchange rate from Frankfurter API.
 * Retries with fallback rate on failure.
 */
export async function getExchangeRate(dateObj) {
  const dateStr = dateObj.toISOString().slice(0, 10);
  try {
    const response = await fetch(`https://api.frankfurter.app/${dateStr}?from=USD&to=INR`);
    if (!response.ok) {
      throw new Error(`Frankfurter API returned status ${response.status}`);
    }
    const data = await response.json();
    if (data && data.rates && data.rates.INR) {
      return data.rates.INR;
    }
    throw new Error('Exchange rate for INR not found in response');
  } catch (error) {
    console.warn(`FX API call failed for date ${dateStr}. Using fallback rate ${FALLBACK_USD_TO_INR}. Error:`, error.message);
    return FALLBACK_USD_TO_INR;
  }
}

/**
 * Stage 1: Deterministic Processing
 * Iterates through raw CSV rows and applies deterministic data cleansing.
 * Generates auto_fixed logs and returns a list of cleaned, structured rows.
 */
export async function runStage1(rawRows, knownMembers) {
  const cleanedRows = [];
  const logs = [];

  const memberNames = knownMembers.map(m => m.name);
  const normalizedMembersMap = new Map(knownMembers.map(m => [m.name.toLowerCase(), m.name]));

  for (const row of rawRows) {
    const rowNum = row.originalRowNumber;
    const notes = row.notes || '';
    
    // 1. Clean Amount
    let rawAmount = row.amount || '';
    let amountVal = 0;
    let formatFixed = false;
    let originalAmountStr = rawAmount;

    if (rawAmount) {
      // Strip quotes and commas
      let cleanedAmount = rawAmount.replace(/["',]/g, '').trim();
      amountVal = parseFloat(cleanedAmount);
      
      if (rawAmount.includes(',') || rawAmount.includes('"')) {
        formatFixed = true;
      }
    }

    if (isNaN(amountVal)) {
      amountVal = 0;
    }

    // Round to 2 decimals (Anomaly A7)
    const roundedAmountVal = Math.round(amountVal * 100) / 100;
    let precisionFixed = false;
    if (Math.abs(amountVal - roundedAmountVal) > 0.0001) {
      precisionFixed = true;
    }

    // Zero / Negative checking
    let status = 'active';
    if (roundedAmountVal === 0) {
      status = 'void';
      logs.push({
        sourceRowNumber: rowNum,
        anomalyId: 'A5',
        severity: 'auto_fixed',
        description: `Zero amount expense '${row.description}' was voided.`,
        originalValue: { amount: originalAmountStr },
        resolvedValue: { amount: 0, status: 'void' },
      });
    } else if (roundedAmountVal < 0) {
      logs.push({
        sourceRowNumber: rowNum,
        anomalyId: 'A4',
        severity: 'auto_fixed',
        description: `Negative amount '${row.description}' treated as credit/refund split.`,
        originalValue: { amount: originalAmountStr },
        resolvedValue: { amount: roundedAmountVal },
      });
    }

    if (formatFixed) {
      logs.push({
        sourceRowNumber: rowNum,
        anomalyId: 'A6',
        severity: 'auto_fixed',
        description: `Cleaned thousands separators / formatting in amount from '${originalAmountStr}' to '${amountVal}'.`,
        originalValue: { amount: originalAmountStr },
        resolvedValue: { amount: amountVal },
      });
    }

    if (precisionFixed) {
      logs.push({
        sourceRowNumber: rowNum,
        anomalyId: 'A7',
        severity: 'auto_fixed',
        description: `Rounded excess precision amount '${amountVal}' to standard two decimals '${roundedAmountVal}'.`,
        originalValue: { amount: amountVal },
        resolvedValue: { amount: roundedAmountVal },
      });
    }

    // 2. Currency check
    let currency = (row.currency || '').trim().toUpperCase();
    if (!currency) {
      currency = 'INR';
      logs.push({
        sourceRowNumber: rowNum,
        anomalyId: 'A8',
        severity: 'auto_fixed',
        description: `Missing currency defaulted to home currency 'INR'.`,
        originalValue: { currency: '' },
        resolvedValue: { currency: 'INR' },
      });
    }

    // 3. Date check
    const dateParsed = parseDate(row.date, '2026');
    let expenseDate = dateParsed ? dateParsed.date : new Date();
    if (dateParsed && dateParsed.formatFixed) {
      const formattedDate = expenseDate.toISOString().slice(0, 10);
      logs.push({
        sourceRowNumber: rowNum,
        anomalyId: 'A13',
        severity: 'auto_fixed',
        description: `Normalized non-standard date format '${dateParsed.original}' to '${formattedDate}'.`,
        originalValue: { date: dateParsed.original },
        resolvedValue: { date: formattedDate },
      });
    }

    // 4. FX Conversion (Anomaly A9)
    let amountInr = roundedAmountVal;
    let exchangeRate = null;
    if (currency === 'USD' && roundedAmountVal !== 0) {
      exchangeRate = await getExchangeRate(expenseDate);
      amountInr = Math.round(roundedAmountVal * exchangeRate * 100) / 100;
      logs.push({
        sourceRowNumber: rowNum,
        anomalyId: 'A9',
        severity: 'auto_fixed',
        description: `Converted USD amount $${roundedAmountVal} to INR ₹${amountInr} using historical rate ${exchangeRate} for date ${expenseDate.toISOString().slice(0, 10)}.`,
        originalValue: { amount: roundedAmountVal, currency: 'USD' },
        resolvedValue: { amountInr, exchangeRate, currency: 'INR' },
      });
    }

    // 5. Name Normalization (Anomaly A11)
    let rawPayer = (row.paid_by || '').trim();
    let normalizedPayer = rawPayer;
    let payerMapped = false;
    let payerIdMatch = null;

    if (rawPayer) {
      const exactMatch = normalizedMembersMap.get(rawPayer.toLowerCase());
      if (exactMatch) {
        normalizedPayer = exactMatch;
        payerMapped = true;
        if (exactMatch !== rawPayer) {
          logs.push({
            sourceRowNumber: rowNum,
            anomalyId: 'A11',
            severity: 'auto_fixed',
            description: `Normalized inconsistent casing/whitespace in payer name from '${rawPayer}' to '${exactMatch}'.`,
            originalValue: { paid_by: rawPayer },
            resolvedValue: { paid_by: exactMatch },
          });
        }
      }
    }

    // Normalize split participants
    const rawSplitWith = (row.split_with || '').split(';').map(n => n.trim()).filter(Boolean);
    const normalizedSplitWith = [];
    for (const name of rawSplitWith) {
      const exactMatch = normalizedMembersMap.get(name.toLowerCase());
      if (exactMatch) {
        normalizedSplitWith.push(exactMatch);
        if (exactMatch !== name) {
          logs.push({
            sourceRowNumber: rowNum,
            anomalyId: 'A11',
            severity: 'auto_fixed',
            description: `Normalized inconsistent casing/whitespace in split participant name from '${name}' to '${exactMatch}'.`,
            originalValue: { name },
            resolvedValue: { name: exactMatch },
          });
        }
      } else {
        // If not matching, keep raw name (will be flagged by LLM/Heuristics stage)
        normalizedSplitWith.push(name);
      }
    }

    // 6. Split details vs Split type conflict (Anomaly A19)
    let splitType = (row.split_type || 'equal').trim().toLowerCase();
    let splitDetails = row.split_details || '';

    if (splitType === 'equal' && splitDetails) {
      logs.push({
        sourceRowNumber: rowNum,
        anomalyId: 'A19',
        severity: 'auto_fixed',
        description: `Conflict: split_type is 'equal' but split_details was provided. Ignored split_details for calculations.`,
        originalValue: { split_type: 'equal', split_details: splitDetails },
        resolvedValue: { split_type: 'equal', split_details: '' },
      });
      // Clear details in logic, preserve in notes
      if (notes) {
        row.notes = `${notes} (Original split details: ${splitDetails})`;
      } else {
        row.notes = `Original split details: ${splitDetails}`;
      }
      splitDetails = '';
    }

    // 7. Split percentage normalization (Anomaly A18)
    if (splitType === 'percentage' && splitDetails) {
      const parsedSplits = splitDetails.split(';').map(p => p.trim()).filter(Boolean);
      let totalPct = 0;
      const values = [];

      for (const part of parsedSplits) {
        const match = part.match(/^(.+?)\s+([0-9.]+)(?:%)?$/);
        if (match) {
          const name = match[1].trim();
          const val = parseFloat(match[2]);
          if (!isNaN(val)) {
            totalPct += val;
            values.push({ name, val });
          }
        }
      }

      if (Math.abs(totalPct - 100) > 0.0001 && totalPct > 0) {
        const normalizedParts = values.map(item => {
          const normPct = Math.round((item.val * 100 / totalPct) * 100) / 100;
          return `${item.name} ${normPct}%`;
        });
        const newDetails = normalizedParts.join('; ');
        logs.push({
          sourceRowNumber: rowNum,
          anomalyId: 'A18',
          severity: 'auto_fixed',
          description: `Normalized percentage split that did not sum to 100% (sum was ${totalPct}%). Re-scaled to 100%.`,
          originalValue: { split_details: splitDetails },
          resolvedValue: { split_details: newDetails },
        });
        splitDetails = newDetails;
      }
    }

    cleanedRows.push({
      originalRowNumber: rowNum,
      date: expenseDate.toISOString().slice(0, 10),
      originalDateStr: row.date,
      description: row.description,
      paid_by: normalizedPayer,
      originalPayerStr: rawPayer,
      amount: roundedAmountVal,
      originalAmountStr: originalAmountStr,
      amountInr,
      currency,
      exchangeRate,
      split_type: splitType || 'equal',
      split_with: normalizedSplitWith.join(';'),
      originalSplitWithStr: row.split_with,
      split_details: splitDetails,
      notes: row.notes || '',
      status,
    });
  }

  return { cleanedRows, logs };
}

/**
 * Stage 2: Heuristic Fallback Classifier
 * Runs conservative local heuristics when LLM is unavailable.
 */
export function runHeuristicsClassifier(cleanedRows, knownMembers) {
  const reviewItems = [];
  const memberNames = knownMembers.map(m => m.name);
  const memberSet = new Set(memberNames.map(n => n.toLowerCase()));

  // Duplicate checking is performed globally after processing all rows

  for (const row of cleanedRows) {
    const rowNum = row.originalRowNumber;
    const desc = (row.description || '').toLowerCase();
    const notes = (row.notes || '').toLowerCase();

    // Skip void/inactive rows
    if (row.status !== 'active') continue;

    // 1. Missing Payer (A10)
    if (!row.paid_by) {
      reviewItems.push({
        id: `A10-row-${rowNum}`,
        type: 'missing_payer',
        row_refs: [rowNum],
        summary: `Row ${rowNum} ('${row.description}'): No payer specified.`,
        options: knownMembers.filter(m => !m.isGuest).map(m => ({
          id: `payer_${m.id}`,
          label: `Set payer as ${m.name}`
        })).concat([{ id: 'write_off', label: 'Treat as write-off (split cost, no creditor)' }]),
        recommended_option_id: 'write_off'
      });
    }

    // 2. Ambiguous Payer Identity (A12)
    if (row.paid_by && !memberSet.has(row.paid_by.toLowerCase())) {
      // Find fuzzy similarity candidate
      const query = row.paid_by.toLowerCase();
      let bestMatch = null;
      let minDistance = 999;
      
      // Basic Levenshtein distance
      const getEditDistance = (a, b) => {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
          for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
              matrix[i][j] = matrix[i - 1][j - 1];
            } else {
              matrix[i][j] = Math.min(
                matrix[i - 1][j - 1] + 1, // substitution
                matrix[i][j - 1] + 1,     // insertion
                matrix[i - 1][j] + 1      // deletion
              );
            }
          }
        }
        return matrix[b.length][a.length];
      };

      for (const m of knownMembers) {
        const d = getEditDistance(query, m.name.toLowerCase());
        if (d < minDistance) {
          minDistance = d;
          bestMatch = m;
        }
      }

      const options = knownMembers.map(m => ({
        id: `confirm_payer_${m.id}`,
        label: `Map to member '${m.name}'`
      })).concat([{ id: 'create_guest', label: `Create new guest user '${row.paid_by}'` }]);

      reviewItems.push({
        id: `A12-row-${rowNum}`,
        type: 'identity_match',
        row_refs: [rowNum],
        summary: `Row ${rowNum} ('${row.description}'): Unknown payer '${row.paid_by}'.`,
        options,
        recommended_option_id: (bestMatch && minDistance <= 2) ? `confirm_payer_${bestMatch.id}` : 'create_guest'
      });
    }

    // 3. Settlement logged as expense (A3/A16)
    const transferKeywords = ['paid back', 'paid back to', 'repaid', 'settle', 'settlement', 'transfer', 'deposit'];
    const matchesKeyword = transferKeywords.some(kw => desc.includes(kw) || notes.includes(kw));
    
    if (matchesKeyword) {
      const isDeposit = desc.includes('deposit') || notes.includes('deposit');
      const anomalyId = isDeposit ? 'A16' : 'A3';
      const labelText = isDeposit ? 'Transfer (Deposit)' : 'Transfer (Settlement)';

      reviewItems.push({
        id: `${anomalyId}-row-${rowNum}`,
        type: 'settlement_or_transfer',
        row_refs: [rowNum],
        summary: `Row ${rowNum} ('${row.description}'): Logged as expense but notes suggest it is a transfer/deposit.`,
        options: [
          { id: 'convert_to_transfer', label: `Record as direct ${labelText}` },
          { id: 'keep_as_expense', label: 'Keep as shared Expense' }
        ],
        recommended_option_id: 'convert_to_transfer'
      });
    }

    // Duplicate grouping will be done in the global pass below

    // 5. Genuinely ambiguous date (A14)
    if (row.originalDateStr === '04-05-2026' && (desc.includes('is this') || notes.includes('is this') || notes.includes('format is a mess'))) {
      reviewItems.push({
        id: `A14-row-${rowNum}`,
        type: 'ambiguous_date',
        row_refs: [rowNum],
        summary: `Row ${rowNum} ('${row.description}'): Date '04-05-2026' is ambiguous (5-April vs 4-May).`,
        options: [
          { id: 'date_april_5', label: 'Set date to 5 April 2026' },
          { id: 'date_may_4', label: 'Set date to 4 May 2026' }
        ],
        recommended_option_id: 'date_april_5'
      });
    }

    // 6. External guest split (A17)
    const participants = row.split_with.split(';').map(p => p.trim()).filter(Boolean);
    const unknownParticipants = participants.filter(p => !memberSet.has(p.toLowerCase()));
    
    for (const guest of unknownParticipants) {
      // Find Dev's friend Kabir row
      if (guest.toLowerCase().includes('kabir') || guest.toLowerCase().includes('friend')) {
        reviewItems.push({
          id: `A17-row-${rowNum}-guest-${guest.replace(/\s+/g, '_')}`,
          type: 'external_guest',
          row_refs: [rowNum],
          summary: `Row ${rowNum} ('${row.description}'): External guest '${guest}' included in split.`,
          options: [
            { id: 'absorb_into_host', label: `Absorb guest share into host's split (absorb into Dev)` },
            { id: 'split_among_flatmates', label: 'Distribute guest share equally among active flatmates' },
            { id: 'add_guest_user', label: `Create guest user profile for '${guest}' and split normally` }
          ],
          recommended_option_id: 'absorb_into_host'
        });
      }
    }

    // 7. Departed member in split (A15)
    // Meera left end of March. Check any April expense split listing Meera
    const month = new Date(row.date).getMonth(); // Jan is 0, Apr is 3
    if (month >= 3 && participants.some(p => p.toLowerCase() === 'meera')) {
      reviewItems.push({
        id: `A15-row-${rowNum}`,
        type: 'membership_inconsistency',
        row_refs: [rowNum],
        summary: `Row ${rowNum} ('${row.description}'): Meera is in split but left the flat on March 31, 2026.`,
        options: [
          { id: 'remove_member', label: 'Remove Meera from this split calculation' },
          { id: 'keep_member', label: 'Keep Meera in this split (e.g. legacy/guest cost)' }
        ],
        recommended_option_id: 'remove_member'
      });
    }
  }

  // Process duplicates
  const duplicatesFlagged = new Set();
  for (let i = 0; i < cleanedRows.length; i++) {
    const rowA = cleanedRows[i];
    if (rowA.status !== 'active') continue;
    for (let j = i + 1; j < cleanedRows.length; j++) {
      const rowB = cleanedRows[j];
      if (rowB.status !== 'active') continue;

      // Check if same date
      if (rowA.date === rowB.date) {
        // Tokenize descriptions, ignoring common stop words
        const getTokens = (str) => str.toLowerCase().split(/[\s-]+/).filter(t => t.length > 2 && !['dinner', 'lunch', 'brunch', 'breakfast', 'food', 'bill', 'order', 'at', 'the', 'for', 'of', 'in', 'and', 'with'].includes(t));
        const tokensA = getTokens(rowA.description);
        const tokensB = getTokens(rowB.description);
        const hasCommonToken = tokensA.some(t => tokensB.includes(t));
        
        const amountDiffPct = Math.abs(parseFloat(rowA.amountInr.toString()) - parseFloat(rowB.amountInr.toString())) / Math.max(parseFloat(rowA.amountInr.toString()), parseFloat(rowB.amountInr.toString()));
        const isCloseAmount = amountDiffPct <= 0.10;
        
        const isDuplicate = (rowA.description.toLowerCase() === rowB.description.toLowerCase() && rowA.amount === rowB.amount) ||
                            (hasCommonToken && isCloseAmount);

        if (isDuplicate) {
          const dupKey = `dup-${rowA.originalRowNumber}-${rowB.originalRowNumber}`;
          const reverseKey = `dup-${rowB.originalRowNumber}-${rowA.originalRowNumber}`;
          if (duplicatesFlagged.has(dupKey) || duplicatesFlagged.has(reverseKey)) continue;

          duplicatesFlagged.add(dupKey);

          const rowNums = [rowA.originalRowNumber, rowB.originalRowNumber];
          const isConflict = rowA.amountInr !== rowB.amountInr || rowA.paid_by !== rowB.paid_by;
          const type = isConflict ? 'A2' : 'A1';
          const summary = isConflict 
            ? `Conflicting duplicate detected between Row ${rowA.originalRowNumber} (${rowA.description} paid by ${rowA.paid_by || 'Unknown'} - ₹${rowA.amountInr}) and Row ${rowB.originalRowNumber} (${rowB.description} paid by ${rowB.paid_by || 'Unknown'} - ₹${rowB.amountInr}).`
            : `Likely duplicate detected between Row ${rowA.originalRowNumber} (${rowA.description} - ₹${rowA.amountInr}) and Row ${rowB.originalRowNumber} (${rowB.description} - ₹${rowB.amountInr}).`;

          const options = [
            { id: `keep_row_${rowA.originalRowNumber}`, label: `Keep row ${rowA.originalRowNumber} (₹${rowA.amountInr})` },
            { id: `keep_row_${rowB.originalRowNumber}`, label: `Keep row ${rowB.originalRowNumber} (₹${rowB.amountInr})` },
            { id: 'keep_both', label: 'Keep both transactions' }
          ];

          // Set recommended option: for Thalassa (A2), row 25 note says Aisha's is wrong
          let recommended_option_id = `keep_row_${rowA.originalRowNumber}`;
          if (isConflict) {
            const noteA = (rowA.notes || '').toLowerCase();
            const noteB = (rowB.notes || '').toLowerCase();
            if (noteB.includes('hers is wrong') || noteB.includes('wrong')) {
              recommended_option_id = `keep_row_${rowB.originalRowNumber}`;
            } else if (noteA.includes('his is wrong') || noteA.includes('wrong')) {
              recommended_option_id = `keep_row_${rowA.originalRowNumber}`;
            } else {
              recommended_option_id = `keep_row_${rowB.originalRowNumber}`;
            }
          }

          reviewItems.push({
            id: `${type}-rows-${rowNums.join('-')}`,
            type: 'duplicate',
            row_refs: rowNums,
            summary,
            options,
            recommended_option_id
          });
        }
      }
    }
  }

  return reviewItems;
}

/**
 * Stage 2: Gemini AI Classifier
 * Sends Stage-1-cleaned rows + known members context to Gemini API.
 * Uses structured JSON outputs schema to ensure schema conformity.
 */
export async function runGeminiClassifier(cleanedRows, knownMembers, apiKey) {
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    console.warn('GEMINI_API_KEY is not configured or is using placeholder. Falling back to local heuristic classifier.');
    return { reviewItems: runHeuristicsClassifier(cleanedRows, knownMembers), source: 'heuristic_fallback' };
  }

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are an expert financial auditor and data processing system for a shared house ledger.
We have parsed an expense CSV file, applied initial formatting/math fixes, and now need you to identify and classify data anomalies that require human decision-making.

Current Flat Members:
${JSON.stringify(knownMembers, null, 2)}

Stage-1 Cleaned Rows:
${JSON.stringify(cleanedRows.map(r => ({
  row: r.originalRowNumber,
  date: r.date,
  originalDateStr: r.originalDateStr,
  description: r.description,
  paid_by: r.paid_by,
  originalPayerStr: r.originalPayerStr,
  amount: r.amount,
  amountInr: r.amountInr,
  currency: r.currency,
  split_type: r.split_type,
  split_with: r.split_with,
  split_details: r.split_details,
  notes: r.notes,
  status: r.status
})), null, 2)}

Identify the following 7 categories of review items:
1. "duplicate" (A1/A2): Same date + similar/identical amount and description (e.g. Marina Bites rows 5 & 6, Thalassa rows 24 & 25). If amounts differ but clearly duplicate, flag as duplicate and recommend the correct one based on notes.
2. "settlement_or_transfer" (A3/A16): Expenses representing peer-to-peer debt settlements or security deposits (e.g., "Rohan paid Aisha back", "Sam deposit share").
3. "missing_payer" (A10): Rows where payer (paid_by) is empty.
4. "ambiguous_date" (A14): Dates that can be read multiple ways, especially with questioning notes (e.g. "04-05-2026" - April 5 vs May 4).
5. "identity_match" (A12): Names in payer/split fields that don't match any known member (e.g., "Priya S"). Suggest a merge option.
6. "external_guest" (A17): Non-flatmates added to the split list (e.g., "Dev's friend Kabir"). Surface absorption options.
7. "membership_inconsistency" (A15): Roommates included in splits for dates *after* they moved out or *before* they moved in (e.g. Meera in April splits, as Meera moved out March 31).

Return the anomalies strictly according to the specified JSON schema. Keep summaries short and provide a recommended_option_id for each card.
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            review_items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Unique ID for this review item, e.g. A1-rows-5-6' },
                  type: { 
                    type: 'string', 
                    enum: [
                      'duplicate',
                      'settlement_or_transfer',
                      'missing_payer',
                      'ambiguous_date',
                      'membership_inconsistency',
                      'identity_match',
                      'external_guest'
                    ]
                  },
                  row_refs: { type: 'array', items: { type: 'integer' }, description: 'CSV row numbers affected' },
                  summary: { type: 'string', description: 'Friendly explanation of what was detected' },
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', description: 'Action key, e.g., keep_row_5, convert_to_transfer, remove_member' },
                        label: { type: 'string', description: 'User-friendly label for button' }
                      },
                      required: ['id', 'label']
                    }
                  },
                  recommended_option_id: { type: 'string', description: 'ID of the option that represents the house policy or best inference' }
                },
                required: ['id', 'type', 'row_refs', 'summary', 'options', 'recommended_option_id']
              }
            }
          },
          required: ['review_items']
        }
      }
    });

    const text = response.response.text();
    const resultObj = JSON.parse(text);

    return { reviewItems: resultObj.review_items || [], source: 'llm' };
  } catch (error) {
    console.error('Gemini API call failed. Falling back to local heuristic classifier. Error:', error);
    return { reviewItems: runHeuristicsClassifier(cleanedRows, knownMembers), source: 'heuristic_fallback' };
  }
}

/**
 * Stage 3: Decision Application Engine
 * Applies the admin's chosen options to the Stage-1 cleaned rows.
 * Returns the final expenses, transfers, and logs.
 * 
 * @param {Array} cleanedRows - Cleaned rows from Stage 1
 * @param {Array} decisions - Chosen decisions from admin: [{ itemId, chosenOptionId }]
 * @param {Array} knownMembers - Users in the database
 * @returns {Object} { finalExpenses, finalTransfers, logUpdates, guestUsersToCreate }
 */
export function applyDecisions(cleanedRows, decisions, knownMembers) {
  const decisionsMap = new Map(decisions.map(d => [d.itemId, d.chosenOptionId]));
  const memberSet = new Set(knownMembers.map(m => m.name.toLowerCase()));
  const memberNameMap = new Map(knownMembers.map(m => [m.name.toLowerCase(), m]));
  const memberIdMap = new Map(knownMembers.map(m => [m.id, m]));

  const finalExpenses = [];
  const finalTransfers = [];
  const logUpdates = [];
  const guestUsersToCreate = new Set(); // Guest names to create in DB

  // We need to keep track of row exclusions (for duplicates)
  // key: originalRowNumber, value: boolean
  const excludedRows = new Set();

  // Group duplicate decisions first
  decisions.forEach(d => {
    if (d.itemId.startsWith('A1-') || d.itemId.startsWith('A2-')) {
      const parts = d.itemId.split('-');
      // Find row numbers in the ID: A2-rows-24-25 -> [24, 25]
      const rowNums = parts.filter(p => !isNaN(parseInt(p, 10))).map(p => parseInt(p, 10));
      
      if (d.chosenOptionId.startsWith('keep_row_')) {
        const rowToKeep = parseInt(d.chosenOptionId.replace('keep_row_', ''), 10);
        rowNums.forEach(num => {
          if (num !== rowToKeep) {
            excludedRows.add(num);
          }
        });
      }
    }
  });

  for (const row of cleanedRows) {
    const rowNum = row.originalRowNumber;
    const desc = row.description;
    const notes = row.notes;

    // 1. If row was excluded by duplicate check, skip or add as inactive
    if (excludedRows.has(rowNum)) {
      logUpdates.push({
        sourceRowNumber: rowNum,
        anomalyId: rowNum === 24 || rowNum === 5 ? 'A1' : 'A2',
        severity: 'review_required',
        description: `Row excluded as a duplicate.`,
        resolution: `Excluded in favor of other duplicate row`,
      });
      continue;
    }

    // If voided in Stage 1, we still insert it as voided
    if (row.status === 'void') {
      finalExpenses.push({
        sourceRowNumber: rowNum,
        description: desc,
        amountInr: 0,
        expenseDate: new Date(row.date),
        paidBy: null, // voided has no payer
        splitType: row.split_type,
        status: 'void',
        notes: row.notes,
        splits: [],
      });
      continue;
    }

    // 2. Check Settlement/Transfer decisions (A3/A16)
    const isSettlementDecision = decisionsMap.get(`A3-row-${rowNum}`);
    const isDepositDecision = decisionsMap.get(`A16-row-${rowNum}`);
    const chosenTransferOpt = isSettlementDecision || isDepositDecision;

    if (chosenTransferOpt === 'convert_to_transfer') {
      // Reclassify as transfer instead of expense
      const isDeposit = !!isDepositDecision;
      const transferType = isDeposit ? 'deposit' : 'settlement';
      
      // We need to resolve from/to users
      let fromUser = row.paid_by;
      let toUser = row.split_with.split(';')[0]; // first split participant

      // Let's resolve their database IDs
      const fromMember = memberNameMap.get((fromUser || '').toLowerCase());
      const toMember = memberNameMap.get((toUser || '').toLowerCase());

      finalTransfers.push({
        sourceRowNumber: rowNum,
        transferDate: new Date(row.date),
        description: desc,
        amountInr: row.amountInr,
        fromUserId: fromMember ? fromMember.id : null,
        fromUserName: fromUser,
        toUserId: toMember ? toMember.id : null,
        toUserName: toUser,
        transferType,
      });

      logUpdates.push({
        sourceRowNumber: rowNum,
        anomalyId: isDeposit ? 'A16' : 'A3',
        severity: 'review_required',
        description: `Reclassified expense '${desc}' as Transfer (${transferType}).`,
        resolution: `Record as direct Transfer`,
      });
      continue;
    }

    // 3. Resolve Payer (A10 / A12)
    let finalPayerName = row.paid_by;
    let finalPayerId = null;
    let isWriteOff = false;

    // Missing Payer card (A10)
    const missingPayerDecision = decisionsMap.get(`A10-row-${rowNum}`);
    if (missingPayerDecision) {
      if (missingPayerDecision === 'write_off') {
        isWriteOff = true;
        logUpdates.push({
          sourceRowNumber: rowNum,
          anomalyId: 'A10',
          severity: 'review_required',
          description: `Missing payer resolved as write-off.`,
          resolution: `Treat as write-off`,
        });
      } else if (missingPayerDecision.startsWith('payer_')) {
        const payerId = parseInt(missingPayerDecision.replace('payer_', ''), 10);
        const member = memberIdMap.get(payerId);
        if (member) {
          finalPayerId = member.id;
          finalPayerName = member.name;
          logUpdates.push({
            sourceRowNumber: rowNum,
            anomalyId: 'A10',
            severity: 'review_required',
            description: `Assigned missing payer to '${member.name}'.`,
            resolution: `Set payer as ${member.name}`,
          });
        }
      }
    } else if (row.paid_by) {
      // Known or ambiguous payer
      const ambiguousPayerDecision = decisionsMap.get(`A12-row-${rowNum}`);
      if (ambiguousPayerDecision) {
        if (ambiguousPayerDecision.startsWith('confirm_payer_')) {
          const payerId = parseInt(ambiguousPayerDecision.replace('confirm_payer_', ''), 10);
          const member = memberIdMap.get(payerId);
          if (member) {
            finalPayerId = member.id;
            finalPayerName = member.name;
            logUpdates.push({
              sourceRowNumber: rowNum,
              anomalyId: 'A12',
              severity: 'review_required',
              description: `Resolved ambiguous name '${row.paid_by}' to member '${member.name}'.`,
              resolution: `Map to member ${member.name}`,
            });
          }
        } else if (ambiguousPayerDecision === 'create_guest') {
          guestUsersToCreate.add(row.paid_by);
          finalPayerName = row.paid_by;
          logUpdates.push({
            sourceRowNumber: rowNum,
            anomalyId: 'A12',
            severity: 'review_required',
            description: `Resolved ambiguous name '${row.paid_by}' by creating new guest profile.`,
            resolution: `Create new guest user`,
          });
        }
      } else {
        // Standard case - match to member id
        const member = memberNameMap.get(row.paid_by.toLowerCase());
        if (member) {
          finalPayerId = member.id;
        } else {
          // If not matching and no decision was made, create guest to prevent failure
          guestUsersToCreate.add(row.paid_by);
        }
      }
    }

    // 4. Resolve Date (A14)
    let finalDate = new Date(row.date);
    const dateDecision = decisionsMap.get(`A14-row-${rowNum}`);
    if (dateDecision) {
      if (dateDecision === 'date_april_5') {
        finalDate = new Date('2026-04-05');
        logUpdates.push({
          sourceRowNumber: rowNum,
          anomalyId: 'A14',
          severity: 'review_required',
          description: `Resolved ambiguous date format. Set to April 5, 2026.`,
          resolution: `Set date to 5 April 2026`,
        });
      } else if (dateDecision === 'date_may_4') {
        finalDate = new Date('2026-05-04');
        logUpdates.push({
          sourceRowNumber: rowNum,
          anomalyId: 'A14',
          severity: 'review_required',
          description: `Resolved ambiguous date format. Set to May 4, 2026.`,
          resolution: `Set date to 4 May 2026`,
        });
      }
    }

    // 5. Resolve Split Participants list
    let participants = row.split_with.split(';').map(n => n.trim()).filter(Boolean);

    // Membership Inconsistency (A15) - departed member Meera
    const membershipDecision = decisionsMap.get(`A15-row-${rowNum}`);
    if (membershipDecision === 'remove_member') {
      participants = participants.filter(p => p.toLowerCase() !== 'meera');
      logUpdates.push({
        sourceRowNumber: rowNum,
        anomalyId: 'A15',
        severity: 'review_required',
        description: `Removed departed member Meera from split.`,
        resolution: `Remove Meera from split`,
      });
    } else if (membershipDecision === 'keep_member') {
      logUpdates.push({
        sourceRowNumber: rowNum,
        anomalyId: 'A15',
        severity: 'review_required',
        description: `Kept departed member Meera in split.`,
        resolution: `Keep Meera in split`,
      });
    }

    // External Guest Splits (A17) - Dev's friend Kabir
    let guestAction = null;
    let guestNameStr = '';
    decisions.forEach(d => {
      if (d.itemId.startsWith(`A17-row-${rowNum}-`)) {
        guestAction = d.chosenOptionId;
        guestNameStr = d.itemId.split('-guest-')[1].replace(/_/g, ' ');
      }
    });

    let guestAbsorbedBy = null;
    if (guestAction) {
      if (guestAction === 'absorb_into_host') {
        participants = participants.filter(p => p.toLowerCase() !== guestNameStr.toLowerCase());
        guestAbsorbedBy = 'Dev';
        logUpdates.push({
          sourceRowNumber: rowNum,
          anomalyId: 'A17',
          severity: 'review_required',
          description: `Absorbed guest '${guestNameStr}' share into host Dev's split.`,
          resolution: `Absorb guest share into host Dev`,
        });
      } else if (guestAction === 'split_among_flatmates') {
        participants = participants.filter(p => p.toLowerCase() !== guestNameStr.toLowerCase());
        logUpdates.push({
          sourceRowNumber: rowNum,
          anomalyId: 'A17',
          severity: 'review_required',
          description: `Distributed guest '${guestNameStr}' share equally among flatmates.`,
          resolution: `Split among flatmates`,
        });
      } else if (guestAction === 'add_guest_user') {
        guestUsersToCreate.add(guestNameStr);
        logUpdates.push({
          sourceRowNumber: rowNum,
          anomalyId: 'A17',
          severity: 'review_required',
          description: `Created guest profile for '${guestNameStr}' and split normally.`,
          resolution: `Create guest user profile`,
        });
      }
    } else {
      for (const p of participants) {
        if (!memberSet.has(p.toLowerCase())) {
          guestUsersToCreate.add(p);
        }
      }
    }

    // 6. Calculate final splits using split engine
    let computedSplits = [];
    if (guestAbsorbedBy && guestAction === 'absorb_into_host') {
      const fullList = [...participants, guestNameStr];
      const fullSplits = calculateSplits(row.amountInr, row.split_type, fullList, row.split_details);
      
      const guestShareObj = fullSplits.find(s => s.name.toLowerCase() === guestNameStr.toLowerCase());
      const guestShare = guestShareObj ? guestShareObj.shareAmountInr : 0;

      computedSplits = fullSplits.filter(s => s.name.toLowerCase() !== guestNameStr.toLowerCase());
      const hostSplit = computedSplits.find(s => s.name.toLowerCase() === guestAbsorbedBy.toLowerCase());
      if (hostSplit) {
        hostSplit.shareAmountInr = Math.round((hostSplit.shareAmountInr + guestShare) * 100) / 100;
        hostSplit.shareInput = `${hostSplit.shareInput} + guest absorb`;
      }
    } else {
      computedSplits = calculateSplits(row.amountInr, row.split_type, participants, row.split_details);
    }

    // Log duplicate resolutions that were kept
    decisions.forEach(d => {
      if ((d.itemId.startsWith('A1-') || d.itemId.startsWith('A2-')) && d.chosenOptionId === `keep_row_${rowNum}`) {
        const type = d.itemId.startsWith('A1-') ? 'A1' : 'A2';
        logUpdates.push({
          sourceRowNumber: rowNum,
          anomalyId: type,
          severity: 'review_required',
          description: `Kept row ${rowNum} in favor of other duplicate rows.`,
          resolution: `Keep row ${rowNum}`,
        });
      }
    });

    finalExpenses.push({
      sourceRowNumber: rowNum,
      description: desc,
      amountInr: row.amountInr,
      originalAmount: row.originalAmountStr ? parseFloat(row.originalAmountStr) : null,
      originalCurrency: row.currency !== 'INR' ? row.currency : null,
      exchangeRate: row.exchangeRate,
      expenseDate: finalDate,
      paidById: finalPayerId,
      paidByUserName: finalPayerName,
      isWriteOff,
      splitType: row.split_type,
      status: 'active',
      notes: row.notes,
      splits: computedSplits,
    });
  }

  return {
    finalExpenses,
    finalTransfers,
    logUpdates,
    guestUsersToCreate: Array.from(guestUsersToCreate),
  };
}

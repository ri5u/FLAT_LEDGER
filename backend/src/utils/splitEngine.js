/**
 * Split Engine for Flatmate Ledger
 * Calculates the exact share (in INR) for each participant based on split type and details.
 * Ensures standard currency precision (2 decimal places) and resolves penny rounding discrepancies.
 */

/**
 * Parses split details string like:
 * "Aisha 30%; Rohan 30%; Priya 30%; Meera 20%"
 * "Aisha 1; Rohan 2; Priya 1; Dev 2"
 * "Rohan 700; Priya 400; Meera 400"
 * 
 * Returns an array of objects: { name: string, value: number }
 */
export function parseSplitDetails(detailsString) {
  if (!detailsString || typeof detailsString !== 'string') {
    return [];
  }

  // Split by semicolon
  const parts = detailsString.split(';').map(p => p.trim()).filter(Boolean);
  const parsed = [];

  for (const part of parts) {
    // Regex matches a name followed by a number (and optional percentage sign)
    // E.g., "Aisha 30%" -> group 1: "Aisha", group 2: "30"
    // E.g., "rohan 1" -> group 1: "rohan", group 2: "1"
    const match = part.match(/^(.+?)\s+([0-9.-]+)%?$/);
    if (match) {
      const name = match[1].trim();
      const value = parseFloat(match[2]);
      if (!isNaN(value)) {
        parsed.push({ name, value });
      }
    }
  }

  return parsed;
}

/**
 * Calculates shares for each participant.
 * 
 * @param {number} amountInr - Total expense amount in INR
 * @param {string} splitType - 'equal' | 'percentage' | 'share' | 'unequal'
 * @param {string[]} participantNames - List of participant names
 * @param {string} splitDetailsString - Raw split details from CSV/input (optional)
 * @returns {Array<{ name: string, shareAmountInr: number, shareInput: string }>} Calculated shares
 */
export function calculateSplits(amountInr, splitType, participantNames, splitDetailsString = '') {
  if (typeof amountInr !== 'number' || isNaN(amountInr) || amountInr <= 0) {
    // Handle zero or negative amounts gracefully by splitting 0
    amountInr = 0;
  }

  const normalizedType = splitType.toLowerCase();
  const parsedDetails = parseSplitDetails(splitDetailsString);

  let shares = [];

  if (normalizedType === 'equal') {
    // Equal split
    const count = participantNames.length;
    if (count === 0) return [];

    const baseShare = Math.floor((amountInr / count) * 100) / 100;
    let sum = 0;

    shares = participantNames.map((name) => {
      sum += baseShare;
      return {
        name,
        shareAmountInr: baseShare,
        shareInput: 'equal',
      };
    });

    // Distribute remaining cents/paise (rounding difference)
    // Let's add the remainder to the first participant
    const remainder = Math.round((amountInr - sum) * 100) / 100;
    if (remainder !== 0 && shares.length > 0) {
      shares[0].shareAmountInr = Math.round((shares[0].shareAmountInr + remainder) * 100) / 100;
    }

  } else if (normalizedType === 'percentage') {
    // Percentage split
    const count = participantNames.length;
    if (count === 0) return [];

    // Map parsed details to participants
    const detailsMap = new Map(parsedDetails.map(d => [d.name.toLowerCase(), d.value]));
    
    // Get raw percentages for each participant, default to equal split if not specified
    let rawPercentages = participantNames.map(name => {
      return {
        name,
        pct: detailsMap.get(name.toLowerCase()) ?? (100 / count),
      };
    });

    // Check sum of percentages
    const totalPct = rawPercentages.reduce((acc, curr) => acc + curr.pct, 0);

    // If sum is not 100% (Anomaly A18), normalize it proportionally
    if (Math.abs(totalPct - 100) > 0.0001 && totalPct > 0) {
      rawPercentages = rawPercentages.map(item => ({
        name: item.name,
        pct: (item.pct * 100) / totalPct,
      }));
    }

    let sum = 0;
    shares = rawPercentages.map((item) => {
      const share = Math.round(amountInr * (item.pct / 100) * 100) / 100;
      sum += share;
      const originalPct = detailsMap.get(item.name.toLowerCase());
      return {
        name: item.name,
        shareAmountInr: share,
        shareInput: originalPct !== undefined ? `${originalPct}%` : `${Math.round((100 / count) * 10) / 10}%`,
      };
    });

    // Adjust rounding difference
    const remainder = Math.round((amountInr - sum) * 100) / 100;
    if (remainder !== 0 && shares.length > 0) {
      // Find the one with the largest share to absorb the rounding difference, or default to first
      shares[0].shareAmountInr = Math.round((shares[0].shareAmountInr + remainder) * 100) / 100;
    }

  } else if (normalizedType === 'share') {
    // Share split (e.g. 1 share, 2 shares)
    const count = participantNames.length;
    if (count === 0) return [];

    const detailsMap = new Map(parsedDetails.map(d => [d.name.toLowerCase(), d.value]));
    
    // Get shares for each participant, default to 1 share if not specified
    const rawShares = participantNames.map(name => {
      return {
        name,
        shareVal: detailsMap.get(name.toLowerCase()) ?? 1,
      };
    });

    const totalShares = rawShares.reduce((acc, curr) => acc + curr.shareVal, 0);

    if (totalShares <= 0) {
      // Fallback to equal split if total shares is 0 or negative
      return calculateSplits(amountInr, 'equal', participantNames);
    }

    let sum = 0;
    shares = rawShares.map((item) => {
      const share = Math.round(amountInr * (item.shareVal / totalShares) * 100) / 100;
      sum += share;
      const inputVal = detailsMap.get(item.name.toLowerCase());
      return {
        name: item.name,
        shareAmountInr: share,
        shareInput: inputVal !== undefined ? `${inputVal} shares` : '1 share',
      };
    });

    // Adjust rounding difference
    const remainder = Math.round((amountInr - sum) * 100) / 100;
    if (remainder !== 0 && shares.length > 0) {
      shares[0].shareAmountInr = Math.round((shares[0].shareAmountInr + remainder) * 100) / 100;
    }

  } else if (normalizedType === 'unequal') {
    // Unequal split (explicit amounts)
    const detailsMap = new Map(parsedDetails.map(d => [d.name.toLowerCase(), d.value]));
    
    let sum = 0;
    shares = participantNames.map((name) => {
      const explicitVal = detailsMap.get(name.toLowerCase()) ?? 0;
      sum += explicitVal;
      return {
        name,
        shareAmountInr: explicitVal,
        shareInput: explicitVal.toString(),
      };
    });

    // NOTE: For unequal splits, we do not auto-force-adjust a rounding remainder
    // because the user explicitly enters amounts. However, if sum !== amountInr,
    // we let it be handled by validation at import/creation time.
  }

  return shares;
}

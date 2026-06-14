import prisma from '../utils/db.js';

export const getBalances = async (req, res) => {
  try {
    // 1. Fetch all active expenses and their splits
    const expenses = await prisma.expense.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        paidBy: true,
        splits: {
          select: {
            userId: true,
            shareAmountInr: true,
          },
        },
      },
    });

    // 2. Fetch all transfers
    const transfers = await prisma.transfer.findMany({
      select: {
        fromUserId: true,
        toUserId: true,
        amountInr: true,
      },
    });

    // 3. Fetch all users for names lookup
    const users = await prisma.user.findMany({
      select: { id: true, name: true, isGuest: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Initialize balance ledger
    // balanceLedger[A][B] represents what A owes B
    const balanceLedger = {};
    const initializePair = (u1, u2) => {
      if (!balanceLedger[u1]) balanceLedger[u1] = {};
      if (!balanceLedger[u2]) balanceLedger[u2] = {};
      if (balanceLedger[u1][u2] === undefined) {
        balanceLedger[u1][u2] = 0;
        balanceLedger[u2][u1] = 0;
      }
    };

    // Process expense splits
    // If user A participated in expense paid by B, user A owes B their share amount
    for (const exp of expenses) {
      const creditorId = exp.paidBy;
      for (const split of exp.splits) {
        const debtorId = split.userId;
        if (debtorId !== creditorId) {
          initializePair(debtorId, creditorId);
          // Convert Decimal to float for calculations
          const share = parseFloat(split.shareAmountInr.toString());
          balanceLedger[debtorId][creditorId] += share;
        }
      }
    }

    // Process transfers
    // If A paid B directly (transfer), it reduces what A owes B
    for (const tx of transfers) {
      const senderId = tx.fromUserId;
      const receiverId = tx.toUserId;
      initializePair(senderId, receiverId);
      const amount = parseFloat(tx.amountInr.toString());
      balanceLedger[senderId][receiverId] -= amount;
    }

    // Net out all balances
    const netBalances = [];
    const visited = new Set();

    for (const u1 of userMap.keys()) {
      for (const u2 of userMap.keys()) {
        if (u1 === u2) continue;
        const pairKey = [u1, u2].sort().join('-');
        if (visited.has(pairKey)) continue;
        visited.add(pairKey);

        const u1_owes_u2 = balanceLedger[u1]?.[u2] || 0;
        const u2_owes_u1 = balanceLedger[u2]?.[u1] || 0;

        const net = u1_owes_u2 - u2_owes_u1;
        const u1Info = userMap.get(u1);
        const u2Info = userMap.get(u2);

        if (net > 0.005) {
          netBalances.push({
            debtorId: u1,
            debtorName: u1Info.name,
            debtorIsGuest: u1Info.isGuest,
            creditorId: u2,
            creditorName: u2Info.name,
            creditorIsGuest: u2Info.isGuest,
            amountInr: Math.round(net * 100) / 100,
          });
        } else if (net < -0.005) {
          netBalances.push({
            debtorId: u2,
            debtorName: u2Info.name,
            debtorIsGuest: u2Info.isGuest,
            creditorId: u1,
            creditorName: u1Info.name,
            creditorIsGuest: u1Info.isGuest,
            amountInr: Math.round(Math.abs(net) * 100) / 100,
          });
        }
      }
    }

    return res.json({ balances: netBalances });
  } catch (error) {
    console.error('Error computing balances:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBalanceBreakdown = async (req, res) => {
  const { userId } = req.params;

  try {
    const targetUserId = parseInt(userId, 10);
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 1. Get all active expenses where:
    // - The target user paid, and others had splits (other owes target)
    // - The target user had a split, and someone else paid (target owes other)
    const expenses = await prisma.expense.findMany({
      where: {
        status: 'active',
        OR: [
          { paidBy: targetUserId },
          { splits: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        payer: { select: { id: true, name: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { expenseDate: 'asc' },
    });

    // 2. Get all transfers involving the target user
    const transfers = await prisma.transfer.findMany({
      where: {
        OR: [
          { fromUserId: targetUserId },
          { toUserId: targetUserId },
        ],
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
      orderBy: { transferDate: 'asc' },
    });

    // 3. Get all other users for counterparty iteration
    const otherUsers = await prisma.user.findMany({
      where: { id: { not: targetUserId } },
      select: { id: true, name: true, isGuest: true },
    });

    // Group items by counterparty
    const breakdown = {};
    for (const user of otherUsers) {
      breakdown[user.id] = {
        counterparty: { id: user.id, name: user.name, isGuest: user.isGuest },
        items: [], // Array of { type: 'expense_split' | 'transfer', date, description, amount (positive: they owe target, negative: target owes them), refId }
        netBalance: 0, // positive: counterparty owes target, negative: target owes counterparty
      };
    }

    // Process expenses
    for (const exp of expenses) {
      const payerId = exp.paidBy;
      const date = exp.expenseDate;
      const description = exp.description;
      const totalAmount = parseFloat(exp.amountInr.toString());

      if (payerId === targetUserId) {
        // Target user paid, others owe target user
        for (const split of exp.splits) {
          const debtorId = split.userId;
          if (debtorId !== targetUserId && breakdown[debtorId]) {
            const share = parseFloat(split.shareAmountInr.toString());
            breakdown[debtorId].items.push({
              type: 'expense_split',
              role: 'creditor', // Target user is creditor
              date,
              description,
              totalAmount,
              shareAmount: share,
              direction: 'positive', // Counterparty owes target
              refId: exp.id,
            });
            breakdown[debtorId].netBalance += share;
          }
        }
      } else {
        // Someone else paid, target user owes them
        const mySplit = exp.splits.find(s => s.userId === targetUserId);
        if (mySplit && breakdown[payerId]) {
          const share = parseFloat(mySplit.shareAmountInr.toString());
          breakdown[payerId].items.push({
            type: 'expense_split',
            role: 'debtor', // Target user is debtor
            date,
            description,
            totalAmount,
            shareAmount: share,
            direction: 'negative', // Target owes counterparty
            refId: exp.id,
          });
          breakdown[payerId].netBalance -= share;
        }
      }
    }

    // Process transfers
    for (const tx of transfers) {
      const date = tx.transferDate;
      const description = tx.description;
      const amount = parseFloat(tx.amountInr.toString());

      if (tx.fromUserId === targetUserId) {
        // Target user paid counterparty (reduces target's debt or increases what counterparty owes)
        const destId = tx.toUserId;
        if (breakdown[destId]) {
          breakdown[destId].items.push({
            type: 'transfer',
            role: 'sender',
            date,
            description,
            shareAmount: amount,
            direction: 'positive', // Reduces target's debt (positive change to net)
            refId: tx.id,
          });
          breakdown[destId].netBalance += amount;
        }
      } else {
        // Counterparty paid target user (increases target's debt or reduces what counterparty owes)
        const srcId = tx.fromUserId;
        if (breakdown[srcId]) {
          breakdown[srcId].items.push({
            type: 'transfer',
            role: 'receiver',
            date,
            description,
            shareAmount: amount,
            direction: 'negative', // Increases target's debt (negative change to net)
            refId: tx.id,
          });
          breakdown[srcId].netBalance -= amount;
        }
      }
    }

    // Format output
    // Filter out counterparties with zero items and zero balance, sort items by date
    const formattedBreakdown = Object.values(breakdown)
      .filter((grp) => grp.items.length > 0 || Math.abs(grp.netBalance) > 0.005)
      .map((grp) => {
        grp.items.sort((a, b) => new Date(a.date) - new Date(b.date));
        grp.netBalance = Math.round(grp.netBalance * 100) / 100;
        return grp;
      });

    return res.json({
      userId: targetUserId,
      userName: targetUser.name,
      breakdown: formattedBreakdown,
    });
  } catch (error) {
    console.error('Error fetching balance breakdown:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

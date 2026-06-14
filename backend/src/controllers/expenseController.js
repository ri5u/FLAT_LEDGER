import prisma from '../utils/db.js';
import { calculateSplits } from '../utils/splitEngine.js';

export const getExpenses = async (req, res) => {
  const { status, payerId, startDate, endDate } = req.query;

  try {
    const filters = {};

    // By default, only show active expenses unless explicitly filtered
    if (status) {
      filters.status = status;
    } else {
      filters.status = 'active';
    }

    if (payerId) {
      filters.paidBy = parseInt(payerId, 10);
    }

    if (startDate || endDate) {
      filters.expenseDate = {};
      if (startDate) {
        filters.expenseDate.gte = new Date(startDate);
      }
      if (endDate) {
        filters.expenseDate.lte = new Date(endDate);
      }
    }

    const expenses = await prisma.expense.findMany({
      where: filters,
      include: {
        payer: {
          select: { id: true, name: true, role: true, isGuest: true },
        },
        splits: {
          include: {
            user: {
              select: { id: true, name: true, role: true, isGuest: true },
            },
          },
        },
      },
      orderBy: { expenseDate: 'desc' },
    });

    return res.json({ expenses });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getExpenseById = async (req, res) => {
  const { id } = req.params;

  try {
    const expenseId = parseInt(id, 10);
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        payer: {
          select: { id: true, name: true, role: true, isGuest: true },
        },
        splits: {
          include: {
            user: {
              select: { id: true, name: true, role: true, isGuest: true },
            },
          },
        },
        importBatch: {
          select: { id: true, originalFilename: true, uploadedAt: true },
        },
      },
    });

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    return res.json({ expense });
  } catch (error) {
    console.error('Error fetching expense details:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTransfers = async (req, res) => {
  try {
    const transfers = await prisma.transfer.findMany({
      include: {
        fromUser: {
          select: { id: true, name: true, role: true, isGuest: true },
        },
        toUser: {
          select: { id: true, name: true, role: true, isGuest: true },
        },
      },
      orderBy: { transferDate: 'desc' },
    });
    return res.json({ transfers });
  } catch (error) {
    console.error('Error fetching transfers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createManualExpense = async (req, res) => {
  const { description, amount, expenseDate, paidById, splitType, participantIds, splitDetails } = req.body;

  if (!description || !amount || !expenseDate || !paidById || !splitType || !participantIds || participantIds.length === 0) {
    return res.status(400).json({ error: 'Missing required fields for manual expense' });
  }

  try {
    // Resolve user names for split engine
    const users = await prisma.user.findMany({
      where: { id: { in: participantIds } },
      select: { id: true, name: true },
    });

    if (users.length !== participantIds.length) {
      return res.status(400).json({ error: 'One or more participant IDs are invalid' });
    }

    const nameToId = new Map(users.map(u => [u.name.toLowerCase(), u.id]));
    const names = users.map(u => u.name);

    // Calculate splits
    const amountVal = parseFloat(amount);
    const computedSplits = calculateSplits(amountVal, splitType, names, splitDetails || '');

    // Check sum match for unequal split
    if (splitType.toLowerCase() === 'unequal') {
      const sum = computedSplits.reduce((acc, curr) => acc + curr.shareAmountInr, 0);
      if (Math.abs(sum - amountVal) > 0.01) {
        return res.status(400).json({ error: `Sum of unequal split shares (₹${sum}) does not equal total amount (₹${amountVal})` });
      }
    }

    // Write to database inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          description,
          amountInr: amountVal,
          expenseDate: new Date(expenseDate),
          paidBy: parseInt(paidById, 10),
          splitType,
          status: 'active',
          notes: 'Manually logged',
        },
      });

      const splitsData = computedSplits.map(split => {
        const userId = nameToId.get(split.name.toLowerCase());
        return {
          expenseId: expense.id,
          userId,
          shareAmountInr: split.shareAmountInr,
          shareInput: split.shareInput,
        };
      });

      await tx.expenseSplit.createMany({
        data: splitsData,
      });

      return tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          payer: { select: { id: true, name: true } },
          splits: { include: { user: { select: { id: true, name: true } } } },
        },
      });
    });

    return res.status(201).json({
      message: 'Expense created successfully',
      expense: result,
    });
  } catch (error) {
    console.error('Error logging manual expense:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createManualTransfer = async (req, res) => {
  const { description, amount, transferDate, fromUserId, toUserId, transferType } = req.body;

  if (!amount || !transferDate || !fromUserId || !toUserId) {
    return res.status(400).json({ error: 'Missing required fields for manual transfer' });
  }

  try {
    const fromId = parseInt(fromUserId, 10);
    const toId = parseInt(toUserId, 10);

    const fromUser = await prisma.user.findUnique({ where: { id: fromId } });
    const toUser = await prisma.user.findUnique({ where: { id: toId } });

    if (!fromUser || !toUser) {
      return res.status(400).json({ error: 'Invalid sender or receiver user ID' });
    }

    const transfer = await prisma.transfer.create({
      data: {
        description: description || `${fromUser.name} paid ${toUser.name} back`,
        amountInr: parseFloat(amount),
        transferDate: new Date(transferDate),
        fromUserId: fromId,
        toUserId: toId,
        transferType: transferType || 'settlement',
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json({
      message: 'Transfer recorded successfully',
      transfer,
    });
  } catch (error) {
    console.error('Error logging manual transfer:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

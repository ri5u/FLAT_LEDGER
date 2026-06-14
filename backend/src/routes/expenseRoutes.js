import express from 'express';
import {
  getExpenses,
  getExpenseById,
  getTransfers,
  createManualExpense,
  createManualTransfer
} from '../controllers/expenseController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/expenses', authenticateToken, getExpenses);
router.get('/expenses/:id', authenticateToken, getExpenseById);
router.post('/expenses', authenticateToken, createManualExpense);

router.get('/transfers', authenticateToken, getTransfers);
router.post('/transfers', authenticateToken, createManualTransfer);

export default router;

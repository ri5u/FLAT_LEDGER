import express from 'express';
import { getBalances, getBalanceBreakdown } from '../controllers/balanceController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, getBalances);
router.get('/:userId/breakdown', authenticateToken, getBalanceBreakdown);

export default router;

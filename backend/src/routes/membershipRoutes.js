import express from 'express';
import { getMemberships, updateMembership } from '../controllers/membershipController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, getMemberships);
router.patch('/:id', authenticateToken, requireAdmin, updateMembership);

export default router;

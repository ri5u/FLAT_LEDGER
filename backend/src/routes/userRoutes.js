import express from 'express';
import { getUsers, createMember, updateMember } from '../controllers/userController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, getUsers);
router.post('/', authenticateToken, requireAdmin, createMember);
router.patch('/:id', authenticateToken, requireAdmin, updateMember);

export default router;

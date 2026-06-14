import express from 'express';
import {
  uploadCSV,
  resolveImport,
  commitImport,
  getImportBatches,
  getImportBatchById,
  downloadReport
} from '../controllers/importController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Apply auth + admin middleware to all import operations
router.use(authenticateToken);
router.use(requireAdmin);

router.post('/', uploadCSV);
router.get('/', getImportBatches);
router.get('/:id', getImportBatchById);
router.post('/:id/resolve', resolveImport);
router.post('/:id/commit', commitImport);
router.get('/:id/report', downloadReport);

export default router;

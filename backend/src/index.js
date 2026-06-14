import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import membershipRoutes from './routes/membershipRoutes.js';
import transactionRoutes from './routes/expenseRoutes.js';
import balanceRoutes from './routes/balanceRoutes.js';
import importRoutes from './routes/importRoutes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/balances', balanceRoutes);
app.use('/api/imports', importRoutes);
app.use('/api', transactionRoutes); // Mount /expenses and /transfers

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
  console.log(`Backend server is running on port ${port}`);
});

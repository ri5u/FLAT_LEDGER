import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_flat_ledger_token_secret';

export const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { name }],
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this name or email already exists' });
    }

    // First user becomes admin, subsequent users are members
    const userCount = await prisma.user.count({
      where: { isGuest: false },
    });
    const role = userCount === 0 ? 'admin' : 'member';

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        isGuest: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    // Automatically create a membership record starting today
    await prisma.membership.create({
      data: {
        userId: newUser.id,
        joinedDate: new Date(),
        notes: 'Joined via registration',
      },
    });

    // Issue token
    const token = jwt.sign({ sub: newUser.id, role: newUser.role }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.status(201).json({
      message: 'Registration successful',
      token,
      user: newUser,
    });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.isGuest || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Issue token
    const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req, res) => {
  return res.json({ user: req.user });
};

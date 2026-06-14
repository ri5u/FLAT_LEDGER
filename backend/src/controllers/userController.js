import prisma from '../utils/db.js';

export const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isGuest: true,
        createdAt: true,
      },
    });
    return res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createMember = async (req, res) => {
  const { name, email, role, isGuest } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { name },
    });

    if (existing) {
      return res.status(400).json({ error: 'User with this name already exists' });
    }

    const newUser = await prisma.user.create({
      data: {
        name,
        email: email || null,
        role: role || (isGuest ? 'guest' : 'member'),
        isGuest: !!isGuest,
        passwordHash: null, // Guests and manually added users don't have passwords initially
      },
    });

    // If it's a permanent member, create an open membership record starting now
    if (!isGuest) {
      await prisma.membership.create({
        data: {
          userId: newUser.id,
          joinedDate: new Date(),
          notes: 'Added manually by admin',
        },
      });
    }

    return res.status(201).json({
      message: 'User created successfully',
      user: newUser,
    });
  } catch (error) {
    console.error('Error creating member:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateMember = async (req, res) => {
  const { id } = req.params;
  const { email, role, isGuest } = req.body;

  try {
    const userId = parseInt(id, 10);
    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        email: email !== undefined ? email : existing.email,
        role: role !== undefined ? role : existing.role,
        isGuest: isGuest !== undefined ? !!isGuest : existing.isGuest,
      },
    });

    return res.json({
      message: 'User updated successfully',
      user: updated,
    });
  } catch (error) {
    console.error('Error updating member:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

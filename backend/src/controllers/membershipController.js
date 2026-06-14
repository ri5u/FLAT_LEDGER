import prisma from '../utils/db.js';

export const getMemberships = async (req, res) => {
  try {
    const memberships = await prisma.membership.findMany({
      include: {
        user: {
          select: { id: true, name: true, role: true, isGuest: true },
        },
      },
      orderBy: { joinedDate: 'asc' },
    });
    return res.json({ memberships });
  } catch (error) {
    console.error('Error fetching memberships:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateMembership = async (req, res) => {
  const { id } = req.params;
  const { joinedDate, leftDate, notes } = req.body;

  try {
    const membershipId = parseInt(id, 10);
    const existing = await prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Membership record not found' });
    }

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: {
        joinedDate: joinedDate ? new Date(joinedDate) : existing.joinedDate,
        leftDate: leftDate ? new Date(leftDate) : leftDate === null ? null : existing.leftDate,
        notes: notes !== undefined ? notes : existing.notes,
      },
    });

    return res.json({
      message: 'Membership record updated successfully',
      membership: updated,
    });
  } catch (error) {
    console.error('Error updating membership:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

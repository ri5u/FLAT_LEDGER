import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial users...');

  // Common password hash for development
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', salt);

  const users = [
    { name: 'Aisha', email: 'aisha@flat.com', passwordHash, role: 'admin', isGuest: false },
    { name: 'Rohan', email: 'rohan@flat.com', passwordHash, role: 'member', isGuest: false },
    { name: 'Priya', email: 'priya@flat.com', passwordHash, role: 'member', isGuest: false },
    { name: 'Meera', email: 'meera@flat.com', passwordHash, role: 'member', isGuest: false },
    { name: 'Sam', email: 'sam@flat.com', passwordHash, role: 'member', isGuest: false },
    { name: 'Dev', email: 'dev@guest.com', passwordHash: null, role: 'guest', isGuest: true },
    { name: 'Kabir', email: 'kabir@guest.com', passwordHash: null, role: 'guest', isGuest: true },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { name: u.name },
      update: {
        email: u.email,
        passwordHash: u.passwordHash,
        role: u.role,
        isGuest: u.isGuest,
      },
      create: {
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash,
        role: u.role,
        isGuest: u.isGuest,
      },
    });
    console.log(`- Seeded user: ${user.name} (Role: ${user.role}, Guest: ${user.isGuest})`);
  }

  // Also seed initial membership timelines based on the spreadsheet:
  // - Meera moved out at the end of March 2026.
  // - Sam moved in mid-April (let's say April 15, 2026).
  // - Aisha, Rohan, Priya joined in Feb 2026.
  // - Dev joined for the weekend in Feb/March.
  
  console.log('Seeding initial memberships...');
  const aisha = await prisma.user.findUnique({ where: { name: 'Aisha' } });
  const rohan = await prisma.user.findUnique({ where: { name: 'Rohan' } });
  const priya = await prisma.user.findUnique({ where: { name: 'Priya' } });
  const meera = await prisma.user.findUnique({ where: { name: 'Meera' } });
  const sam = await prisma.user.findUnique({ where: { name: 'Sam' } });

  const memberships = [
    { userId: aisha.id, joinedDate: new Date('2026-02-01'), leftDate: null, notes: 'Original flatmate' },
    { userId: rohan.id, joinedDate: new Date('2026-02-01'), leftDate: null, notes: 'Original flatmate' },
    { userId: priya.id, joinedDate: new Date('2026-02-01'), leftDate: null, notes: 'Original flatmate' },
    { userId: meera.id, joinedDate: new Date('2026-02-01'), leftDate: new Date('2026-03-31'), notes: 'Moved out end of March' },
    { userId: sam.id, joinedDate: new Date('2026-04-15'), leftDate: null, notes: 'Moved in mid-April' },
  ];

  // Clear existing memberships to avoid duplicates
  await prisma.membership.deleteMany({});

  for (const m of memberships) {
    const membership = await prisma.membership.create({
      data: m,
    });
    console.log(`- Seeded membership for User ID ${membership.userId}: Joined ${m.joinedDate.toISOString().slice(0, 10)}`);
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

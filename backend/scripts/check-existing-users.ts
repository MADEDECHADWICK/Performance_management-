import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    const users = await prisma.user.findMany({
      include: {
        roles: true,
        profile: true
      }
    });

    console.log('=== Existing Users ===');
    users.forEach(user => {
      console.log(`ID: ${user.id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Name: ${user.name}`);
      console.log(`Roles: ${user.roles.map(r => r.role).join(', ')}`);
      console.log(`Profile: ${user.profile?.first_name} ${user.profile?.last_name}`);
      console.log('---');
    });

    console.log(`Total users found: ${users.length}`);
  } catch (error) {
    console.error('Error checking users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function updateUserPasswords() {
  try {
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Update GMP user password
    await prisma.user.update({
      where: { email: 'gmp@ronaldsllp.com' },
      data: { password: hashedPassword }
    });
    console.log('Updated GMP user password');

    // Update partner user password  
    const partnerUser = await prisma.user.findUnique({
      where: { email: 'john.partner@ronaldsllp.com' }
    });
    if (partnerUser) {
      await prisma.user.update({
        where: { email: 'john.partner@ronaldsllp.com' },
        data: { password: hashedPassword }
      });
      console.log('Updated partner user password');
    }

    // Update manager user password
    const managerUser = await prisma.user.findUnique({
      where: { email: 'sarah.manager@ronaldsllp.com' }
    });
    if (managerUser) {
      await prisma.user.update({
        where: { email: 'sarah.manager@ronaldsllp.com' },
        data: { password: hashedPassword }
      });
      console.log('Updated manager user password');
    }

    console.log('\nAll test users now have password: password123');
    console.log('You can now login with:');
    console.log('- gmp@ronaldsllp.com (Group Managing Partner)');
    console.log('- john.partner@ronaldsllp.com (Partner)'); 
    console.log('- sarah.manager@ronaldsllp.com (Manager)');

  } catch (error) {
    console.error('Error updating passwords:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateUserPasswords();
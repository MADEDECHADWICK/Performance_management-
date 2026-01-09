import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createGMPUser() {
  try {
    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: 'gmp@ronaldsllp.com' }
    });

    if (!user) {
      // Create a user first with hashed password
      const hashedPassword = await bcrypt.hash('password123', 10);
      user = await prisma.user.create({
        data: {
          email: 'gmp@ronaldsllp.com',
          name: 'Group Managing Partner',
          password: hashedPassword
        }
      });
      console.log('Created new user');
    } else {
      console.log('User already exists');
    }

    // Check if profile exists
    let profile = await prisma.profile.findUnique({
      where: { email: 'gmp@ronaldsllp.com' }
    });

    if (!profile) {
      // Create a profile for the GMP
      profile = await prisma.profile.create({
        data: {
          userId: user.id,
          first_name: 'Group',
          last_name: 'Partner',
          email: 'gmp@ronaldsllp.com',
          position: 'group_managing_partner',
          status: 'active',
          is_partner: true
        }
      });
      console.log('Created new profile');
    } else {
      // Update existing profile
      profile = await prisma.profile.update({
        where: { email: 'gmp@ronaldsllp.com' },
        data: {
          position: 'group_managing_partner',
          is_partner: true
        }
      });
      console.log('Updated existing profile');
    }

    // Check if role exists
    const existingRole = await prisma.userRole.findFirst({
      where: { 
        userId: user.id,
        role: 'super_admin'
      }
    });

    if (!existingRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          role: 'super_admin'
        }
      });
      console.log('Added super_admin role');
    }

    console.log('GMP User setup completed:');
    console.log('Email: gmp@ronaldsllp.com');
    console.log('Password: password123');
    console.log('Position: group_managing_partner');
    console.log('Profile ID:', profile.id);

  } catch (error) {
    console.error('Error creating GMP user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createGMPUser();
import prisma from '../src/prisma';

async function checkGMPAuth() {
  try {
    const gmpUser = await prisma.user.findUnique({
      where: { email: 'gmp@ronaldsllp.com' },
      include: { roles: true }
    });
    
    const gmpProfile = await prisma.profile.findUnique({
      where: { email: 'gmp@ronaldsllp.com' }
    });
    
    console.log('GMP User found:', gmpUser ? 'Yes' : 'No');
    console.log('GMP User ID:', gmpUser?.id);
    console.log('GMP User roles:', gmpUser?.roles);
    console.log('GMP Profile position:', gmpProfile?.position);
    console.log('GMP Profile is_partner:', gmpProfile?.is_partner);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkGMPAuth();
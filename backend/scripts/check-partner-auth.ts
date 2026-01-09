import prisma from '../src/prisma';
import bcrypt from 'bcryptjs';

async function checkPartnerAuth() {
  try {
    const user = await prisma.user.findUnique({ 
      where: { email: 'john.partner@ronaldsllp.com' },
      include: { roles: true }
    });
    
    const profile = await prisma.profile.findUnique({
      where: { email: 'john.partner@ronaldsllp.com' }
    });
    
    console.log('John Partner User:', user ? 'Found' : 'Not Found');
    if (user) {
      console.log('- ID:', user.id);
      console.log('- Email:', user.email);
      console.log('- Password set:', user.password ? 'Yes' : 'No');
      console.log('- Roles:', user.roles);
      
      if (user.password) {
        const isValid = await bcrypt.compare('password123', user.password);
        console.log('- Password valid:', isValid);
      }
    }
    
    console.log('\nJohn Partner Profile:', profile ? 'Found' : 'Not Found');
    if (profile) {
      console.log('- ID:', profile.id);
      console.log('- Position:', profile.position);
      console.log('- Is Partner:', profile.is_partner);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPartnerAuth();
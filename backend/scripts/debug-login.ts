import prisma from '../src/prisma';
import bcrypt from 'bcryptjs';

async function debugLogin() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'admin@ronalds.com' },
      include: { roles: true, profile: true }
    });

    console.log('User found:', user?.email);
    console.log('User has password hash:', !!user?.password);
    console.log('User password hash:', user?.password?.substring(0, 20) + '...');
    
    if (user?.password) {
      const testPassword = 'admin123456';
      const isValid = await bcrypt.compare(testPassword, user.password);
      console.log('Password validation result:', isValid);
    }

    console.log('User roles:', user?.roles.map(r => r.role));
    console.log('User profile:', {
      id: user?.profile?.id,
      first_name: user?.profile?.first_name,
      last_name: user?.profile?.last_name
    });
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

debugLogin();

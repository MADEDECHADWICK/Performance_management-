import prisma from '../src/prisma';

async function checkPassword() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'admin@ronalds.com' }
    });

    console.log('Full password hash in DB:');
    console.log(user?.password);
    console.log('');
    console.log('Hash length:', user?.password?.length);
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

checkPassword();

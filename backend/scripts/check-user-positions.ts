import prisma from '../src/prisma';

async function checkUserProfiles() {
  try {
    const johnPartner = await prisma.profile.findUnique({ 
      where: { email: 'john.partner@ronaldsllp.com' } 
    });
    
    const sarahManager = await prisma.profile.findUnique({ 
      where: { email: 'sarah.manager@ronaldsllp.com' } 
    });
    
    console.log('John Partner profile:');
    console.log('- Position:', johnPartner?.position);
    console.log('- Is Partner:', johnPartner?.is_partner);
    console.log('- Email:', johnPartner?.email);
    
    console.log('\nSarah Manager profile:');
    console.log('- Position:', sarahManager?.position);
    console.log('- Is Partner:', sarahManager?.is_partner);
    console.log('- Email:', sarahManager?.email);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserProfiles();
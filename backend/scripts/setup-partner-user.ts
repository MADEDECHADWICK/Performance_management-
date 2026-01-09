import prisma from '../src/prisma';

async function setupPartnerUser() {
  try {
    console.log('Setting up partner user john.partner@ronaldsllp.com...');
    
    // Get the user and profile
    const user = await prisma.user.findUnique({ 
      where: { email: 'john.partner@ronaldsllp.com' },
      include: { roles: true }
    });
    
    const profile = await prisma.profile.findUnique({
      where: { email: 'john.partner@ronaldsllp.com' }
    });
    
    if (!user || !profile) {
      console.log('User or profile not found');
      return;
    }
    
    console.log('User ID:', user.id, 'Profile ID:', profile.id);
    
    // Check if user has partner role
    const hasPartnerRole = user.roles.some(role => role.role === 'partner');
    if (!hasPartnerRole) {
      console.log('Adding partner role...');
      await prisma.userRole.create({
        data: {
          userId: user.id,
          role: 'partner'
        }
      });
    } else {
      console.log('Partner role already exists');
    }
    
    // Check if profile is marked as partner
    if (!profile.is_partner) {
      console.log('Updating profile to mark as partner...');
      await prisma.profile.update({
        where: { id: profile.id },
        data: { is_partner: true }
      });
    } else {
      console.log('Profile already marked as partner');
    }
    
    // Check if partner entry exists
    const partnerEntry = await prisma.partner.findUnique({
      where: { profile_id: profile.id }
    });
    
    if (!partnerEntry) {
      // Create company first
      let company = await prisma.partnerCompany.findFirst({
        where: { company_name: 'Ronalds LLP' }
      });
      
      if (!company) {
        console.log('Creating partner company...');
        company = await prisma.partnerCompany.create({
          data: {
            company_name: 'Ronalds LLP',
            registration_number: 'REG001',
            tax_id: 'TAX-12345',
            bank_account_details: 'Bank: KCB, Account: 1234567890',
            contract_terms: 'Standard partnership terms'
          }
        });
      }
      
      console.log('Creating partner entry...');
      await prisma.partner.create({
        data: {
          profile_id: profile.id,
          company_id: company.id,
          commission_rate: 15.0,
          performance_threshold: 80.0,
          group_name: 'Senior Partner'
        }
      });
    } else {
      console.log('Partner entry already exists');
    }
    
    console.log('Partner user setup completed successfully!');
    
  } catch (error) {
    console.error('Error setting up partner user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupPartnerUser();
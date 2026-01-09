import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPartnerSetup() {
  try {
    console.log('Checking partner setup for john.partner@ronaldsllp.com...\n');
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: 'john.partner@ronaldsllp.com' },
      include: {
        profile: true,
        roles: true
      }
    });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('✅ User found:', {
      id: user.id,
      email: user.email,
      name: user.name
    });
    
    if (user.profile) {
      console.log('✅ Profile found:', {
        id: user.profile.id,
        first_name: user.profile.first_name,
        last_name: user.profile.last_name,
        is_partner: user.profile.is_partner,
        position: user.profile.position
      });
      
      // Check for partner entry
      const partner = await prisma.partner.findUnique({
        where: { profile_id: user.profile.id },
        include: { company: true }
      });
      
      if (partner) {
        console.log('✅ Partner entry found:', {
          id: partner.id,
          profile_id: partner.profile_id,
          company_id: partner.company_id,
          commission_rate: partner.commission_rate,
          company_name: partner.company?.company_name
        });
      } else {
        console.log('❌ Partner entry not found');
      }
      
    } else {
      console.log('❌ Profile not found');
    }
    
    console.log('✅ Roles:', user.roles.map(r => r.role));
    
    // Check partner jobs
    if (user.profile) {
      const jobs = await prisma.job.findMany({
        where: { partner_id: user.profile.id },
        take: 3
      });
      console.log(`📊 Jobs assigned to partner: ${jobs.length}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPartnerSetup();
import { PrismaClient } from '@prisma/client';
import { getAuthContext } from '../src/middleware/partner-auth';

const prisma = new PrismaClient();

async function testPartnerAuth() {
  try {
    console.log('Testing partner authentication for user ID 6...\n');
    
    // Test auth context creation
    const authContext = await getAuthContext(6);
    console.log('Auth Context:', authContext);
    
    if (!authContext) {
      console.log('❌ Auth context is null');
      return;
    }
    
    if (!authContext.isPartner) {
      console.log('❌ User is not marked as partner in auth context');
      return;
    }
    
    console.log('✅ User is correctly identified as partner');
    console.log('Partner ID (profile ID):', authContext.partnerId);
    
    // Test if we can find jobs with this partner ID
    const jobs = await prisma.job.findMany({
      where: { partner_id: authContext.partnerId },
      select: { id: true, job_code: true, job_name: true }
    });
    
    console.log(`\n📊 Found ${jobs.length} jobs for partner ID ${authContext.partnerId}:`);
    jobs.slice(0, 3).forEach(job => {
      console.log(`  - Job ${job.id}: ${job.job_code} - ${job.job_name}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPartnerAuth();
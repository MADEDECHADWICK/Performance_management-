import prisma from '../src/prisma';

async function quickApiTest() {
  try {
    console.log('Testing basic queries used by GMP dashboard...');
    
    // Test 1: Basic function call
    const dashboardData = await prisma.$queryRaw`SELECT * FROM get_gmp_dashboard_analytics(4::integer)`;
    console.log('✓ Main function call works');
    
    // Test 2: Personal jobs query
    const personalJobs = await prisma.job.findMany({
      where: { partner_id: 4, status: 'active' },
      include: { client: true },
      take: 2
    });
    console.log('✓ Personal jobs query works, found:', personalJobs.length);
    
    // Test 3: Jobs at risk query  
    const jobsAtRisk = await prisma.job.findMany({
      where: {
        OR: [
          { due_date: { lt: new Date() } },
          { status: 'at_risk' }
        ]
      },
      include: { client: true, partner: true },
      take: 2
    });
    console.log('✓ Jobs at risk query works, found:', jobsAtRisk.length);
    
    console.log('\nAll main queries are working!');
    
  } catch (error: any) {
    console.error('✗ Test failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

quickApiTest();
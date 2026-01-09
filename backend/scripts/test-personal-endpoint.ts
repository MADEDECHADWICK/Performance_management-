import prisma from '../src/prisma';

async function testPersonalEndpoint() {
  try {
    console.log('Testing GMP personal endpoint queries...');

    const profileId = 4; // GMP profile ID

    // Test personal jobs query
    console.log('1. Testing personal jobs query...');
    const personalJobs = await prisma.job.findMany({
      where: {
        OR: [
          { partner_id: profileId },
          { manager_id: profileId }
        ],
        status: 'active'
      },
      include: {
        client: true,
        jobStaffAssignments: {
          include: {
            employee: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                position: true
              }
            }
          }
        }
      }
    });
    console.log('✓ Personal jobs query works, found:', personalJobs.length);

    // Test direct reports query 
    console.log('2. Testing direct reports query...');
    const directReports = await prisma.profile.findMany({
      where: { manager_id: profileId },
      include: {
        department: true,
        employeeEvaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
    console.log('✓ Direct reports query works, found:', directReports.length);

    // Test personal performance
    console.log('3. Testing personal performance query...');
    const personalPerformance = await prisma.employeeEvaluation.findFirst({
      where: { employee_id: profileId },
      orderBy: { createdAt: 'desc' }
    });
    console.log('✓ Personal performance query works, found:', personalPerformance ? 'Yes' : 'No');

    console.log('\nAll personal endpoint queries working!');
    
  } catch (error: any) {
    console.error('✗ Query failed:', error.message);
    if (error.code) console.error('Error code:', error.code);
  } finally {
    await prisma.$disconnect();
  }
}

testPersonalEndpoint();
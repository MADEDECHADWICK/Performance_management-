import prisma from '../src/prisma';

async function testGMPQueries() {
  try {
    console.log('Testing GMP dashboard specific queries...');

    // Test direct reports query
    console.log('1. Testing direct reports query...');
    const directReports = await prisma.profile.findMany({
      where: { manager_id: 4 },
      include: {
        department: true,
        employeeEvaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
    console.log('✓ Direct reports query works, found:', directReports.length);

    // Test pending evaluations query
    console.log('2. Testing pending evaluations query...');
    const pendingEvaluations = await prisma.employeeEvaluation.findMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      },
      include: {
        employee: {
          select: {
            first_name: true,
            last_name: true,
            position: true,
            manager_id: true
          }
        }
      },
      take: 10
    });
    console.log('✓ Pending evaluations query works, found:', pendingEvaluations.length);

    // Test personal performance evaluation query
    console.log('3. Testing personal performance query...');
    const personalPerformance = await prisma.employeeEvaluation.findFirst({
      where: { employee_id: 4 },
      orderBy: { createdAt: 'desc' }
    });
    console.log('✓ Personal performance query works, found:', personalPerformance ? 'Yes' : 'No');

    console.log('\nAll GMP dashboard queries are working correctly!');
    
  } catch (error: any) {
    console.error('✗ Query failed:', error.message);
    console.error('Details:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testGMPQueries();
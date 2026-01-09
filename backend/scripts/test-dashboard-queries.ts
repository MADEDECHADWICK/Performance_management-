import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDashboardQueries() {
  try {
    console.log('Testing GMP Dashboard database queries...\n');

    // Test 1: Check if our views exist
    console.log('1. Testing firm_wide_metrics view...');
    try {
      const firmMetrics = await prisma.$queryRaw`SELECT * FROM firm_wide_metrics`;
      console.log('✓ firm_wide_metrics view works');
      console.log('Sample data:', firmMetrics);
    } catch (error: any) {
      console.log('✗ firm_wide_metrics view failed:', error.message);
    }

    // Test 2: Check partner_performance_summary view
    console.log('\n2. Testing partner_performance_summary view...');
    try {
      const partnerMetrics = await prisma.$queryRaw`SELECT * FROM partner_performance_summary LIMIT 5`;
      console.log('✓ partner_performance_summary view works');
      console.log('Sample data:', partnerMetrics);
    } catch (error: any) {
      console.log('✗ partner_performance_summary view failed:', error.message);
    }

    // Test 3: Check manager_performance_summary view
    console.log('\n3. Testing manager_performance_summary view...');
    try {
      const managerMetrics = await prisma.$queryRaw`SELECT * FROM manager_performance_summary LIMIT 5`;
      console.log('✓ manager_performance_summary view works');
      console.log('Sample data:', managerMetrics);
    } catch (error: any) {
      console.log('✗ manager_performance_summary view failed:', error.message);
    }

    // Test 4: Check department_performance_summary view
    console.log('\n4. Testing department_performance_summary view...');
    try {
      const deptMetrics = await prisma.$queryRaw`SELECT * FROM department_performance_summary LIMIT 5`;
      console.log('✓ department_performance_summary view works');
      console.log('Sample data:', deptMetrics);
    } catch (error: any) {
      console.log('✗ department_performance_summary view failed:', error.message);
    }

    // Test 5: Test the get_gmp_dashboard_analytics function
    console.log('\n5. Testing get_gmp_dashboard_analytics function...');
    try {
      const dashboardData = await prisma.$queryRaw`SELECT * FROM get_gmp_dashboard_analytics(4)`;
      console.log('✓ get_gmp_dashboard_analytics function works');
      console.log('Sample data:', dashboardData);
    } catch (error: any) {
      console.log('✗ get_gmp_dashboard_analytics function failed:', error.message);
    }

    // Test 6: Basic profile query to ensure our GMP user exists
    console.log('\n6. Testing GMP user profile...');
    try {
      const gmpProfile = await prisma.profile.findUnique({
        where: { email: 'gmp@ronaldsllp.com' }
      });
      console.log('✓ GMP profile found:', gmpProfile ? `ID ${gmpProfile.id}` : 'NOT FOUND');
    } catch (error: any) {
      console.log('✗ GMP profile query failed:', error.message);
    }

  } catch (error) {
    console.error('General error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDashboardQueries();
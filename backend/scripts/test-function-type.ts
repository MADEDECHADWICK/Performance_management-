import prisma from '../src/prisma';

async function testFunction() {
  try {
    console.log('Testing function with integer cast...');
    const result = await prisma.$queryRaw`SELECT * FROM get_gmp_dashboard_analytics(4::integer)`;
    console.log('✓ Function works with integer cast');
    console.log('Result:', result);
  } catch (error: any) {
    console.log('✗ Function failed:', error.message);
  }

  try {
    console.log('\nTesting function signature...');
    const signature = await prisma.$queryRaw`
      SELECT 
        p.proname as function_name,
        pg_catalog.pg_get_function_arguments(p.oid) as arguments,
        pg_catalog.pg_get_function_result(p.oid) as return_type
      FROM pg_proc p
      WHERE p.proname = 'get_gmp_dashboard_analytics'
    `;
    console.log('Function signature:', signature);
  } catch (error: any) {
    console.log('✗ Signature query failed:', error.message);
  }
  
  await prisma.$disconnect();
}

testFunction();
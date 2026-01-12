import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkEmployees() {
  console.log('Checking employees in the system...\n');

  try {
    // Check total profiles
    const totalProfiles = await prisma.profile.count();
    console.log(`Total profiles: ${totalProfiles}`);

    // Check active profiles
    const activeProfiles = await prisma.profile.count({
      where: { status: 'active' }
    });
    console.log(`Active profiles: ${activeProfiles}`);

    // Check profiles with user accounts
    const profilesWithUsers = await prisma.profile.count({
      where: { userId: { not: null } }
    });
    console.log(`Profiles with user accounts: ${profilesWithUsers}`);

    // Get some sample profiles
    const sampleProfiles = await prisma.profile.findMany({
      take: 5,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        status: true,
        userId: true,
        manager_id: true,
      }
    });

    console.log('\nSample profiles:');
    sampleProfiles.forEach(p => {
      console.log(`- ${p.first_name} ${p.last_name} (ID: ${p.id}, Status: ${p.status}, UserID: ${p.userId}, Manager: ${p.manager_id})`);
    });

    // Check evaluation cycles
    const cycles = await prisma.evaluationCycle.findMany({
      select: {
        id: true,
        cycle_name: true,
        status: true,
        start_date: true,
        end_date: true,
      }
    });

    console.log(`\nEvaluation cycles: ${cycles.length}`);
    cycles.forEach(c => {
      console.log(`- ${c.cycle_name} (ID: ${c.id}, Status: ${c.status})`);
    });

  } catch (error) {
    console.error('Error checking employees:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEmployees();
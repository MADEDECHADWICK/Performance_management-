import prisma from '../src/prisma';

async function createManagerUsers() {
  try {
    console.log('🎯 Creating manager users for job assignment testing...\n');

    // Get available departments and roles
    const departments = await prisma.department.findMany();
    const roles = await prisma.role.findMany();
    
    const managerRole = roles.find(r => r.name.toLowerCase().includes('manager')) || roles[1];
    
    const managers = [
      {
        email: 'james.kiprotich@ronalds.co.ke',
        name: 'James Kiprotich',
        first_name: 'James',
        last_name: 'Kiprotich',
        position: 'Audit Manager',
        departmentId: departments[0]?.id || 1,
        role_id: managerRole?.id || 1
      },
      {
        email: 'grace.wanjiku@ronalds.co.ke', 
        name: 'Grace Wanjiku',
        first_name: 'Grace',
        last_name: 'Wanjiku',
        position: 'Tax Manager',
        departmentId: departments[1]?.id || 1,
        role_id: managerRole?.id || 1
      },
      {
        email: 'peter.mwangi@ronalds.co.ke',
        name: 'Peter Mwangi',
        first_name: 'Peter', 
        last_name: 'Mwangi',
        position: 'Advisory Manager',
        departmentId: departments[2]?.id || 1,
        role_id: managerRole?.id || 1
      }
    ];

    for (const managerData of managers) {
      console.log(`Creating manager: ${managerData.first_name} ${managerData.last_name}...`);
      
      // Create user account
      const user = await prisma.user.create({
        data: {
          email: managerData.email,
          name: managerData.name,
          password: '$2b$10$encrypted.password.hash' // Placeholder
        }
      });

      // Create user role
      await prisma.userRole.create({
        data: {
          userId: user.id,
          role: 'manager'
        }
      });

      // Create profile
      await prisma.profile.create({
        data: {
          userId: user.id,
          first_name: managerData.first_name,
          last_name: managerData.last_name,
          email: managerData.email,
          position: managerData.position,
          position_level: 'manager',
          departmentId: managerData.departmentId,
          role_id: managerData.role_id,
          status: 'active'
        }
      });

      console.log(`✓ Created ${managerData.first_name} ${managerData.last_name} (${managerData.position})`);
    }

    console.log(`\n🎉 Successfully created ${managers.length} managers!`);
    
  } catch (error) {
    console.error('❌ Error creating managers:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createManagerUsers()
  .then(() => {
    console.log('\n✅ Manager creation completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed to create managers:', error);
    process.exit(1);
  });
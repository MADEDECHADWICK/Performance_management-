import prisma from '../src/prisma';

async function createTestUsers() {
  try {
    console.log('Creating test admin and partner users...\n');

    // Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@ronalds.com',
        name: 'Admin User',
        password: 'hashed_admin_password',
        roles: {
          create: {
            role: 'admin'
          }
        },
        profile: {
          create: {
            first_name: 'Admin',
            last_name: 'User',
            email: 'admin@ronalds.com',
            position: 'System Administrator',
            status: 'active'
          }
        }
      },
      include: { profile: true, roles: true }
    });

    console.log('✓ Admin user created:');
    console.log(`  Email: ${adminUser.email}`);
    console.log(`  Role: admin`);
    console.log(`  ID: ${adminUser.id}\n`);

    // Create Partner User
    const partnerProfile = await prisma.profile.create({
      data: {
        first_name: 'Partner',
        last_name: 'User',
        email: 'partner@ronalds.com',
        position: 'Business Partner',
        status: 'active',
        is_partner: true
      }
    });

    const partnerUser = await prisma.user.create({
      data: {
        email: 'partner@ronalds.com',
        name: 'Partner User',
        password: 'hashed_partner_password',
        roles: {
          create: {
            role: 'partner'
          }
        }
      }
    });

    // Update profile with userId
    await prisma.profile.update({
      where: { id: partnerProfile.id },
      data: { userId: partnerUser.id }
    });

    // Create Partner Company for this partner
    const partnerCompany = await prisma.partnerCompany.create({
      data: {
        company_name: 'Test Partner Company',
        registration_number: 'REG-2025-001',
        tax_id: 'TAX-2025-001'
      }
    });

    // Create Partner record
    const partner = await prisma.partner.create({
      data: {
        profile_id: partnerProfile.id,
        company_id: partnerCompany.id,
        commission_rate: 15,
        performance_threshold: 80,
        group_name: 'Test Partner Group'
      }
    });

    console.log('✓ Partner user created:');
    console.log(`  Email: ${partnerUser.email}`);
    console.log(`  Role: partner`);
    console.log(`  ID: ${partnerUser.id}`);
    console.log(`  Partner Company: ${partnerCompany.company_name}\n`);

    // Get the test employee we created earlier
    const testEmployee = await prisma.profile.findUnique({
      where: { email: 'testemployee@ronalds.com' },
      include: { user: true }
    });

    if (testEmployee?.user) {
      console.log('✓ Existing test employee found:');
      console.log(`  Email: ${testEmployee.email}`);
      console.log(`  ID: ${testEmployee.userId}\n`);
    }

    // Summary
    console.log('=== Test Users Summary ===');
    console.log('Admin User:');
    console.log(`  - Email: admin@ronalds.com`);
    console.log(`  - Role: admin`);
    console.log('');
    console.log('Partner User:');
    console.log(`  - Email: partner@ronalds.com`);
    console.log(`  - Role: partner`);
    console.log('');
    console.log('Employee User (Test):');
    console.log(`  - Email: testemployee@ronalds.com`);
    console.log(`  - Role: associate`);
    console.log('');
    console.log('✓ All test users created successfully!');
    console.log('\nYou can now test the analytics with these users.');

    process.exit(0);
  } catch (error) {
    console.error('Error creating test users:', error);
    process.exit(1);
  }
}

createTestUsers();

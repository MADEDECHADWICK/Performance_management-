import prisma from '../src/prisma';
import bcryptjs from 'bcryptjs';

async function resetAndCreateUsers() {
  try {
    console.log('Deleting old test users and their related data...');
    
    // First find the users
    const usersToDelete = await prisma.user.findMany({
      where: {
        email: {
          in: ['admin@ronalds.com', 'partner@ronalds.com']
        }
      },
      include: { profile: true }
    });

    // Delete their performance reviews
    for (const user of usersToDelete) {
      if (user.profile) {
        await prisma.performanceReview.deleteMany({
          where: { employee_id: user.profile.id }
        });
      }
    }
    
    // Delete partner records
    for (const user of usersToDelete) {
      if (user.profile) {
        await prisma.partner.deleteMany({
          where: { profile_id: user.profile.id }
        });
      }
    }

    // Delete the users (this will cascade delete profiles)
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['admin@ronalds.com', 'partner@ronalds.com']
        }
      }
    });
    
    console.log('Old users deleted successfully');
    
    console.log('Creating new test users with proper password hashing...\n');

    // Admin user
    const adminPassword = 'admin123456';
    const adminPasswordHash = await bcryptjs.hash(adminPassword, 10);
    
    console.log('Admin password hash (first 20 chars):', adminPasswordHash.substring(0, 20) + '...');
    
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@ronalds.com',
        name: 'Admin User',
        password: adminPasswordHash,
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
            position: 'Administrator',
            status: 'active'
          }
        }
      },
      include: { profile: true }
    });

    console.log('✓ Admin user created:');
    console.log(`  Email: ${adminUser.email}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`  Name: ${adminUser.name}\n`);

    // Partner user
    const partnerPassword = 'partner123456';
    const partnerPasswordHash = await bcryptjs.hash(partnerPassword, 10);

    console.log('Partner password hash (first 20 chars):', partnerPasswordHash.substring(0, 20) + '...');

    const partnerUser = await prisma.user.create({
      data: {
        email: 'partner@ronalds.com',
        name: 'Partner User',
        password: partnerPasswordHash,
        roles: {
          create: {
            role: 'partner'
          }
        },
        profile: {
          create: {
            first_name: 'Partner',
            last_name: 'User',
            email: 'partner@ronalds.com',
            position: 'Partner Manager',
            status: 'active',
            is_partner: true
          }
        }
      },
      include: { profile: true }
    });

    console.log('✓ Partner user created:');
    console.log(`  Email: ${partnerUser.email}`);
    console.log(`  Password: ${partnerPassword}`);
    console.log(`  Name: ${partnerUser.name}\n`);

    // Create or get a partner company for the partner
    let partnerCompany = await prisma.partnerCompany.findUnique({
      where: { company_name: 'Test Partner Company' }
    });

    if (!partnerCompany) {
      partnerCompany = await prisma.partnerCompany.create({
        data: {
          company_name: 'Test Partner Company',
          registration_number: 'REG001',
          tax_id: 'TAX001'
        }
      });
    }

    console.log('✓ Partner company created:');
    console.log(`  Company: ${partnerCompany.company_name}\n`);

    // Link partner to company
    if (partnerUser.profile) {
      const partner = await prisma.partner.create({
        data: {
          profile_id: partnerUser.profile.id,
          company_id: partnerCompany.id,
          commission_rate: 15,
          performance_threshold: 80
        }
      });

      console.log('✓ Partner linked to company');
      console.log(`  Profile ID: ${partner.profile_id}`);
      console.log(`  Company ID: ${partner.company_id}\n`);
    }

    // Create performance reviews for the new users (for analytics testing)
    await prisma.performanceReview.create({
      data: {
        employee_id: adminUser.profile?.id || 1,
        reviewer_id: adminUser.profile?.id || 1,
        review_period_start: new Date('2025-01-01'),
        review_period_end: new Date('2025-12-31'),
        overall_rating: 90,
        financial_score: 92,
        non_financial_score: 88,
        strengths: 'Excellent leadership and decision-making',
        areas_for_improvement: 'Delegation',
        goals_next_period: 'Mentor team members',
        reviewer_comments: 'Outstanding performance',
        status: 'submitted'
      }
    });

    await prisma.performanceReview.create({
      data: {
        employee_id: partnerUser.profile?.id || 1,
        reviewer_id: partnerUser.profile?.id || 1,
        review_period_start: new Date('2025-01-01'),
        review_period_end: new Date('2025-12-31'),
        overall_rating: 88,
        financial_score: 85,
        non_financial_score: 90,
        strengths: 'Great partner relationship management',
        areas_for_improvement: 'Documentation',
        goals_next_period: 'Expand portfolio',
        reviewer_comments: 'Strong performance',
        status: 'submitted'
      }
    });

    console.log('✓ Performance reviews created for testing\n');

    console.log('========================================');
    console.log('Test Users Created Successfully!');
    console.log('========================================\n');
    console.log('You can now log in with:');
    console.log('\nAdmin User:');
    console.log(`  Email: admin@ronalds.com`);
    console.log(`  Password: admin123456`);
    console.log('\nPartner User:');
    console.log(`  Email: partner@ronalds.com`);
    console.log(`  Password: partner123456`);
    console.log('\nExisting Test Employee:');
    console.log(`  Email: testemployee@ronalds.com\n`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

resetAndCreateUsers();

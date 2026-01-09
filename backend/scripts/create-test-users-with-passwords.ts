import prisma from '../src/prisma';
import bcrypt from 'bcryptjs';

async function createTestUsers() {
  try {
    console.log('Creating admin and partner test users...\n');

    // Admin user
    const adminPassword = 'admin123456';
    const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@ronalds.com' },
      update: {},
      create: {
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

    console.log('✓ Admin user created/updated:');
    console.log(`  Email: ${adminUser.email}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`  Name: ${adminUser.name}\n`);

    // Partner user
    const partnerPassword = 'partner123456';
    const partnerPasswordHash = await bcrypt.hash(partnerPassword, 10);

    const partnerUser = await prisma.user.upsert({
      where: { email: 'partner@ronalds.com' },
      update: {},
      create: {
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

    console.log('✓ Partner user created/updated:');
    console.log(`  Email: ${partnerUser.email}`);
    console.log(`  Password: ${partnerPassword}`);
    console.log(`  Name: ${partnerUser.name}\n`);

    // Create a partner company for the partner
    const partnerCompany = await prisma.partnerCompany.upsert({
      where: { company_name: 'Test Partner Company' },
      update: {},
      create: {
        company_name: 'Test Partner Company',
        registration_number: 'REG001',
        tax_id: 'TAX001'
      }
    });

    console.log('✓ Partner company created/updated:');
    console.log(`  Company: ${partnerCompany.company_name}\n`);

    // Link partner to company
    if (partnerUser.profile) {
      const partner = await prisma.partner.upsert({
        where: { profile_id: partnerUser.profile.id },
        update: { company_id: partnerCompany.id },
        create: {
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
    const adminReview = await prisma.performanceReview.upsert({
      where: { id: 999 }, // Use a high ID that likely doesn't exist
      update: {},
      create: {
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

    const partnerReview = await prisma.performanceReview.upsert({
      where: { id: 1000 },
      update: {},
      create: {
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
    console.log('Summary:');
    console.log('--------');
    console.log('Admin User:');
    console.log(`  Email: admin@ronalds.com`);
    console.log(`  Password: admin123456`);
    console.log('\nPartner User:');
    console.log(`  Email: partner@ronalds.com`);
    console.log(`  Password: partner123456`);
    console.log('\nExisting Test Employee:');
    console.log(`  Email: testemployee@ronalds.com`);
    console.log('\nYou can now log in with these credentials to test the analytics functionality.\n');

    process.exit(0);
  } catch (error) {
    console.error('Error creating test users:', error);
    process.exit(1);
  }
}

createTestUsers();

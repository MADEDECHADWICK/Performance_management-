import prisma from '../src/prisma';
import bcryptjs from 'bcryptjs';

async function createSuperAdmin() {
  try {
    console.log('Creating super admin user...\n');

    const superAdminPassword = 'superadmin123456';
    const superAdminPasswordHash = await bcryptjs.hash(superAdminPassword, 10);

    // Delete existing super admin if exists
    await prisma.performanceReview.deleteMany({
      where: {
        employee: {
          user: {
            email: 'superadmin@ronalds.com'
          }
        }
      }
    });

    await prisma.user.deleteMany({
      where: { email: 'superadmin@ronalds.com' }
    });

    const superAdminUser = await prisma.user.create({
      data: {
        email: 'superadmin@ronalds.com',
        name: 'Super Admin User',
        password: superAdminPasswordHash,
        roles: {
          create: {
            role: 'super_admin'
          }
        },
        profile: {
          create: {
            first_name: 'Super',
            last_name: 'Admin',
            email: 'superadmin@ronalds.com',
            position: 'Super Administrator',
            status: 'active'
          }
        }
      },
      include: { profile: true }
    });

    console.log('✓ Super Admin user created:');
    console.log(`  Email: ${superAdminUser.email}`);
    console.log(`  Password: ${superAdminPassword}`);
    console.log(`  Name: ${superAdminUser.name}\n`);

    // Create performance review for analytics testing
    await prisma.performanceReview.create({
      data: {
        employee_id: superAdminUser.profile?.id || 1,
        reviewer_id: superAdminUser.profile?.id || 1,
        review_period_start: new Date('2025-01-01'),
        review_period_end: new Date('2025-12-31'),
        overall_rating: 95,
        financial_score: 95,
        non_financial_score: 95,
        strengths: 'Exceptional leadership and strategic vision',
        areas_for_improvement: 'None',
        goals_next_period: 'Lead organizational transformation',
        reviewer_comments: 'Outstanding performance',
        status: 'submitted'
      }
    });

    console.log('✓ Performance review created\n');

    console.log('========================================');
    console.log('Super Admin Created Successfully!');
    console.log('========================================\n');
    console.log('Super Admin User:');
    console.log(`  Email: superadmin@ronalds.com`);
    console.log(`  Password: superadmin123456`);
    console.log(`  Role: super_admin\n`);

    console.log('You now have all test users:');
    console.log('  - Super Admin: superadmin@ronalds.com / superadmin123456');
    console.log('  - Admin: admin@ronalds.com / admin123456');
    console.log('  - Partner: partner@ronalds.com / partner123456');
    console.log('  - Employee: testemployee@ronalds.com\n');

    process.exit(0);
  } catch (error) {
    console.error('Error creating super admin:', error);
    process.exit(1);
  }
}

createSuperAdmin();

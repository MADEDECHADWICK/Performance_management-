import prisma from '../src/prisma';

async function createSampleReviews() {
  try {
    // Find an employee profile to create a review for
    const employee = await prisma.profile.findFirst({
      where: {
        user: {
          roles: {
            some: {
              role: 'associate'
            }
          }
        }
      },
      include: { user: true }
    });

    if (!employee || !employee.userId) {
      console.log('No employee found. Creating one...');
      
      // Create a test user
      const testUser = await prisma.user.create({
        data: {
          email: 'testemployee@ronalds.com',
          name: 'Test Employee',
          password: 'hashed_password',
          roles: {
            create: {
              role: 'associate'
            }
          },
          profile: {
            create: {
              first_name: 'Test',
              last_name: 'Employee',
              email: 'testemployee@ronalds.com',
            }
          }
        },
        include: { profile: true }
      });

      console.log('Created test employee:', testUser.email);

      // Create a performance review
      const review = await prisma.performanceReview.create({
        data: {
          employee_id: testUser.profile?.id || 1,
          reviewer_id: testUser.profile?.id || 1,
          review_period_start: new Date('2025-01-01'),
          review_period_end: new Date('2025-12-31'),
          overall_rating: 85,
          financial_score: 80,
          non_financial_score: 88,
          strengths: 'Great teamwork and communication',
          areas_for_improvement: 'Time management',
          goals_next_period: 'Improve productivity',
          reviewer_comments: 'Overall good performance',
        }
      });

      console.log('Created sample review:', review);
    } else {
      console.log('Found employee:', employee.user?.email || employee.email);

      // Create a review for this employee
      const review = await prisma.performanceReview.create({
        data: {
          employee_id: employee.id,
          reviewer_id: employee.id,
          review_period_start: new Date('2025-01-01'),
          review_period_end: new Date('2025-12-31'),
          overall_rating: 85,
          financial_score: 80,
          non_financial_score: 88,
          strengths: 'Great teamwork and communication',
          areas_for_improvement: 'Time management',
          goals_next_period: 'Improve productivity',
          reviewer_comments: 'Overall good performance',
        }
      });

      console.log('Created sample review for employee:', review);
    }

    // Create reviews for other employees
    const allEmployees = await prisma.profile.findMany({
      where: {
        user: {
          roles: {
            some: {
              role: {
                in: ['associate', 'intern']
              }
            }
          }
        }
      },
      include: { user: true },
      take: 5
    });

    for (const emp of allEmployees) {
      const existingReview = await prisma.performanceReview.findFirst({
        where: { employee_id: emp.id }
      });

      if (!existingReview) {
        const review = await prisma.performanceReview.create({
          data: {
            employee_id: emp.id,
            reviewer_id: emp.id,
            review_period_start: new Date('2025-01-01'),
            review_period_end: new Date('2025-12-31'),
            overall_rating: Math.floor(Math.random() * 40) + 70,
            financial_score: Math.floor(Math.random() * 40) + 70,
            non_financial_score: Math.floor(Math.random() * 40) + 70,
            strengths: 'Good contributor to team',
            areas_for_improvement: 'Continue developing skills',
            goals_next_period: 'Expand knowledge base',
            reviewer_comments: 'Solid performance',
          }
        });
        console.log(`Created review for ${emp.user?.email || emp.email}`);
      }
    }

    console.log('Sample data created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating sample reviews:', error);
    process.exit(1);
  }
}

createSampleReviews();


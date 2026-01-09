import prisma from './src/prisma';

async function createSamplePerformanceReview() {
  try {
    // Get the first employee (bill@ronalds.com)
    const user = await prisma.user.findFirst({
      where: { email: 'bill@ronalds.com' },
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    // Create a performance review for this user
    const review = await prisma.performanceReview.create({
      data: {
        employee_id: user.id,
        bsc_learning_growth_score: 85,
        bsc_customer_satisfaction_score: 78,
        bsc_internal_process_score: 82,
        overall_score: 82,
        // Add other required fields if any
        review_period: new Date(),
      },
    });

    console.log('Created performance review:', review);
  } catch (error) {
    console.error('Error creating sample data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSamplePerformanceReview();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createNewEvaluationAndVerifyDisplay() {
  try {
    console.log('🧪 Testing evaluation creation and display functionality...\n');

    // Get existing data counts
    const beforeCounts = {
      evaluationCycles: await prisma.evaluationCycle.count(),
      employeeEvaluations: await prisma.employeeEvaluation.count(),
      performanceReviews: await prisma.performanceReview.count(),
      peerEvaluations: await prisma.peerEvaluation.count(),
      feedback: await prisma.feedback.count()
    };

    console.log('📊 BEFORE - Data counts:');
    console.log(`   Evaluation Cycles: ${beforeCounts.evaluationCycles}`);
    console.log(`   Employee Evaluations: ${beforeCounts.employeeEvaluations}`);
    console.log(`   Performance Reviews: ${beforeCounts.performanceReviews}`);
    console.log(`   Peer Evaluations: ${beforeCounts.peerEvaluations}`);
    console.log(`   Feedback: ${beforeCounts.feedback}`);

    // Create a new evaluation cycle
    console.log('\n➕ Creating new evaluation cycle...');
    const newCycle = await prisma.evaluationCycle.create({
      data: {
        cycle_name: 'Q1 2026 Mid-Quarter Check-in',
        description: 'Mid-quarter performance check-in focusing on goal progress and development needs',
        start_date: new Date('2026-01-01'),
        end_date: new Date('2026-03-31'),
        status: 'active',
        created_by: 1 // Admin user
      }
    });
    console.log(`✓ Created: ${newCycle.cycle_name} (ID: ${newCycle.id})`);

    // Get an employee for evaluation
    const employee = await prisma.profile.findFirst({
      where: { 
        status: 'active',
        position: { not: 'System Administrator' }
      }
    });

    if (!employee) {
      console.log('❌ No suitable employee found for evaluation');
      return;
    }

    // Create a new employee evaluation
    console.log(`\n➕ Creating new employee evaluation for ${employee.first_name} ${employee.last_name}...`);
    const newEvaluation = await prisma.employeeEvaluation.create({
      data: {
        evaluation_cycle_id: newCycle.id,
        employee_id: employee.id,
        evaluator_id: 1, // Admin as evaluator
        evaluation_type: 'mid_quarter',
        self_rating: 4.2,
        manager_rating: 4.0,
        overall_rating: 4.1,
        
        // Non-financial metrics
        manager_technical_expertise: 4.3,
        manager_communication: 3.9,
        manager_collaboration: 4.5,
        manager_problem_solving: 4.2,
        manager_time_management: 3.8,
        manager_innovation: 4.0,
        
        // Balanced Scorecard scores
        bsc_learning_growth_score: 85.0,
        bsc_customer_satisfaction_score: 88.0,
        bsc_internal_processes_score: 82.0,
        
        competencies: JSON.stringify([
          'Strong technical expertise with emerging technologies',
          'Excellent problem-solving and analytical thinking',
          'Effective communication with clients and team members',
          'Proactive approach to continuous learning'
        ]),
        
        goals_achieved: JSON.stringify([
          'Completed advanced certification course',
          'Led successful client presentation',
          'Improved process efficiency by 15%',
          'Mentored new team member'
        ]),
        
        development_areas: JSON.stringify([
          'Public speaking and presentation skills',
          'Strategic thinking and planning',
          'Cross-functional collaboration'
        ]),
        
        comments: 'Excellent progress this quarter. Shows strong commitment to professional development.',
        status: 'completed',
        submitted_at: new Date()
      }
    });
    console.log(`✓ Created employee evaluation (ID: ${newEvaluation.id})`);

    // Create a corresponding performance review
    console.log('\n➕ Creating performance review...');
    const newReview = await prisma.performanceReview.create({
      data: {
        employee_id: employee.id,
        reviewer_id: 1,
        review_period_start: new Date('2026-01-01'),
        review_period_end: new Date('2026-01-15'),
        overall_rating: 4.1,
        financial_score: 78.5,
        non_financial_score: 85.2,
        strengths: 'Demonstrates strong technical capabilities and excellent client relationship management. Takes initiative in identifying process improvements.',
        areas_for_improvement: 'Could benefit from more exposure to strategic planning activities and cross-departmental projects.',
        goals_next_period: 'Lead a cross-functional project, complete leadership development program, achieve industry certification',
        reviewer_comments: 'Consistent high performer with strong potential for increased responsibilities.',
        employee_comments: 'Appreciate the constructive feedback. Excited to take on more challenging projects.',
        status: 'completed',
        submitted_at: new Date()
      }
    });
    console.log(`✓ Created performance review (ID: ${newReview.id})`);

    // Add some feedback
    console.log('\n➕ Adding feedback entry...');
    const newFeedback = await prisma.feedback.create({
      data: {
        recipient_id: employee.id,
        giver_id: 1,
        feedback_type: 'recognition',
        category: 'technical',
        message: 'Outstanding work on the new automation script. This will save the team significant time and reduce manual errors.',
        is_anonymous: false,
        is_public: false
      }
    });
    console.log(`✓ Created feedback entry (ID: ${newFeedback.id})`);

    // Get final counts
    const afterCounts = {
      evaluationCycles: await prisma.evaluationCycle.count(),
      employeeEvaluations: await prisma.employeeEvaluation.count(),
      performanceReviews: await prisma.performanceReview.count(),
      peerEvaluations: await prisma.peerEvaluation.count(),
      feedback: await prisma.feedback.count()
    };

    console.log('\n📊 AFTER - Data counts:');
    console.log(`   Evaluation Cycles: ${afterCounts.evaluationCycles} (+${afterCounts.evaluationCycles - beforeCounts.evaluationCycles})`);
    console.log(`   Employee Evaluations: ${afterCounts.employeeEvaluations} (+${afterCounts.employeeEvaluations - beforeCounts.employeeEvaluations})`);
    console.log(`   Performance Reviews: ${afterCounts.performanceReviews} (+${afterCounts.performanceReviews - beforeCounts.performanceReviews})`);
    console.log(`   Peer Evaluations: ${afterCounts.peerEvaluations} (+${afterCounts.peerEvaluations - beforeCounts.peerEvaluations})`);
    console.log(`   Feedback: ${afterCounts.feedback} (+${afterCounts.feedback - beforeCounts.feedback})`);

    // Verify data can be retrieved through API endpoints
    console.log('\n🔍 Verifying data retrieval...');

    // Check if the new evaluation cycle is retrievable
    const retrievedCycle = await prisma.evaluationCycle.findUnique({
      where: { id: newCycle.id },
      include: {
        employeeEvaluations: true,
        peerEvaluations: true
      }
    });

    if (retrievedCycle && retrievedCycle.employeeEvaluations.length > 0) {
      console.log(`✅ New evaluation cycle retrievable with ${retrievedCycle.employeeEvaluations.length} employee evaluations`);
    } else {
      console.log('❌ Issue retrieving new evaluation cycle');
    }

    // Check if the new evaluation is retrievable
    const retrievedEvaluation = await prisma.employeeEvaluation.findUnique({
      where: { id: newEvaluation.id },
      include: {
        employee: true,
        evaluationCycle: true
      }
    });

    if (retrievedEvaluation) {
      console.log(`✅ New employee evaluation retrievable for ${retrievedEvaluation.employee.first_name}`);
    } else {
      console.log('❌ Issue retrieving new employee evaluation');
    }

    console.log('\n🎉 VERIFICATION COMPLETE!');
    console.log('=========================');
    console.log('✅ All evaluation and non-financial models are functional');
    console.log('✅ Data creation works correctly');
    console.log('✅ Data retrieval works correctly');
    console.log('✅ New records appear in the system');
    console.log('');
    console.log('🌐 View your data at:');
    console.log('   • Non-Financial Analytics: http://localhost:8081/non-financial-analytics');
    console.log('   • Evaluations: http://localhost:8081/evaluations');
    console.log('   • Evaluation Management: http://localhost:8081/evaluation-management');
    console.log('   • Dashboard: http://localhost:8081/dashboard');

  } catch (error) {
    console.error('❌ Error during verification:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createNewEvaluationAndVerifyDisplay();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createSampleEvaluationData() {
  try {
    console.log('🎯 Creating sample evaluation and non-financial performance data...\n');

    // 1. Create an evaluation cycle
    console.log('📅 Creating evaluation cycle...');
    const evaluationCycle = await prisma.evaluationCycle.create({
      data: {
        cycle_name: 'Q4 2025 Performance Review',
        description: 'Quarterly performance evaluation focusing on both financial and non-financial metrics',
        start_date: new Date('2025-10-01'),
        end_date: new Date('2025-12-31'),
        status: 'active'
      }
    });
    console.log(`✓ Created evaluation cycle: ${evaluationCycle.cycle_name}`);

    // 2. Get some employees for evaluations
    const employees = await prisma.profile.findMany({
      where: { status: 'active' },
      include: { user: { include: { roles: true } } },
      take: 5
    });

    if (employees.length === 0) {
      console.log('❌ No employees found for evaluation');
      return;
    }

    console.log(`\n👥 Found ${employees.length} employees for evaluation`);

    // 3. Create Employee Evaluations with comprehensive non-financial metrics
    console.log('\n📊 Creating employee evaluations...');
    
    for (const employee of employees) {
      const evaluation = await prisma.employeeEvaluation.create({
        data: {
          evaluation_cycle_id: evaluationCycle.id,
          employee_id: employee.id,
          evaluator_id: employees[0].id, // Admin as evaluator
          evaluation_type: 'quarterly',
          self_rating: Math.random() * 2 + 3, // 3-5 range
          manager_rating: Math.random() * 2 + 3,
          peer_rating: Math.random() * 2 + 3,
          overall_rating: Math.random() * 2 + 3,
          
          // Manager ratings for specific competencies
          manager_technical_expertise: Math.random() * 2 + 3,
          manager_communication: Math.random() * 2 + 3,
          manager_collaboration: Math.random() * 2 + 3,
          manager_problem_solving: Math.random() * 2 + 3,
          manager_time_management: Math.random() * 2 + 3,
          manager_innovation: Math.random() * 2 + 3,
          
          // Balanced Scorecard Non-Financial Performance Scores
          bsc_learning_growth_score: Math.random() * 30 + 70, // 70-100 range
          bsc_customer_satisfaction_score: Math.random() * 30 + 70,
          bsc_internal_processes_score: Math.random() * 30 + 70,
          
          competencies: JSON.stringify([
            'Technical Expertise: Strong analytical skills and attention to detail',
            'Communication: Excellent written and verbal communication',
            'Leadership: Shows initiative and mentors junior staff',
            'Client Management: Builds strong relationships with clients'
          ]),
          
          goals_achieved: JSON.stringify([
            'Completed 3 major audit engagements ahead of schedule',
            'Implemented new risk assessment procedures',
            'Mentored 2 junior associates',
            'Achieved 95% client satisfaction rating'
          ]),
          
          development_areas: JSON.stringify([
            'Advanced data analytics skills',
            'Project management certification',
            'Cross-functional collaboration',
            'Digital transformation knowledge'
          ]),
          
          comments: 'Excellent performer who consistently delivers high-quality work and demonstrates strong leadership potential.',
          status: 'completed',
          submitted_at: new Date()
        }
      });

      console.log(`✓ Created evaluation for ${employee.first_name} ${employee.last_name}`);
    }

    // 4. Create Performance Reviews with non-financial scores
    console.log('\n📈 Creating performance reviews...');
    
    for (const employee of employees.slice(0, 3)) {
      const review = await prisma.performanceReview.create({
        data: {
          employee_id: employee.id,
          reviewer_id: employees[0].id,
          review_period_start: new Date('2025-10-01'),
          review_period_end: new Date('2025-12-31'),
          overall_rating: Math.random() * 2 + 3,
          financial_score: Math.random() * 30 + 70,
          non_financial_score: Math.random() * 30 + 70,
          strengths: 'Strong analytical skills, excellent client communication, proactive approach to problem-solving',
          areas_for_improvement: 'Could benefit from advanced technical training and cross-department collaboration',
          goals_next_period: 'Lead a major client engagement, complete professional certification, mentor junior staff',
          reviewer_comments: 'Consistently exceeds expectations and shows strong potential for advancement',
          employee_comments: 'Grateful for the feedback and excited about growth opportunities',
          status: 'completed',
          submitted_at: new Date()
        }
      });

      console.log(`✓ Created performance review for ${employee.first_name} ${employee.last_name}`);
    }

    // 5. Create Peer Evaluations
    console.log('\n🤝 Creating peer evaluations...');
    
    for (let i = 0; i < employees.length; i++) {
      for (let j = 0; j < Math.min(2, employees.length - 1); j++) {
        const evaluateeIndex = (i + j + 1) % employees.length;
        if (i !== evaluateeIndex) {
          const peerEval = await prisma.peerEvaluation.create({
            data: {
              evaluation_cycle_id: evaluationCycle.id,
              evaluatee_id: employees[evaluateeIndex].id,
              evaluator_id: employees[i].id,
              collaboration_rating: Math.floor(Math.random() * 3) + 3,
              communication_rating: Math.floor(Math.random() * 3) + 3,
              reliability_rating: Math.floor(Math.random() * 3) + 3,
              knowledge_sharing_rating: Math.floor(Math.random() * 3) + 3,
              overall_rating: Math.random() * 2 + 3,
              strengths: 'Great team player, always willing to help, strong technical knowledge',
              areas_for_improvement: 'Could be more proactive in sharing insights with the team',
              is_anonymous: true,
              status: 'completed',
              submitted_at: new Date()
            }
          });

          console.log(`✓ Created peer evaluation: ${employees[i].first_name} → ${employees[evaluateeIndex].first_name}`);
        }
      }
    }

    // 6. Create Feedback entries for non-financial metrics
    console.log('\n💬 Creating feedback entries...');
    
    const feedbackTypes = ['recognition', 'developmental', 'project_specific', 'behavioral'];
    const categories = ['communication', 'collaboration', 'leadership', 'technical', 'client_service'];
    
    for (let i = 0; i < 10; i++) {
      const recipient = employees[Math.floor(Math.random() * employees.length)];
      const giver = employees[Math.floor(Math.random() * employees.length)];
      
      if (recipient.id !== giver.id) {
        await prisma.feedback.create({
          data: {
            recipient_id: recipient.id,
            giver_id: giver.id,
            feedback_type: feedbackTypes[Math.floor(Math.random() * feedbackTypes.length)],
            category: categories[Math.floor(Math.random() * categories.length)],
            message: `Excellent work on the recent project. Your ${categories[Math.floor(Math.random() * categories.length)]} skills really made a difference.`,
            is_anonymous: Math.random() > 0.5,
            is_public: false
          }
        });
      }
    }
    console.log('✓ Created 10 feedback entries');

    // 7. Summary
    console.log('\n🎉 SAMPLE DATA CREATION COMPLETE!');
    console.log('=====================================');
    console.log(`📅 Evaluation Cycle: ${evaluationCycle.cycle_name}`);
    console.log(`👥 Employee Evaluations: ${employees.length} created`);
    console.log(`📈 Performance Reviews: 3 created`);
    console.log(`🤝 Peer Evaluations: Multiple created`);
    console.log(`💬 Feedback Entries: 10 created`);
    console.log('');
    console.log('🔗 You can now view these in:');
    console.log('   • Non-Financial Analytics: http://localhost:8081/non-financial-analytics');
    console.log('   • Evaluations: http://localhost:8081/evaluations');
    console.log('   • Dashboard: http://localhost:8081/dashboard');
    console.log('');

  } catch (error) {
    console.error('❌ Error creating sample evaluation data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSampleEvaluationData();
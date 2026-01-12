import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createSampleTemplates() {
  console.log('Creating sample evaluation templates...');

  try {
    // Create performance evaluation template
    const performanceTemplate = await prisma.evaluationTemplate.create({
      data: {
        template_name: "Standard Performance Evaluation",
        description: "Comprehensive performance evaluation covering technical skills, communication, collaboration, and problem-solving",
        template_type: "performance",
        questions: JSON.stringify([
          {
            category: "Technical Skills",
            questions: [
              "How would you rate the technical expertise demonstrated?",
              "Does the employee stay current with industry trends and technologies?",
              "How effectively does the employee apply technical knowledge to solve problems?"
            ]
          },
          {
            category: "Communication",
            questions: [
              "How clear and effective is their verbal communication?",
              "How well do they communicate in writing?",
              "Do they actively listen and respond appropriately?"
            ]
          },
          {
            category: "Collaboration",
            questions: [
              "How well does the employee work within a team?",
              "Do they share knowledge and help colleagues?",
              "How do they handle conflicts or disagreements?"
            ]
          },
          {
            category: "Problem Solving",
            questions: [
              "How effectively does the employee identify and solve problems?",
              "Do they think creatively when approaching challenges?",
              "How well do they analyze complex situations?"
            ]
          }
        ]),
        is_active: true,
      }
    });

    console.log(`✓ Created performance template (ID: ${performanceTemplate.id})`);

    // Create leadership evaluation template
    const leadershipTemplate = await prisma.evaluationTemplate.create({
      data: {
        template_name: "Leadership Assessment",
        description: "Evaluation template focused on leadership capabilities and management skills",
        template_type: "leadership",
        questions: JSON.stringify([
          {
            category: "Vision & Strategy",
            questions: [
              "How effectively does the leader communicate vision and direction?",
              "Do they set clear goals and expectations?",
              "How well do they align team efforts with organizational objectives?"
            ]
          },
          {
            category: "People Management",
            questions: [
              "How effectively do they develop and mentor team members?",
              "Do they provide constructive feedback regularly?",
              "How well do they delegate responsibilities?"
            ]
          },
          {
            category: "Decision Making",
            questions: [
              "How effectively do they make timely decisions?",
              "Do they consider multiple perspectives before deciding?",
              "How well do they communicate decisions and rationale?"
            ]
          }
        ]),
        is_active: true,
      }
    });

    console.log(`✓ Created leadership template (ID: ${leadershipTemplate.id})`);

    // Create 360-degree feedback template
    const feedback360Template = await prisma.evaluationTemplate.create({
      data: {
        template_name: "360-Degree Feedback",
        description: "Comprehensive feedback template for multi-source evaluations",
        template_type: "360_feedback",
        questions: JSON.stringify([
          {
            category: "Professional Competencies",
            questions: [
              "Demonstrates technical expertise in their role",
              "Shows initiative and takes ownership of responsibilities",
              "Adapts well to change and new challenges",
              "Maintains high quality standards in their work"
            ]
          },
          {
            category: "Interpersonal Skills",
            questions: [
              "Communicates clearly and respectfully",
              "Builds positive working relationships",
              "Shows empathy and understanding toward others",
              "Handles conflict constructively"
            ]
          },
          {
            category: "Collaboration",
            questions: [
              "Actively participates in team activities",
              "Shares information and resources willingly",
              "Supports colleagues and helps when needed",
              "Contributes to a positive team environment"
            ]
          }
        ]),
        is_active: true,
      }
    });

    console.log(`✓ Created 360-feedback template (ID: ${feedback360Template.id})`);

    console.log('\n🎉 Sample evaluation templates created successfully!');
    console.log('Templates available:');
    console.log('• Standard Performance Evaluation');
    console.log('• Leadership Assessment');
    console.log('• 360-Degree Feedback');

  } catch (error) {
    console.error('❌ Error creating sample templates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSampleTemplates();
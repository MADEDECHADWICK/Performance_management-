import prisma from '../src/prisma';
import bcrypt from 'bcryptjs';

async function createManagerUser() {
  try {
    console.log('Creating manager test user...\n');

    // Check if a department exists or create one
    const department = await prisma.department.upsert({
      where: { department_code: 'SALES' },
      update: {},
      create: {
        name: 'Sales Department',
        description: 'Sales and Business Development',
        department_code: 'SALES'
      }
    });

    // Check if roles exist or create them
    const managerRole = await prisma.role.upsert({
      where: { name: 'Manager' },
      update: {},
      create: {
        name: 'Manager',
        billing_rate: 150,
        description: 'Department Manager',
        permissions: ["read", "write", "manage_team"],
        is_active: true
      }
    });

    const employeeRole = await prisma.role.upsert({
      where: { name: 'Associate' },
      update: {},
      create: {
        name: 'Associate',
        billing_rate: 75,
        description: 'Associate Level Employee',
        permissions: ["read", "write"],
        is_active: true
      }
    });

    // Manager user
    const managerPassword = 'manager123456';
    const managerPasswordHash = await bcrypt.hash(managerPassword, 10);
    
    const managerUser = await prisma.user.upsert({
      where: { email: 'manager@ronalds.com' },
      update: {},
      create: {
        email: 'manager@ronalds.com',
        name: 'John Manager',
        password: managerPasswordHash,
        roles: {
          create: {
            role: 'manager'
          }
        },
        profile: {
          create: {
            first_name: 'John',
            last_name: 'Manager',
            email: 'manager@ronalds.com',
            position: 'Sales Manager',
            status: 'active',
            departmentId: department.id,
            role_id: managerRole.id,
            cost_rate: 100,
            hire_date: new Date('2024-01-15')
          }
        }
      },
      include: { profile: true }
    });

    console.log('✓ Manager user created/updated:');
    console.log(`  Email: ${managerUser.email}`);
    console.log(`  Password: ${managerPassword}`);
    console.log(`  Name: ${managerUser.name}\n`);

    // Create some team members for the manager
    const employee1Password = 'employee123456';
    const employee1PasswordHash = await bcrypt.hash(employee1Password, 10);

    const employee1User = await prisma.user.upsert({
      where: { email: 'sarah.smith@ronalds.com' },
      update: {},
      create: {
        email: 'sarah.smith@ronalds.com',
        name: 'Sarah Smith',
        password: employee1PasswordHash,
        roles: {
          create: {
            role: 'employee'
          }
        },
        profile: {
          create: {
            first_name: 'Sarah',
            last_name: 'Smith',
            email: 'sarah.smith@ronalds.com',
            position: 'Sales Associate',
            status: 'active',
            departmentId: department.id,
            role_id: employeeRole.id,
            cost_rate: 60,
            manager_id: managerUser.profile?.id,
            hire_date: new Date('2024-03-20')
          }
        }
      },
      include: { profile: true }
    });

    const employee2Password = 'employee123456';
    const employee2PasswordHash = await bcrypt.hash(employee2Password, 10);

    const employee2User = await prisma.user.upsert({
      where: { email: 'mike.johnson@ronalds.com' },
      update: {},
      create: {
        email: 'mike.johnson@ronalds.com',
        name: 'Mike Johnson',
        password: employee2PasswordHash,
        roles: {
          create: {
            role: 'employee'
          }
        },
        profile: {
          create: {
            first_name: 'Mike',
            last_name: 'Johnson',
            email: 'mike.johnson@ronalds.com',
            position: 'Senior Sales Associate',
            status: 'active',
            departmentId: department.id,
            role_id: employeeRole.id,
            cost_rate: 70,
            manager_id: managerUser.profile?.id,
            hire_date: new Date('2023-08-10')
          }
        }
      },
      include: { profile: true }
    });

    console.log('✓ Team members created:');
    console.log(`  Employee 1: ${employee1User.email} (Password: ${employee1Password})`);
    console.log(`  Employee 2: ${employee2User.email} (Password: ${employee2Password})\n`);

    // Create a client for jobs
    const client = await prisma.client.upsert({
      where: { client_code: 'ACME001' },
      update: {},
      create: {
        client_name: 'Acme Corporation',
        client_code: 'ACME001',
        industry: 'Technology',
        contact_person: 'Jane Doe',
        contact_email: 'jane.doe@acme.com',
        status: 'active'
      }
    });

    // Create some jobs managed by the manager
    const job1 = await prisma.job.upsert({
      where: { job_code: 'PROJ001' },
      update: {},
      create: {
        job_name: 'Website Redesign Project',
        job_code: 'PROJ001',
        client_id: client.id,
        manager_id: managerUser.profile?.id,
        partner_id: managerUser.profile?.id, // Manager also acts as partner for this example
        description: 'Complete website redesign and optimization',
        start_date: new Date('2025-12-01'),
        due_date: new Date('2026-03-01'),
        status: 'active',
        department_id: department.id,
        budgeted_hours: 120,
        billing_type: 'hourly',
        budget: 18000,
        completion_percentage: 35
      }
    });

    const job2 = await prisma.job.upsert({
      where: { job_code: 'PROJ002' },
      update: {},
      create: {
        job_name: 'CRM Implementation',
        job_code: 'PROJ002',
        client_id: client.id,
        manager_id: managerUser.profile?.id,
        description: 'Implement new CRM system',
        start_date: new Date('2025-11-15'),
        due_date: new Date('2026-02-15'),
        status: 'active',
        department_id: department.id,
        budgeted_hours: 200,
        billing_type: 'fixed_fee',
        fixed_fee_amount: 25000,
        budget: 25000,
        completion_percentage: 60
      }
    });

    console.log('✓ Sample jobs created:');
    console.log(`  Job 1: ${job1.job_name} (${job1.job_code})`);
    console.log(`  Job 2: ${job2.job_name} (${job2.job_code})\n`);

    // Assign team members to jobs
    await prisma.jobStaffAssignment.upsert({
      where: { 
        job_id_employee_id: {
          job_id: job1.id,
          employee_id: employee1User.profile!.id
        }
      },
      update: {},
      create: {
        job_id: job1.id,
        employee_id: employee1User.profile!.id,
        assigned_role_id: employeeRole.id,
        assigned_hourly_rate: employeeRole.billing_rate
      }
    });

    await prisma.jobStaffAssignment.upsert({
      where: { 
        job_id_employee_id: {
          job_id: job2.id,
          employee_id: employee2User.profile!.id
        }
      },
      update: {},
      create: {
        job_id: job2.id,
        employee_id: employee2User.profile!.id,
        assigned_role_id: employeeRole.id,
        assigned_hourly_rate: employeeRole.billing_rate
      }
    });

    // Add some time entries
    const timeEntry1 = await prisma.timeEntry.create({
      data: {
        job_id: job1.id,
        employee_id: employee1User.profile!.id,
        date_worked: new Date('2025-12-15'),
        hours: 8,
        billable: true,
        description: 'Website wireframe design',
        status: 'approved',
        billable_amount: 8 * Number(employeeRole.billing_rate),
        cost: 8 * 60
      }
    });

    const timeEntry2 = await prisma.timeEntry.create({
      data: {
        job_id: job2.id,
        employee_id: employee2User.profile!.id,
        date_worked: new Date('2025-12-20'),
        hours: 6.5,
        billable: true,
        description: 'CRM configuration setup',
        status: 'approved',
        billable_amount: 6.5 * Number(employeeRole.billing_rate),
        cost: 6.5 * 70
      }
    });

    console.log('✓ Sample time entries created\n');

    // Create performance reviews
    await prisma.performanceReview.create({
      data: {
        employee_id: employee1User.profile!.id,
        reviewer_id: managerUser.profile!.id,
        review_period_start: new Date('2025-07-01'),
        review_period_end: new Date('2025-12-31'),
        overall_rating: 85,
        financial_score: 88,
        non_financial_score: 82,
        strengths: 'Great attention to detail, reliable delivery',
        areas_for_improvement: 'Time management, client communication',
        status: 'submitted'
      }
    });

    await prisma.performanceReview.create({
      data: {
        employee_id: employee2User.profile!.id,
        reviewer_id: managerUser.profile!.id,
        review_period_start: new Date('2025-07-01'),
        review_period_end: new Date('2025-12-31'),
        overall_rating: 92,
        financial_score: 90,
        non_financial_score: 94,
        strengths: 'Excellent technical skills, leadership potential',
        areas_for_improvement: 'Documentation practices',
        status: 'submitted'
      }
    });

    console.log('✓ Performance reviews created\n');

    console.log('========================================');
    console.log('Manager Test User Created Successfully!');
    console.log('========================================\n');
    console.log('Login Credentials:');
    console.log('------------------');
    console.log('Manager:');
    console.log(`  Email: manager@ronalds.com`);
    console.log(`  Password: manager123456`);
    console.log('\nTeam Members:');
    console.log(`  Sarah Smith: sarah.smith@ronalds.com (Password: employee123456)`);
    console.log(`  Mike Johnson: mike.johnson@ronalds.com (Password: employee123456)`);
    console.log('\n🎯 Next Steps:');
    console.log('1. Start the frontend: cd ronalds-growth-hub && npm run dev');
    console.log('2. Go to http://localhost:5173');
    console.log('3. Login as manager@ronalds.com with password: manager123456');
    console.log('4. You should see "Manager Dashboard" in the navigation');
    console.log('5. Click it to view team data, job portfolio, and financials\n');

    process.exit(0);
  } catch (error) {
    console.error('Error creating manager user:', error);
    process.exit(1);
  }
}

createManagerUser();
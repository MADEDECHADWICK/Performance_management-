import prisma from '../src/prisma';

async function createComprehensiveTestJob() {
  try {
    console.log('🚀 Creating comprehensive test job with real database data...\n');

    // 1. Fetch available data from database
    console.log('📊 Fetching available data from database...');
    
    const clients = await prisma.client.findMany({ take: 5 });
    console.log(`✓ Found ${clients.length} clients`);
    
    const partners = await prisma.profile.findMany({
      where: { 
        OR: [
          { is_partner: true }, 
          { position: { contains: 'partner' }}
        ]
      },
      include: { user: true }
    });
    console.log(`✓ Found ${partners.length} partners`);
    
    const managers = await prisma.profile.findMany({
      where: { 
        OR: [
          { position_level: 'manager' },
          { position: { contains: 'Manager' }}
        ]
      },
      include: { user: true }
    });
    console.log(`✓ Found ${managers.length} managers`);
    
    const employees = await prisma.profile.findMany({
      where: { 
        AND: [
          { position: { not: { contains: 'partner' }}},
          { position: { not: { contains: 'manager' }}}
        ]
      },
      include: { user: true },
      take: 6
    });
    console.log(`✓ Found ${employees.length} staff members`);
    
    const departments = await prisma.department.findMany();
    console.log(`✓ Found ${departments.length} departments`);

    const roles = await prisma.role.findMany();
    console.log(`✓ Found ${roles.length} roles`);

    // Validate we have minimum required data
    if (clients.length === 0) throw new Error('No clients found in database');
    if (partners.length === 0) throw new Error('No partners found in database');
    if (managers.length === 0) throw new Error('No managers found in database');
    if (departments.length === 0) throw new Error('No departments found in database');
    if (roles.length === 0) throw new Error('No roles found in database');

    // 2. Select data for job creation
    const selectedClient = clients[0];
    const selectedPartner = partners[0];
    const selectedManager = managers[0];
    const selectedDepartment = departments[0];
    
    console.log('\n🎯 Selected for job creation:');
    console.log(`  📋 Client: ${selectedClient.client_name} (${selectedClient.industry || 'General Business'})`);
    console.log(`  👔 Partner: ${selectedPartner.first_name} ${selectedPartner.last_name}`);
    console.log(`  🎯 Manager: ${selectedManager.first_name} ${selectedManager.last_name}`);
    console.log(`  🏛️ Department: ${selectedDepartment.name}`);

    // 3. Create the comprehensive job
    console.log('\n📝 Creating job record...');
    
    const jobData = {
      job_name: `Statutory Audit - ${selectedClient.client_name} FY2025`,
      description: `Comprehensive statutory audit engagement for ${selectedClient.client_name}, including:\n- Financial statement audit\n- Internal controls review\n- Compliance assessment\n- Management letter preparation\n- Post-audit client presentation`,
      job_code: `AUD-${selectedClient.client_name.substring(0,3).toUpperCase()}-2026-${Date.now().toString().slice(-6)}`,
      client_id: selectedClient.id,
      partner_id: selectedPartner.id,
      manager_id: selectedManager.id,
      department_id: selectedDepartment.id,
      status: 'active',
      priority: 'high',
      estimated_hours: 120,
      budget: 600000, // KES 600,000
      start_date: new Date(),
      due_date: new Date(Date.now() + (60 * 24 * 60 * 60 * 1000)), // 60 days from now
      billing_type: 'fixed_fee',
      fixed_fee_amount: 600000,
      job_owner_id: selectedPartner.id
    };

    const job = await prisma.job.create({
      data: jobData
    });
    
    console.log(`✓ Job created with ID: ${job.id}`);

    // 4. Create job staff assignments
    console.log('\n👥 Assigning staff members...');
    
    const staffAssignments = [];
    
    // Find appropriate roles
    const partnerRole = roles.find(r => r.name.toLowerCase().includes('partner')) || roles[0];
    const managerRole = roles.find(r => r.name.toLowerCase().includes('manager')) || roles[1] || roles[0];
    const associateRole = roles.find(r => r.name.toLowerCase().includes('associate')) || roles[2] || roles[0];
    
    // Assign partner
    const partnerAssignment = await prisma.jobStaffAssignment.create({
      data: {
        job_id: job.id,
        employee_id: selectedPartner.id,
        assigned_role_id: partnerRole.id,
        assigned_hourly_rate: partnerRole.billing_rate,
        role_on_job: 'Engagement Partner'
      }
    });
    staffAssignments.push(partnerAssignment);
    
    // Assign manager
    const managerAssignment = await prisma.jobStaffAssignment.create({
      data: {
        job_id: job.id,
        employee_id: selectedManager.id,
        assigned_role_id: managerRole.id,
        assigned_hourly_rate: managerRole.billing_rate,
        role_on_job: 'Engagement Manager'
      }
    });
    staffAssignments.push(managerAssignment);
    
    // Assign other employees (up to 4, excluding partner and manager)
    const availableEmployees = employees.filter(e => 
      e.id !== selectedPartner.id && e.id !== selectedManager.id
    ).slice(0, 4);
    const jobRoles = ['Senior Associate', 'Associate', 'Junior Associate', 'Audit Assistant'];
    
    for (let i = 0; i < availableEmployees.length; i++) {
      const employee = availableEmployees[i];
      const assignment = await prisma.jobStaffAssignment.create({
        data: {
          job_id: job.id,
          employee_id: employee.id,
          assigned_role_id: associateRole.id,
          assigned_hourly_rate: associateRole.billing_rate,
          role_on_job: jobRoles[i] || 'Team Member'
        }
      });
      staffAssignments.push(assignment);
    }
    
    console.log(`✓ Assigned ${staffAssignments.length} staff members to the job`);

    // 5. Create some sample time entries to show activity
    console.log('\n⏱️ Creating sample time entries...');
    
    const timeEntries = [];
    const activities = ['Planning', 'Risk Assessment', 'Testing Controls', 'Documentation Review'];
    
    for (let i = 0; i < 3; i++) {
      const assignment = staffAssignments[i % staffAssignments.length];
      const timeEntry = await prisma.timeEntry.create({
        data: {
          employee_id: assignment.employee_id,
          job_id: job.id,
          description: activities[i % activities.length],
          hours: Math.floor(Math.random() * 8) + 1, // 1-8 hours
          date_worked: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)), // Past i days
          billable_amount: assignment.assigned_hourly_rate,
          billable: true,
          status: 'approved'
        }
      });
      timeEntries.push(timeEntry);
    }
    
    console.log(`✓ Created ${timeEntries.length} sample time entries`);

    // 6. Create audit log entry
    if (selectedPartner.user) {
      await prisma.auditLog.create({
        data: {
          userId: selectedPartner.user.id,
          action: 'job_creation',
          entityType: 'Job',
          ipAddress: '127.0.0.1'
        }
      });
    }

    // 7. Display comprehensive job summary
    console.log('\n🎉 JOB CREATION COMPLETED SUCCESSFULLY!\n');
    console.log('📊 JOB SUMMARY:');
    console.log(`  🆔 Job ID: ${job.id}`);
    console.log(`  📋 Title: ${job.job_name}`);
    console.log(`  🏢 Client: ${selectedClient.client_name}`);
    console.log(`  👔 Partner: ${selectedPartner.first_name} ${selectedPartner.last_name}`);
    console.log(`  🎯 Manager: ${selectedManager.first_name} ${selectedManager.last_name}`);
    console.log(`  🏛️ Department: ${selectedDepartment.name}`);
    console.log(`  💰 Budget: KES ${Number(jobData.budget).toLocaleString()}`);
    console.log(`  ⏱️ Estimated Hours: ${Number(jobData.estimated_hours)}`);
    console.log(`  📅 Due Date: ${jobData.due_date.toLocaleDateString()}`);
    console.log(`  👥 Team Size: ${staffAssignments.length} members`);
    console.log(`  ⏰ Time Entries: ${timeEntries.length} logged`);
    
    console.log('\n👥 TEAM ASSIGNMENTS:');
    for (const assignment of staffAssignments) {
      const member = assignment.employee_id === selectedPartner.id ? selectedPartner :
                    assignment.employee_id === selectedManager.id ? selectedManager :
                    availableEmployees.find(e => e.id === assignment.employee_id);
      if (member) {
        console.log(`  - ${member.first_name} ${member.last_name} (${assignment.role_on_job}) - Rate: KES ${Number(assignment.assigned_hourly_rate)}/hr`);
      }
    }
    
    console.log('\n⏰ SAMPLE TIME ENTRIES:');
    for (const entry of timeEntries) {
      const member = staffAssignments.find(a => a.employee_id === entry.employee_id);
      const employee = member?.employee_id === selectedPartner.id ? selectedPartner :
                      member?.employee_id === selectedManager.id ? selectedManager :
                      availableEmployees.find(e => e.id === member?.employee_id);
      if (employee) {
        console.log(`  - ${employee.first_name} ${employee.last_name}: ${Number(entry.hours)}h on ${entry.description}`);
      }
    }

    console.log('\n✅ You can now test the job workflow dashboard to see this job in action!');
    console.log('🌐 Navigate to: http://localhost:8081/job-workflow-dashboard');
    
  } catch (error) {
    console.error('❌ Error creating comprehensive test job:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function
createComprehensiveTestJob()
  .then(() => {
    console.log('\n🎯 Test job creation completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed to create test job:', error);
    process.exit(1);
  });
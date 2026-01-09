import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function seedRoles() {
  try {
    console.log('Seeding default roles...');

    const roles = [
      {
        name: 'super_admin',
        billing_rate: 0,
        permissions: ['*'],
        description: 'Super Administrator with all permissions',
        is_active: true,
      },
      {
        name: 'hr_manager',
        billing_rate: 0,
        permissions: ['manage_staff', 'manage_roles', 'view_financials', 'manage_jobs'],
        description: 'HR Manager can manage staff and roles',
        is_active: true,
      },
      {
        name: 'Partner',
        billing_rate: 15000,
        permissions: ['manage_jobs', 'view_financials', 'submit_timesheets'],
        description: 'Partner role with 15,000 KES/hr billing rate',
        is_active: true,
      },
      {
        name: 'Manager',
        billing_rate: 6000,
        permissions: ['manage_assigned_jobs', 'view_team_financials', 'submit_timesheets'],
        description: 'Manager role with 6,000 KES/hr billing rate',
        is_active: true,
      },
      {
        name: 'Associate',
        billing_rate: 4000,
        permissions: ['view_own_jobs', 'submit_timesheets', 'view_own'],
        description: 'Associate role with 4,000 KES/hr billing rate',
        is_active: true,
      },
      {
        name: 'Intern',
        billing_rate: 2000,
        permissions: ['submit_timesheets', 'view_own'],
        description: 'Intern role with 2,000 KES/hr billing rate',
        is_active: true,
      },
      {
        name: 'Employee',
        billing_rate: 1500,
        permissions: ['submit_timesheets', 'view_own'],
        description: 'General Employee role with 1,500 KES/hr billing rate',
        is_active: true,
      },
    ];

    // Create roles
    for (const role of roles) {
      const existing = await prisma.role.findUnique({
        where: { name: role.name },
      });

      if (!existing) {
        await prisma.role.create({
          data: role,
        });
        console.log(`✓ Created role: ${role.name}`);
      } else {
        console.log(`✓ Role already exists: ${role.name}`);
      }
    }

    // Assign roles to profiles
    console.log('\nAssigning roles to profiles...');

    // Get role IDs
    const partnerRole = await prisma.role.findUnique({ where: { name: 'Partner' } });
    const employeeRole = await prisma.role.findUnique({ where: { name: 'Employee' } });
    const managerRole = await prisma.role.findUnique({ where: { name: 'Manager' } });

    if (!partnerRole || !employeeRole) {
      throw new Error('Failed to get role IDs');
    }

    // Assign Partner role to partners
    const partnersUpdated = await prisma.profile.updateMany({
      where: { is_partner: true, role_id: null },
      data: { role_id: partnerRole.id },
    });
    console.log(`✓ Assigned Partner role to ${partnersUpdated.count} partners`);

    // Assign Employee role to remaining profiles
    const employeesUpdated = await prisma.profile.updateMany({
      where: { role_id: null },
      data: { role_id: employeeRole.id },
    });
    console.log(`✓ Assigned Employee role to ${employeesUpdated.count} employees`);

    // Populate job_staff_assignments with role data
    console.log('\nPopulating job staff assignments...');
    const assignments = await prisma.jobStaffAssignment.findMany({
      where: { assigned_role_id: undefined },
    });

    let updated = 0;
    for (const assignment of assignments) {
      // Get the employee's role
      const employee = await prisma.profile.findUnique({
        where: { id: assignment.employee_id },
        include: { role: true },
      });

      const roleId = employee?.role_id || employeeRole.id;
      const roleName = employee?.role?.name || 'Employee';
      const billingRate = employee?.role?.billing_rate || 1500;

      await prisma.jobStaffAssignment.update({
        where: { id: assignment.id },
        data: {
          assigned_role_id: roleId,
          assigned_hourly_rate: new Decimal(billingRate),
          role_snapshot: {
            name: roleName,
            billing_rate: billingRate,
          },
        },
      });
      updated++;
    }
    console.log(`✓ Updated ${updated} job staff assignments`);

    console.log('\n✓ Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding roles:', error);
    process.exit(1);
  }
}

seedRoles();

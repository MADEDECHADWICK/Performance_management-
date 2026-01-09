import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createSampleData() {
  try {
    // Create departments if they don't exist
    let audit = await prisma.department.findFirst({ where: { department_code: 'AUD' } });
    if (!audit) {
      audit = await prisma.department.create({
        data: {
          name: 'Audit',
          department_code: 'AUD',
          description: 'Audit Department'
        }
      });
    }

    let tax = await prisma.department.findFirst({ where: { department_code: 'TAX' } });
    if (!tax) {
      tax = await prisma.department.create({
        data: {
          name: 'Tax',
          department_code: 'TAX',
          description: 'Tax Department'
        }
      });
    }

    let advisory = await prisma.department.findFirst({ where: { department_code: 'ADV' } });
    if (!advisory) {
      advisory = await prisma.department.create({
        data: {
          name: 'Advisory',
          department_code: 'ADV',
          description: 'Advisory Services'
        }
      });
    }

    // Create some partner users
    let partner1 = await prisma.user.findUnique({
      where: { email: 'john.partner@ronaldsllp.com' }
    });
    
    if (!partner1) {
      const hashedPassword = await bcrypt.hash('password123', 10);
      partner1 = await prisma.user.create({
        data: {
          email: 'john.partner@ronaldsllp.com',
          name: 'John Partner',
          password: hashedPassword
        }
      });
    }

    let partner1Profile = await prisma.profile.findUnique({
      where: { email: 'john.partner@ronaldsllp.com' }
    });

    if (!partner1Profile) {
      partner1Profile = await prisma.profile.create({
        data: {
          userId: partner1.id,
          first_name: 'John',
          last_name: 'Partner',
          email: 'john.partner@ronaldsllp.com',
          position: 'partner',
          departmentId: audit.id,
          status: 'active',
          is_partner: true
        }
      });
    }

    // Create some manager users
    let manager1 = await prisma.user.findUnique({
      where: { email: 'sarah.manager@ronaldsllp.com' }
    });

    if (!manager1) {
      const hashedPassword = await bcrypt.hash('password123', 10);
      manager1 = await prisma.user.create({
        data: {
          email: 'sarah.manager@ronaldsllp.com',
          name: 'Sarah Manager',
          password: hashedPassword
        }
      });
    }

    let manager1Profile = await prisma.profile.findUnique({
      where: { email: 'sarah.manager@ronaldsllp.com' }
    });

    if (!manager1Profile) {
      manager1Profile = await prisma.profile.create({
        data: {
          userId: manager1.id,
          first_name: 'Sarah',
          last_name: 'Manager',
          email: 'sarah.manager@ronaldsllp.com',
          position: 'manager',
          departmentId: audit.id,
          status: 'active',
          manager_id: partner1Profile.id
        }
      });
    }

    // Create some client
    let client1 = await prisma.client.findFirst({
      where: { client_code: 'ABC001' }
    });

    if (!client1) {
      client1 = await prisma.client.create({
        data: {
          client_name: 'ABC Corporation',
          client_code: 'ABC001',
          industry: 'Technology',
          contact_person: 'Jane Doe',
          contact_email: 'jane@abc.com',
          status: 'active'
        }
      });
    }

    // Create some sample jobs
    let job1 = await prisma.job.findFirst({
      where: { job_code: 'AUD-2024-001' }
    });

    if (!job1) {
      job1 = await prisma.job.create({
        data: {
          job_name: 'Annual Audit - ABC Corp',
          job_code: 'AUD-2024-001',
          client_id: client1.id,
          partner_id: partner1Profile.id,
          manager_id: manager1Profile.id,
          status: 'active',
          amount_collected: 150000,
          fees: 125000,
          start_date: new Date('2024-01-01'),
          due_date: new Date('2024-03-31')
        }
      });
    }

    console.log('Sample data created successfully!');
    console.log('Created departments:', [audit.name, tax.name, advisory.name]);
    console.log('Created partner:', partner1Profile.first_name, partner1Profile.last_name);
    console.log('Created manager:', manager1Profile.first_name, manager1Profile.last_name);
    console.log('Created client:', client1.client_name);
    console.log('Created job:', job1.job_name);

  } catch (error) {
    console.error('Error creating sample data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSampleData();
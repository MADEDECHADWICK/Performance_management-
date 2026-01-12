import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createSecureGMPUser() {
  try {
    console.log('🚀 Creating comprehensive Group Managing Partner (GMP) user...\n');

    // Create secure password with proper hashing
    const gmpPassword = 'GMP@Ronalds2026!';  // Strong password
    const hashedPassword = await bcrypt.hash(gmpPassword, 12); // Higher salt rounds for security
    
    console.log('🔐 Password hash created with 12 salt rounds for maximum security');

    // Ensure required departments exist
    const executiveDept = await prisma.department.upsert({
      where: { department_code: 'EXECUTIVE' },
      update: {},
      create: {
        name: 'Executive Management',
        description: 'Senior executive leadership and strategic oversight',
        department_code: 'EXECUTIVE'
      }
    });
    console.log('✓ Executive department ensured');

    // Ensure required roles exist
    const gmpRole = await prisma.role.upsert({
      where: { name: 'Group Managing Partner' },
      update: {},
      create: {
        name: 'Group Managing Partner',
        billing_rate: 500, // Premium GMP billing rate
        description: 'Group Managing Partner with full firm oversight',
        permissions: [
          "read", "write", "delete", "manage_all", 
          "financial_oversight", "strategic_planning",
          "partner_management", "firm_governance"
        ],
        is_active: true
      }
    });
    console.log('✓ GMP role ensured');

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: 'gmp@ronalds.com' },
      include: { profile: true, roles: true }
    });

    if (user) {
      console.log('⚠️  GMP user already exists, updating password and ensuring proper setup...');
      
      // Update password
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
      });
      console.log('✓ Password updated');
    } else {
      // Create new GMP user
      user = await prisma.user.create({
        data: {
          email: 'gmp@ronalds.com',
          name: 'Ronald Karauri', // Authentic Kenyan name for GMP
          password: hashedPassword
        },
        include: { profile: true, roles: true }
      });
      console.log('✓ New GMP user created');
    }

    // Check if profile exists or create/update it
    let profile = await prisma.profile.findUnique({
      where: { userId: user.id }
    });

    if (!profile) {
      // Create new profile
      profile = await prisma.profile.create({
        data: {
          userId: user.id,
          first_name: 'Ronald',
          last_name: 'Karauri',
          email: 'gmp@ronalds.com',
          position: 'group_managing_partner',
          status: 'active',
          is_partner: true,
          departmentId: executiveDept.id,
          role_id: gmpRole.id,
          hire_date: new Date('2015-01-01'), // Long tenure for credibility
          cost_rate: 350,
          phone_number: '+254 720 123456',
        }
      });
      console.log('✓ New GMP profile created');
    } else {
      // Update existing profile to ensure correct data
      profile = await prisma.profile.update({
        where: { userId: user.id },
        data: {
          first_name: 'Ronald',
          last_name: 'Karauri',
          email: 'gmp@ronalds.com',
          position: 'group_managing_partner',
          is_partner: true,
          departmentId: executiveDept.id,
          role_id: gmpRole.id,
          status: 'active',
          phone_number: '+254 720 123456',
        }
      });
      console.log('✓ Existing GMP profile updated');
    }

    // Ensure proper roles are assigned
    const roleAssignments = [
      'super_admin',
      'group_managing_partner', 
      'partner',
      'admin'
    ];

    for (const role of roleAssignments) {
      const existingRole = await prisma.userRole.findFirst({
        where: { 
          userId: user.id,
          role: role
        }
      });

      if (!existingRole) {
        await prisma.userRole.create({
          data: {
            userId: user.id,
            role: role
          }
        });
        console.log(`✓ Added ${role} role`);
      }
    }

    // Create GMP-specific data for comprehensive functionality
    
    // Create Partner Company if it doesn't exist
    const gmpCompany = await prisma.partnerCompany.upsert({
      where: { company_name: 'Ronalds LLP' },
      update: {},
      create: {
        company_name: 'Ronalds LLP',
        registration_number: 'REG-KE-2015-001',
        tax_id: 'TAX-KE-GMP-001',
      }
    });
    console.log('✓ GMP partner company ensured');

    // Create Partner record if it doesn't exist
    const existingPartner = await prisma.partner.findUnique({
      where: { profile_id: profile.id }
    });

    if (!existingPartner) {
      await prisma.partner.create({
        data: {
          profile_id: profile.id,
          company_id: gmpCompany.id,
          commission_rate: 25, // High commission rate for GMP
          performance_threshold: 95,
          group_name: 'Executive Leadership',
        }
      });
      console.log('✓ Partner record created');
    }

    // Verify login functionality
    const testLogin = await bcrypt.compare(gmpPassword, user.password!);
    console.log(`🔍 Login verification: ${testLogin ? '✅ PASSED' : '❌ FAILED'}`);

    console.log('\n🎉 GMP User Setup Completed Successfully!');
    console.log('=========================================');
    console.log('📧 Email: gmp@ronalds.com');
    console.log(`🔑 Password: ${gmpPassword}`);
    console.log('👤 Name: Ronald Karauri');
    console.log('📍 Position: Group Managing Partner');
    console.log('🏢 Department: Executive Management');
    console.log('🆔 Employee ID: GMP001');
    console.log('📱 Phone: +254 720 123456');
    console.log('\n🔐 Security Features:');
    console.log('• Password hashed with bcrypt (12 salt rounds)');
    console.log('• Multiple role assignments for comprehensive access');
    console.log('• Complete profile with Kenyan context');
    console.log('• Partnership structure established');
    console.log('\n🎯 Available Functionalities:');
    console.log('• Complete GMP Dashboard access');
    console.log('• Firm-wide financial oversight');
    console.log('• Partner performance management');
    console.log('• Strategic planning and analytics');
    console.log('• HR and administrative controls');
    console.log('• All partner and manager functionalities');
    console.log('\n🚀 Next Steps:');
    console.log('1. Start the backend: cd backend && npm start');
    console.log('2. Start the frontend: cd ronalds-growth-hub && npm run dev');
    console.log('3. Navigate to http://localhost:8082');
    console.log('4. Login with the credentials above');
    console.log('5. You will be redirected to the GMP Dashboard');
    console.log('\n⚠️  IMPORTANT: Store these credentials securely!');

  } catch (error) {
    console.error('❌ Error creating GMP user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Add password validation helper
async function validateGMPLogin(email: string, password: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true, roles: true }
    });

    if (!user) {
      console.log('❌ User not found');
      return false;
    }

    const isValid = await bcrypt.compare(password, user.password!);
    console.log(`🔍 Password validation: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    
    if (isValid) {
      console.log('👤 User details:');
      console.log(`   Name: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Profile: ${user.profile?.first_name} ${user.profile?.last_name}`);
      console.log(`   Position: ${user.profile?.position}`);
      console.log(`   Roles: ${user.roles.map(r => r.role).join(', ')}`);
    }

    return isValid;
  } catch (error) {
    console.error('❌ Validation error:', error);
    return false;
  }
}

// Run the script
async function main() {
  try {
    await createSecureGMPUser();
    
    // Test the login
    console.log('\n🧪 Testing login functionality...');
    await validateGMPLogin('gmp@ronalds.com', 'GMP@Ronalds2026!');
    
  } catch (error) {
    console.error('Script execution failed:', error);
    process.exit(1);
  }
}

main();
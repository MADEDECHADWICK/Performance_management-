import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

/**
 * Script to create financial calculation views
 * Run this after running the migration to create the database views
 */
async function createFinancialViews() {
  try {
    console.log('Creating financial calculation views...');
    
    // Read the SQL file
    const sqlContent = readFileSync(join(__dirname, 'create-financial-views.sql'), 'utf8');
    
    // Split by view creation statements and execute them
    const viewStatements = sqlContent
      .split('CREATE OR REPLACE VIEW')
      .filter(statement => statement.trim().length > 0);
    
    console.log(`Found ${viewStatements.length - 1} views to create`);
    
    // Execute the first statement (comments) separately if needed
    const sqlStatements = [
      sqlContent.substring(0, sqlContent.indexOf('CREATE OR REPLACE VIEW')),
      ...viewStatements.slice(1).map(statement => 'CREATE OR REPLACE VIEW' + statement)
    ];
    
    // Execute each view creation
    for (let i = 1; i < sqlStatements.length; i++) {
      const statement = sqlStatements[i].trim();
      if (statement.length > 0) {
        try {
          console.log(`Creating view ${i}/${sqlStatements.length - 1}...`);
          await prisma.$executeRawUnsafe(statement);
          console.log(`✓ View ${i} created successfully`);
        } catch (error: any) {
          console.error(`✗ Failed to create view ${i}:`, error.message);
        }
      }
    }
    
    console.log('\n✅ Financial views creation completed');
  } catch (error: any) {
    console.error('❌ Error creating financial views:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  createFinancialViews()
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export default createFinancialViews;
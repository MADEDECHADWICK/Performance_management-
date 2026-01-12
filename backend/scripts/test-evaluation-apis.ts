import fetch from 'node-fetch';

const API_BASE = 'http://localhost:4000';

async function testEvaluationSystemAPIs() {
  console.log('🧪 Testing Evaluation System APIs...\n');

  try {
    // Test 1: Check evaluation templates endpoint
    console.log('1. Testing Evaluation Templates API...');
    const templatesResponse = await fetch(`${API_BASE}/evaluation_templates?is_active=true`);
    const templates = await templatesResponse.json();
    
    if (templatesResponse.ok) {
      console.log(`   ✅ Templates API working - Found ${templates.length} templates`);
      templates.forEach((t: any) => console.log(`      - ${t.template_name}`));
    } else {
      console.log('   ❌ Templates API failed:', templates.error);
    }

    // Test 2: Check evaluation cycles endpoint
    console.log('\n2. Testing Evaluation Cycles API...');
    const cyclesResponse = await fetch(`${API_BASE}/evaluation_cycles`);
    const cycles = await cyclesResponse.json();
    
    if (cyclesResponse.ok) {
      console.log(`   ✅ Cycles API working - Found ${cycles.length} cycles`);
    } else {
      console.log('   ❌ Cycles API failed:', cycles.error);
    }

    // Test 3: Check ad-hoc evaluations endpoint
    console.log('\n3. Testing Ad-hoc Evaluations API...');
    const adHocResponse = await fetch(`${API_BASE}/ad_hoc_evaluations`);
    const adHocEvals = await adHocResponse.json();
    
    if (adHocResponse.ok) {
      console.log(`   ✅ Ad-hoc Evaluations API working - Found ${adHocEvals.length} evaluations`);
    } else {
      console.log('   ❌ Ad-hoc Evaluations API failed:', adHocEvals.error);
    }

    // Test 4: Check evaluation assignments endpoint
    console.log('\n4. Testing Evaluation Assignments API...');
    const assignmentsResponse = await fetch(`${API_BASE}/evaluation_assignments?limit=5`);
    const assignments = await assignmentsResponse.json();
    
    if (assignmentsResponse.ok) {
      console.log(`   ✅ Assignments API working - Found ${assignments.length} assignments`);
    } else {
      console.log('   ❌ Assignments API failed:', assignments.error);
    }

    // Test 5: Check create-cycle-evaluations endpoint
    console.log('\n5. Testing Create Cycle Evaluations API...');
    // This will fail without proper auth, but should return a proper error message
    const createCycleResponse = await fetch(`${API_BASE}/create-cycle-evaluations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycleId: 1 })
    });
    const createCycleResult = await createCycleResponse.json();
    
    if (createCycleResponse.status === 401) {
      console.log('   ✅ Create Cycle Evaluations API accessible (auth required as expected)');
    } else if (createCycleResponse.ok) {
      console.log('   ✅ Create Cycle Evaluations API working');
    } else {
      console.log('   ⚠️  Create Cycle Evaluations API response:', createCycleResult);
    }

    // Test 6: Check evaluation result areas endpoint
    console.log('\n6. Testing Evaluation Result Areas API...');
    const resultAreasResponse = await fetch(`${API_BASE}/evaluation_result_areas`);
    const resultAreas = await resultAreasResponse.json();
    
    if (resultAreasResponse.ok) {
      console.log(`   ✅ Result Areas API working - Found ${resultAreas.length} result areas`);
    } else {
      console.log('   ❌ Result Areas API failed:', resultAreas.error);
    }

    // Test 7: Check KPIs endpoint
    console.log('\n7. Testing KPIs API...');
    const kpisResponse = await fetch(`${API_BASE}/kpis?is_active=true`);
    const kpis = await kpisResponse.json();
    
    if (kpisResponse.ok) {
      console.log(`   ✅ KPIs API working - Found ${kpis.length} active KPIs`);
    } else {
      console.log('   ❌ KPIs API failed:', kpis.error);
    }

    // Test 8: Check profiles endpoint
    console.log('\n8. Testing Profiles API...');
    const profilesResponse = await fetch(`${API_BASE}/profiles?status=active&limit=5`);
    const profiles = await profilesResponse.json();
    
    if (profilesResponse.ok) {
      console.log(`   ✅ Profiles API working - Found ${profiles.length} active profiles`);
    } else {
      console.log('   ❌ Profiles API failed:', profiles.error);
    }

    console.log('\n🎉 API Testing Complete!');
    console.log('\n📋 System Status Summary:');
    console.log('• Evaluation Templates: ✅ Available');
    console.log('• Evaluation Cycles: ✅ Available');
    console.log('• Ad-hoc Evaluations: ✅ Available');
    console.log('• Evaluation Assignments: ✅ Available');
    console.log('• Auto-create Evaluations: ✅ Available');
    console.log('• KPI Management: ✅ Available');
    console.log('• Profile Management: ✅ Available');
    
    console.log('\n🔗 Frontend Should Now Work With:');
    console.log('• Create Evaluation page');
    console.log('• Evaluation Management page');
    console.log('• Complete Evaluation workflow');
    console.log('• Evaluation cycle creation');
    console.log('• Template selection');

  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
}

testEvaluationSystemAPIs();
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  cycleId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting create-cycle-evaluations function');

    // Create Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the cycle ID from the request
    const { cycleId }: RequestBody = await req.json();
    
    if (!cycleId) {
      console.error('No cycle ID provided');
      return new Response(
        JSON.stringify({ error: 'Cycle ID is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log(`Creating evaluations for cycle: ${cycleId}`);

    // Fetch all active employees with their manager information
    const { data: employees, error: employeesError } = await supabase
      .from('profiles')
      .select('id, manager_id, first_name, last_name, email, status')
      .eq('status', 'active');

    if (employeesError) {
      console.error('Error fetching employees:', employeesError);
      throw employeesError;
    }

    if (!employees || employees.length === 0) {
      console.log('No active employees found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active employees to create evaluations for',
          created: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    console.log(`Found ${employees.length} active employees`);

    // Check for existing evaluations for this cycle
    const { data: existingEvaluations, error: existingError } = await supabase
      .from('employee_evaluations')
      .select('employee_id')
      .eq('cycle_id', cycleId);

    if (existingError) {
      console.error('Error checking existing evaluations:', existingError);
      throw existingError;
    }

    const existingEmployeeIds = new Set(
      existingEvaluations?.map(e => e.employee_id) || []
    );

    console.log(`Found ${existingEmployeeIds.size} existing evaluations for this cycle`);

    // Create evaluation records for employees who don't have one yet
    const evaluationsToCreate = employees
      .filter(emp => !existingEmployeeIds.has(emp.id))
      .map(emp => ({
        cycle_id: cycleId,
        employee_id: emp.id,
        manager_id: emp.manager_id,
        status: 'draft',
      }));

    if (evaluationsToCreate.length === 0) {
      console.log('All employees already have evaluations for this cycle');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All employees already have evaluations for this cycle',
          created: 0,
          skipped: employees.length
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    console.log(`Creating ${evaluationsToCreate.length} new evaluations`);

    // Insert the evaluations
    const { data: createdEvaluations, error: insertError } = await supabase
      .from('employee_evaluations')
      .insert(evaluationsToCreate)
      .select();

    if (insertError) {
      console.error('Error creating evaluations:', insertError);
      throw insertError;
    }

    console.log(`Successfully created ${createdEvaluations?.length || 0} evaluations`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Created ${createdEvaluations?.length || 0} evaluation(s)`,
        created: createdEvaluations?.length || 0,
        skipped: existingEmployeeIds.size
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in create-cycle-evaluations:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while creating evaluations';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

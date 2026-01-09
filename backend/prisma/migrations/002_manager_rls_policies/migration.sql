-- Manager Access Control Policies
-- This migration adds Row Level Security policies to ensure managers can only access their team data

-- Enable RLS on key tables (if not already enabled)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_goals ENABLE ROW LEVEL SECURITY;

-- Create function to check if user is a manager
CREATE OR REPLACE FUNCTION is_manager(user_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM user_roles ur 
    WHERE ur."userId" = user_id 
    AND ur.role = 'manager'
  );
$$;

-- Create function to get user's profile ID from user ID
CREATE OR REPLACE FUNCTION get_user_profile_id(user_id INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT p.id FROM profiles p WHERE p."userId" = user_id LIMIT 1;
$$;

-- Profiles: Managers can view their direct reports + their own profile
CREATE POLICY manager_can_view_team_profiles
ON profiles
FOR SELECT
USING (
  -- User can see their own profile
  "userId" = CURRENT_USER_ID()
  OR
  -- OR user is a manager and this is their direct report
  (
    is_manager(CURRENT_USER_ID()) = true
    AND manager_id = get_user_profile_id(CURRENT_USER_ID())
  )
  OR
  -- OR user is HR/Admin (handled by existing policies)
  EXISTS(
    SELECT 1 FROM user_roles ur 
    WHERE ur."userId" = CURRENT_USER_ID() 
    AND ur.role IN ('hr_manager', 'super_admin')
  )
);

-- Time Entries: Managers can view their team's time entries
CREATE POLICY manager_can_view_team_time_entries
ON time_entries
FOR SELECT
USING (
  -- User can see their own time entries
  employee_id = get_user_profile_id(CURRENT_USER_ID())
  OR
  -- OR user is a manager and this is their team member's time entry
  (
    is_manager(CURRENT_USER_ID()) = true
    AND EXISTS(
      SELECT 1 FROM profiles p 
      WHERE p.id = employee_id 
      AND p.manager_id = get_user_profile_id(CURRENT_USER_ID())
    )
  )
  OR
  -- OR user is HR/Admin
  EXISTS(
    SELECT 1 FROM user_roles ur 
    WHERE ur."userId" = CURRENT_USER_ID() 
    AND ur.role IN ('hr_manager', 'super_admin')
  )
);

-- Jobs: Managers can view jobs they manage or jobs their team works on
CREATE POLICY manager_can_view_managed_jobs
ON jobs
FOR SELECT
USING (
  -- User can see jobs where they are the manager
  manager_id = get_user_profile_id(CURRENT_USER_ID())
  OR
  -- OR jobs where they are the partner/owner
  partner_id = get_user_profile_id(CURRENT_USER_ID())
  OR
  -- OR jobs where they are assigned
  assigned_to = get_user_profile_id(CURRENT_USER_ID())
  OR
  -- OR jobs where their team members are assigned (for managers)
  (
    is_manager(CURRENT_USER_ID()) = true
    AND EXISTS(
      SELECT 1 FROM job_staff_assignments jsa
      JOIN profiles p ON jsa.employee_id = p.id
      WHERE jsa.job_id = jobs.id
      AND p.manager_id = get_user_profile_id(CURRENT_USER_ID())
    )
  )
  OR
  -- OR user is HR/Admin
  EXISTS(
    SELECT 1 FROM user_roles ur 
    WHERE ur."userId" = CURRENT_USER_ID() 
    AND ur.role IN ('hr_manager', 'super_admin')
  )
);

-- Performance Reviews: Managers can view their team's reviews
CREATE POLICY manager_can_view_team_reviews
ON performance_reviews
FOR SELECT
USING (
  -- User can see their own reviews
  employee_id = get_user_profile_id(CURRENT_USER_ID())
  OR
  -- OR user is the reviewer
  reviewer_id = get_user_profile_id(CURRENT_USER_ID())
  OR
  -- OR user is a manager viewing their team member's review
  (
    is_manager(CURRENT_USER_ID()) = true
    AND EXISTS(
      SELECT 1 FROM profiles p 
      WHERE p.id = employee_id 
      AND p.manager_id = get_user_profile_id(CURRENT_USER_ID())
    )
  )
  OR
  -- OR user is HR/Admin
  EXISTS(
    SELECT 1 FROM user_roles ur 
    WHERE ur."userId" = CURRENT_USER_ID() 
    AND ur.role IN ('hr_manager', 'super_admin')
  )
);

-- Employee Goals: Managers can view their team's goals
CREATE POLICY manager_can_view_team_goals
ON employee_goals
FOR SELECT
USING (
  -- User can see their own goals
  employee_id = get_user_profile_id(CURRENT_USER_ID())
  OR
  -- OR user is a manager viewing their team member's goals
  (
    is_manager(CURRENT_USER_ID()) = true
    AND EXISTS(
      SELECT 1 FROM profiles p 
      WHERE p.id = employee_id 
      AND p.manager_id = get_user_profile_id(CURRENT_USER_ID())
    )
  )
  OR
  -- OR user is HR/Admin
  EXISTS(
    SELECT 1 FROM user_roles ur 
    WHERE ur."userId" = CURRENT_USER_ID() 
    AND ur.role IN ('hr_manager', 'super_admin')
  )
);

-- Note: This assumes a CURRENT_USER_ID() function exists.
-- Since we're using regular PostgreSQL, we'll need to set this in the application layer
-- by using SET statements or custom session variables.
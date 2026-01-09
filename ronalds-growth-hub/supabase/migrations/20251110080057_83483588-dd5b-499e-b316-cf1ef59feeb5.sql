-- Create position hierarchy enum for Ronalds LLP
CREATE TYPE public.position_level AS ENUM (
  'group_managing_partner',
  'partner',
  'manager',
  'senior',
  'semi_senior',
  'associate',
  'intern'
);

-- Add position_level column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS position_level position_level;

-- Update position_level based on existing position text (best effort mapping)
UPDATE public.profiles 
SET position_level = CASE
  WHEN LOWER(position) LIKE '%group managing partner%' OR LOWER(position) LIKE '%gmp%' THEN 'group_managing_partner'::position_level
  WHEN LOWER(position) LIKE '%partner%' THEN 'partner'::position_level
  WHEN LOWER(position) LIKE '%manager%' THEN 'manager'::position_level
  WHEN LOWER(position) LIKE '%senior%' AND LOWER(position) NOT LIKE '%semi%' THEN 'senior'::position_level
  WHEN LOWER(position) LIKE '%semi-senior%' OR LOWER(position) LIKE '%semi senior%' THEN 'semi_senior'::position_level
  WHEN LOWER(position) LIKE '%associate%' THEN 'associate'::position_level
  WHEN LOWER(position) LIKE '%intern%' THEN 'intern'::position_level
  ELSE NULL
END
WHERE position IS NOT NULL;

-- Create a view for team hierarchy (who reports to whom)
CREATE OR REPLACE VIEW public.team_hierarchy AS
WITH RECURSIVE reporting_chain AS (
  -- Base case: all employees
  SELECT 
    p.id,
    p.first_name,
    p.last_name,
    p.position,
    p.position_level,
    p.manager_id,
    p.department_id,
    1 as level,
    ARRAY[p.id] as chain
  FROM profiles p
  
  UNION ALL
  
  -- Recursive case: managers above
  SELECT 
    p.id,
    p.first_name,
    p.last_name,
    p.position,
    p.position_level,
    p.manager_id,
    p.department_id,
    rc.level + 1,
    rc.chain || p.id
  FROM profiles p
  INNER JOIN reporting_chain rc ON rc.manager_id = p.id
  WHERE NOT p.id = ANY(rc.chain) -- Prevent cycles
)
SELECT DISTINCT ON (id) * FROM reporting_chain
ORDER BY id, level DESC;

-- Create function to get all subordinates of a user
CREATE OR REPLACE FUNCTION public.get_subordinates(user_id uuid)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  position_level position_level,
  department_id uuid
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE subordinates AS (
    -- Base case: direct reports
    SELECT 
      p.id as employee_id,
      p.first_name || ' ' || p.last_name as employee_name,
      p.position_level,
      p.department_id
    FROM profiles p
    WHERE p.manager_id = user_id
    
    UNION ALL
    
    -- Recursive case: reports of reports
    SELECT 
      p.id,
      p.first_name || ' ' || p.last_name,
      p.position_level,
      p.department_id
    FROM profiles p
    INNER JOIN subordinates s ON p.manager_id = s.employee_id
  )
  SELECT * FROM subordinates;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_subordinates(uuid) TO authenticated;
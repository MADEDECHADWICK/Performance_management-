-- Drop the security definer view and recreate without security definer
DROP VIEW IF EXISTS public.team_hierarchy;

-- Recreate view without SECURITY DEFINER (safer approach)
CREATE VIEW public.team_hierarchy AS
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

-- Update the get_subordinates function with proper search_path
DROP FUNCTION IF EXISTS public.get_subordinates(uuid);

CREATE FUNCTION public.get_subordinates(user_id uuid)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  position_level position_level,
  department_id uuid
) 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_subordinates(uuid) TO authenticated;
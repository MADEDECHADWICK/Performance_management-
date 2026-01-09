-- Add due_date to evaluation_assignments for easier querying
ALTER TABLE evaluation_assignments 
ADD COLUMN IF NOT EXISTS due_date timestamp with time zone;

-- Add INSERT policy for evaluation_assignments - only HR/admins can create assignments
CREATE POLICY "Only HR and admins can create evaluation assignments"
ON evaluation_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'hr_manager'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Create index for faster pending evaluations queries
CREATE INDEX IF NOT EXISTS idx_evaluation_assignments_evaluator_status 
ON evaluation_assignments(evaluator_id, status);

-- Create index for due date queries
CREATE INDEX IF NOT EXISTS idx_evaluation_assignments_due_date 
ON evaluation_assignments(due_date) 
WHERE status = 'pending';
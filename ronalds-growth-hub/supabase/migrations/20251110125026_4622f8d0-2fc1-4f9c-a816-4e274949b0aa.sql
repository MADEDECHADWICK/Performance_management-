-- Add activity_type column to work_logs table
ALTER TABLE work_logs 
ADD COLUMN activity_type text NOT NULL DEFAULT 'job' 
CHECK (activity_type IN ('job', 'training', 'holiday', 'sick_leave', 'other'));

-- Add comment for clarity
COMMENT ON COLUMN work_logs.activity_type IS 'Type of activity: job, training, holiday, sick_leave, or other';

-- Update existing records to have activity_type = 'job'
UPDATE work_logs SET activity_type = 'job' WHERE activity_type IS NULL;

-- Add validation trigger to prevent overlapping time entries
CREATE OR REPLACE FUNCTION check_overlapping_work_logs()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM work_logs
    WHERE employee_id = NEW.employee_id
    AND date_worked = NEW.date_worked
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      (NEW.start_time >= start_time AND NEW.start_time < end_time)
      OR (NEW.end_time > start_time AND NEW.end_time <= end_time)
      OR (NEW.start_time <= start_time AND NEW.end_time >= end_time)
    )
  ) THEN
    RAISE EXCEPTION 'Overlapping time entry exists for this date';
  END IF;
  
  -- Ensure holidays and sick leave are not billable
  IF NEW.activity_type IN ('holiday', 'sick_leave') AND NEW.billable = true THEN
    NEW.billable := false;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_work_log_before_insert_update
BEFORE INSERT OR UPDATE ON work_logs
FOR EACH ROW
EXECUTE FUNCTION check_overlapping_work_logs();
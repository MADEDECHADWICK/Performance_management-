-- Add start_time and end_time columns to work_logs table
ALTER TABLE work_logs 
ADD COLUMN start_time time,
ADD COLUMN end_time time;
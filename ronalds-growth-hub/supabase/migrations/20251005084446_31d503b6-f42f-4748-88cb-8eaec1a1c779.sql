-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE app_role AS ENUM ('super_admin', 'hr_manager', 'manager', 'employee', 'client');
CREATE TYPE employment_status AS ENUM ('active', 'inactive', 'on_leave');
CREATE TYPE project_status AS ENUM ('active', 'completed', 'on_hold', 'cancelled');
CREATE TYPE review_status AS ENUM ('draft', 'pending', 'completed', 'calibrated');

-- Create departments table
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  department_id UUID REFERENCES departments(id),
  manager_id UUID REFERENCES profiles(id),
  hourly_rate DECIMAL(10,2),
  status employment_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_roles table (critical for security)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create clients table
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  account_manager_id UUID REFERENCES profiles(id),
  status employment_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_name TEXT NOT NULL,
  project_code TEXT UNIQUE NOT NULL,
  client_id UUID REFERENCES clients(id),
  manager_id UUID REFERENCES profiles(id),
  budget DECIMAL(12,2),
  estimated_hours DECIMAL(8,2),
  start_date DATE,
  end_date DATE,
  status project_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create work_logs table (timesheets)
CREATE TABLE work_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES profiles(id) NOT NULL,
  project_id UUID REFERENCES projects(id),
  date_worked DATE NOT NULL,
  hours_worked DECIMAL(5,2) NOT NULL,
  task_description TEXT,
  billable BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending',
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create KPIs table
CREATE TABLE kpis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'financial' or 'non_financial'
  weight DECIMAL(5,2) DEFAULT 0, -- percentage weight
  role_specific app_role[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create performance_reviews table
CREATE TABLE performance_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES profiles(id) NOT NULL,
  reviewer_id UUID REFERENCES profiles(id),
  review_period_start DATE NOT NULL,
  review_period_end DATE NOT NULL,
  financial_score DECIMAL(5,2), -- 0-100
  non_financial_score DECIMAL(5,2), -- 0-100
  overall_score DECIMAL(5,2), -- weighted average
  status review_status DEFAULT 'draft',
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create feedback table (360 degree feedback)
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id UUID REFERENCES performance_reviews(id),
  subject_id UUID REFERENCES profiles(id) NOT NULL, -- person being reviewed
  reviewer_id UUID REFERENCES profiles(id), -- person giving feedback (can be null for client feedback)
  feedback_type TEXT NOT NULL, -- 'self', 'manager', 'peer', 'client'
  rating DECIMAL(3,2), -- 1-5 scale
  comments TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  
  -- Assign default employee role
  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Create function to check user role (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_work_logs_updated_at BEFORE UPDATE ON work_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Managers can view team profiles"
  ON profiles FOR SELECT
  USING (auth.uid() = manager_id);

CREATE POLICY "HR and admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    has_role(auth.uid(), 'hr_manager') OR 
    has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON user_roles FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- RLS Policies for departments
CREATE POLICY "All authenticated users can view departments"
  ON departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "HR and admins can manage departments"
  ON departments FOR ALL
  USING (
    has_role(auth.uid(), 'hr_manager') OR 
    has_role(auth.uid(), 'super_admin')
  );

-- RLS Policies for work_logs
CREATE POLICY "Employees can view own work logs"
  ON work_logs FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Managers can view team work logs"
  ON work_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = work_logs.employee_id
      AND profiles.manager_id = auth.uid()
    )
  );

CREATE POLICY "HR and admins can view all work logs"
  ON work_logs FOR SELECT
  USING (
    has_role(auth.uid(), 'hr_manager') OR 
    has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Employees can create own work logs"
  ON work_logs FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

-- RLS Policies for performance_reviews
CREATE POLICY "Employees can view own reviews"
  ON performance_reviews FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Managers can view team reviews"
  ON performance_reviews FOR SELECT
  USING (
    auth.uid() = reviewer_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = performance_reviews.employee_id
      AND profiles.manager_id = auth.uid()
    )
  );

CREATE POLICY "HR and admins can view all reviews"
  ON performance_reviews FOR SELECT
  USING (
    has_role(auth.uid(), 'hr_manager') OR 
    has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Managers and HR can create reviews"
  ON performance_reviews FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'manager') OR
    has_role(auth.uid(), 'hr_manager') OR
    has_role(auth.uid(), 'super_admin')
  );

-- RLS Policies for feedback
CREATE POLICY "Users can view feedback they provided"
  ON feedback FOR SELECT
  USING (auth.uid() = reviewer_id);

CREATE POLICY "Users can view feedback about them"
  ON feedback FOR SELECT
  USING (auth.uid() = subject_id);

CREATE POLICY "HR and admins can view all feedback"
  ON feedback FOR SELECT
  USING (
    has_role(auth.uid(), 'hr_manager') OR 
    has_role(auth.uid(), 'super_admin')
  );

-- RLS Policies for KPIs
CREATE POLICY "All authenticated users can view KPIs"
  ON kpis FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "HR and admins can manage KPIs"
  ON kpis FOR ALL
  USING (
    has_role(auth.uid(), 'hr_manager') OR 
    has_role(auth.uid(), 'super_admin')
  );

-- Insert default KPIs
INSERT INTO kpis (name, description, category, weight) VALUES
  ('Billable Hours', 'Total billable hours logged', 'financial', 20.0),
  ('Revenue Contribution', 'Total revenue generated', 'financial', 25.0),
  ('Project Profitability', 'Profit margin on projects', 'financial', 15.0),
  ('Utilization Rate', 'Percentage of available hours billed', 'financial', 10.0),
  ('Technical Skills', 'Proficiency in required technical skills', 'non_financial', 10.0),
  ('Leadership', 'Leadership and mentoring capabilities', 'non_financial', 8.0),
  ('Client Satisfaction', 'Client feedback and satisfaction scores', 'non_financial', 7.0),
  ('Innovation', 'Process improvements and innovative solutions', 'non_financial', 5.0);

-- Insert sample department
INSERT INTO departments (name, description) VALUES
  ('Audit', 'Audit and Assurance Services'),
  ('Tax', 'Tax Advisory and Compliance'),
  ('Advisory', 'Business Advisory Services'),
  ('IT', 'Information Technology'),
  ('HR', 'Human Resources');
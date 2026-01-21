import { useState, useEffect } from 'react';
import { rolesAPI } from '@/lib/api';

interface Role {
  id: number;
  name: string;
  billing_rate: number;
}

interface RoleSelectProps {
  value?: number;
  onChange?: (roleId: number) => void;
  disabled?: boolean;
  label?: string;
}

export function RoleSelect({ value, onChange, disabled, label = "Select Role" }: RoleSelectProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | undefined>();

  useEffect(() => {
    loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRoles = async () => {
    try {
      const data = await rolesAPI.getAll();
      setRoles(data);
      if (value) {
        setSelectedRole(data.find(r => r.id === value));
      }
    } catch (error) {
      console.error('Error loading roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (roleId: string) => {
    const id = parseInt(roleId);
    setSelectedRole(roles.find(r => r.id === id));
    onChange?.(id);
  };

  if (loading) return <div className="text-sm text-gray-500">Loading roles...</div>;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        className="border rounded px-3 py-2 text-sm"
      >
        <option value="">-- Select Role --</option>
        {roles.map(role => (
          <option key={role.id} value={role.id}>
            {role.name} ({role.billing_rate.toLocaleString()} KES/hr)
          </option>
        ))}
      </select>
      {selectedRole && (
        <div className="text-xs text-gray-600">
          Rate: {selectedRole.billing_rate.toLocaleString()} KES/hr
        </div>
      )}
    </div>
  );
}

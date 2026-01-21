import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { rolesAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Role {
  id: number;
  name: string;
  billing_rate: number;
  description?: string;
  permissions: string[];
  is_active: boolean;
  createdAt: string;
}

export default function RoleManagement() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    billing_rate: 0,
    description: '',
    permissions: [] as string[],
    is_active: true,
  });

  useEffect(() => {
    loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const data = await rolesAPI.getAll();
      setRoles(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load roles';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingRole(null);
    setFormData({
      name: '',
      billing_rate: 0,
      description: '',
      permissions: [],
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      billing_rate: role.billing_rate,
      description: role.description || '',
      permissions: role.permissions || [],
      is_active: role.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Role name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (editingRole) {
        await rolesAPI.update(editingRole.id, formData);
        toast({
          title: 'Success',
          description: `Role "${formData.name}" updated successfully`,
        });
      } else {
        await rolesAPI.create(formData);
        toast({
          title: 'Success',
          description: `Role "${formData.name}" created successfully`,
        });
      }
      setIsModalOpen(false);
      loadRoles();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save role';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to deactivate this role?')) return;

    try {
      await rolesAPI.delete(id);
      toast({
        title: 'Success',
        description: 'Role deactivated successfully',
      });
      loadRoles();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to deactivate role';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Loading roles...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Role Management</h1>
        <Button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700">
          + Create New Role
        </Button>
      </div>

      {/* Roles Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="text-left px-6 py-3 font-semibold">Role Name</th>
              <th className="text-left px-6 py-3 font-semibold">Billing Rate</th>
              <th className="text-left px-6 py-3 font-semibold">Active</th>
              <th className="text-left px-6 py-3 font-semibold">Permissions</th>
              <th className="text-center px-6 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-b hover:bg-gray-50">
                <td className="px-6 py-3">
                  <div>
                    <p className="font-medium">{role.name}</p>
                    {role.description && <p className="text-sm text-gray-600">{role.description}</p>}
                  </div>
                </td>
                <td className="px-6 py-3">
                  <span className="font-mono font-semibold">{role.billing_rate.toLocaleString()} KES/hr</span>
                </td>
                <td className="px-6 py-3">
                  {role.is_active ? (
                    <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Active</span>
                  ) : (
                    <span className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">Inactive</span>
                  )}
                </td>
                <td className="px-6 py-3">
                  <div className="flex flex-wrap gap-1">
                    {role.permissions && role.permissions.length > 0 ? (
                      role.permissions.slice(0, 2).map((perm, idx) => (
                        <span key={idx} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                          {perm}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400 text-sm">No permissions</span>
                    )}
                    {role.permissions && role.permissions.length > 2 && (
                      <span className="text-gray-500 text-xs">+{role.permissions.length - 2} more</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-3 text-center">
                  <button
                    onClick={() => openEditModal(role)}
                    className="text-blue-600 hover:text-blue-800 font-medium mr-3"
                  >
                    Edit
                  </button>
                  {!['super_admin', 'hr_manager', 'Partner', 'Manager', 'Associate', 'Intern', 'Employee'].includes(role.name) && (
                    <button
                      onClick={() => handleDelete(role.id)}
                      className="text-red-600 hover:text-red-800 font-medium"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">
              {editingRole ? 'Edit Role' : 'Create New Role'}
            </h2>

            <div className="space-y-4">
              <div>
                <Label>Role Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Senior Manager"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Billing Rate (KES/hr) *</Label>
                <Input
                  type="number"
                  value={formData.billing_rate}
                  onChange={(e) => setFormData({ ...formData, billing_rate: parseFloat(e.target.value) })}
                  placeholder="e.g., 10000"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Description</Label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                  className="w-full border rounded px-3 py-2 text-sm mt-1"
                  rows={3}
                />
              </div>

              <div>
                <Label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  Active
                </Label>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {editingRole ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface StaffAssignment {
  id?: number;
  employeeProfileId: number;
  name: string;
  roleName: string;
  assignedHourlyRate: number;
  assignedAt?: string;
}

interface StaffAssignmentListProps {
  staff: StaffAssignment[];
  onRemove?: (employeeProfileId: number) => void;
  loading?: boolean;
  editable?: boolean;
}

export function StaffAssignmentList({
  staff,
  onRemove,
  loading,
  editable = true,
}: StaffAssignmentListProps) {
  const totalRate = staff.reduce((sum, s) => sum + (s.assignedHourlyRate || 0), 0);

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-3">Assigned Staff</h3>

      {staff.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">No staff assigned yet</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Role</th>
                  <th className="text-right px-3 py-2">Rate (KES/hr)</th>
                  {editable && <th className="text-center px-3 py-2">Action</th>}
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr
                    key={`${member.employeeProfileId}-${member.id || 'new'}`}
                    className="border-b hover:bg-gray-50"
                  >
                    <td className="px-3 py-2">{member.name}</td>
                    <td className="px-3 py-2">{member.roleName}</td>
                    <td className="text-right px-3 py-2">
                      {member.assignedHourlyRate.toLocaleString()}
                    </td>
                    {editable && (
                      <td className="text-center px-3 py-2">
                        {onRemove && (
                          <button
                            onClick={() => onRemove(member.employeeProfileId)}
                            disabled={loading}
                            className="text-red-600 hover:text-red-800 text-sm font-medium disabled:text-gray-400"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-3 border-t flex justify-between items-center">
            <span className="font-medium">Total Hourly Rate:</span>
            <span className="text-lg font-bold">{totalRate.toLocaleString()} KES/hr</span>
          </div>
        </>
      )}
    </div>
  );
}

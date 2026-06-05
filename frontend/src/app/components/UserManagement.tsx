import { useMemo, useState, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Plus, Search, Edit, Trash2, Users, Shield, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth-context';
import { useRoles, useUsers, useUsersMutations } from '../../lib/hooks';
import { writeAuditLog } from '../../lib/audit';

type AppRole = 'admin' | 'sales' | 'inventory';
type UserStatus = 'Active' | 'Inactive';

type UserRow = {
  user_id: string;
  display_id: string;
  staff_code: string;
  name: string;
  username: string;
  email?: string | null;
  role: AppRole;
  role_id: string;
  role_name: string;
  status: UserStatus;
  date_created: string;
  last_updated: string;
};

type UserFormData = {
  staff_code: string;
  name: string;
  username: string;
  email: string;
  password: string;
  role: AppRole;
  status: UserStatus;
};

const emptyForm: UserFormData = {
  staff_code: '',
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'sales',
  status: 'Active',
};

function normalizeRole(value: unknown): AppRole {
  const role = String(value ?? '').trim().toLowerCase();
  if (role.includes('admin')) return 'admin';
  if (role.includes('inventory')) return 'inventory';
  return 'sales';
}

function normalizeStatus(value: unknown): UserStatus {
  return String(value ?? 'Active').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
}

function toDbUserStatus(value: UserStatus): "active" | "inactive" {
  return String(value).toLowerCase() === "inactive" ? "inactive" : "active";
}

function formatDate(value: unknown) {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toISOString().slice(0, 10);
}

function roleLabel(role: AppRole) {
  if (role === 'admin') return 'Admin';
  if (role === 'inventory') return 'Inventory';
  return 'Sales';
}

function generateStaffCode(role: AppRole) {
  const prefix = role === "inventory" ? "INV" : role === "admin" ? "ADM" : "CSH";
  const random = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${random}`;
}

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const usersQuery = useUsers();
  const rolesQuery = useRoles();
  const { createMutation, updateMutation, removeMutation } = useUsersMutations();

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [formData, setFormData] = useState<UserFormData>(emptyForm);

  const roleOptions = useMemo(() => {
    const rows = ((rolesQuery.data as any[]) ?? []).map((role: any) => ({
      role_id: String(role.role_id ?? ''),
      role_name: String(role.role_name ?? ''),
      appRole: normalizeRole(role.role_name),
    }));

    return (['admin', 'sales', 'inventory'] as AppRole[]).map((appRole) => ({
      appRole,
      role_id: rows.find((row) => row.appRole === appRole)?.role_id ?? '',
      label: appRole === 'admin' ? 'Administrator' : appRole === 'inventory' ? 'Inventory Staff' : 'Sales Staff',
    }));
  }, [rolesQuery.data]);

  const users = useMemo<UserRow[]>(() => {
    const rows = ((usersQuery.data as any[]) ?? []).slice().sort((a, b) => {
      const aDate = new Date(a.created_at ?? '').getTime() || 0;
      const bDate = new Date(b.created_at ?? '').getTime() || 0;
      return aDate - bDate;
    });

    return rows.map((raw: any, index) => {
      const roleName = raw.role?.role_name ?? raw.role_name ?? '';
      const role = normalizeRole(roleName || raw.role_id);
      return {
        user_id: String(raw.user_id ?? ''),
        display_id: `USR-${String(index + 1).padStart(3, '0')}`,
        staff_code: String(raw.staff_code ?? ''),
        name: String(raw.name ?? 'Unnamed User'),
        username: String(raw.username ?? ''),
        email: raw.email ?? '',
        role,
        role_id: String(raw.role_id ?? raw.role?.role_id ?? ''),
        role_name: String(roleName || roleLabel(role)),
        status: normalizeStatus(raw.status),
        date_created: formatDate(raw.created_at),
        last_updated: formatDate(raw.updated_at ?? raw.created_at),
      };
    });
  }, [usersQuery.data]);

  const filteredUsers = users.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(term) ||
      item.username.toLowerCase().includes(term) ||
      String(item.email ?? '').toLowerCase().includes(term)
    );
  });

  const activeUsers = users.filter((item) => item.status === 'Active').length;
  const adminCount = users.filter((item) => item.role === 'admin').length;
  const salesCount = users.filter((item) => item.role === 'sales').length;
  const inventoryCount = users.filter((item) => item.role === 'inventory').length;

  const getRoleId = (role: AppRole) => roleOptions.find((option) => option.appRole === role)?.role_id ?? '';

  const resetForm = () => setFormData(emptyForm);

  const buildPayload = (source: UserFormData, existing?: UserRow) => {
    const roleId = getRoleId(source.role);
    if (!roleId) throw new Error('Role data is still loading. Please try again.');
    if (!currentUser?.user_id) throw new Error('You must be logged in as an administrator.');

    return {
      actor_user_id: currentUser.user_id,
      staff_code: source.staff_code.trim() || null,
      name: source.name.trim() || existing?.name,
      username: source.username.trim() || existing?.username,
      password: source.password.trim(),
      role_id: roleId,
      status: toDbUserStatus(source.status),
      email: source.email.trim() || null,
    };
  };

  const handleAddUser = async () => {
    if (!formData.name.trim() || !formData.username.trim() || !formData.password.trim()) {
      toast.error('Please fill in name, username, and password');
      return;
    }

    try {
      const created = await createMutation.mutateAsync(buildPayload(formData));
      await writeAuditLog({
        actorUserId: currentUser?.user_id,
        actionType: "create_user",
        entityType: "user",
        entityId: String((created as any)?.user_id ?? ""),
        newData: {
          name: formData.name.trim(),
          username: formData.username.trim(),
          role: formData.role,
          staff_code: formData.staff_code.trim() || null,
          status: formData.status,
          email: formData.email.trim() || null,
        },
      });
      setIsAddDialogOpen(false);
      resetForm();
      toast.success('User added successfully!');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not add user');
    }
  };

  const handleEditUser = async () => {
    if (!editingUser) return;
    if (!formData.name.trim() || !formData.username.trim()) {
      toast.error('Please fill in name and username');
      return;
    }

    try {
      await updateMutation.mutateAsync({ id: editingUser.user_id, payload: buildPayload(formData, editingUser) });
      await writeAuditLog({
        actorUserId: currentUser?.user_id,
        actionType: "update_user",
        entityType: "user",
        entityId: editingUser.user_id,
        oldData: {
          name: editingUser.name,
          username: editingUser.username,
          role: editingUser.role,
          status: editingUser.status,
          email: editingUser.email ?? null,
        },
        newData: {
          name: formData.name.trim(),
          username: formData.username.trim(),
          role: formData.role,
          staff_code: formData.staff_code.trim() || null,
          status: formData.status,
          email: formData.email.trim() || null,
        },
      });
      setEditingUser(null);
      resetForm();
      toast.success('User updated successfully!');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not update user');
    }
  };

  const handleDeactivateUser = async (target: UserRow) => {
    if (target.role === 'admin' || target.user_id === currentUser?.user_id) {
      toast.error('Administrator accounts cannot be deactivated here');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: target.user_id,
        payload: buildPayload({
          name: target.name,
          username: target.username,
          email: target.email ?? '',
          password: '',
          role: target.role,
          staff_code: target.staff_code || '',
          status: 'Inactive',
        }, target),
      });
      await writeAuditLog({
        actorUserId: currentUser?.user_id,
        actionType: "deactivate_user",
        entityType: "user",
        entityId: target.user_id,
        oldData: { status: target.status },
        newData: { status: "Inactive" },
      });
      toast.success('User deactivated successfully!');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not deactivate user');
    }
  };

  const handleDeleteUser = async (target: UserRow) => {
    if (target.role === 'admin' || target.user_id === currentUser?.user_id) {
      toast.error('Protected accounts cannot be deleted here');
      return;
    }

    if (target.status === 'Active') {
      await handleDeactivateUser(target);
      return;
    }

    const confirmed = window.confirm(`Permanently delete inactive user ${target.name}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await removeMutation.mutateAsync(target.user_id);
      await writeAuditLog({
        actorUserId: currentUser?.user_id,
        actionType: "delete_user",
        entityType: "user",
        entityId: target.user_id,
        oldData: {
          name: target.name,
          username: target.username,
          role: target.role,
          status: target.status,
          email: target.email ?? null,
        },
      });
      toast.success('Inactive user deleted successfully!');
    } catch (error: any) {
      const message = String(error?.message ?? '');
      if (message.toLowerCase().includes('foreign key')) {
        toast.error('This user has linked records, so keep the account inactive instead of deleting it.');
      } else {
        toast.error(message || 'Could not delete user');
      }
    }
  };

  const openEditDialog = (item: UserRow) => {
    setEditingUser(item);
    setFormData({
      name: item.name,
      username: item.username,
      staff_code: item.staff_code || '',
      email: item.email ?? '',
      password: '',
      role: item.role,
      status: item.status,
    });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4" />;
      case 'sales': return <Users className="w-4 h-4" />;
      case 'inventory': return <UserCog className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-600 text-white';
      case 'sales': return 'bg-blue-600 text-white';
      case 'inventory': return 'bg-green-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  const isBusy = createMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard title="Active Users" value={activeUsers} icon={<Users className="h-8 w-8 text-yellow-400" />} />
        <SummaryCard title="Administrators" value={adminCount} icon={<Shield className="h-8 w-8 text-yellow-400" />} />
        <SummaryCard title="Sales Staff" value={salesCount} icon={<Users className="h-8 w-8 text-yellow-400" />} />
        <SummaryCard title="Inventory Staff" value={inventoryCount} icon={<UserCog className="h-8 w-8 text-yellow-400" />} />
      </div>

      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <div className="flex justify-between items-center gap-3">
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <Users className="w-5 h-5" />
              User Management
            </CardTitle>
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                  <Plus className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-red-700 border-red-800 text-yellow-200">
                <DialogHeader>
                  <DialogTitle className="text-yellow-300">Add New User</DialogTitle>
                </DialogHeader>
                <UserForm formData={formData} setFormData={setFormData} requirePassword />
                <DialogFooter>
                  <Button disabled={isBusy} onClick={handleAddUser} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                    {isBusy ? 'Saving...' : 'Add User'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-yellow-400" />
            <Input
              placeholder="Search by name, username, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
            />
          </div>

          <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-yellow-300 whitespace-nowrap">User ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Staff Code</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Name</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Username</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Email</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Role</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Date Created</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Last Updated</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.isLoading && (
                  <TableRow className="border-red-800">
                    <TableCell colSpan={10} className="text-center text-yellow-200 py-6">Loading users...</TableCell>
                  </TableRow>
                )}
                {!usersQuery.isLoading && filteredUsers.map((item) => {
                  const isProtected = item.role === 'admin' || item.user_id === currentUser?.user_id;
                  return (
                    <TableRow key={item.user_id} className="border-red-800">
                      <TableCell className="text-yellow-200 whitespace-nowrap">{item.display_id}</TableCell>
                      <TableCell className="text-yellow-300 whitespace-nowrap">{item.staff_code || 'N/A'}</TableCell>
                      <TableCell className="text-yellow-200 whitespace-nowrap">{item.name}</TableCell>
                      <TableCell className="text-yellow-200 whitespace-nowrap">{item.username}</TableCell>
                      <TableCell className="text-yellow-200 whitespace-nowrap">{item.email || 'N/A'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className={getRoleBadgeColor(item.role)}>
                          <span className="flex items-center gap-1">
                            {getRoleIcon(item.role)}
                            {roleLabel(item.role)}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className={item.status === 'Active' ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-yellow-200 text-sm whitespace-nowrap">{item.date_created}</TableCell>
                      <TableCell className="text-yellow-200 text-sm whitespace-nowrap">{item.last_updated}</TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-2">
                          <Dialog open={editingUser?.user_id === item.user_id} onOpenChange={(open) => !open && setEditingUser(null)}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                                onClick={() => openEditDialog(item)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-red-700 border-red-800 text-yellow-200">
                              <DialogHeader>
                                <DialogTitle className="text-yellow-300">Edit User</DialogTitle>
                              </DialogHeader>
                              <UserForm formData={formData} setFormData={setFormData} />
                              <DialogFooter>
                                <Button disabled={isBusy} onClick={handleEditUser} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                                  {isBusy ? 'Saving...' : 'Update User'}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={isProtected ? 'Protected account' : item.status === 'Active' ? 'Deactivate user' : 'Delete inactive user'}
                            className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600 disabled:opacity-40"
                            onClick={() => void handleDeleteUser(item)}
                            disabled={isProtected || isBusy}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!usersQuery.isLoading && !filteredUsers.length && (
                  <TableRow className="border-red-800">
                    <TableCell colSpan={10} className="text-center text-yellow-200 py-6">No users found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <Card className="bg-red-700 border-red-800">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-yellow-200">{title}</p>
            <p className="text-2xl text-yellow-300">{value}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function UserForm({ formData, setFormData, requirePassword = false }: {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
  requirePassword?: boolean;
}) {
  return (
    <div className="grid gap-4 py-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="staff_code" className="text-yellow-300">Staff Code</Label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-yellow-300 hover:bg-red-600"
            onClick={() => setFormData({ ...formData, staff_code: generateStaffCode(formData.role) })}
          >
            Auto-generate
          </Button>
        </div>
        <Input
          id="staff_code"
          value={formData.staff_code}
          onChange={(e) => setFormData({ ...formData, staff_code: e.target.value })}
          placeholder="e.g., CSH-079"
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name" className="text-yellow-300">Full Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="username" className="text-yellow-300">Username *</Label>
          <Input
            id="username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-yellow-300">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-yellow-300">
          Password {requirePassword ? '*' : '(leave blank to keep current)'}
        </Label>
        <Input
          id="password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="role" className="text-yellow-300">Role</Label>
          <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value as AppRole })}>
            <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
              <SelectItem value="admin">Administrator</SelectItem>
              <SelectItem value="sales">Sales Staff</SelectItem>
              <SelectItem value="inventory">Inventory Staff</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status" className="text-yellow-300">Status</Label>
          <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as UserStatus })}>
            <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

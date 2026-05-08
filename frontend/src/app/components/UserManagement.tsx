import { useState } from 'react';
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

type User = {
  user_id: string;
  name: string;
  username: string;
  role: 'admin' | 'sales' | 'inventory';
  status: 'Active' | 'Inactive';
  date_created: string;
  last_login: string;
};

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([
    {
      user_id: 'USR-001',
      name: 'Administrator',
      username: 'admin',
      role: 'admin',
      status: 'Active',
      date_created: '2025-01-01',
      last_login: '2026-04-23'
    },
    {
      user_id: 'USR-002',
      name: 'Sarah Johnson',
      username: 'sarah.j',
      role: 'sales',
      status: 'Active',
      date_created: '2025-02-15',
      last_login: '2026-04-23'
    },
    {
      user_id: 'USR-003',
      name: 'Mike Rodriguez',
      username: 'mike.r',
      role: 'sales',
      status: 'Active',
      date_created: '2025-03-01',
      last_login: '2026-04-22'
    },
    {
      user_id: 'USR-004',
      name: 'Emily Chen',
      username: 'emily.c',
      role: 'inventory',
      status: 'Active',
      date_created: '2025-03-10',
      last_login: '2026-04-23'
    },
    {
      user_id: 'USR-005',
      name: 'John Smith',
      username: 'john.s',
      role: 'sales',
      status: 'Inactive',
      date_created: '2025-01-20',
      last_login: '2026-03-15'
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    username: '',
    role: 'sales',
    status: 'Active'
  });

  const handleAddUser = () => {
    if (!formData.name || !formData.username) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newUser: User = {
      user_id: `USR-${String(users.length + 1).padStart(3, '0')}`,
      name: formData.name!,
      username: formData.username!,
      role: formData.role as User['role'] || 'sales',
      status: formData.status as User['status'] || 'Active',
      date_created: new Date().toISOString().split('T')[0],
      last_login: 'Never'
    };

    setUsers([...users, newUser]);
    setIsAddDialogOpen(false);
    setFormData({ name: '', username: '', role: 'sales', status: 'Active' });
    toast.success('User added successfully!');
  };

  const handleEditUser = () => {
    if (!editingUser) return;

    setUsers(users.map(u =>
      u.user_id === editingUser.user_id
        ? { ...editingUser, ...formData }
        : u
    ));
    setEditingUser(null);
    setFormData({ name: '', username: '', role: 'sales', status: 'Active' });
    toast.success('User updated successfully!');
  };

  const handleDeleteUser = (user_id: string) => {
    if (user_id === 'USR-001') {
      toast.error('Cannot delete system administrator');
      return;
    }
    setUsers(users.filter(u => u.user_id !== user_id));
    toast.success('User deleted successfully!');
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setFormData(user);
  };

  const activeUsers = users.filter(u => u.status === 'Active').length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const salesCount = users.filter(u => u.role === 'sales').length;
  const inventoryCount = users.filter(u => u.role === 'inventory').length;

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

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Active Users</p>
                <p className="text-2xl text-yellow-300">{activeUsers}</p>
              </div>
              <Users className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Administrators</p>
                <p className="text-2xl text-yellow-300">{adminCount}</p>
              </div>
              <Shield className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Sales Staff</p>
                <p className="text-2xl text-yellow-300">{salesCount}</p>
              </div>
              <Users className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Inventory Staff</p>
                <p className="text-2xl text-yellow-300">{inventoryCount}</p>
              </div>
              <UserCog className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <Users className="w-5 h-5" />
              User Management
            </CardTitle>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
                <UserForm formData={formData} setFormData={setFormData} />
                <DialogFooter>
                  <Button onClick={handleAddUser} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                    Add User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-yellow-400" />
            <Input
              placeholder="Search by name or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
            />
          </div>

          {/* Table */}
          <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-yellow-300 whitespace-nowrap">User ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Name</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Username</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Role</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Date Created</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Last Login</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.user_id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap">{user.user_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap">{user.name}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap">{user.username}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge className={getRoleBadgeColor(user.role)}>
                        <span className="flex items-center gap-1">
                          {getRoleIcon(user.role)}
                          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        className={user.status === 'Active' ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'}
                      >
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap">{user.date_created}</TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap">{user.last_login}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Dialog open={editingUser?.user_id === user.user_id} onOpenChange={(open) => !open && setEditingUser(null)}>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                              onClick={() => openEditDialog(user)}
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
                              <Button onClick={handleEditUser} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                                Update User
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                          onClick={() => handleDeleteUser(user.user_id)}
                          disabled={user.user_id === 'USR-001'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UserForm({ formData, setFormData }: {
  formData: Partial<User>;
  setFormData: (data: Partial<User>) => void;
}) {
  return (
    <div className="grid gap-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-yellow-300">Full Name *</Label>
        <Input
          id="name"
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="username" className="text-yellow-300">Username *</Label>
        <Input
          id="username"
          value={formData.username || ''}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="role" className="text-yellow-300">Role</Label>
          <Select value={formData.role || 'sales'} onValueChange={(value) => setFormData({ ...formData, role: value as User['role'] })}>
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
          <Select value={formData.status || 'Active'} onValueChange={(value) => setFormData({ ...formData, status: value as User['status'] })}>
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

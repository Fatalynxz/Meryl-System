import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Plus, Search, Edit, Trash2, Users, Mail, Phone, MapPin, Star } from 'lucide-react';
import { toast } from 'sonner';

type Customer = {
  customer_id: string;
  name: string;
  email: string;
  contact_number: string;
  date_registered: string;
  address: string;
  totalPurchases: number;
  lastPurchaseDate: string;
  loyaltyPoints: number;
  status: 'Active' | 'Inactive';
};

export function CustomerManagement() {
  const [customers, setCustomers] = useState<Customer[]>([
    {
      customer_id: '1',
      name: 'John Doe',
      email: 'john.doe@email.com',
      contact_number: '(555) 123-4567',
      date_registered: '2026-01-15',
      address: '123 Main St, City, ST 12345',
      totalPurchases: 5,
      lastPurchaseDate: '2026-03-05',
      loyaltyPoints: 450,
      status: 'Active'
    },
    {
      customer_id: '2',
      name: 'Jane Smith',
      email: 'jane.smith@email.com',
      contact_number: '(555) 234-5678',
      date_registered: '2026-01-20',
      address: '456 Oak Ave, Town, ST 23456',
      totalPurchases: 8,
      lastPurchaseDate: '2026-03-05',
      loyaltyPoints: 720,
      status: 'Active'
    },
    {
      customer_id: '3',
      name: 'Bob Johnson',
      email: 'bob.j@email.com',
      contact_number: '(555) 345-6789',
      date_registered: '2026-02-01',
      address: '789 Pine Rd, Village, ST 34567',
      totalPurchases: 3,
      lastPurchaseDate: '2026-03-04',
      loyaltyPoints: 280,
      status: 'Active'
    },
    {
      customer_id: '4',
      name: 'Alice Brown',
      email: 'alice.brown@email.com',
      contact_number: '(555) 456-7890',
      date_registered: '2025-12-10',
      address: '321 Elm St, City, ST 45678',
      totalPurchases: 12,
      lastPurchaseDate: '2026-03-04',
      loyaltyPoints: 1150,
      status: 'Active'
    },
    {
      customer_id: '5',
      name: 'Charlie Davis',
      email: 'charlie.d@email.com',
      contact_number: '(555) 567-8901',
      date_registered: '2026-02-10',
      address: '654 Maple Dr, Town, ST 56789',
      totalPurchases: 1,
      lastPurchaseDate: '2026-02-15',
      loyaltyPoints: 95,
      status: 'Inactive'
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    email: '',
    contact_number: '',
    address: '',
    status: 'Active'
  });

  const handleAddCustomer = () => {
    if (!formData.name || !formData.email || !formData.contact_number) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newCustomer: Customer = {
      customer_id: Date.now().toString(),
      name: formData.name!,
      email: formData.email!,
      contact_number: formData.contact_number!,
      date_registered: new Date().toISOString().split('T')[0],
      address: formData.address || '',
      totalPurchases: 0,
      lastPurchaseDate: 'N/A',
      loyaltyPoints: 0,
      status: formData.status as Customer['status'] || 'Active'
    };

    setCustomers([...customers, newCustomer]);
    setIsAddDialogOpen(false);
    setFormData({});
    toast.success('Customer added successfully!');
  };

  const handleEditCustomer = () => {
    if (!editingCustomer) return;

    setCustomers(customers.map(c =>
      c.customer_id === editingCustomer.customer_id
        ? { ...editingCustomer, ...formData }
        : c
    ));
    setEditingCustomer(null);
    setFormData({});
    toast.success('Customer updated successfully!');
  };

  const handleDeleteCustomer = (customer_id: string) => {
    setCustomers(customers.filter(c => c.customer_id !== customer_id));
    toast.success('Customer deleted successfully!');
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.contact_number.includes(searchTerm)
  );

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData(customer);
  };

  const activeCustomers = customers.filter(c => c.status === 'Active').length;
  const totalLoyaltyPoints = customers.reduce((sum, c) => sum + c.loyaltyPoints, 0);
  const topCustomer = customers.reduce((top, c) => c.totalPurchases > top.totalPurchases ? c : top, customers[0]);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Active Customers</p>
                <p className="text-2xl text-yellow-300">{activeCustomers}</p>
              </div>
              <Users className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Total Customers</p>
                <p className="text-2xl text-yellow-300">{customers.length}</p>
              </div>
              <Star className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-yellow-200">Top Customer</p>
              <p className="text-lg text-yellow-300">{topCustomer?.name || 'N/A'}</p>
              <p className="text-xs text-yellow-200">{topCustomer?.totalPurchases || 0} purchases</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customers Table */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Customer Directory
            </CardTitle>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Customer
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-red-700 border-red-800 text-yellow-200">
                <DialogHeader>
                  <DialogTitle className="text-yellow-300">Add New Customer</DialogTitle>
                </DialogHeader>
                <CustomerForm formData={formData} setFormData={setFormData} />
                <DialogFooter>
                  <Button onClick={handleAddCustomer} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                    Add Customer
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
              placeholder="Search by name, email, or phone..."
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
                  <TableHead className="text-yellow-300 whitespace-nowrap">Name</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Contact</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Address</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Purchases</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Last Purchase</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.customer_id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap">{customer.name}</TableCell>
                    <TableCell className="min-w-[180px]">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-yellow-200 text-xs whitespace-nowrap">
                          <Mail className="w-3 h-3" />
                          {customer.email}
                        </div>
                        <div className="flex items-center gap-1 text-yellow-200 text-xs whitespace-nowrap">
                          <Phone className="w-3 h-3" />
                          {customer.contact_number}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-yellow-200 text-xs min-w-[200px]">
                      <div className="flex items-start gap-1">
                        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{customer.address}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-yellow-300 text-center whitespace-nowrap">{customer.totalPurchases}</TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap">{customer.lastPurchaseDate}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        className={customer.status === 'Active' ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'}
                      >
                        {customer.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Dialog open={editingCustomer?.customer_id === customer.customer_id} onOpenChange={(open) => !open && setEditingCustomer(null)}>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                              onClick={() => openEditDialog(customer)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-red-700 border-red-800 text-yellow-200">
                            <DialogHeader>
                              <DialogTitle className="text-yellow-300">Edit Customer</DialogTitle>
                            </DialogHeader>
                            <CustomerForm formData={formData} setFormData={setFormData} />
                            <DialogFooter>
                              <Button onClick={handleEditCustomer} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                                Update Customer
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                          onClick={() => handleDeleteCustomer(customer.customer_id)}
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

function CustomerForm({ formData, setFormData }: { 
  formData: Partial<Customer>; 
  setFormData: (data: Partial<Customer>) => void;
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
        <Label htmlFor="email" className="text-yellow-300">Email Address *</Label>
        <Input
          id="email"
          type="email"
          value={formData.email || ''}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact_number" className="text-yellow-300">Contact Number *</Label>
        <Input
          id="contact_number"
          value={formData.contact_number || ''}
          onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address" className="text-yellow-300">Address</Label>
        <Input
          id="address"
          value={formData.address || ''}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
    </div>
  );
}

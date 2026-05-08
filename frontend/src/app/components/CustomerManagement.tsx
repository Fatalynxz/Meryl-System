import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Edit, Mail, MapPin, Phone, Plus, Search, Star, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useCustomers, useCustomersMutations, useSales } from "../../lib/hooks";

type CustomerStatus = "Active" | "Inactive";

type CustomerFormData = {
  name: string;
  email: string;
  contact_number: string;
  address: string;
  status: CustomerStatus;
};

const defaultForm: CustomerFormData = {
  name: "",
  email: "",
  contact_number: "",
  address: "",
  status: "Active",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toISOString().slice(0, 10);
}

export function CustomerManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>(defaultForm);

  const customersQuery = useCustomers();
  const salesQuery = useSales();
  const customerMutations = useCustomersMutations();

  const customers = customersQuery.data ?? [];
  const sales = salesQuery.data ?? [];

  const statsMap = useMemo(() => {
    const map = new Map<string, { count: number; lastDate: string | null }>();
    for (const sale of sales as any[]) {
      const customerId = sale.customer_id as string | null;
      if (!customerId) continue;
      const prev = map.get(customerId) ?? { count: 0, lastDate: null };
      const txDate = sale.transaction_date as string | null;
      const latest =
        !prev.lastDate || (txDate && new Date(txDate).getTime() > new Date(prev.lastDate).getTime())
          ? txDate
          : prev.lastDate;
      map.set(customerId, { count: prev.count + 1, lastDate: latest });
    }
    return map;
  }, [sales]);

  const uiCustomers = useMemo(
    () =>
      (customers as any[]).map((customer) => {
        const stats = statsMap.get(customer.customer_id) ?? { count: 0, lastDate: null };
        return {
          ...customer,
          totalPurchases: stats.count,
          lastPurchaseDate: formatDate(stats.lastDate),
          loyaltyPoints: 0,
        };
      }),
    [customers, statsMap],
  );

  const filteredCustomers = useMemo(
    () =>
      uiCustomers.filter(
        (customer) =>
          (customer.name ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (customer.email ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (customer.contact_number ?? "").includes(searchTerm),
      ),
    [uiCustomers, searchTerm],
  );

  const activeCustomers = uiCustomers.filter((c) => (c.status ?? "Active") === "Active").length;
  const topCustomer =
    uiCustomers.length > 0
      ? [...uiCustomers].sort((a, b) => b.totalPurchases - a.totalPurchases)[0]
      : null;

  const openEditDialog = (customer: any) => {
    setEditingCustomerId(customer.customer_id);
    setFormData({
      name: customer.name ?? "",
      email: customer.email ?? "",
      contact_number: customer.contact_number ?? "",
      address: customer.address ?? "",
      status: (customer.status ?? "Active") as CustomerStatus,
    });
  };

  const handleAddCustomer = async () => {
    if (!formData.name || !formData.email || !formData.contact_number) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await customerMutations.createMutation.mutateAsync({
        name: formData.name,
        email: formData.email,
        contact_number: formData.contact_number,
        address: formData.address || null,
        status: formData.status,
        date_registered: new Date().toISOString().slice(0, 10),
      } as any);
      setIsAddDialogOpen(false);
      setFormData(defaultForm);
      toast.success("Customer added successfully!");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to add customer");
    }
  };

  const handleEditCustomer = async () => {
    if (!editingCustomerId) return;
    try {
      await customerMutations.updateMutation.mutateAsync({
        id: editingCustomerId,
        payload: {
          name: formData.name,
          email: formData.email,
          contact_number: formData.contact_number,
          address: formData.address || null,
          status: formData.status,
        } as any,
      });
      setEditingCustomerId(null);
      setFormData(defaultForm);
      toast.success("Customer updated successfully!");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update customer");
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      await customerMutations.removeMutation.mutateAsync(customerId);
      toast.success("Customer deleted successfully!");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete customer");
    }
  };

  return (
    <div className="space-y-4">
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
                <p className="text-2xl text-yellow-300">{uiCustomers.length}</p>
              </div>
              <Star className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-yellow-200">Top Customer</p>
              <p className="text-lg text-yellow-300">{topCustomer?.name || "N/A"}</p>
              <p className="text-xs text-yellow-200">{topCustomer?.totalPurchases || 0} purchases</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-yellow-400" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
            />
          </div>

          <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Name</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Contact</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Address</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Purchases</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Last Purchase</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer: any) => (
                  <TableRow key={customer.customer_id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{customer.name}</TableCell>
                    <TableCell className="min-w-[180px]">
                      <div className="space-y-1 flex flex-col items-center">
                        <div className="flex items-center justify-center gap-1 text-yellow-200 text-xs whitespace-nowrap">
                          <Mail className="w-3 h-3" />
                          {customer.email}
                        </div>
                        <div className="flex items-center justify-center gap-1 text-yellow-200 text-xs whitespace-nowrap">
                          <Phone className="w-3 h-3" />
                          {customer.contact_number}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-yellow-200 text-xs min-w-[200px]">
                      <div className="flex items-center justify-center gap-1 text-center">
                        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{customer.address || "N/A"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-yellow-300 text-center whitespace-nowrap">{customer.totalPurchases}</TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap text-center">{customer.lastPurchaseDate}</TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <Badge className={(customer.status ?? "Active") === "Active" ? "bg-green-600 text-white" : "bg-gray-600 text-white"}>
                        {customer.status ?? "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-2">
                        <Dialog open={editingCustomerId === customer.customer_id} onOpenChange={(open) => !open && setEditingCustomerId(null)}>
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

function CustomerForm({
  formData,
  setFormData,
}: {
  formData: CustomerFormData;
  setFormData: (data: CustomerFormData) => void;
}) {
  return (
    <div className="grid gap-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-yellow-300">
          Full Name *
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-yellow-300">
          Email Address *
        </Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact_number" className="text-yellow-300">
          Contact Number *
        </Label>
        <Input
          id="contact_number"
          value={formData.contact_number}
          onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address" className="text-yellow-300">
          Address
        </Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
        />
      </div>
    </div>
  );
}

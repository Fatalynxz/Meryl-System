import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Plus, Search, Eye, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

type ReturnDetail = {
  return_detail_id: string;
  product_id: string;
  productName: string;
  quantity_returned: number;
  reason: string;
  refund_amount: number;
};

type Return = {
  return_id: string;
  sales_id: string;
  user_id: string;
  customerName: string;
  return_date: string;
  total_refund: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Completed';
  returnDetails: ReturnDetail[];
};

export function ReturnManagement() {
  const [returns, setReturns] = useState<Return[]>([
    {
      return_id: 'RET-001',
      sales_id: 'SALES-001',
      user_id: 'USER-001',
      customerName: 'John Doe',
      return_date: '2026-04-20',
      total_refund: 120,
      status: 'Pending',
      returnDetails: [
        {
          return_detail_id: 'RD-001',
          product_id: '1',
          productName: 'Nike Air Max 90 - Black Size 8',
          quantity_returned: 1,
          reason: 'Defective - sole detached',
          refund_amount: 120
        }
      ]
    },
    {
      return_id: 'RET-002',
      sales_id: 'SALES-003',
      user_id: 'USER-003',
      customerName: 'Bob Johnson',
      return_date: '2026-04-21',
      total_refund: 85,
      status: 'Approved',
      returnDetails: [
        {
          return_detail_id: 'RD-002',
          product_id: '10',
          productName: 'Puma Suede Classic - Red Size 8',
          quantity_returned: 1,
          reason: 'Wrong size ordered',
          refund_amount: 85
        }
      ]
    },
    {
      return_id: 'RET-003',
      sales_id: 'SALES-002',
      user_id: 'USER-002',
      customerName: 'Jane Smith',
      return_date: '2026-04-19',
      total_refund: 180,
      status: 'Completed',
      returnDetails: [
        {
          return_detail_id: 'RD-003',
          product_id: '6',
          productName: 'Adidas Ultraboost 22 - White Size 9',
          quantity_returned: 1,
          reason: 'Customer changed mind',
          refund_amount: 180
        }
      ]
    },
    {
      return_id: 'RET-004',
      sales_id: 'SALES-004',
      user_id: 'USER-004',
      customerName: 'Alice Brown',
      return_date: '2026-04-22',
      total_refund: 65,
      status: 'Rejected',
      returnDetails: [
        {
          return_detail_id: 'RD-004',
          product_id: '13',
          productName: 'Converse Chuck Taylor - Blue Size 8',
          quantity_returned: 1,
          reason: 'Worn for more than 30 days',
          refund_amount: 0
        }
      ]
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewingReturn, setViewingReturn] = useState<Return | null>(null);
  const [formData, setFormData] = useState({
    customerName: '',
    sales_id: '',
    productName: '',
    quantity_returned: 1,
    reason: '',
    refund_amount: 0,
    status: 'Pending' as Return['status']
  });

  const handleAddReturn = () => {
    if (!formData.customerName || !formData.sales_id || !formData.productName) {
      toast.error('Please fill in all required fields');
      return;
    }

    const returnDetail: ReturnDetail = {
      return_detail_id: `RD-${Date.now()}`,
      product_id: Date.now().toString(),
      productName: formData.productName,
      quantity_returned: formData.quantity_returned,
      reason: formData.reason,
      refund_amount: formData.refund_amount
    };

    const newReturn: Return = {
      return_id: `RET-${String(returns.length + 1).padStart(3, '0')}`,
      sales_id: formData.sales_id,
      user_id: 'USER-CURRENT',
      customerName: formData.customerName,
      return_date: new Date().toISOString().split('T')[0],
      total_refund: formData.refund_amount,
      status: formData.status,
      returnDetails: [returnDetail]
    };

    setReturns([newReturn, ...returns]);
    setIsAddDialogOpen(false);
    setFormData({
      customerName: '',
      sales_id: '',
      productName: '',
      quantity_returned: 1,
      reason: '',
      refund_amount: 0,
      status: 'Pending'
    });
    toast.success('Return recorded successfully!');
  };

  const handleUpdateStatus = (return_id: string, newStatus: Return['status']) => {
    setReturns(returns.map(r =>
      r.return_id === return_id
        ? { ...r, status: newStatus }
        : r
    ));
    toast.success(`Return status updated to ${newStatus}`);
  };

  const filteredReturns = returns.filter(r =>
    r.return_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.sales_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalRefunds = returns.reduce((sum, r) => sum + (r.status !== 'Rejected' ? r.total_refund : 0), 0);
  const pendingReturns = returns.filter(r => r.status === 'Pending').length;
  const approvedReturns = returns.filter(r => r.status === 'Approved').length;
  const completedReturns = returns.filter(r => r.status === 'Completed').length;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Total Refunds</p>
                <p className="text-2xl text-yellow-300">₱{totalRefunds.toFixed(2)}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Pending Returns</p>
                <p className="text-2xl text-yellow-300">{pendingReturns}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Approved</p>
                <p className="text-2xl text-yellow-300">{approvedReturns}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Completed</p>
                <p className="text-2xl text-yellow-300">{completedReturns}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Returns Table */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              Return Management
            </CardTitle>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                  <Plus className="w-4 h-4 mr-2" />
                  Record Return
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-red-700 border-red-800 text-yellow-200">
                <DialogHeader>
                  <DialogTitle className="text-yellow-300">Record New Return</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerName" className="text-yellow-300">Customer Name *</Label>
                    <Input
                      id="customerName"
                      value={formData.customerName || ''}
                      onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                      className="bg-red-600 border-red-800 text-yellow-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sales_id" className="text-yellow-300">Original Sales ID *</Label>
                    <Input
                      id="sales_id"
                      value={formData.sales_id || ''}
                      onChange={(e) => setFormData({ ...formData, sales_id: e.target.value })}
                      className="bg-red-600 border-red-800 text-yellow-200"
                      placeholder="SALES-001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="productName" className="text-yellow-300">Product Name *</Label>
                    <Input
                      id="productName"
                      value={formData.productName || ''}
                      onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                      className="bg-red-600 border-red-800 text-yellow-200"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quantity_returned" className="text-yellow-300">Quantity</Label>
                      <Input
                        id="quantity_returned"
                        type="number"
                        value={formData.quantity_returned || 1}
                        onChange={(e) => setFormData({ ...formData, quantity_returned: parseInt(e.target.value) })}
                        className="bg-red-600 border-red-800 text-yellow-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="refund_amount" className="text-yellow-300">Refund Amount (₱)</Label>
                      <Input
                        id="refund_amount"
                        type="number"
                        value={formData.refund_amount || 0}
                        onChange={(e) => setFormData({ ...formData, refund_amount: parseFloat(e.target.value) })}
                        className="bg-red-600 border-red-800 text-yellow-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason" className="text-yellow-300">Return Reason</Label>
                    <Input
                      id="reason"
                      value={formData.reason || ''}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      className="bg-red-600 border-red-800 text-yellow-200"
                      placeholder="e.g., Defective, Wrong size, etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-yellow-300">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as Return['status'] })}>
                      <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddReturn} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                    Record Return
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
              placeholder="Search by return ID, sales ID, or customer..."
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
                  <TableHead className="text-yellow-300 whitespace-nowrap">Return ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Sales ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Customer</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Items</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Refund Amount</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Return Date</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.map((returnItem) => (
                  <TableRow key={returnItem.return_id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap">{returnItem.return_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap">{returnItem.sales_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap">{returnItem.customerName}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap">
                      {returnItem.returnDetails.reduce((sum, detail) => sum + detail.quantity_returned, 0)} item(s)
                    </TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap">₱{returnItem.total_refund}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Select
                        value={returnItem.status}
                        onValueChange={(value) => handleUpdateStatus(returnItem.return_id, value as Return['status'])}
                      >
                        <SelectTrigger className={`w-32 border-0 ${
                          returnItem.status === 'Completed' ? 'bg-green-600 text-white' :
                          returnItem.status === 'Approved' ? 'bg-blue-600 text-white' :
                          returnItem.status === 'Pending' ? 'bg-yellow-600 text-red-900' :
                          'bg-red-900 text-yellow-200'
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Approved">Approved</SelectItem>
                          <SelectItem value="Rejected">Rejected</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap">{returnItem.return_date}</TableCell>
                    <TableCell>
                      <Dialog open={viewingReturn?.return_id === returnItem.return_id} onOpenChange={(open) => !open && setViewingReturn(null)}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                            onClick={() => setViewingReturn(returnItem)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-red-700 border-red-800 text-yellow-200">
                          <DialogHeader>
                            <DialogTitle className="text-yellow-300">Return Details - {returnItem.return_id}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-yellow-200">Customer</p>
                                <p className="text-yellow-300">{returnItem.customerName}</p>
                              </div>
                              <div>
                                <p className="text-sm text-yellow-200">Original Sale</p>
                                <p className="text-yellow-300">{returnItem.sales_id}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-sm text-yellow-200 mb-2">Returned Items</p>
                              {returnItem.returnDetails.map((detail, idx) => (
                                <div key={idx} className="bg-red-600 p-2 rounded mb-2">
                                  <p className="text-yellow-300">{detail.productName}</p>
                                  <p className="text-yellow-200 text-xs">Qty: {detail.quantity_returned} | Refund: ₱{detail.refund_amount}</p>
                                  <p className="text-yellow-200 text-xs">Reason: {detail.reason}</p>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-yellow-200">Total Refund</p>
                                <p className="text-yellow-300">₱{returnItem.total_refund}</p>
                              </div>
                              <div>
                                <p className="text-sm text-yellow-200">Return Date</p>
                                <p className="text-yellow-300">{returnItem.return_date}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-sm text-yellow-200">Status</p>
                              <p className="text-yellow-300">{returnItem.status}</p>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
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

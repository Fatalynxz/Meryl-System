import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Plus, Search, Eye, ShoppingCart, Calendar } from 'lucide-react';
import { toast } from 'sonner';

type SaleDetail = {
  sales_detail_id: string;
  product_id: string;
  productName: string;
  quantity: number;
  price: number;
  discount_applied: number;
  subtotal: number;
};

type Sale = {
  sales_id: string;
  transaction_date: string;
  total_amount: number;
  payment_method: string;
  user_id: string;
  customerName: string;
  status: 'Completed' | 'Pending' | 'Cancelled';
  saleDetails: SaleDetail[];
};

export function SalesManagement() {
  const [sales, setSales] = useState<Sale[]>([
    {
      sales_id: 'SALES-001',
      transaction_date: '2026-03-05',
      total_amount: 240,
      payment_method: 'Credit Card',
      user_id: 'USER-001',
      customerName: 'John Doe',
      status: 'Completed',
      saleDetails: [
        { sales_detail_id: 'SD-001', product_id: '1', productName: 'Nike Air Max 90', quantity: 2, price: 120, discount_applied: 0, subtotal: 240 }
      ]
    },
    {
      sales_id: 'SALES-002',
      transaction_date: '2026-03-05',
      total_amount: 180,
      payment_method: 'Cash',
      user_id: 'USER-002',
      customerName: 'Jane Smith',
      status: 'Completed',
      saleDetails: [
        { sales_detail_id: 'SD-002', product_id: '6', productName: 'Adidas Ultraboost 22', quantity: 1, price: 180, discount_applied: 0, subtotal: 180 }
      ]
    },
    {
      sales_id: 'SALES-003',
      transaction_date: '2026-03-04',
      total_amount: 255,
      payment_method: 'Debit Card',
      user_id: 'USER-003',
      customerName: 'Bob Johnson',
      status: 'Pending',
      saleDetails: [
        { sales_detail_id: 'SD-003', product_id: '10', productName: 'Puma Suede Classic', quantity: 3, price: 85, discount_applied: 0, subtotal: 255 }
      ]
    },
    {
      sales_id: 'SALES-004',
      transaction_date: '2026-03-04',
      total_amount: 65,
      payment_method: 'Credit Card',
      user_id: 'USER-004',
      customerName: 'Alice Brown',
      status: 'Completed',
      saleDetails: [
        { sales_detail_id: 'SD-004', product_id: '13', productName: 'Converse Chuck Taylor', quantity: 1, price: 65, discount_applied: 0, subtotal: 65 }
      ]
    },
    {
      sales_id: 'SALES-005',
      transaction_date: '2026-03-03',
      total_amount: 190,
      payment_method: 'Cash',
      user_id: 'USER-005',
      customerName: 'Charlie Davis',
      status: 'Completed',
      saleDetails: [
        { sales_detail_id: 'SD-005', product_id: '15', productName: 'New Balance 574', quantity: 2, price: 95, discount_applied: 0, subtotal: 190 }
      ]
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [formData, setFormData] = useState({
    customerName: '',
    productName: '',
    quantity: 1,
    price: 0,
    discount_applied: 0,
    paymentMethod: 'Cash',
    status: 'Completed' as Sale['status']
  });

  const handleAddSale = () => {
    if (!formData.customerName || !formData.productName || !formData.price) {
      toast.error('Please fill in all required fields');
      return;
    }

    const subtotal = (formData.price * formData.quantity) - formData.discount_applied;
    const saleDetail: SaleDetail = {
      sales_detail_id: `SD-${Date.now()}`,
      product_id: Date.now().toString(),
      productName: formData.productName,
      quantity: formData.quantity,
      price: formData.price,
      discount_applied: formData.discount_applied,
      subtotal: subtotal
    };

    const newSale: Sale = {
      sales_id: `SALES-${String(sales.length + 1).padStart(3, '0')}`,
      transaction_date: new Date().toISOString().split('T')[0],
      total_amount: subtotal,
      payment_method: formData.paymentMethod,
      user_id: 'USER-CURRENT',
      customerName: formData.customerName,
      status: formData.status,
      saleDetails: [saleDetail]
    };

    setSales([newSale, ...sales]);
    setIsAddDialogOpen(false);
    setFormData({ customerName: '', productName: '', quantity: 1, price: 0, discount_applied: 0, paymentMethod: 'Cash', status: 'Completed' });
    toast.success('Sale recorded successfully!');
  };

  const filteredSales = sales.filter(s =>
    s.sales_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.saleDetails.some(detail => detail.productName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total_amount, 0);
  const todaySales = sales.filter(s => s.transaction_date === new Date().toISOString().split('T')[0]);
  const pendingSales = sales.filter(s => s.status === 'Pending');

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Total Revenue</p>
                <p className="text-2xl text-yellow-300">₱{totalRevenue.toFixed(2)}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Today's Sales</p>
                <p className="text-2xl text-yellow-300">{todaySales.length}</p>
              </div>
              <Calendar className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Pending Orders</p>
                <p className="text-2xl text-yellow-300">{pendingSales.length}</p>
              </div>
              <Badge className="bg-yellow-600 text-red-900">{pendingSales.length}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Table */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Sales Records
            </CardTitle>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                  <Plus className="w-4 h-4 mr-2" />
                  Record Sale
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-red-700 border-red-800 text-yellow-200">
                <DialogHeader>
                  <DialogTitle className="text-yellow-300">Record New Sale</DialogTitle>
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
                    <Label htmlFor="productName" className="text-yellow-300">Product Name *</Label>
                    <Input
                      id="productName"
                      value={formData.productName || ''}
                      onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                      className="bg-red-600 border-red-800 text-yellow-200"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="price" className="text-yellow-300">Unit Price (₱) *</Label>
                      <Input
                        id="price"
                        type="number"
                        value={formData.price || ''}
                        onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                        className="bg-red-600 border-red-800 text-yellow-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quantity" className="text-yellow-300">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        value={formData.quantity || 1}
                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                        className="bg-red-600 border-red-800 text-yellow-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="discount_applied" className="text-yellow-300">Discount (₱)</Label>
                      <Input
                        id="discount_applied"
                        type="number"
                        value={formData.discount_applied || 0}
                        onChange={(e) => setFormData({ ...formData, discount_applied: parseFloat(e.target.value) })}
                        className="bg-red-600 border-red-800 text-yellow-200"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="paymentMethod" className="text-yellow-300">Payment Method</Label>
                      <Select value={formData.paymentMethod || 'Cash'} onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}>
                        <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Credit Card">Credit Card</SelectItem>
                          <SelectItem value="Debit Card">Debit Card</SelectItem>
                          <SelectItem value="Mobile Payment">Mobile Payment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status" className="text-yellow-300">Status</Label>
                      <Select value={formData.status || 'Completed'} onValueChange={(value) => setFormData({ ...formData, status: value as Sale['status'] })}>
                        <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                          <SelectItem value="Completed">Completed</SelectItem>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddSale} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                    Record Sale
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
              placeholder="Search by order ID, customer, or product..."
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
                  <TableHead className="text-yellow-300 whitespace-nowrap">Order ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Customer</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Product</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Qty</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Amount</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Payment</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Date</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow key={sale.sales_id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap">{sale.sales_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap">{sale.customerName}</TableCell>
                    <TableCell className="text-yellow-200 min-w-[200px]">
                      {sale.saleDetails.map(detail => detail.productName).join(', ')}
                    </TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">
                      {sale.saleDetails.reduce((sum, detail) => sum + detail.quantity, 0)}
                    </TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap">₱{sale.total_amount}</TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap">{sale.payment_method}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        className={
                          sale.status === 'Completed' ? 'bg-green-600 text-white' :
                          sale.status === 'Pending' ? 'bg-yellow-600 text-red-900' :
                          'bg-red-900 text-yellow-200'
                        }
                      >
                        {sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap">{sale.transaction_date}</TableCell>
                    <TableCell>
                      <Dialog open={viewingSale?.sales_id === sale.sales_id} onOpenChange={(open) => !open && setViewingSale(null)}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                            onClick={() => setViewingSale(sale)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-red-700 border-red-800 text-yellow-200">
                          <DialogHeader>
                            <DialogTitle className="text-yellow-300">Sale Details - {sale.sales_id}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-yellow-200">Customer</p>
                                <p className="text-yellow-300">{sale.customerName}</p>
                              </div>
                              <div>
                                <p className="text-sm text-yellow-200">Transaction Date</p>
                                <p className="text-yellow-300">{sale.transaction_date}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-sm text-yellow-200 mb-2">Products</p>
                              {sale.saleDetails.map((detail, idx) => (
                                <div key={idx} className="bg-red-600 p-2 rounded mb-2">
                                  <p className="text-yellow-300">{detail.productName}</p>
                                  <p className="text-yellow-200 text-xs">Qty: {detail.quantity} × ₱{detail.price} = ₱{detail.subtotal}</p>
                                  {detail.discount_applied > 0 && (
                                    <p className="text-yellow-200 text-xs">Discount: -₱{detail.discount_applied}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-yellow-200">Payment Method</p>
                                <p className="text-yellow-300">{sale.payment_method}</p>
                              </div>
                              <div>
                                <p className="text-sm text-yellow-200">Total Amount</p>
                                <p className="text-yellow-300">₱{sale.total_amount}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-sm text-yellow-200">Status</p>
                              <p className="text-yellow-300">{sale.status}</p>
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

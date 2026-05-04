import { useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Calendar, Eye, Plus, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useCustomers, useSales, useSalesMutations } from "../../lib/hooks";
import { useAuth } from "../../lib/auth-context";

type SaleStatus = "Completed" | "Pending" | "Cancelled";

type SaleForm = {
  customerId: string;
  total: number;
  paymentMethod: string;
  status: SaleStatus;
};

const defaultForm: SaleForm = {
  customerId: "walk-in",
  total: 0,
  paymentMethod: "Cash",
  status: "Completed",
};

function getStatus(paymentStatus?: string | null): SaleStatus {
  const status = (paymentStatus ?? "Paid").toLowerCase();
  if (status.includes("pending")) return "Pending";
  if (status.includes("cancel") || status.includes("fail")) return "Cancelled";
  return "Completed";
}

function formatDate(v?: string | null) {
  if (!v) return "N/A";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "N/A" : d.toISOString().slice(0, 10);
}

export function SalesManagement() {
  const { user } = useAuth();
  const salesQuery = useSales();
  const customersQuery = useCustomers();
  const salesMutations = useSalesMutations();

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewingSale, setViewingSale] = useState<any | null>(null);
  const [formData, setFormData] = useState<SaleForm>(defaultForm);

  const customers = (customersQuery.data as any[]) ?? [];
  const sales = (salesQuery.data as any[]) ?? [];

  const uiSales = useMemo(
    () =>
      sales.map((sale) => {
        const customer = Array.isArray(sale.customer) ? sale.customer[0] : sale.customer;
        const payment = Array.isArray(sale.payment) ? sale.payment[0] : sale.payment;
        const details = Array.isArray((sale as any).sales_details) ? (sale as any).sales_details : [];
        return {
          sales_id: sale.sales_id,
          transaction_date: formatDate(sale.transaction_date),
          total_amount: Number(sale.total_amount ?? 0),
          payment_method: payment?.payment_method ?? "N/A",
          user_id: sale.user_id,
          customerName: customer?.name ?? "Walk-in Customer",
          status: getStatus(payment?.payment_status),
          saleDetails: details.map((d: any) => ({
            sales_detail_id: d.sales_detail_id,
            product_id: d.product_id,
            productName: (Array.isArray(d.product) ? d.product[0]?.product_name : d.product?.product_name) ?? "N/A",
            quantity: Number(d.quantity ?? 0),
            price: Number(d.price ?? 0),
            discount_applied: Number(d.discount_applied ?? 0),
            subtotal: Number(d.subtotal ?? 0),
          })),
        };
      }),
    [sales],
  );

  const filteredSales = useMemo(
    () =>
      uiSales.filter(
        (s) =>
          s.sales_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.saleDetails.some((d: any) => d.productName.toLowerCase().includes(searchTerm.toLowerCase())),
      ),
    [uiSales, searchTerm],
  );

  const totalRevenue = uiSales.reduce((sum, sale) => sum + sale.total_amount, 0);
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = uiSales.filter((s) => s.transaction_date === today);
  const pendingSales = uiSales.filter((s) => s.status === "Pending");

  const handleAddSale = async () => {
    if (!formData.total || formData.total <= 0) {
      toast.error("Please provide a valid total amount");
      return;
    }

    try {
      await salesMutations.createMutation.mutateAsync({
        transaction_date: new Date().toISOString(),
        total_amount: formData.total,
        user_id: user?.user_id ?? null,
        customer_id: formData.customerId === "walk-in" ? null : formData.customerId,
      } as any);
      setIsAddDialogOpen(false);
      setFormData(defaultForm);
      toast.success("Sale recorded successfully!");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to record sale");
    }
  };

  return (
    <div className="space-y-4">
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
                    <Label className="text-yellow-300">Customer</Label>
                    <Select
                      value={formData.customerId}
                      onValueChange={(value) => setFormData({ ...formData, customerId: value })}
                    >
                      <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                        <SelectItem value="walk-in">Walk-in Customer</SelectItem>
                        {customers.map((c: any) => (
                          <SelectItem key={c.customer_id} value={c.customer_id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-yellow-300">Total Amount (₱)</Label>
                    <Input
                      type="number"
                      value={formData.total}
                      onChange={(e) => setFormData({ ...formData, total: Number(e.target.value || 0) })}
                      className="bg-red-600 border-red-800 text-yellow-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-yellow-300">Payment Method</Label>
                    <Select
                      value={formData.paymentMethod}
                      onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}
                    >
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
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-yellow-400" />
            <Input
              placeholder="Search by order ID, customer, or product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
            />
          </div>

          <div className="border border-red-800 rounded-lg overflow-x-auto">
            <Table className="w-full min-w-[1180px]">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-yellow-300 whitespace-nowrap">Order ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Customer</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Product</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Qty</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Amount</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Payment</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Date</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale: any) => (
                  <TableRow key={sale.sales_id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap">{sale.sales_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap">{sale.customerName}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap max-w-[240px] truncate">
                      {sale.saleDetails.length > 0
                        ? sale.saleDetails.map((d: any) => d.productName).join(", ")
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-yellow-200 text-center whitespace-nowrap">
                      {sale.saleDetails.reduce((sum: number, detail: any) => sum + detail.quantity, 0)}
                    </TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap">₱{sale.total_amount}</TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap">{sale.payment_method}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        className={
                          sale.status === "Completed"
                            ? "bg-green-600 text-white"
                            : sale.status === "Pending"
                              ? "bg-yellow-600 text-red-900"
                              : "bg-red-900 text-yellow-200"
                        }
                      >
                        {sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap">{sale.transaction_date}</TableCell>
                    <TableCell className="text-center whitespace-nowrap">
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
                              <div><p className="text-sm text-yellow-200">Customer</p><p className="text-yellow-300">{sale.customerName}</p></div>
                              <div><p className="text-sm text-yellow-200">Transaction Date</p><p className="text-yellow-300">{sale.transaction_date}</p></div>
                            </div>
                            <div>
                              <p className="text-sm text-yellow-200 mb-2">Products</p>
                              {sale.saleDetails.map((detail: any, idx: number) => (
                                <div key={idx} className="bg-red-600 p-2 rounded mb-2">
                                  <p className="text-yellow-300">{detail.productName}</p>
                                  <p className="text-yellow-200 text-xs">Qty: {detail.quantity} × ₱{detail.price} = ₱{detail.subtotal}</p>
                                  {detail.discount_applied > 0 && <p className="text-yellow-200 text-xs">Discount: -₱{detail.discount_applied}</p>}
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div><p className="text-sm text-yellow-200">Payment Method</p><p className="text-yellow-300">{sale.payment_method}</p></div>
                              <div><p className="text-sm text-yellow-200">Total Amount</p><p className="text-yellow-300">₱{sale.total_amount}</p></div>
                            </div>
                            <div><p className="text-sm text-yellow-200">Status</p><p className="text-yellow-300">{sale.status}</p></div>
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

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Calendar, Eye, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useReturns, useSales } from "../../lib/hooks";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";

type SaleStatus = "Completed" | "Pending" | "Cancelled";

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

function formatSalesDisplayId(sequence: number) {
  return `SALES-${String(sequence).padStart(3, "0")}`;
}

function toPaymentStatus(status: SaleStatus): string {
  if (status === "Pending") return "pending";
  if (status === "Cancelled") return "failed";
  return "completed";
}

export function SalesManagement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const salesQuery = useSales();
  const returnsQuery = useReturns();

  const [searchTerm, setSearchTerm] = useState("");
  const [viewingSale, setViewingSale] = useState<any | null>(null);
  const [updatingSaleId, setUpdatingSaleId] = useState<string | null>(null);

  const sales = (salesQuery.data as any[]) ?? [];
  const returns = (returnsQuery.data as any[]) ?? [];
  const normalizedRole = String(user?.role_name ?? "").trim().toLowerCase();
  const isAdmin = normalizedRole.includes("admin");

  const replacementBySale = useMemo(() => {
    const map = new Map<string, { count: number; additional: number; credits: number; lastActivity: string | null }>();
    for (const replacement of returns) {
      const salesId = String(replacement.sales_id ?? "");
      if (!salesId) continue;
      const prev = map.get(salesId) ?? { count: 0, additional: 0, credits: 0, lastActivity: null };
      const additional = Number(replacement.additional_payment ?? replacement.total_replacement_payments ?? 0);
      const credits = Number(replacement.total_refund ?? replacement.total_credits_issued ?? 0);
      const activityDate = String(replacement.last_activity_date ?? replacement.return_date ?? replacement.created_at ?? "");
      const prevTs = prev.lastActivity ? new Date(prev.lastActivity).getTime() : 0;
      const nextTs = activityDate ? new Date(activityDate).getTime() : 0;
      map.set(salesId, {
        count: prev.count + 1,
        additional: prev.additional + additional,
        credits: prev.credits + credits,
        lastActivity: nextTs > prevTs ? activityDate : prev.lastActivity,
      });
    }
    return map;
  }, [returns]);

  const uiSales = useMemo(
    () => {
      const salesIdSequence = new Map<string, string>();
      [...sales]
        .sort((a, b) => {
          const aTime = new Date(a.transaction_date ?? "").getTime();
          const bTime = new Date(b.transaction_date ?? "").getTime();
          const safeATime = Number.isNaN(aTime) ? 0 : aTime;
          const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
          return safeATime - safeBTime;
        })
        .forEach((sale, index) => {
          salesIdSequence.set(String(sale.sales_id ?? ""), formatSalesDisplayId(index + 1));
        });

      return sales.map((sale) => {
        const customer = Array.isArray(sale.customer) ? sale.customer[0] : sale.customer;
        const cashier = Array.isArray(sale.user) ? sale.user[0] : sale.user;
        const payment = Array.isArray(sale.payment) ? sale.payment[0] : sale.payment;
        const details = Array.isArray((sale as any).sales_details) ? (sale as any).sales_details : [];
        const salesId = String(sale.sales_id ?? "");
        const replacementInfo = replacementBySale.get(salesId) ?? { count: 0, additional: 0, credits: 0, lastActivity: null };
        return {
          sales_id: salesId,
          display_sales_id: salesIdSequence.get(salesId) ?? "SALES-000",
          payment_id: payment?.payment_id ?? null,
          transaction_date: formatDate(sale.transaction_date),
          total_amount: Number(sale.total_amount ?? 0),
          payment_method: payment?.payment_method ?? "N/A",
          user_id: String(sale.user_id ?? cashier?.user_id ?? ""),
          cashierName: cashier?.name ?? cashier?.username ?? "Unknown Cashier",
          cashierUsername: cashier?.username ?? "",
          customerName: customer?.name ?? "Walk-in Customer",
          status: getStatus(payment?.payment_status),
          replacementCount: replacementInfo.count,
          replacementPayments: replacementInfo.additional,
          replacementCredits: replacementInfo.credits,
          lastActivityDate: formatDate(replacementInfo.lastActivity ?? sale.updated_at ?? sale.transaction_date),
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
      });
    },
    [replacementBySale, sales],
  );

  const visibleSales = useMemo(
    () => (isAdmin ? uiSales : uiSales.filter((sale) => sale.user_id === String(user?.user_id ?? ""))),
    [isAdmin, uiSales, user?.user_id],
  );

  const filteredSales = useMemo(
    () =>
      visibleSales.filter(
        (s) =>
          s.sales_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.display_sales_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.cashierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.cashierUsername.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.saleDetails.some((d: any) => d.productName.toLowerCase().includes(searchTerm.toLowerCase())),
      ),
    [visibleSales, searchTerm],
  );

  const completedSales = visibleSales.filter((s) => s.status === "Completed");
  const totalRevenue = completedSales.reduce((sum, sale) => sum + sale.total_amount, 0);
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = completedSales.filter((s) => s.transaction_date === today);

  const handleStatusUpdate = async (sale: any, nextStatus: SaleStatus) => {
    if (!isAdmin) return;
    if (sale.status === nextStatus) return;
    if (!sale.payment_id) {
      toast.error("No payment record found for this sale");
      return;
    }

    try {
      setUpdatingSaleId(sale.sales_id);
      const { error } = await supabase
        .from("payment")
        .update({ payment_status: toPaymentStatus(nextStatus) })
        .eq("payment_id", sale.payment_id);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success(`Sale status updated to ${nextStatus}`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update sale status");
    } finally {
      setUpdatingSaleId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>

      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Sales Records
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-yellow-400" />
            <Input
              placeholder="Search by sales ID, customer, or product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
            />
          </div>

          <div className="border border-red-800 rounded-lg overflow-x-auto">
            <Table className="w-full min-w-[1180px]">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Sales ID</TableHead>
                  {isAdmin && <TableHead className="text-yellow-300 whitespace-nowrap text-center">Cashier</TableHead>}
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Customer</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Product</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Qty</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Amount</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Added</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Credit</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Payment</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Date</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale: any) => (
                  <TableRow key={sale.sales_id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{sale.display_sales_id}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-yellow-200 whitespace-nowrap text-center">
                        <div className="flex flex-col">
                          <span>{sale.cashierName}</span>
                          {sale.cashierUsername && <span className="text-xs text-yellow-200/60">@{sale.cashierUsername}</span>}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{sale.customerName}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap max-w-[240px] truncate text-center">
                      {sale.saleDetails.length > 0
                        ? sale.saleDetails.map((d: any) => d.productName).join(", ")
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-yellow-200 text-center whitespace-nowrap">
                      {sale.saleDetails.reduce((sum: number, detail: any) => sum + detail.quantity, 0)}
                    </TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap text-center">PHP {sale.total_amount}</TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap text-center">PHP {Number(sale.replacementPayments ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap text-center">PHP {Number(sale.replacementCredits ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap text-center">{sale.payment_method}</TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      {isAdmin ? (
                        <Select
                          value={sale.status}
                          onValueChange={(value) => void handleStatusUpdate(sale, value as SaleStatus)}
                          disabled={updatingSaleId === sale.sales_id}
                        >
                          <SelectTrigger className="h-8 w-full bg-red-600 border-red-800 text-yellow-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                            <SelectItem value="Completed">Completed</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
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
                      )}
                    </TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap text-center">{sale.lastActivityDate}</TableCell>
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
                            <DialogTitle className="text-yellow-300">Sale Details - {sale.display_sales_id}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div><p className="text-sm text-yellow-200">Customer</p><p className="text-yellow-300">{sale.customerName}</p></div>
                              {isAdmin && <div><p className="text-sm text-yellow-200">Cashier</p><p className="text-yellow-300">{sale.cashierName}</p></div>}
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
                              <div><p className="text-sm text-yellow-200">Total Amount</p><p className="text-yellow-300">PHP {sale.total_amount}</p></div>
                              <div><p className="text-sm text-yellow-200">Replacements</p><p className="text-yellow-300">{sale.replacementCount}</p></div>
                              <div><p className="text-sm text-yellow-200">Added Payments</p><p className="text-yellow-300">PHP {Number(sale.replacementPayments ?? 0).toFixed(2)}</p></div>
                              <div><p className="text-sm text-yellow-200">Credits Issued</p><p className="text-yellow-300">PHP {Number(sale.replacementCredits ?? 0).toFixed(2)}</p></div>
                              <div><p className="text-sm text-yellow-200">Last Activity</p><p className="text-yellow-300">{sale.lastActivityDate}</p></div>
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




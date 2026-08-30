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
import { useProducts, useReturns, useSales } from "../../lib/hooks";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { writeAuditLog } from "../../lib/audit";

type SaleStatus = "Completed" | "Pending" | "Voided";

function getStatus(paymentStatus?: string | null): SaleStatus {
  const status = (paymentStatus ?? "Paid").toLowerCase();
  if (status.includes("pending")) return "Pending";
  if (status.includes("void") || status.includes("cancel") || status.includes("fail")) return "Voided";
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

function formatStaffCode(staffCode?: string | null, userId?: string | null, username?: string | null) {
  const explicitCode = String(staffCode ?? "").trim();
  if (explicitCode) return explicitCode;

  const uname = String(username ?? "");
  const usernameDigits = uname.replace(/\D/g, "");
  if (usernameDigits) return `Cashier ${usernameDigits.slice(-3).padStart(3, "0")}`;

  const id = String(userId ?? "").replace(/-/g, "");
  if (id) {
    const numeric = id.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 1000;
    return `Cashier ${String(numeric).padStart(3, "0")}`;
  }
  return "Cashier 000";
}

function toPaymentStatus(status: SaleStatus): string {
  if (status === "Pending") return "pending";
  if (status === "Voided") return "failed";
  return "completed";
}

function extractPesoAmount(text: string) {
  const match = String(text ?? "").match(/(?:customer adds|adds)\s*php\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (!match?.[1]) return 0;
  return Number(match[1].replace(/,/g, "")) || 0;
}

function normalizeProductName(value: string) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function extractReplacementName(text: string) {
  const match = String(text ?? "").match(/replacement:\s*([^|]+)/i);
  return match?.[1]?.trim() ?? "";
}

function formatCurrency(value: number) {
  return `PHP ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SalesManagement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const salesQuery = useSales();
  const returnsQuery = useReturns();
  const productsQuery = useProducts();

  const [searchTerm, setSearchTerm] = useState("");
  const [viewingSale, setViewingSale] = useState<any | null>(null);
  const [updatingSaleId, setUpdatingSaleId] = useState<string | null>(null);

  const sales = (salesQuery.data as any[]) ?? [];
  const returns = (returnsQuery.data as any[]) ?? [];
  const productRows = (productsQuery.data as any[]) ?? [];
  const normalizedRole = String(user?.role_name ?? "").trim().toLowerCase();
  const isAdmin = normalizedRole.includes("admin");

  const productMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const product of productRows) {
      const inventory = Array.isArray(product.inventory) ? product.inventory[0] : product.inventory;
      const productId = String(product.product_id ?? "");
      if (!productId) continue;
      map.set(productId, {
        product_id: productId,
        name: String(product.product_name ?? "N/A"),
        size: String(product.size ?? "N/A"),
        color: String(product.color ?? "N/A"),
        price: Number(inventory?.srp ?? product.price ?? product.cost_price ?? 0),
      });
    }
    return map;
  }, [productRows]);

  const replacementBySale = useMemo(() => {
    const map = new Map<string, { count: number; additional: number; credits: number; lastActivity: string | null; details: any[] }>();
    for (const replacement of returns) {
      const salesId = String(replacement.original_sales_id ?? replacement.sales_id ?? "");
      if (!salesId) continue;
      const prev = map.get(salesId) ?? { count: 0, additional: 0, credits: 0, lastActivity: null, details: [] };
      const details = Array.isArray(replacement.return_details) ? replacement.return_details : [];
      const headerAdditional = Number(replacement.additional_payment ?? replacement.total_replacement_payments ?? 0);
      const credits = Number(replacement.total_refund ?? replacement.total_credits_issued ?? 0);
      const activityDate = String(replacement.last_activity_date ?? replacement.return_date ?? replacement.created_at ?? "");
      const prevTs = prev.lastActivity ? new Date(prev.lastActivity).getTime() : 0;
      const nextTs = activityDate ? new Date(activityDate).getTime() : 0;
      const mappedDetails = details.map((detail: any) => {
        const returnedProduct = Array.isArray(detail.product) ? detail.product[0] : detail.product;
        const returnedFallback = productMap.get(String(detail.returned_product_id ?? detail.product_id ?? ""));
        const replacementNameFromNote = extractReplacementName(String(detail.reason ?? ""));
        const replacementFallback =
          productMap.get(String(detail.replacement_product_id ?? detail.new_product_id ?? "")) ??
          [...productMap.values()].find((product) => normalizeProductName(product.name) === normalizeProductName(replacementNameFromNote));
        const returnedInventory = Array.isArray(returnedProduct?.inventory) ? returnedProduct.inventory[0] : returnedProduct?.inventory;
        const returnedPrice = Number(detail.returned_price_unit ?? returnedInventory?.srp ?? returnedProduct?.price ?? returnedProduct?.cost_price ?? returnedFallback?.price ?? 0);
        const replacementPrice = Number(detail.new_price_unit ?? replacementFallback?.price ?? 0);
        const returnedQuantity = Number(detail.returned_quantity ?? detail.quantity_returned ?? 0);
        const replacementQuantity = Number(detail.new_quantity ?? detail.replacement_quantity ?? detail.quantity_returned ?? 0);
        const storedDifference = Number(detail.net_difference ?? detail.price_difference ?? 0);
        const computedDifference = (replacementPrice * replacementQuantity) - (returnedPrice * returnedQuantity);
        return {
          return_detail_id: String(detail.return_detail_id ?? ""),
          returnedProductName: returnedProduct?.product_name ?? returnedFallback?.name ?? "N/A",
          returnedSize: String(returnedProduct?.size ?? returnedFallback?.size ?? "N/A"),
          returnedColor: String(returnedProduct?.color ?? returnedFallback?.color ?? "N/A"),
          returnedPrice,
          returnedQuantity,
          replacementProductName: replacementFallback?.name ?? "N/A",
          replacementSize: String(replacementFallback?.size ?? "N/A"),
          replacementColor: String(replacementFallback?.color ?? "N/A"),
          replacementPrice,
          replacementQuantity,
          priceDifference: storedDifference !== 0 ? storedDifference : computedDifference,
          inventoryAction: String(detail.inventory_action ?? "Defective / Not Sellable"),
        };
      });
      const detailAdditional = mappedDetails.reduce((sum: number, detail: any) => {
        const byDiff = Math.max(0, Number(detail.priceDifference ?? 0));
        if (byDiff > 0) return sum + byDiff;
        const rawDetail = details.find((item: any) => String(item.return_detail_id ?? "") === detail.return_detail_id);
        return sum + extractPesoAmount(String(rawDetail?.reason ?? ""));
      }, 0);
      const additional = detailAdditional > 0 ? detailAdditional : headerAdditional;
      map.set(salesId, {
        count: prev.count + (Number(replacement.replacement_count ?? 0) || Math.max(1, details.length || 1)),
        additional: prev.additional + additional,
        credits: prev.credits + credits,
        lastActivity: nextTs > prevTs ? activityDate : prev.lastActivity,
        details: [...prev.details, ...mappedDetails],
      });
    }
    return map;
  }, [productMap, returns]);

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
        const replacementInfo = replacementBySale.get(salesId) ?? { count: 0, additional: 0, credits: 0, lastActivity: null, details: [] };
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
          cashierCode: formatStaffCode(cashier?.staff_code, sale.user_id ?? cashier?.user_id, cashier?.username),
          customerName: customer?.name ?? "Walk-in Customer",
          status: getStatus(payment?.payment_status),
          replacementCount: replacementInfo.count,
          replacementPayments: replacementInfo.additional,
          replacementCredits: replacementInfo.credits,
          replacementDetails: replacementInfo.details,
          lastActivityDate: formatDate(replacementInfo.lastActivity ?? sale.updated_at ?? sale.transaction_date),
          saleDetails: details.map((d: any) => {
            const product = Array.isArray(d.product) ? d.product[0] : d.product;
            const quantity = Number(d.quantity ?? 0);
            const price = Number(d.price ?? 0);
            const subtotal = Number(d.subtotal ?? 0);
            const rawDiscount = Number(d.discount_applied ?? 0);
            const gross = price * quantity;

            let discountAmount = Math.max(0, gross - subtotal);
            let discountPercent = rawDiscount;

            if (discountPercent > 0 && discountAmount === 0 && gross > 0) {
              discountAmount = Math.round(((gross * discountPercent) / 100) * 100) / 100;
            } else if (discountPercent <= 0 && gross > 0 && discountAmount > 0) {
              discountPercent = Math.round((discountAmount / gross) * 100);
            }

            return {
              sales_detail_id: d.sales_detail_id,
              product_id: d.product_id,
              productName: (product?.product_name ?? "Unknown Shoe").trim(),
              brand: String(product?.brand ?? "").trim(),
              size: String(product?.size ?? "").trim(),
              color: String(product?.color ?? "").trim(),
              quantity,
              returned_quantity: Number(d.returned_quantity ?? 0),
              price,
              gross,
              discount_percent: discountPercent,
              discount_amount: discountAmount,
              subtotal,
            };
          }),
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

  const replacementLabelBySaleId = useMemo(() => {
    const map = new Map<string, "Fully Replaced" | "Partially Replaced" | "Not Replaced">();
    for (const sale of visibleSales) {
      const details = Array.isArray(sale.saleDetails) ? sale.saleDetails : [];
      const hasReplacement = Number(sale.replacementCount ?? 0) > 0;
      if (!hasReplacement) {
        map.set(sale.sales_id, "Not Replaced");
        continue;
      }
      const fullyReplaced = details.length > 0 && details.every((d: any) => Number(d.returned_quantity ?? 0) >= Number(d.quantity ?? 0));
      map.set(sale.sales_id, fullyReplaced ? "Fully Replaced" : "Partially Replaced");
    }
    return map;
  }, [visibleSales]);

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

      await writeAuditLog({
        actorUserId: user?.user_id,
        actionType: "update_sale_status",
        entityType: "payment",
        entityId: String(sale.payment_id ?? sale.sales_id),
        oldData: { status: sale.status },
        newData: { status: nextStatus },
        metadata: { sales_id: sale.sales_id, payment_id: sale.payment_id },
      });

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
                <p className="text-sm text-zinc-400">Total Revenue</p>
                <p className="text-2xl text-zinc-100">₱{totalRevenue.toFixed(2)}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Today's Sales</p>
                <p className="text-2xl text-zinc-100">{todaySales.length}</p>
              </div>
              <Calendar className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-zinc-100 flex items-center gap-2">
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
              className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-zinc-100/50"
            />
          </div>

          <div className="border border-red-800 rounded-lg overflow-x-auto">
            <Table className="w-full min-w-[860px]">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-zinc-100 whitespace-nowrap text-center">Sales ID</TableHead>
                  {isAdmin && <TableHead className="text-zinc-100 whitespace-nowrap text-center">Cashier</TableHead>}
                  <TableHead className="text-zinc-100 whitespace-nowrap text-center">Customer</TableHead>
                  <TableHead className="text-zinc-100 whitespace-nowrap text-center">Amount</TableHead>
                  <TableHead className="text-zinc-100 whitespace-nowrap text-center">Status</TableHead>
                  <TableHead className="text-zinc-100 whitespace-nowrap text-center">Date</TableHead>
                  <TableHead className="text-zinc-100 whitespace-nowrap text-center">Actions</TableHead>
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
                          <span className="text-xs text-zinc-100/80">{sale.cashierCode}</span>
                          {sale.cashierUsername && <span className="text-xs text-yellow-200/60">@{sale.cashierUsername}</span>}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{sale.customerName}</TableCell>
                    <TableCell className="text-zinc-100 whitespace-nowrap text-center">PHP {Number(sale.total_amount ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
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
                              <SelectItem value="Voided">Voided</SelectItem>
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
                        {replacementLabelBySaleId.get(sale.sales_id) !== "Not Replaced" && (
                          <Badge className="bg-blue-700 text-white" title="Replaced">Replaced</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap text-center">{sale.lastActivityDate}</TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      <Dialog open={viewingSale?.sales_id === sale.sales_id} onOpenChange={(open) => !open && setViewingSale(null)}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-yellow-400 hover:text-zinc-100 hover:bg-red-600"
                            onClick={() => setViewingSale(sale)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-100 max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl">
                          <DialogHeader className="border-b border-zinc-800/80 pb-3">
                            <div className="flex items-center justify-between pr-6">
                              <DialogTitle className="text-zinc-100 text-lg font-bold">
                                Sale Details • {sale.display_sales_id}
                              </DialogTitle>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                                sale.status === 'Completed' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                                sale.status === 'Pending' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                                'bg-red-950 text-red-300 border border-red-800'
                              }`}>
                                {sale.status}
                              </span>
                            </div>
                          </DialogHeader>

                          {(() => {
                            const totalGross = sale.saleDetails.reduce((sum: number, d: any) => sum + (d.gross || 0), 0);
                            const totalDiscount = sale.saleDetails.reduce((sum: number, d: any) => sum + (d.discount_amount || 0), 0);
                            const totalItemsCount = sale.saleDetails.reduce((sum: number, d: any) => sum + (d.quantity || 0), 0);

                            return (
                              <div className="space-y-4 py-3">
                                {/* TRANSACTION INFO */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs">
                                  <div>
                                    <p className="text-[11px] text-zinc-400 font-medium">Customer</p>
                                    <p className="font-semibold text-zinc-100 truncate mt-0.5">{sale.customerName}</p>
                                  </div>
                                  {isAdmin && (
                                    <div>
                                      <p className="text-[11px] text-zinc-400 font-medium">Cashier</p>
                                      <p className="font-semibold text-zinc-100 truncate mt-0.5">{sale.cashierName}</p>
                                      <p className="text-[10px] text-zinc-400">{sale.cashierCode}</p>
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-[11px] text-zinc-400 font-medium">Transaction Date</p>
                                    <p className="font-semibold text-zinc-100 mt-0.5">{sale.transaction_date}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] text-zinc-400 font-medium">Payment Method</p>
                                    <p className="font-semibold text-zinc-100 uppercase mt-0.5">{sale.payment_method}</p>
                                  </div>
                                </div>

                                {/* PURCHASED PRODUCTS */}
                                <div className="space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                                      Purchased Items ({totalItemsCount} {totalItemsCount === 1 ? 'pair' : 'pairs'})
                                    </p>
                                  </div>

                                  <div className="space-y-2">
                                    {sale.saleDetails.map((detail: any, idx: number) => {
                                      const hasDiscount = detail.discount_amount > 0 || detail.discount_percent > 0;
                                      return (
                                        <div
                                          key={idx}
                                          className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                        >
                                          <div className="space-y-1.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-bold text-zinc-100 text-sm">{detail.productName}</span>
                                              {detail.brand && detail.brand !== "N/A" && (
                                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                  {detail.brand}
                                                </span>
                                              )}
                                              {detail.size && detail.size !== "N/A" && (
                                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                  Size {detail.size}
                                                </span>
                                              )}
                                              {detail.color && detail.color !== "N/A" && (
                                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                  {detail.color}
                                                </span>
                                              )}
                                            </div>

                                            <p className="text-xs text-zinc-400">
                                              Qty: <span className="text-zinc-200 font-medium">{detail.quantity} {detail.quantity === 1 ? 'pair' : 'pairs'}</span> × {formatCurrency(detail.price)}
                                            </p>

                                            {hasDiscount && (
                                              <p className="text-xs font-semibold text-emerald-400">
                                                Discount: {detail.discount_percent > 0 ? `${detail.discount_percent}%` : ''} (-{formatCurrency(detail.discount_amount)})
                                              </p>
                                            )}
                                          </div>

                                          <div className="text-right shrink-0">
                                            <p className="text-[11px] text-zinc-400">Item Total</p>
                                            <p className="text-sm font-bold text-yellow-300">{formatCurrency(detail.subtotal)}</p>
                                            {hasDiscount && (
                                              <p className="text-[11px] text-zinc-500 line-through">
                                                {formatCurrency(detail.gross)}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* REPLACEMENTS SECTION */}
                                {sale.replacementDetails.length > 0 && (
                                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                                    <p className="mb-3 text-xs uppercase tracking-wider text-zinc-400 font-semibold">Replacement Items</p>
                                    <div className="space-y-3">
                                      {sale.replacementDetails.map((detail: any) => (
                                        <div key={detail.return_detail_id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-stretch">
                                            <div className="rounded-md border border-red-900/50 bg-red-950/20 p-3">
                                              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Replaced Item</p>
                                              <p className="font-medium text-zinc-100">{detail.returnedProductName}</p>
                                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-300">
                                                <span>Qty: {detail.returnedQuantity}</span>
                                                <span>Price: {formatCurrency(detail.returnedPrice)}</span>
                                                <span>Size: {detail.returnedSize}</span>
                                                <span>Color: {detail.returnedColor}</span>
                                              </div>
                                            </div>
                                            <div className="rounded-md border border-emerald-900/50 bg-emerald-950/20 p-3">
                                              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Replacement Item</p>
                                              <p className="font-medium text-zinc-100">{detail.replacementProductName}</p>
                                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-300">
                                                <span>Qty: {detail.replacementQuantity}</span>
                                                <span>Price: {formatCurrency(detail.replacementPrice)}</span>
                                                <span>Size: {detail.replacementSize}</span>
                                                <span>Color: {detail.replacementColor}</span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-300">
                                            <Badge className="bg-zinc-800 text-zinc-200">Difference: {formatCurrency(detail.priceDifference)}</Badge>
                                            <Badge className="bg-zinc-800 text-zinc-200">Inventory: {detail.inventoryAction}</Badge>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* FINANCIAL SUMMARY */}
                                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                                  <p className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Payment & Settlement</p>

                                  <div className="space-y-1.5 text-xs text-zinc-300 border-b border-zinc-800 pb-3">
                                    <div className="flex justify-between">
                                      <span className="text-zinc-400">Gross Subtotal:</span>
                                      <span className="font-medium text-zinc-200">{formatCurrency(totalGross)}</span>
                                    </div>
                                    {totalDiscount > 0 && (
                                      <div className="flex justify-between text-emerald-400 font-medium">
                                        <span>Total Discount:</span>
                                        <span>-{formatCurrency(totalDiscount)}</span>
                                      </div>
                                    )}
                                    {sale.replacementPayments > 0 && (
                                      <div className="flex justify-between text-amber-300 font-medium">
                                        <span>Replacement Additional Payments:</span>
                                        <span>+{formatCurrency(sale.replacementPayments)}</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex justify-between items-baseline pt-1">
                                    <span className="text-sm font-bold text-zinc-100">Total Net Amount:</span>
                                    <span className="text-lg font-black text-yellow-300">{formatCurrency(sale.total_amount)}</span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-zinc-800 text-xs">
                                    <div>
                                      <p className="text-zinc-400 text-[11px]">Payment Mode</p>
                                      <p className="font-semibold text-zinc-200 uppercase mt-0.5">{sale.payment_method}</p>
                                    </div>
                                    <div>
                                      <p className="text-zinc-400 text-[11px]">Replacements</p>
                                      <p className="font-semibold text-zinc-200 mt-0.5">{sale.replacementCount} item{sale.replacementCount === 1 ? '' : 's'}</p>
                                    </div>
                                    <div>
                                      <p className="text-zinc-400 text-[11px]">Last Activity</p>
                                      <p className="font-semibold text-zinc-200 mt-0.5">{sale.lastActivityDate}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
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





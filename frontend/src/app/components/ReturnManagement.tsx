import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Plus, Search, Eye, RotateCcw, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth-context";
import { useInventory, useProducts, useReturns, useReturnsMutations, useSales } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";

type ReturnDetail = {
  return_detail_id: string;
  product_id: string;
  productName: string;
  quantity_returned: number;
  reason: string;
  refund_amount: number;
};

type ReturnRow = {
  return_id: string;
  display_return_id: string;
  sales_id: string;
  display_sales_id: string;
  customerName: string;
  return_date: string;
  total_refund: number;
  status: "Completed";
  returnDetails: ReturnDetail[];
};

type ExchangeForm = {
  sales_id: string;
  returned_product_id: string;
  replacement_product_id: string;
  quantity: number;
  reason: string;
};

const defaultForm: ExchangeForm = {
  sales_id: "",
  returned_product_id: "",
  replacement_product_id: "",
  quantity: 1,
  reason: "",
};

function buildClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ret_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatDate(v?: string | null) {
  if (!v) return "N/A";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "N/A" : d.toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return `PHP ${Number(value || 0).toFixed(2)}`;
}

function formatSequence(prefix: string, sequence: number) {
  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}

export function ReturnManagement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const returnsQuery = useReturns();
  const salesQuery = useSales();
  const productsQuery = useProducts();
  const inventoryQuery = useInventory();
  const returnsMutations = useReturnsMutations();

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewingReturn, setViewingReturn] = useState<ReturnRow | null>(null);
  const [formData, setFormData] = useState<ExchangeForm>(defaultForm);
  const [isSaving, setIsSaving] = useState(false);

  const sales = (salesQuery.data as any[]) ?? [];
  const productRows = (productsQuery.data as any[]) ?? [];
  const inventoryRows = (inventoryQuery.data as any[]) ?? [];
  const returnRows = (returnsQuery.data as any[]) ?? [];

  const salesDisplayMap = useMemo(() => {
    const map = new Map<string, string>();
    [...sales]
      .sort((a, b) => {
        const aTime = new Date(a.transaction_date ?? "").getTime();
        const bTime = new Date(b.transaction_date ?? "").getTime();
        return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
      })
      .forEach((sale, index) => map.set(String(sale.sales_id ?? ""), formatSequence("SALES", index + 1)));
    return map;
  }, [sales]);

  const products = useMemo(() => {
    const inventoryByProductId = new Map<string, any>();
    for (const inv of inventoryRows) {
      inventoryByProductId.set(String(inv.product_id ?? ""), inv);
    }

    return productRows
      .map((product: any) => {
        const inventory = Array.isArray(product.inventory)
          ? product.inventory[0]
          : product.inventory ?? inventoryByProductId.get(String(product.product_id ?? ""));
        const price = Number(product.price ?? product.cost_price ?? 0);
        return {
          product_id: String(product.product_id ?? ""),
          name: String(product.product_name ?? "Unnamed Product"),
          brand: String(product.brand ?? "N/A"),
          size: String(product.size ?? "N/A"),
          color: String(product.color ?? "N/A"),
          price,
          stock: Number(inventory?.stock_quantity ?? 0),
          inventory_id: inventory?.inventory_id ? String(inventory.inventory_id) : "",
          reorder_level: Number(inventory?.reorder_level ?? product.reorder_level ?? 10),
        };
      })
      .filter((product) => product.product_id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inventoryRows, productRows]);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.product_id, product])),
    [products],
  );

  const salesOptions = useMemo(
    () =>
      sales.map((sale: any) => {
        const customer = Array.isArray(sale.customer) ? sale.customer[0] : sale.customer;
        const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
        return {
          sales_id: String(sale.sales_id ?? ""),
          display_sales_id: salesDisplayMap.get(String(sale.sales_id ?? "")) ?? "SALES-000",
          customerName: customer?.name ?? "Walk-in Customer",
          user_id: String(sale.user_id ?? ""),
          details: details.map((detail: any) => {
            const product = Array.isArray(detail.product) ? detail.product[0] : detail.product;
            const qty = Number(detail.quantity ?? 0);
            return {
              product_id: String(detail.product_id ?? ""),
              productName: product?.product_name ?? productMap.get(String(detail.product_id ?? ""))?.name ?? "N/A",
              quantity: qty,
              price: Number(detail.price ?? (qty ? Number(detail.subtotal ?? 0) / qty : 0)),
              subtotal: Number(detail.subtotal ?? 0),
            };
          }),
        };
      }),
    [productMap, sales, salesDisplayMap],
  );

  const selectedSale = salesOptions.find((sale) => sale.sales_id === formData.sales_id);
  const selectedOriginalItem = selectedSale?.details.find((detail) => detail.product_id === formData.returned_product_id);
  const replacementProduct = productMap.get(formData.replacement_product_id);
  const maxReturnQty = Math.max(1, Number(selectedOriginalItem?.quantity ?? 1));
  const quantity = Math.min(Math.max(1, Number(formData.quantity || 1)), maxReturnQty);
  const originalTotal = Number(selectedOriginalItem?.price ?? 0) * quantity;
  const replacementTotal = Number(replacementProduct?.price ?? 0) * quantity;
  const priceDifference = replacementTotal - originalTotal;
  const customerPays = Math.max(0, priceDifference);
  const isLowerReplacement = Boolean(replacementProduct && selectedOriginalItem && priceDifference < 0);
  const exchangeSummary =
    priceDifference > 0
      ? `Customer adds ${formatCurrency(customerPays)}`
      : priceDifference < 0
        ? `Not allowed: replacement is ${formatCurrency(Math.abs(priceDifference))} lower`
        : "Even exchange";
  const eligibleReplacementProducts = useMemo(
    () =>
      products.filter((product) => {
        if (!selectedOriginalItem) return true;
        return Number(product.price ?? 0) >= Number(selectedOriginalItem.price ?? 0);
      }),
    [products, selectedOriginalItem],
  );

  const displayReturns = useMemo<ReturnRow[]>(() => {
    const sortedAsc = [...returnRows].sort((a, b) => {
      const aTime = new Date(a.return_date ?? a.created_at ?? "").getTime();
      const bTime = new Date(b.return_date ?? b.created_at ?? "").getTime();
      return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
    });
    const returnDisplayMap = new Map<string, string>();
    sortedAsc.forEach((row, index) => {
      returnDisplayMap.set(String(row.return_id ?? ""), formatSequence("RET", index + 1));
    });

    return returnRows.map((row: any) => {
      const sale = Array.isArray(row.sales_transaction) ? row.sales_transaction[0] : row.sales_transaction;
      const customer = Array.isArray(sale?.customer) ? sale.customer[0] : sale?.customer;
      const details = Array.isArray(row.return_details) ? row.return_details : [];
      return {
        return_id: String(row.return_id ?? ""),
        display_return_id: returnDisplayMap.get(String(row.return_id ?? "")) ?? "RET-000",
        sales_id: String(row.sales_id ?? ""),
        display_sales_id: salesDisplayMap.get(String(row.sales_id ?? "")) ?? "SALES-000",
        customerName: customer?.name ?? "Walk-in Customer",
        return_date: formatDate(row.return_date ?? row.created_at),
        total_refund: Number(row.total_refund ?? 0),
        status: "Completed",
        returnDetails: details.map((detail: any) => {
          const product = Array.isArray(detail.product) ? detail.product[0] : detail.product;
          return {
            return_detail_id: String(detail.return_detail_id ?? ""),
            product_id: String(detail.product_id ?? ""),
            productName: product?.product_name ?? productMap.get(String(detail.product_id ?? ""))?.name ?? "N/A",
            quantity_returned: Number(detail.quantity_returned ?? 0),
            reason: String(detail.reason ?? ""),
            refund_amount: Number(detail.refund_amount ?? 0),
          };
        }),
      };
    });
  }, [productMap, returnRows, salesDisplayMap]);

  const updateInventoryStock = async (productId: string, quantityDelta: number) => {
    const product = productMap.get(productId);
    if (!product) throw new Error("Product inventory not found");

    const nextStock = Math.max(0, Number(product.stock ?? 0) + quantityDelta);
    if (product.inventory_id) {
      const { error } = await supabase
        .from("inventory")
        .update({ stock_quantity: nextStock, last_updated: new Date().toISOString() })
        .eq("inventory_id", product.inventory_id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from("inventory").insert({
      inventory_id: buildClientId(),
      product_id: productId,
      stock_quantity: nextStock,
      reorder_level: product.reorder_level,
      last_updated: new Date().toISOString(),
    });
    if (error) throw error;
  };

  const handleAddReturn = async () => {
    if (!selectedSale || !selectedOriginalItem || !replacementProduct) {
      toast.error("Please select the original sale, returned item, and replacement item");
      return;
    }
    if (!formData.reason.trim()) {
      toast.error("Please add a return reason");
      return;
    }
    if (quantity > maxReturnQty) {
      toast.error(`Only ${maxReturnQty} unit(s) can be returned from this sale item`);
      return;
    }
    if (replacementProduct.product_id !== selectedOriginalItem.product_id && replacementProduct.stock < quantity) {
      toast.error(`Only ${replacementProduct.stock} replacement unit(s) available`);
      return;
    }
    if (isLowerReplacement) {
      toast.error("Replacement item must be the same price or higher. Cheaper replacements are not allowed.");
      return;
    }

    const returnId = buildClientId();
    const replacementNote = [
      `Replacement exchange`,
      `Returned: ${selectedOriginalItem.productName}`,
      `Replacement: ${replacementProduct.name}`,
      `Rule: ${exchangeSummary}`,
      `Reason: ${formData.reason.trim()}`,
    ].join(" | ");

    try {
      setIsSaving(true);
      await returnsMutations.createMutation.mutateAsync({
        return_id: returnId,
        sales_id: selectedSale.sales_id,
        user_id: user?.user_id ?? selectedSale.user_id,
        return_date: new Date().toISOString(),
        total_refund: 0,
      } as any);

      const { error: detailError } = await supabase.from("return_details").insert({
        return_detail_id: buildClientId(),
        return_id: returnId,
        product_id: selectedOriginalItem.product_id,
        quantity_returned: quantity,
        reason: replacementNote,
        refund_amount: 0,
      });
      if (detailError) throw detailError;

      if (selectedOriginalItem.product_id === replacementProduct.product_id) {
        await updateInventoryStock(selectedOriginalItem.product_id, 0);
      } else {
        await updateInventoryStock(selectedOriginalItem.product_id, quantity);
        await updateInventoryStock(replacementProduct.product_id, -quantity);
      }

      await queryClient.invalidateQueries({ queryKey: ["returns"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      setIsAddDialogOpen(false);
      setFormData(defaultForm);
      toast.success(`Replacement recorded. ${exchangeSummary}.`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to record replacement return");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredReturns = displayReturns.filter(
    (returnItem) =>
      returnItem.display_return_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      returnItem.display_sales_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      returnItem.customerName.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const completedReturns = displayReturns.length;
  const higherReplacementCount = displayReturns.filter((item) =>
    item.returnDetails.some((detail) => detail.reason.toLowerCase().includes("customer adds")),
  ).length;
  const evenExchangeCount = displayReturns.filter((item) =>
    item.returnDetails.some((detail) => detail.reason.toLowerCase().includes("even exchange")),
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Refunds Issued</p>
                <p className="text-2xl text-yellow-300">{formatCurrency(0)}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Completed Exchanges</p>
                <p className="text-2xl text-yellow-300">{completedReturns}</p>
              </div>
              <ArrowRightLeft className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Customer Adds</p>
                <p className="text-2xl text-yellow-300">{higherReplacementCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Even Exchanges</p>
                <p className="text-2xl text-yellow-300">{evenExchangeCount}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

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
                  Record Replacement
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-red-700 border-red-800 text-yellow-200 max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-yellow-300">Record Replacement Return</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label className="text-yellow-300">Original Sale *</Label>
                    <Select
                      value={formData.sales_id}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          sales_id: value,
                          returned_product_id: "",
                          replacement_product_id: "",
                          quantity: 1,
                        })
                      }
                    >
                      <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                        <SelectValue placeholder="Select sales ID" />
                      </SelectTrigger>
                      <SelectContent className="bg-red-700 border-red-800 text-yellow-200 max-h-64">
                        {salesOptions.map((sale) => (
                          <SelectItem key={sale.sales_id} value={sale.sales_id}>
                            {sale.display_sales_id} - {sale.customerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-yellow-300">Returned Item *</Label>
                      <Select
                        value={formData.returned_product_id}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            returned_product_id: value,
                            replacement_product_id: "",
                            quantity: 1,
                          })
                        }
                        disabled={!selectedSale}
                      >
                        <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                          <SelectValue placeholder="Select sold item" />
                        </SelectTrigger>
                        <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                          {(selectedSale?.details ?? []).map((detail) => (
                            <SelectItem key={detail.product_id} value={detail.product_id}>
                              {detail.productName} - {formatCurrency(detail.price)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-yellow-300">Replacement Item *</Label>
                      <Select
                        value={formData.replacement_product_id}
                        onValueChange={(value) => setFormData({ ...formData, replacement_product_id: value })}
                      >
                        <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                          <SelectValue placeholder="Select replacement" />
                        </SelectTrigger>
                        <SelectContent className="bg-red-700 border-red-800 text-yellow-200 max-h-72">
                          {eligibleReplacementProducts.map((product) => (
                            <SelectItem key={product.product_id} value={product.product_id}>
                              {product.name} - {product.size} - {formatCurrency(product.price)} ({product.stock} stock)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-yellow-300">Quantity</Label>
                      <Input
                        type="number"
                        min={1}
                        max={maxReturnQty}
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value || 1) })}
                        className="bg-red-600 border-red-800 text-yellow-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-yellow-300">Original Value</Label>
                      <Input value={formatCurrency(originalTotal)} readOnly className="bg-red-600 border-red-800 text-yellow-200" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-yellow-300">Replacement Value</Label>
                      <Input value={formatCurrency(replacementTotal)} readOnly className="bg-red-600 border-red-800 text-yellow-200" />
                    </div>
                  </div>

                  <div className="rounded-lg border border-red-800 bg-red-800/40 p-3">
                    <p className="text-yellow-300 font-medium">{exchangeSummary}</p>
                    <p className="text-yellow-200 text-sm">
                      Business rule: no full refunds and no cheaper replacements. Replacement must be the same price or higher; higher replacements require the customer to add the difference.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-yellow-300">Reason *</Label>
                    <Input
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      className="bg-red-600 border-red-800 text-yellow-200"
                      placeholder="e.g., wrong size, damaged item, customer requested exchange"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleAddReturn}
                    disabled={isSaving || isLowerReplacement}
                    className="bg-yellow-400 text-red-900 hover:bg-yellow-500 disabled:opacity-60"
                  >
                    {isSaving ? "Recording..." : "Record Replacement"}
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
              placeholder="Search by return ID, sales ID, or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
            />
          </div>

          <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
            <Table className="w-full min-w-[980px]">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Return ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Sales ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Customer</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Items</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Adjustment</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Return Date</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.map((returnItem) => (
                  <TableRow key={returnItem.return_id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.display_return_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.display_sales_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.customerName}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">
                      {returnItem.returnDetails.reduce((sum, detail) => sum + detail.quantity_returned, 0)} item(s)
                    </TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap text-center">No refund</TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <Badge className="bg-green-600 text-white">Completed</Badge>
                    </TableCell>
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap text-center">{returnItem.return_date}</TableCell>
                    <TableCell className="text-center">
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
                        <DialogContent className="bg-red-700 border-red-800 text-yellow-200 max-w-2xl">
                          <DialogHeader>
                            <DialogTitle className="text-yellow-300">Return Details - {returnItem.display_return_id}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-yellow-200">Customer</p>
                                <p className="text-yellow-300">{returnItem.customerName}</p>
                              </div>
                              <div>
                                <p className="text-sm text-yellow-200">Original Sale</p>
                                <p className="text-yellow-300">{returnItem.display_sales_id}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-sm text-yellow-200 mb-2">Exchange Details</p>
                              {returnItem.returnDetails.map((detail) => (
                                <div key={detail.return_detail_id} className="bg-red-600 p-3 rounded mb-2">
                                  <p className="text-yellow-300">{detail.productName}</p>
                                  <p className="text-yellow-200 text-xs">Qty: {detail.quantity_returned} | No refund issued</p>
                                  <p className="text-yellow-200 text-xs mt-1">{detail.reason}</p>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-yellow-200">Refund Policy</p>
                                <p className="text-yellow-300">Replacement only</p>
                              </div>
                              <div>
                                <p className="text-sm text-yellow-200">Return Date</p>
                                <p className="text-yellow-300">{returnItem.return_date}</p>
                              </div>
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

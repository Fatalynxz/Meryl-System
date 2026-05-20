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
import { useInventory, useProducts, useReturns, useSales } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";

type ReturnDetail = {
  return_detail_id: string;
  product_id: string;
  productName: string;
  quantity_returned: number;
  reason: string;
  refund_amount: number;
  replacementProductName: string;
  price_difference: number;
  inventory_action: string;
};

type ReturnRow = {
  return_id: string;
  display_return_id: string;
  sales_id: string;
  display_sales_id: string;
  user_id: string;
  customerName: string;
  return_date: string;
  total_refund: number;
  return_type: string;
  return_status: string;
  additional_payment: number;
  adjustment_amount: number;
  processedBy: string;
  salesStatus: string;
  returnDetails: ReturnDetail[];
};

type ExchangeForm = {
  sales_id: string;
  returned_product_id: string;
  replacement_product_id: string;
  quantity: number;
  reason: string;
  mode_of_payment: "gcash" | "cash";
  return_action: "Replacement" | "Partial Return" | "Full Return" | "Adjustment";
  inventory_action: "Defective / Not Sellable" | "Return to Stock";
};

const defaultForm: ExchangeForm = {
  sales_id: "",
  returned_product_id: "",
  replacement_product_id: "",
  quantity: 1,
  reason: "",
  mode_of_payment: "cash",
  return_action: "Replacement",
  inventory_action: "Defective / Not Sellable",
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

async function tryUpdateById(table: string, idColumn: string, id: string, payloads: Record<string, any>[]) {
  let lastError: any = null;
  for (const payload of payloads) {
    const { error } = await supabase.from(table as any).update(payload).eq(idColumn as any, id);
    if (!error) return;
    lastError = error;
  }
  if (lastError) throw lastError;
}

async function tryInsertRow(table: string, payloads: Record<string, any>[]) {
  let lastError: any = null;
  for (const payload of payloads) {
    const { error } = await supabase.from(table as any).insert(payload);
    if (!error) return;
    lastError = error;
  }
  if (lastError) throw lastError;
}

function normalizeSaleStatus(value: string | null | undefined) {
  const normalized = String(value ?? "Completed").trim();
  return normalized || "Completed";
}

export function ReturnManagement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const returnsQuery = useReturns();
  const salesQuery = useSales();
  const productsQuery = useProducts();
  const inventoryQuery = useInventory();

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewingReturn, setViewingReturn] = useState<ReturnRow | null>(null);
  const [formData, setFormData] = useState<ExchangeForm>(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [salePickerSearch, setSalePickerSearch] = useState("");
  const [returnedItemSearch, setReturnedItemSearch] = useState("");
  const [replacementSearch, setReplacementSearch] = useState("");

  const sales = (salesQuery.data as any[]) ?? [];
  const productRows = (productsQuery.data as any[]) ?? [];
  const inventoryRows = (inventoryQuery.data as any[]) ?? [];
  const returnRows = (returnsQuery.data as any[]) ?? [];
  const isAdmin = String(user?.role_name ?? "").trim().toLowerCase().includes("admin");

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
      sales
        .filter((sale: any) => isAdmin || String(sale.user_id ?? "") === String(user?.user_id ?? ""))
        .map((sale: any) => {
          const customer = Array.isArray(sale.customer) ? sale.customer[0] : sale.customer;
          const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
          return {
            sales_id: String(sale.sales_id ?? ""),
            display_sales_id: salesDisplayMap.get(String(sale.sales_id ?? "")) ?? "SALES-000",
            customerName: customer?.name ?? "Walk-in Customer",
            user_id: String(sale.user_id ?? ""),
            total_amount: Number(sale.total_amount ?? 0),
            sales_status: normalizeSaleStatus(sale.sales_status ?? sale.status),
            return_status: String(sale.return_status ?? "None"),
            details: details.map((detail: any) => {
              const product = Array.isArray(detail.product) ? detail.product[0] : detail.product;
              const qty = Number(detail.quantity ?? 0);
              const returnedQty = Number(detail.returned_quantity ?? 0);
            return {
                sales_detail_id: String(detail.sales_detail_id ?? ""),
                product_id: String(detail.product_id ?? ""),
                productName: product?.product_name ?? productMap.get(String(detail.product_id ?? ""))?.name ?? "N/A",
                quantity: qty,
                returned_quantity: returnedQty,
                returnable_quantity: Math.max(0, qty - returnedQty),
                price: Number(detail.price ?? (qty ? Number(detail.subtotal ?? 0) / qty : 0)),
                subtotal: Number(detail.subtotal ?? 0),
              };
            }),
            customer_id: String(sale.customer_id ?? ""),
          };
        }),
    [isAdmin, productMap, sales, salesDisplayMap, user?.user_id],
  );

  const selectedSale = salesOptions.find((sale) => sale.sales_id === formData.sales_id);
  const selectedOriginalItem = selectedSale?.details.find((detail) => detail.product_id === formData.returned_product_id);
  const replacementProduct = productMap.get(formData.replacement_product_id);
  const requiresReplacement = formData.return_action === "Replacement" || formData.return_action === "Adjustment";
  const maxReturnQty = Math.max(1, Number(selectedOriginalItem?.returnable_quantity ?? selectedOriginalItem?.quantity ?? 1));
  const quantity = Math.min(Math.max(1, Number(formData.quantity || 1)), maxReturnQty);
  const originalTotal = Number(selectedOriginalItem?.price ?? 0) * quantity;
  const replacementTotal = Number(replacementProduct?.price ?? 0) * quantity;
  const priceDifference = replacementTotal - originalTotal;
  const customerPays = Math.max(0, priceDifference);
  const exchangeSummary =
    !requiresReplacement
      ? `${formData.return_action}: ${formatCurrency(originalTotal)} will be adjusted`
      : priceDifference > 0
      ? `Customer adds ${formatCurrency(customerPays)}`
      : priceDifference < 0
        ? `Store credit issued: ${formatCurrency(Math.abs(priceDifference))}`
        : "Even exchange";
  const eligibleReplacementProducts = useMemo(
    () => products,
    [products],
  );

  const filteredSaleOptions = useMemo(() => {
    const term = salePickerSearch.trim().toLowerCase();
    if (!term) return salesOptions;
    return salesOptions.filter((sale) =>
      [sale.display_sales_id, sale.sales_id, sale.customerName, sale.sales_status, sale.return_status]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [salePickerSearch, salesOptions]);

  const filteredReturnedItems = useMemo(() => {
    const term = returnedItemSearch.trim().toLowerCase();
    const details = selectedSale?.details ?? [];
    if (!term) return details;
    return details.filter((detail) =>
      [detail.product_id, detail.productName, String(detail.quantity), String(detail.price)]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [returnedItemSearch, selectedSale?.details]);

  const filteredReplacementProducts = useMemo(() => {
    const term = replacementSearch.trim().toLowerCase();
    const availableProducts = eligibleReplacementProducts.filter((product) => product.stock > 0);
    if (!term) return availableProducts;
    return availableProducts.filter((product) =>
      [
        product.product_id,
        product.name,
        product.brand,
        product.color,
        product.size,
        String(product.price),
        String(product.stock),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [eligibleReplacementProducts, replacementSearch]);

  const selectSaleForReturn = (saleId: string) => {
    setFormData({
      ...formData,
      sales_id: saleId,
      returned_product_id: "",
      replacement_product_id: "",
      quantity: 1,
    });
  };

  const selectReturnedProduct = (productId: string) => {
    setFormData({
      ...formData,
      returned_product_id: productId,
      replacement_product_id: "",
      quantity: 1,
    });
  };

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
      const processedUser = Array.isArray(row.user) ? row.user[0] : row.user;
      const details = Array.isArray(row.return_details) ? row.return_details : [];
      return {
        return_id: String(row.return_id ?? ""),
        display_return_id: returnDisplayMap.get(String(row.return_id ?? "")) ?? "RET-000",
        sales_id: String(row.sales_id ?? ""),
        display_sales_id: salesDisplayMap.get(String(row.sales_id ?? "")) ?? "SALES-000",
        user_id: String(row.user_id ?? sale?.user_id ?? ""),
        customerName: customer?.name ?? "Walk-in Customer",
        return_date: formatDate(row.return_date ?? row.created_at),
        total_refund: Number(row.total_refund ?? 0),
        return_type: String(row.return_type ?? "Replacement"),
        return_status: String(row.return_status ?? "Completed"),
        additional_payment: Number(row.additional_payment ?? 0),
        adjustment_amount: Number(row.adjustment_amount ?? 0),
        processedBy: processedUser?.name ?? processedUser?.username ?? "Staff",
        salesStatus: normalizeSaleStatus(sale?.sales_status ?? sale?.status),
        returnDetails: details.map((detail: any) => {
          const product = Array.isArray(detail.product) ? detail.product[0] : detail.product;
          const replacement = Array.isArray(detail.replacement_product) ? detail.replacement_product[0] : detail.replacement_product;
          return {
            return_detail_id: String(detail.return_detail_id ?? ""),
            product_id: String(detail.product_id ?? ""),
            productName: product?.product_name ?? productMap.get(String(detail.product_id ?? ""))?.name ?? "N/A",
            quantity_returned: Number(detail.quantity_returned ?? 0),
            reason: String(detail.reason ?? ""),
            refund_amount: Number(detail.refund_amount ?? 0),
            replacementProductName: replacement?.product_name ?? "N/A",
            price_difference: Number(detail.price_difference ?? 0),
            inventory_action: String(detail.inventory_action ?? "Defective / Not Sellable"),
          };
        }),
      };
    });
  }, [productMap, returnRows, salesDisplayMap]);

  const visibleReturns = useMemo(
    () => (isAdmin ? displayReturns : displayReturns.filter((row) => row.user_id === String(user?.user_id ?? ""))),
    [displayReturns, isAdmin, user?.user_id],
  );

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

  const createInventoryLog = async (productId: string, quantityChange: number, transactionType: string, referenceId: string) => {
    await tryInsertRow("inventory_log", [
      {
        inventory_log_id: buildClientId(),
        product_id: productId,
        quantity_change: quantityChange,
        transaction_type: transactionType,
        reference_id: referenceId,
        date_updated: new Date().toISOString(),
      },
    ]);
  };

  const recordAdditionalPayment = async (salesId: string, amount: number) => {
    if (amount <= 0) return;

    const { data: existingPayment } = await supabase
      .from("payment")
      .select("payment_id, amount_paid")
      .eq("sales_id", salesId)
      .maybeSingle();

    if (existingPayment?.payment_id) {
      const nextAmountPaid = Number(existingPayment.amount_paid ?? 0) + amount;
      const { error } = await supabase
        .from("payment")
        .update({
          amount_paid: nextAmountPaid,
          payment_status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("payment_id", existingPayment.payment_id);
      if (error) throw error;
      return;
    }

    await tryInsertRow("payment", [
      {
        payment_id: buildClientId(),
        sales_id: salesId,
        payment_method: "cash",
        amount_paid: amount,
        change_amount: 0,
        payment_status: "completed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  };

  const handleAddReturn = async () => {
    if (!selectedSale || !selectedOriginalItem) {
      toast.error("Please select the original sale and returned item");
      return;
    }
    if (formData.return_action !== "Replacement") {
      toast.error("Replacement-only policy: choose Replacement to continue");
      return;
    }
    if (requiresReplacement && !replacementProduct) {
      toast.error("Please select the replacement item");
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
    if (requiresReplacement && replacementProduct && replacementProduct.stock < quantity) {
      toast.error(`Only ${replacementProduct.stock} replacement unit(s) available`);
      return;
    }

    const returnId = buildClientId();
    const selectedSalesDetailId = selectedOriginalItem.sales_detail_id;
    const nextReturnedQty = Number(selectedOriginalItem.returned_quantity ?? 0) + quantity;
    const isFullyReturnedItem = nextReturnedQty >= Number(selectedOriginalItem.quantity ?? 0);
    const allOtherItemsReturned = (selectedSale.details ?? [])
      .filter((detail: any) => detail.sales_detail_id !== selectedSalesDetailId)
      .every((detail: any) => Number(detail.returnable_quantity ?? detail.quantity ?? 0) <= 0);
    const isFullTransactionReturn = isFullyReturnedItem && allOtherItemsReturned;
    const additionalPayment = Math.max(0, priceDifference);
    const creditIssued = Math.max(0, -priceDifference);
    const adjustmentAmount = additionalPayment;
    const adjustedTotal = Math.max(0, Number(selectedSale.total_amount ?? 0) + additionalPayment);
    const salesStatus = isFullTransactionReturn
      ? formData.return_action === "Full Return"
        ? "Fully Returned"
        : "Adjusted"
      : formData.return_action === "Replacement" || formData.return_action === "Adjustment"
        ? "Adjusted"
        : "Partially Returned";
    const replacementNote = [
      `${formData.return_action}`,
      `Returned: ${selectedOriginalItem.productName}`,
      replacementProduct ? `Replacement: ${replacementProduct.name}` : "Replacement: N/A",
      `Rule: ${exchangeSummary}`,
      `Mode of payment: ${additionalPayment > 0 ? formData.mode_of_payment : "N/A"}`,
      `Inventory action: ${formData.inventory_action}`,
      `Reason: ${formData.reason.trim()}`,
    ].join(" | ");

    try {
      setIsSaving(true);
      await tryInsertRow("returns", [
        {
          return_id: returnId,
          sales_id: selectedSale.sales_id,
          original_sales_id: selectedSale.sales_id,
          user_id: user?.user_id ?? selectedSale.user_id,
          return_date: new Date().toISOString(),
          return_type: formData.return_action,
          return_status: "Completed",
          total_refund: creditIssued,
          additional_payment: additionalPayment,
          adjustment_amount: adjustmentAmount,
          mode_of_payment: additionalPayment > 0 ? formData.mode_of_payment : null,
          payment_date: additionalPayment > 0 ? new Date().toISOString() : null,
          fulfilled_date: new Date().toISOString(),
          replacement_count: 1,
          total_replacement_payments: additionalPayment,
          total_credits_issued: creditIssued,
          net_amount: adjustedTotal,
          last_activity_date: new Date().toISOString(),
          remarks: replacementNote,
        },
        {
          return_id: returnId,
          sales_id: selectedSale.sales_id,
          user_id: user?.user_id ?? selectedSale.user_id,
          return_date: new Date().toISOString(),
          total_refund: creditIssued,
        },
      ]);

      await tryInsertRow("return_details", [
        {
          return_detail_id: buildClientId(),
          return_id: returnId,
          product_id: selectedOriginalItem.product_id,
          quantity_returned: quantity,
          reason: replacementNote,
          refund_amount: creditIssued,
          replacement_product_id: replacementProduct?.product_id ?? null,
          replacement_quantity: replacementProduct ? quantity : 0,
          price_difference: priceDifference,
          returned_product_id: selectedOriginalItem.product_id,
          returned_quantity: quantity,
          returned_price_unit: Number(selectedOriginalItem?.price ?? 0),
          new_product_id: replacementProduct?.product_id ?? null,
          new_quantity: replacementProduct ? quantity : 0,
          new_price_unit: Number(replacementProduct?.price ?? 0),
          net_difference: priceDifference,
          inventory_action: formData.inventory_action,
        },
        {
          return_detail_id: buildClientId(),
          return_id: returnId,
          product_id: selectedOriginalItem.product_id,
          quantity_returned: quantity,
          reason: replacementNote,
          refund_amount: creditIssued,
        },
      ]);

      try {
        await tryUpdateById("sales_details", "sales_detail_id", selectedSalesDetailId, [
          {
            returned_quantity: nextReturnedQty,
            replacement_product_id: replacementProduct?.product_id ?? null,
            item_status: isFullyReturnedItem ? (replacementProduct ? "Replaced" : "Returned") : "Partially Returned",
          },
        ]);
      } catch {
        // Older schemas may not have return-tracking columns on sales_details yet.
      }

      await tryUpdateById("sales_transaction", "sales_id", selectedSale.sales_id, [
        {
          original_total_amount: Number(selectedSale.total_amount ?? 0),
          adjusted_total_amount: adjustedTotal,
          total_amount: adjustedTotal,
          sales_status: salesStatus,
          return_status: "Completed",
          updated_at: new Date().toISOString(),
        },
        {
          total_amount: adjustedTotal,
          updated_at: new Date().toISOString(),
        },
      ]);

      await recordAdditionalPayment(selectedSale.sales_id, additionalPayment);

      if (creditIssued > 0 && selectedSale.customer_id) {
        const customerId = String(selectedSale.customer_id);
        const { data: existingCredit, error: creditFetchError } = await supabase
          .from("customer_credits")
          .select("customer_credit_id, total_issued, total_used, available_credit")
          .eq("customer_id", customerId)
          .maybeSingle();
        if (creditFetchError) throw creditFetchError;

        if (existingCredit?.customer_credit_id) {
          const nextTotalIssued = Number(existingCredit.total_issued ?? 0) + creditIssued;
          const nextAvailableCredit = Number(existingCredit.available_credit ?? 0) + creditIssued;
          const { error: updateCreditError } = await supabase
            .from("customer_credits")
            .update({
              total_issued: nextTotalIssued,
              available_credit: nextAvailableCredit,
              updated_at: new Date().toISOString(),
            })
            .eq("customer_credit_id", existingCredit.customer_credit_id);
          if (updateCreditError) throw updateCreditError;
        } else {
          const { error: insertCreditError } = await supabase.from("customer_credits").insert({
            customer_credit_id: buildClientId(),
            customer_id: customerId,
            total_issued: creditIssued,
            total_used: 0,
            available_credit: creditIssued,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          if (insertCreditError) throw insertCreditError;
        }

        const { error: creditTxnError } = await supabase.from("customer_credit_transactions").insert({
          customer_credit_txn_id: buildClientId(),
          customer_id: customerId,
          return_id: returnId,
          txn_type: "issue",
          amount: creditIssued,
          notes: `Replacement credit issued for ${selectedSale.sales_id}`,
          created_at: new Date().toISOString(),
        });
        if (creditTxnError) throw creditTxnError;
      }

      if (formData.inventory_action === "Return to Stock") {
        await updateInventoryStock(selectedOriginalItem.product_id, quantity);
        await createInventoryLog(selectedOriginalItem.product_id, quantity, "Return", returnId);
      }

      if (replacementProduct) {
        await updateInventoryStock(replacementProduct.product_id, -quantity);
        await createInventoryLog(replacementProduct.product_id, -quantity, "Replacement", returnId);
      }

      await queryClient.invalidateQueries({ queryKey: ["returns"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setIsAddDialogOpen(false);
      setFormData(defaultForm);
      toast.success(`${formData.return_action} recorded. Sales transaction preserved and adjusted.`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to record replacement return");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredReturns = visibleReturns.filter(
    (returnItem) =>
      returnItem.display_return_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      returnItem.display_sales_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      returnItem.customerName.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const completedReturns = visibleReturns.length;
  const higherReplacementCount = visibleReturns.filter((item) =>
    item.returnDetails.some((detail) => detail.reason.toLowerCase().includes("customer adds")),
  ).length;
  const evenExchangeCount = visibleReturns.filter((item) =>
    item.returnDetails.some((detail) => detail.reason.toLowerCase().includes("even exchange")),
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Store Credits Issued</p>
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
                  Process Replacement
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-red-700 border-red-800 text-yellow-200 !w-[94vw] !max-w-[1050px] max-h-[88vh] overflow-hidden p-0 shadow-2xl">
                <div className="border-b border-red-800 p-5 bg-red-800/50">
                  <DialogHeader>
                    <DialogTitle className="text-yellow-300 flex items-center gap-2">
                      <ArrowRightLeft className="w-5 h-5" />
                      Process Item Replacement
                    </DialogTitle>
                    <p className="text-xs text-yellow-300 mt-2 font-medium">⚠️ Replacement Only - No cash refunds allowed</p>
                    <p className="text-xs text-yellow-200 mt-1">If replacement is higher: customer pays the difference. If lower: store credit issued.</p>
                  </DialogHeader>
                </div>
                <div className="grid max-h-[70vh] gap-5 overflow-y-auto overflow-x-hidden p-5 scrollbar-hide">
                  <div className="space-y-2">
                    <Label className="text-yellow-300">Original Sale *</Label>
                    <Select
                      value={formData.sales_id}
                      onValueChange={(value) =>
                        selectSaleForReturn(value)
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
                    <div className="space-y-3 rounded-xl border border-red-800 p-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                        <Input
                          value={salePickerSearch}
                          onChange={(event) => setSalePickerSearch(event.target.value)}
                          placeholder="Search sale by sales ID, customer, or status..."
                          className="h-11 rounded-xl pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50 focus-visible:ring-yellow-400"
                        />
                      </div>
                      <div className="border border-red-800 rounded-xl overflow-y-auto overflow-x-hidden max-h-48">
                        <Table className="w-full table-fixed text-sm">
                          <TableHeader>
                            <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                              <TableHead className="w-[18%] text-yellow-300 text-center">Sales ID</TableHead>
                              <TableHead className="w-[24%] text-yellow-300 text-center">Customer</TableHead>
                              <TableHead className="w-[12%] text-yellow-300 text-center">Items</TableHead>
                              <TableHead className="w-[18%] text-yellow-300 text-center">Amount</TableHead>
                              <TableHead className="w-[16%] text-yellow-300 text-center">Status</TableHead>
                              <TableHead className="w-[12%] text-yellow-300 text-center">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredSaleOptions.map((sale) => (
                              <TableRow key={sale.sales_id} className="border-red-800 transition-colors hover:bg-red-800/60">
                                <TableCell className="truncate text-yellow-200 text-center" title={sale.display_sales_id}>{sale.display_sales_id}</TableCell>
                                <TableCell className="truncate text-yellow-200 text-center" title={sale.customerName}>{sale.customerName}</TableCell>
                                <TableCell className="text-yellow-200 text-center">{sale.details.length}</TableCell>
                                <TableCell className="truncate text-yellow-300 text-center">{formatCurrency(sale.total_amount)}</TableCell>
                                <TableCell className="text-center">
                                  <Badge className="bg-green-600 text-white">{sale.sales_status}</Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    size="sm"
                                    onClick={() => selectSaleForReturn(sale.sales_id)}
                                    className="h-8 rounded-full bg-yellow-400 px-4 text-red-900 hover:bg-yellow-500"
                                  >
                                    Select
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-yellow-300">Replacement Type *</Label>
                      <Select
                        value={formData.return_action}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            return_action: value as ExchangeForm["return_action"],
                            replacement_product_id:
                              value === "Replacement" || value === "Adjustment" ? formData.replacement_product_id : "",
                          })
                        }
                      >
                        <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                          <SelectValue placeholder="Select replacement type" />
                        </SelectTrigger>
                        <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                          <SelectItem value="Replacement">Replace with Different Item</SelectItem>
                          <SelectItem value="Adjustment">Adjustment / Price Adjustment</SelectItem>
                          <SelectItem value="Partial Return">Partial Return (Defective)</SelectItem>
                          <SelectItem value="Full Return">Full Return (Defective)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-yellow-300 mt-1">💡 Replacement = Item swap. Adjustment = Manager override.</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-yellow-300">Returned Item Inventory Action *</Label>
                      <Select
                        value={formData.inventory_action}
                        onValueChange={(value) =>
                          setFormData({ ...formData, inventory_action: value as ExchangeForm["inventory_action"] })
                        }
                      >
                        <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                          <SelectValue placeholder="Select inventory action" />
                        </SelectTrigger>
                        <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                          <SelectItem value="Defective / Not Sellable">Defective / Not Sellable</SelectItem>
                          <SelectItem value="Return to Stock">Return to Stock</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-yellow-300">Returned Item *</Label>
                      <Select
                        value={formData.returned_product_id}
                        onValueChange={(value) =>
                          selectReturnedProduct(value)
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
                      <Label className="text-yellow-300">Replacement Item {requiresReplacement ? "*" : ""}</Label>
                      <Select
                        value={formData.replacement_product_id}
                        onValueChange={(value) => setFormData({ ...formData, replacement_product_id: value })}
                        disabled={!requiresReplacement}
                      >
                        <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                          <SelectValue placeholder={requiresReplacement ? "Select replacement" : "No replacement needed"} />
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

                  {selectedSale && (
                    <div className="space-y-3 rounded-xl border border-red-800 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <Label className="text-yellow-300">Purchased Products Grid</Label>
                        <div className="relative md:w-80">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                          <Input
                            value={returnedItemSearch}
                            onChange={(event) => setReturnedItemSearch(event.target.value)}
                            placeholder="Search purchased product..."
                            className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50 focus-visible:ring-yellow-400"
                          />
                        </div>
                      </div>
                      <div className="border border-red-800 rounded-xl overflow-y-auto overflow-x-hidden max-h-48">
                        <Table className="w-full table-fixed text-sm">
                          <TableHeader>
                            <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                              <TableHead className="w-[14%] text-yellow-300 text-center">SKU</TableHead>
                              <TableHead className="w-[30%] text-yellow-300 text-center">Product</TableHead>
                              <TableHead className="w-[12%] text-yellow-300 text-center">Sold</TableHead>
                              <TableHead className="w-[14%] text-yellow-300 text-center">Returnable</TableHead>
                              <TableHead className="w-[18%] text-yellow-300 text-center">Price</TableHead>
                              <TableHead className="w-[12%] text-yellow-300 text-center">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredReturnedItems.map((detail: any) => (
                              <TableRow key={`${detail.sales_detail_id}-${detail.product_id}`} className="border-red-800 transition-colors hover:bg-red-800/60">
                                <TableCell className="truncate text-yellow-200 text-center" title={detail.product_id}>{detail.product_id.slice(0, 8)}</TableCell>
                                <TableCell className="truncate text-yellow-200 text-center" title={detail.productName}>{detail.productName}</TableCell>
                                <TableCell className="text-yellow-200 text-center">{detail.quantity}</TableCell>
                                <TableCell className="text-yellow-200 text-center">{detail.returnable_quantity}</TableCell>
                                <TableCell className="truncate text-yellow-300 text-center">{formatCurrency(detail.price)}</TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    size="sm"
                                    disabled={Number(detail.returnable_quantity ?? 0) <= 0}
                                    onClick={() => selectReturnedProduct(detail.product_id)}
                                    className="h-8 rounded-full bg-yellow-400 px-4 text-red-900 hover:bg-yellow-500 disabled:opacity-50"
                                  >
                                    Select
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {requiresReplacement && (
                    <div className="space-y-3 rounded-xl border border-red-800 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <Label className="text-yellow-300">Replacement Product Grid</Label>
                        <div className="relative md:w-80">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                          <Input
                            value={replacementSearch}
                            onChange={(event) => setReplacementSearch(event.target.value)}
                            placeholder="Search replacement by SKU, name, brand..."
                            className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50 focus-visible:ring-yellow-400"
                          />
                        </div>
                      </div>
                      <div className="border border-red-800 rounded-xl overflow-y-auto overflow-x-hidden max-h-56">
                        <Table className="w-full table-fixed text-sm">
                          <TableHeader>
                            <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                              <TableHead className="w-[24%] text-yellow-300 text-center">Product</TableHead>
                              <TableHead className="w-[14%] text-yellow-300 text-center">Brand</TableHead>
                              <TableHead className="w-[16%] text-yellow-300 text-center">Variant</TableHead>
                              <TableHead className="w-[16%] text-yellow-300 text-center">Price</TableHead>
                              <TableHead className="w-[14%] text-yellow-300 text-center">Stock</TableHead>
                              <TableHead className="w-[16%] text-yellow-300 text-center">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredReplacementProducts.map((product) => (
                              <TableRow key={product.product_id} className="border-red-800 transition-colors hover:bg-red-800/60">
                                <TableCell className="truncate text-yellow-200 text-center" title={product.name}>{product.name}</TableCell>
                                <TableCell className="truncate text-yellow-200 text-center" title={product.brand}>{product.brand}</TableCell>
                                <TableCell className="truncate text-yellow-200 text-center" title={`${product.color} / ${product.size}`}>{product.color} / {product.size}</TableCell>
                                <TableCell className="truncate text-yellow-300 text-center">{formatCurrency(product.price)}</TableCell>
                                <TableCell className="text-center">
                                  <Badge className="rounded-full bg-yellow-400 text-red-900">{product.stock} units</Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    size="sm"
                                    onClick={() => setFormData({ ...formData, replacement_product_id: product.product_id })}
                                    className="h-8 rounded-full bg-yellow-400 px-4 text-red-900 hover:bg-yellow-500"
                                  >
                                    Select
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

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

                  <div className="rounded-lg border-2 border-yellow-400 bg-yellow-400/10 p-4">
                    <p className="text-yellow-300 font-bold text-lg">{exchangeSummary}</p>
                    <p className="text-yellow-200 text-sm mt-2">
                      💡 <strong>NO REFUND POLICY:</strong> {priceDifference > 0 ? `Customer must pay ₽${priceDifference.toFixed(2)} additional to complete replacement.` : priceDifference < 0 ? `Store credit of ₽${Math.abs(priceDifference).toFixed(2)} will be issued to customer.` : "No additional payment required - even exchange."}
                    </p>
                    <p className="text-yellow-200 text-xs mt-2 opacity-80">
                      Original sales record will be preserved for audit trail. Sales history will update to reflect replacement and any adjustments.
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
                <DialogFooter className="border-t border-red-800 p-5">
                  <Button
                    onClick={handleAddReturn}
                    disabled={isSaving}
                    className="bg-yellow-400 text-red-900 hover:bg-yellow-500 disabled:opacity-60 font-bold"
                  >
                    {isSaving ? "Processing..." : "✓ Complete Replacement"}
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
            <Table className="w-full min-w-[1280px]">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Return ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Sales ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Customer</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Product Returned</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Qty</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Return Type</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Store Credit</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Additional Pay</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Return Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Sales Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Return Date</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.map((returnItem) => {
                  const firstDetail = returnItem.returnDetails[0];
                  const returnedProduct = firstDetail?.productName ?? "N/A";
                  const returnedQty = returnItem.returnDetails.reduce((sum, detail) => sum + detail.quantity_returned, 0);
                  return (
                  <TableRow key={returnItem.return_id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.display_return_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.display_sales_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.customerName}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnedProduct}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnedQty}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.return_type}</TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap text-center">{formatCurrency(returnItem.total_refund)}</TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap text-center">{formatCurrency(returnItem.additional_payment)}</TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <Badge className="bg-green-600 text-white">{returnItem.return_status}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <Badge className="bg-yellow-500 text-red-950">{returnItem.salesStatus}</Badge>
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
                              <div>
                                <p className="text-sm text-yellow-200">Return Type</p>
                                <p className="text-yellow-300">{returnItem.return_type}</p>
                              </div>
                              <div>
                                <p className="text-sm text-yellow-200">Processed By</p>
                                <p className="text-yellow-300">{returnItem.processedBy}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-sm text-yellow-200 mb-2">Return Details</p>
                              {returnItem.returnDetails.map((detail) => (
                                <div key={detail.return_detail_id} className="bg-red-600 p-3 rounded mb-2">
                                  <p className="text-yellow-300">{detail.productName}</p>
                                  <p className="text-yellow-200 text-xs">
                                    Qty: {detail.quantity_returned} | Refund/Credit: {formatCurrency(detail.refund_amount)}
                                  </p>
                                  <p className="text-yellow-200 text-xs">
                                    Replacement: {detail.replacementProductName} | Inventory: {detail.inventory_action}
                                  </p>
                                  <p className="text-yellow-200 text-xs mt-1">{detail.reason}</p>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <p className="text-sm text-yellow-200">Refund / Credit</p>
                                <p className="text-yellow-300">{formatCurrency(returnItem.total_refund)}</p>
                              </div>
                              <div>
                                <p className="text-sm text-yellow-200">Additional Pay</p>
                                <p className="text-yellow-300">{formatCurrency(returnItem.additional_payment)}</p>
                              </div>
                              <div>
                                <p className="text-sm text-yellow-200">Sales Status</p>
                                <p className="text-yellow-300">{returnItem.salesStatus}</p>
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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

type ReplacementLine = {
  line_id: string;
  sales_detail_id: string;
  returned_product_id: string;
  returned_product_name: string;
  replacement_product_id: string;
  replacement_product_name: string;
  quantity: number;
  returned_price_unit: number;
  replacement_price_unit: number;
  price_difference: number;
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

function isMissingTableError(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("could not find the table") || message.includes("relation") && message.includes("does not exist");
}

async function resolveExistingTableName(candidates: string[]) {
  let lastError: any = null;
  for (const table of candidates) {
    const { error } = await supabase.from(table as any).select("*").limit(1);
    if (!error) return table;
    lastError = error;
    if (!isMissingTableError(error)) throw error;
  }
  if (lastError) throw lastError;
  throw new Error(`Could not resolve any table from: ${candidates.join(", ")}`);
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
  const [isReplacementPickerOpen, setIsReplacementPickerOpen] = useState(false);
  const [selectedReturnedDetailIds, setSelectedReturnedDetailIds] = useState<string[]>([]);
  const [returnedItemQtyByDetail, setReturnedItemQtyByDetail] = useState<Record<string, number>>({});
  const [replacementLines, setReplacementLines] = useState<ReplacementLine[]>([]);

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
        })
        .filter((sale) => sale.details.some((detail: any) => Number(detail.returnable_quantity ?? 0) > 0)),
    [isAdmin, productMap, sales, salesDisplayMap, user?.user_id],
  );

  const selectedSale = salesOptions.find((sale) => sale.sales_id === formData.sales_id);
  const selectedReturnedItems = useMemo(() => {
    const selected = new Set(selectedReturnedDetailIds);
    const details = selectedSale?.details ?? [];
    return details.filter((detail) => selected.has(detail.sales_detail_id));
  }, [selectedReturnedDetailIds, selectedSale?.details]);
  const selectedReturnedItemsWithQty = useMemo(
    () =>
      selectedReturnedItems.map((item) => ({
        ...item,
        selectedQty: Math.min(
          Math.max(1, Number(returnedItemQtyByDetail[item.sales_detail_id] ?? formData.quantity ?? 1)),
          Math.max(1, Number(item.returnable_quantity ?? item.quantity ?? 1)),
        ),
      })),
    [formData.quantity, returnedItemQtyByDetail, selectedReturnedItems],
  );
  const selectedOriginalItem =
    selectedReturnedItems[0] ??
    selectedSale?.details.find((detail) => detail.product_id === formData.returned_product_id);
  const replacementProduct = productMap.get(formData.replacement_product_id);
  const requiresReplacement = formData.return_action === "Replacement" || formData.return_action === "Adjustment";
  const maxReturnQty = Math.max(
    1,
    selectedReturnedItems.length
      ? Math.min(...selectedReturnedItems.map((item) => Number(item.returnable_quantity ?? item.quantity ?? 1)))
      : Number(selectedOriginalItem?.returnable_quantity ?? selectedOriginalItem?.quantity ?? 1),
  );
  const quantity = Math.min(Math.max(1, Number(formData.quantity || 1)), maxReturnQty);
  const originalTotal =
    selectedReturnedItemsWithQty.length > 0
      ? selectedReturnedItemsWithQty.reduce((sum, item) => sum + Number(item.price ?? 0) * Number(item.selectedQty ?? 1), 0)
      : Number(selectedOriginalItem?.price ?? 0) * quantity;
  const replacementTotal =
    selectedReturnedItemsWithQty.length > 0
      ? selectedReturnedItemsWithQty.reduce((sum, item) => sum + Number(replacementProduct?.price ?? 0) * Number(item.selectedQty ?? 1), 0)
      : Number(replacementProduct?.price ?? 0) * quantity;
  const priceDifference = replacementTotal - originalTotal;
  const customerPays = Math.max(0, priceDifference);
  const totalAdditionalPayment = replacementLines.reduce((sum, line) => sum + Math.max(0, line.price_difference), 0);
  const totalCreditIssued = replacementLines.reduce((sum, line) => sum + Math.max(0, -line.price_difference), 0);
  const hasSaleSelected = Boolean(selectedSale);
  const hasReturnedSelected = selectedReturnedItems.length > 0;
  const hasReplacementSelected = Boolean(replacementProduct);
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
    if (saleId !== formData.sales_id) {
      setReplacementLines([]);
      setSelectedReturnedDetailIds([]);
      setReturnedItemQtyByDetail({});
    }
    setFormData({
      ...formData,
      sales_id: saleId,
      returned_product_id: "",
      replacement_product_id: "",
      quantity: 1,
    });
  };

  const toggleReturnedProduct = (salesDetailId: string, productId: string) => {
    setSelectedReturnedDetailIds((prev) => {
      if (prev.includes(salesDetailId)) {
        const next = prev.filter((id) => id !== salesDetailId);
        setReturnedItemQtyByDetail((qtyPrev) => {
          const copy = { ...qtyPrev };
          delete copy[salesDetailId];
          return copy;
        });
        if (next.length === 0) {
          setFormData((current) => ({ ...current, returned_product_id: "" }));
        }
        return next;
      }
      setFormData((current) => ({ ...current, returned_product_id: productId }));
      setReturnedItemQtyByDetail((qtyPrev) => ({ ...qtyPrev, [salesDetailId]: Number(formData.quantity || 1) }));
      return [...prev, salesDetailId];
    });
  };

  const selectReplacementProduct = (productId: string) => {
    setFormData((current) => ({ ...current, replacement_product_id: productId }));
    setIsReplacementPickerOpen(false);
  };

  const addReplacementLine = () => {
    if (!selectedSale || selectedReturnedItemsWithQty.length === 0 || !replacementProduct) {
      toast.error("Select sale, returned item(s), and replacement item first");
      return;
    }
    const duplicate = selectedReturnedItemsWithQty.find((item) =>
      replacementLines.some((line) => line.sales_detail_id === item.sales_detail_id),
    );
    if (duplicate) {
      toast.error(`${duplicate.productName} is already in the replacement list`);
      return;
    }
    const invalidQty = selectedReturnedItemsWithQty.find((item) => Number(item.selectedQty ?? 1) > Number(item.returnable_quantity ?? 0));
    if (invalidQty) {
      toast.error(`Only ${invalidQty.returnable_quantity} unit(s) can be returned from ${invalidQty.productName}`);
      return;
    }
    const stockNeeded = selectedReturnedItemsWithQty.reduce((sum, item) => sum + Number(item.selectedQty ?? 1), 0);
    if (replacementProduct.stock < stockNeeded) {
      toast.error(`Only ${replacementProduct.stock} replacement unit(s) available, but ${stockNeeded} needed`);
      return;
    }

    setReplacementLines((prev) => {
      const additions = selectedReturnedItemsWithQty.map((item) => {
        const lineQty = Number(item.selectedQty ?? 1);
        const originalLineTotal = Number(item.price ?? 0) * lineQty;
        const replacementLineTotal = Number(replacementProduct.price ?? 0) * lineQty;
        return {
          line_id: buildClientId(),
          sales_detail_id: item.sales_detail_id,
          returned_product_id: item.product_id,
          returned_product_name: item.productName,
          replacement_product_id: replacementProduct.product_id,
          replacement_product_name: replacementProduct.name,
          quantity: lineQty,
          returned_price_unit: Number(item.price ?? 0),
          replacement_price_unit: Number(replacementProduct.price ?? 0),
          price_difference: replacementLineTotal - originalLineTotal,
          inventory_action: formData.inventory_action,
        };
      });
      return [...prev, ...additions];
    });

    setFormData((prev) => ({
      ...prev,
      returned_product_id: "",
      replacement_product_id: "",
      quantity: 1,
    }));
    setSelectedReturnedDetailIds([]);
    setReturnedItemQtyByDetail({});
  };

  const removeReplacementLine = (lineId: string) => {
    setReplacementLines((prev) => prev.filter((line) => line.line_id !== lineId));
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
    const normalized = String(transactionType ?? "").trim().toLowerCase();
    const dbTransactionType =
      normalized === "return" || normalized === "restock" || normalized === "sale" || normalized === "adjustment"
        ? normalized
        : "adjustment";
    await tryInsertRow("inventory_log", [
      {
        inventory_log_id: buildClientId(),
        product_id: productId,
        quantity_change: quantityChange,
        transaction_type: dbTransactionType,
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
    if (!selectedSale) {
      toast.error("Please select the original sale");
      return;
    }
    if (replacementLines.length === 0) {
      toast.error("Add at least one replacement line");
      return;
    }
    if (!formData.reason.trim()) {
      toast.error("Please add a return reason");
      return;
    }

    try {
      setIsSaving(true);
      const saleDetailById = new Map((selectedSale.details ?? []).map((detail: any) => [detail.sales_detail_id, detail]));
      const returnedQtyIncrementByDetail = new Map<string, number>();
      const replacementStockUsed = new Map<string, number>();

      for (const line of replacementLines) {
        const saleDetail = saleDetailById.get(line.sales_detail_id);
        if (!saleDetail) {
          throw new Error(`Unable to find sale detail for ${line.returned_product_name}`);
        }
        const alreadyQueued = returnedQtyIncrementByDetail.get(line.sales_detail_id) ?? 0;
        const maxQty = Number(saleDetail.returnable_quantity ?? saleDetail.quantity ?? 0);
        if (line.quantity + alreadyQueued > maxQty) {
          throw new Error(`Return quantity exceeded for ${line.returned_product_name}`);
        }
        returnedQtyIncrementByDetail.set(line.sales_detail_id, alreadyQueued + line.quantity);

        const usedStock = replacementStockUsed.get(line.replacement_product_id) ?? 0;
        const replacementInfo = productMap.get(line.replacement_product_id);
        const availableStock = Number(replacementInfo?.stock ?? 0);
        if (usedStock + line.quantity > availableStock) {
          throw new Error(`Not enough stock for ${line.replacement_product_name}`);
        }
        replacementStockUsed.set(line.replacement_product_id, usedStock + line.quantity);
      }

      for (const line of replacementLines) {
        const returnId = buildClientId();
        const saleDetail = saleDetailById.get(line.sales_detail_id);
        if (!saleDetail) continue;

        const additionalPayment = Math.max(0, line.price_difference);
        const creditIssued = Math.max(0, -line.price_difference);
        const adjustedTotal = Math.max(0, Number(selectedSale.total_amount ?? 0) + additionalPayment);
        const replacementNote = [
          "Replacement",
          `Returned: ${line.returned_product_name}`,
          `Replacement: ${line.replacement_product_name}`,
          `Rule: ${line.price_difference > 0 ? `Customer adds ${formatCurrency(additionalPayment)}` : line.price_difference < 0 ? `Store credit issued ${formatCurrency(creditIssued)}` : "Even exchange"}`,
          `Mode of payment: ${additionalPayment > 0 ? formData.mode_of_payment : "N/A"}`,
          `Inventory action: ${line.inventory_action}`,
          `Reason: ${formData.reason.trim()}`,
        ].join(" | ");

        await tryInsertRow("returns", [
          {
            return_id: returnId,
            sales_id: selectedSale.sales_id,
            original_sales_id: selectedSale.sales_id,
            user_id: user?.user_id ?? selectedSale.user_id,
            return_date: new Date().toISOString(),
            return_type: "Replacement",
            return_status: "Completed",
            total_refund: creditIssued,
            additional_payment: additionalPayment,
            adjustment_amount: additionalPayment,
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
            product_id: line.returned_product_id,
            quantity_returned: line.quantity,
            reason: replacementNote,
            refund_amount: creditIssued,
            replacement_product_id: line.replacement_product_id,
            replacement_quantity: line.quantity,
            price_difference: line.price_difference,
            returned_product_id: line.returned_product_id,
            returned_quantity: line.quantity,
            returned_price_unit: line.returned_price_unit,
            new_product_id: line.replacement_product_id,
            new_quantity: line.quantity,
            new_price_unit: line.replacement_price_unit,
            net_difference: line.price_difference,
            inventory_action: line.inventory_action,
          },
          {
            return_detail_id: buildClientId(),
            return_id: returnId,
            product_id: line.returned_product_id,
            quantity_returned: line.quantity,
            reason: replacementNote,
            refund_amount: creditIssued,
          },
        ]);

        const nextReturnedQty = Number(saleDetail.returned_quantity ?? 0) + line.quantity;
        const isFullyReturnedItem = nextReturnedQty >= Number(saleDetail.quantity ?? 0);
        try {
          await tryUpdateById("sales_details", "sales_detail_id", line.sales_detail_id, [
            {
              returned_quantity: nextReturnedQty,
              replacement_product_id: line.replacement_product_id,
              item_status: isFullyReturnedItem ? "Replaced" : "Partially Returned",
            },
          ]);
        } catch {
          // Older schemas may not have return-tracking columns on sales_details yet.
        }

        if (line.inventory_action === "Return to Stock") {
          await updateInventoryStock(line.returned_product_id, line.quantity);
          await createInventoryLog(line.returned_product_id, line.quantity, "return", returnId);
        }
        await updateInventoryStock(line.replacement_product_id, -line.quantity);
        await createInventoryLog(line.replacement_product_id, -line.quantity, "adjustment", returnId);
      }

      await tryUpdateById("sales_transaction", "sales_id", selectedSale.sales_id, [
        {
          original_total_amount: Number(selectedSale.total_amount ?? 0),
          adjusted_total_amount: Math.max(0, Number(selectedSale.total_amount ?? 0) + totalAdditionalPayment),
          total_amount: Math.max(0, Number(selectedSale.total_amount ?? 0) + totalAdditionalPayment),
          sales_status: "Adjusted",
          return_status: "Completed",
          updated_at: new Date().toISOString(),
        },
        {
          total_amount: Math.max(0, Number(selectedSale.total_amount ?? 0) + totalAdditionalPayment),
          updated_at: new Date().toISOString(),
        },
      ]);

      await recordAdditionalPayment(selectedSale.sales_id, totalAdditionalPayment);

      if (totalCreditIssued > 0 && selectedSale.customer_id) {
        const creditTable = await resolveExistingTableName(["customer_credits", "customer_credit"]);
        const creditTxnTable = await resolveExistingTableName(["customer_credit_transactions", "customer_credit_transaction"]);
        const customerId = String(selectedSale.customer_id);
        const { data: existingCredit, error: creditFetchError } = await supabase
          .from(creditTable as any)
          .select("customer_credit_id, total_issued, total_used, available_credit")
          .eq("customer_id", customerId)
          .maybeSingle();
        if (creditFetchError) throw creditFetchError;

        if (existingCredit?.customer_credit_id) {
          const nextTotalIssued = Number(existingCredit.total_issued ?? 0) + totalCreditIssued;
          const nextAvailableCredit = Number(existingCredit.available_credit ?? 0) + totalCreditIssued;
          const { error: updateCreditError } = await supabase
            .from(creditTable as any)
            .update({
              total_issued: nextTotalIssued,
              available_credit: nextAvailableCredit,
              updated_at: new Date().toISOString(),
            })
            .eq("customer_credit_id", existingCredit.customer_credit_id);
          if (updateCreditError) throw updateCreditError;
        } else {
          const { error: insertCreditError } = await supabase.from(creditTable as any).insert({
            customer_credit_id: buildClientId(),
            customer_id: customerId,
            total_issued: totalCreditIssued,
            total_used: 0,
            available_credit: totalCreditIssued,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          if (insertCreditError) throw insertCreditError;
        }

        const { error: creditTxnError } = await supabase.from(creditTxnTable as any).insert({
          customer_credit_txn_id: buildClientId(),
          customer_id: customerId,
          return_id: null,
          txn_type: "issue",
          amount: totalCreditIssued,
          notes: `Replacement credit batch issued for ${selectedSale.sales_id}`,
          created_at: new Date().toISOString(),
        });
        if (creditTxnError) throw creditTxnError;
      }

      await queryClient.invalidateQueries({ queryKey: ["returns"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setIsAddDialogOpen(false);
      setFormData(defaultForm);
      setReplacementLines([]);
      toast.success(`${replacementLines.length} replacement item(s) recorded successfully.`);
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
              <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 !w-[94vw] !max-w-[1050px] max-h-[88vh] overflow-hidden p-0 shadow-2xl">
                <div className="border-b border-zinc-800 p-5 bg-zinc-900">
                  <DialogHeader>
                    <DialogTitle className="text-yellow-300 flex items-center gap-2">
                      <ArrowRightLeft className="w-5 h-5" />
                      Process Item Replacement
                    </DialogTitle>
                  </DialogHeader>
                </div>
                <div className="grid max-h-[70vh] gap-5 overflow-y-auto overflow-x-hidden p-5 scrollbar-hide">
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-zinc-100">Current Selection</p>
                      <Badge className="bg-yellow-400 text-red-900">{replacementLines.length} line(s) added</Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                      <div className={`rounded-lg border p-2 ${hasSaleSelected ? "border-emerald-600 bg-emerald-900/20" : "border-zinc-700 bg-zinc-950"}`}>
                        <p className="text-[11px] text-zinc-400">1. Sale</p>
                        <p className="text-sm text-zinc-100">{selectedSale?.display_sales_id ?? "Not selected"}</p>
                      </div>
                      <div className={`rounded-lg border p-2 ${hasReturnedSelected ? "border-emerald-600 bg-emerald-900/20" : "border-zinc-700 bg-zinc-950"}`}>
                        <p className="text-[11px] text-zinc-400">2. Returned Item</p>
                        <p className="text-sm text-zinc-100">{selectedOriginalItem?.productName ?? "Not selected"}</p>
                      </div>
                      <div className={`rounded-lg border p-2 ${hasReplacementSelected ? "border-emerald-600 bg-emerald-900/20" : "border-zinc-700 bg-zinc-950"}`}>
                        <p className="text-[11px] text-zinc-400">3. Replacement</p>
                        <p className="text-sm text-zinc-100">{replacementProduct?.name ?? "Not selected"}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-2">
                        <p className="text-[11px] text-zinc-400">4. Difference</p>
                        <p className={`text-sm ${priceDifference > 0 ? "text-orange-300" : priceDifference < 0 ? "text-cyan-300" : "text-zinc-100"}`}>
                          {formatCurrency(priceDifference)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-yellow-300">Step 1: Original Sale *</Label>
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
                              <TableRow key={sale.sales_id} className={`border-red-800 transition-colors hover:bg-red-800/60 ${formData.sales_id === sale.sales_id ? "bg-yellow-400/10" : ""}`}>
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
                                    {formData.sales_id === sale.sales_id ? "Selected" : "Select"}
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
                      <Label className="text-yellow-300">Mode of Payment</Label>
                      <Select
                        value={formData.mode_of_payment}
                        onValueChange={(value) =>
                          setFormData({ ...formData, mode_of_payment: value as ExchangeForm["mode_of_payment"] })
                        }
                        disabled={customerPays <= 0 && totalAdditionalPayment <= 0}
                      >
                        <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                          <SelectValue placeholder={customerPays > 0 || totalAdditionalPayment > 0 ? "Select mode of payment" : "Not needed for this replacement"} />
                        </SelectTrigger>
                        <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="gcash">GCash</SelectItem>
                        </SelectContent>
                      </Select>
                      {customerPays <= 0 && totalAdditionalPayment <= 0 && <p className="text-xs text-yellow-300">No payment required unless replacement value is higher.</p>}
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-xl border border-red-800 p-3">
                    <div>
                      <p className="text-xs text-yellow-300">Selected Sale</p>
                      <p className="text-sm text-yellow-200">{selectedSale?.display_sales_id ?? "Not selected"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-yellow-300">Returned Item</p>
                      <p className="text-sm text-yellow-200">
                        {selectedReturnedItems.length
                          ? `${selectedReturnedItems.length} item(s) selected`
                          : "Not selected"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-yellow-300">Replacement Item</p>
                      <p className="text-sm text-yellow-200">{replacementProduct?.name ?? "Not selected"}</p>
                    </div>
                  </div>

                  <div className={`space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 ${!hasSaleSelected ? "opacity-50" : ""}`}>
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <Label className="text-yellow-300">Step 2: Select Returned Product</Label>
                        <div className="relative md:w-80">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                          <Input
                            value={returnedItemSearch}
                            onChange={(event) => setReturnedItemSearch(event.target.value)}
                            placeholder="Search purchased product..."
                            className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50 focus-visible:ring-yellow-400"
                            disabled={!hasSaleSelected}
                          />
                        </div>
                      </div>
                      {!hasSaleSelected && <p className="text-xs text-zinc-300">Select a sale first to show purchased items.</p>}
                      <div className="border border-zinc-800 rounded-xl overflow-y-auto overflow-x-auto max-h-48">
                        <Table className="w-full text-sm">
                          <TableHeader>
                            <TableRow className="bg-zinc-900 hover:bg-zinc-900 border-zinc-800">
                              <TableHead className="text-yellow-300 text-center">SKU</TableHead>
                              <TableHead className="text-yellow-300 text-center">Product</TableHead>
                              <TableHead className="text-yellow-300 text-center">Sold</TableHead>
                              <TableHead className="text-yellow-300 text-center">Returnable</TableHead>
                              <TableHead className="text-yellow-300 text-center">Return Qty</TableHead>
                              <TableHead className="text-yellow-300 text-center">Price</TableHead>
                              <TableHead className="text-yellow-300 text-center">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredReturnedItems.map((detail: any) => {
                              const isSelected = selectedReturnedDetailIds.includes(detail.sales_detail_id);
                              const rowQty = Math.min(
                                Math.max(1, Number(returnedItemQtyByDetail[detail.sales_detail_id] ?? formData.quantity ?? 1)),
                                Math.max(1, Number(detail.returnable_quantity ?? detail.quantity ?? 1)),
                              );
                              return (
                              <TableRow key={`${detail.sales_detail_id}-${detail.product_id}`} className={`border-zinc-800 transition-colors hover:bg-zinc-900 ${isSelected ? "bg-yellow-400/10" : ""}`}>
                                <TableCell className="truncate text-yellow-200 text-center" title={detail.product_id}>{detail.product_id.slice(0, 8)}</TableCell>
                                <TableCell className="truncate text-yellow-200 text-center" title={detail.productName}>{detail.productName}</TableCell>
                                <TableCell className="text-yellow-200 text-center">{detail.quantity}</TableCell>
                                <TableCell className="text-yellow-200 text-center">{detail.returnable_quantity}</TableCell>
                                <TableCell className="text-center">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={Math.max(1, Number(detail.returnable_quantity ?? 1))}
                                    value={rowQty}
                                    disabled={!isSelected}
                                    onChange={(event) => {
                                      const raw = Number(event.target.value || 1);
                                      const nextQty = Math.min(
                                        Math.max(1, raw),
                                        Math.max(1, Number(detail.returnable_quantity ?? detail.quantity ?? 1)),
                                      );
                                      setReturnedItemQtyByDetail((prev) => ({
                                        ...prev,
                                        [detail.sales_detail_id]: nextQty,
                                      }));
                                    }}
                                    className="mx-auto h-8 w-20 bg-zinc-900 border-zinc-700 text-yellow-200 text-center disabled:opacity-50"
                                  />
                                </TableCell>
                                <TableCell className="truncate text-yellow-300 text-center">{formatCurrency(detail.price)}</TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    size="sm"
                                    disabled={Number(detail.returnable_quantity ?? 0) <= 0}
                                    onClick={() => toggleReturnedProduct(detail.sales_detail_id, detail.product_id)}
                                    className="h-8 rounded-full bg-yellow-400 px-4 text-red-900 hover:bg-yellow-500 disabled:opacity-50"
                                  >
                                    {isSelected ? "Selected" : "Select"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )})}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                  {requiresReplacement && (
                    <div className={`space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 ${!hasReturnedSelected ? "opacity-50" : ""}`}>
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <Label className="text-yellow-300">Step 3: Select Replacement Product</Label>
                        <Dialog open={isReplacementPickerOpen} onOpenChange={setIsReplacementPickerOpen}>
                          <DialogTrigger asChild>
                            <Button
                              type="button"
                              disabled={!hasReturnedSelected}
                              className="bg-yellow-400 text-red-900 hover:bg-yellow-500 disabled:opacity-50"
                            >
                              {replacementProduct ? "Change Replacement Product" : "Choose Replacement Product"}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 !w-[92vw] !max-w-[980px] max-h-[84vh] overflow-hidden p-0">
                            <div className="border-b border-zinc-800 p-4">
                              <DialogHeader>
                                <DialogTitle className="text-yellow-300">Select Replacement Product</DialogTitle>
                              </DialogHeader>
                            </div>
                            <div className="max-h-[66vh] overflow-y-auto p-4 space-y-3">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                                <Input
                                  value={replacementSearch}
                                  onChange={(event) => setReplacementSearch(event.target.value)}
                                  placeholder="Search replacement by SKU, name, brand..."
                                  className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
                                />
                              </div>
                              <div className="border border-zinc-800 rounded-xl overflow-y-auto overflow-x-auto max-h-[48vh]">
                                <Table className="w-full text-sm">
                                  <TableHeader>
                                    <TableRow className="bg-zinc-900 hover:bg-zinc-900 border-zinc-800">
                                      <TableHead className="text-yellow-300 text-center">Product</TableHead>
                                      <TableHead className="text-yellow-300 text-center">Brand</TableHead>
                                      <TableHead className="text-yellow-300 text-center">Variant</TableHead>
                                      <TableHead className="text-yellow-300 text-center">Price</TableHead>
                                      <TableHead className="text-yellow-300 text-center">Stock</TableHead>
                                      <TableHead className="text-yellow-300 text-center">Action</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {filteredReplacementProducts.map((product) => (
                                      <TableRow key={product.product_id} className={`border-zinc-800 transition-colors hover:bg-zinc-900 ${formData.replacement_product_id === product.product_id ? "bg-yellow-400/10" : ""}`}>
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
                                            onClick={() => selectReplacementProduct(product.product_id)}
                                            className="h-8 rounded-full bg-yellow-400 px-4 text-red-900 hover:bg-yellow-500"
                                          >
                                            {formData.replacement_product_id === product.product_id ? "Selected" : "Select"}
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      {!hasReturnedSelected && <p className="text-xs text-zinc-300">Select the returned product first.</p>}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                        <p className="text-xs text-yellow-300">Selected Replacement Product</p>
                        <p className="text-sm text-yellow-200">
                          {replacementProduct
                            ? `${replacementProduct.name} (${formatCurrency(replacementProduct.price)})`
                            : "No replacement product selected yet"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 rounded-xl border border-red-800 p-3">
                    <Label className="text-yellow-300">Replacement List ({replacementLines.length})</Label>
                    <div className="border border-red-800 rounded-lg overflow-x-auto">
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                            <TableHead className="text-yellow-300 text-center">Returned</TableHead>
                            <TableHead className="text-yellow-300 text-center">Replacement</TableHead>
                            <TableHead className="text-yellow-300 text-center">Qty</TableHead>
                            <TableHead className="text-yellow-300 text-center">Difference</TableHead>
                            <TableHead className="text-yellow-300 text-center">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {replacementLines.length === 0 ? (
                            <TableRow className="border-red-800">
                              <TableCell colSpan={5} className="text-center text-yellow-200 py-3">No items added yet</TableCell>
                            </TableRow>
                          ) : (
                            replacementLines.map((line) => (
                              <TableRow key={line.line_id} className="border-red-800">
                                <TableCell className="text-yellow-200 text-center">{line.returned_product_name}</TableCell>
                                <TableCell className="text-yellow-200 text-center">{line.replacement_product_name}</TableCell>
                                <TableCell className="text-yellow-200 text-center">{line.quantity}</TableCell>
                                <TableCell className="text-yellow-300 text-center">{formatCurrency(line.price_difference)}</TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="text-yellow-300 hover:text-yellow-200 hover:bg-red-700"
                                    onClick={() => removeReplacementLine(line.line_id)}
                                  >
                                    Remove
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-yellow-300">Step 4: Quantity</Label>
                      <Input
                        type="number"
                        min={1}
                        max={maxReturnQty}
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value || 1) })}
                        className="bg-red-600 border-red-800 text-yellow-200"
                      />
                      {selectedReturnedItems.length > 1 && (
                        <p className="text-xs text-yellow-300">Tip: Set exact qty per selected item in Step 2 (Return Qty column).</p>
                      )}
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

                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <p className="text-zinc-200 text-sm">
                      Added payment total: {formatCurrency(totalAdditionalPayment)} | Store credit total: {formatCurrency(totalCreditIssued)}
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

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={addReplacementLine}
                      disabled={!hasReturnedSelected || !replacementProduct}
                      className="bg-yellow-400 text-red-900 hover:bg-yellow-500"
                    >
                      Add Item to Replacement List
                    </Button>
                  </div>
                </div>
                <DialogFooter className="border-t border-red-800 p-5">
                  <Button
                    onClick={handleAddReturn}
                    disabled={isSaving}
                    className="bg-yellow-400 text-red-900 hover:bg-yellow-500 disabled:opacity-60 font-bold"
                  >
                    {isSaving ? "Processing..." : "Save Replacement to Records"}
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



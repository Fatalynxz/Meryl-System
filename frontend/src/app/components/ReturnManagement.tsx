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
import { FileImage, Minus, Plus, Search, Eye, RotateCcw, AlertTriangle, ArrowRightLeft, Upload, X, Receipt, CheckCircle2, XCircle, AlertCircle, Clock, ShieldCheck, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth-context";
import { useInventory, useProducts, useReturns, useSales } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";

type ReturnDetail = {
  return_detail_id: string;
  product_id: string;
  productName: string;
  productSize: string;
  productColor: string;
  productPrice: number;
  quantity_returned: number;
  reason: string;
  refund_amount: number;
  replacementProductId: string;
  replacementProductName: string;
  replacementProductSize: string;
  replacementProductColor: string;
  replacementProductPrice: number;
  replacementQuantity: number;
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
  staffCode: string;
  salesStatus: string;
  receiptProofName: string;
  receiptProofPath: string;
  receiptProofUrl: string;
  receiptVerifiedAt: string;
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

function QuantityStepper({
  value,
  min = 1,
  max = 999,
  disabled = false,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const clamp = (nextValue: number) => Math.min(Math.max(min, Math.floor(Number(nextValue) || min)), max);

  return (
    <div className="mx-auto flex w-[116px] items-center justify-center rounded-xl border border-yellow-400/25 bg-[#1D1D25] p-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="h-7 w-7 rounded-lg text-yellow-300 hover:bg-yellow-400 hover:text-[#171219] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Input
        type="text"
        inputMode="numeric"
        value={String(value)}
        disabled={disabled}
        onChange={(event) => onChange(clamp(Number(event.target.value.replace(/\D/g, ""))))}
        className="h-7 w-12 border-0 bg-transparent p-0 text-center text-yellow-100 shadow-none focus-visible:ring-0 disabled:opacity-50"
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="h-7 w-7 rounded-lg text-yellow-300 hover:bg-yellow-400 hover:text-[#171219] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

const REPLACEMENT_REASON_OPTIONS = [
  "Wrong size",
  "Damaged item",
  "Defective item",
  "Wrong item received",
  "Customer requested exchange",
  "Customer changed preference",
  "Others",
];

const RECEIPT_PROOF_BUCKET = "return-receipts";

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
  const [reasonOption, setReasonOption] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [receiptProofFile, setReceiptProofFile] = useState<File | null>(null);
  const [receiptProofPreview, setReceiptProofPreview] = useState("");
  const [receiptNumberInput, setReceiptNumberInput] = useState("");
  const [receiptValidationStatus, setReceiptValidationStatus] = useState<{
    state: "idle" | "valid" | "expired_warning" | "already_replaced" | "not_found" | "no_returnable_items";
    message?: string;
    daysAgo?: number;
    purchaseDate?: string;
    customerName?: string;
    totalAmount?: number;
    displayId?: string;
    returnableCount?: number;
  }>({ state: "idle" });
  const [showManualSaleList, setShowManualSaleList] = useState(false);

  const sales = (salesQuery.data as any[]) ?? [];
  const productRows = (productsQuery.data as any[]) ?? [];
  const inventoryRows = (inventoryQuery.data as any[]) ?? [];
  const returnRows = (returnsQuery.data as any[]) ?? [];
  const isAdmin = String(user?.role_name ?? "").trim().toLowerCase().includes("admin");
  const selectedReplacementReason = reasonOption === "Others" ? customReason.trim() : reasonOption.trim();
  const normalizedReplacementReason = selectedReplacementReason.toLowerCase();
  const isUnsellableReason = normalizedReplacementReason.includes("damaged") || normalizedReplacementReason.includes("defective");
  const effectiveInventoryAction: ExchangeForm["inventory_action"] = isUnsellableReason
    ? "Defective / Not Sellable"
    : formData.inventory_action;
  const replacedSalesIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of returnRows) {
      const type = String(row.return_type ?? "Replacement").trim().toLowerCase();
      const status = String(row.return_status ?? "Completed").trim().toLowerCase();
      if (type.includes("replacement") && status !== "cancelled") {
        const saleId = String(row.original_sales_id ?? row.sales_id ?? "");
        if (saleId) ids.add(saleId);
      }
    }
    return ids;
  }, [returnRows]);

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
        const price = Number(inventory?.srp ?? product.price ?? product.cost_price ?? 0);
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
        .filter((sale: any) => !replacedSalesIds.has(String(sale.sales_id ?? "")))
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
    [isAdmin, productMap, replacedSalesIds, sales, salesDisplayMap, user?.user_id],
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
      ? selectedReturnedItemsWithQty.reduce((sum, item) => {
          const sameProduct = productMap.get(item.product_id);
          return sum + Number(sameProduct?.price ?? item.price ?? 0) * Number(item.selectedQty ?? 1);
        }, 0)
      : Number(replacementProduct?.price ?? 0) * quantity;
  const priceDifference = replacementTotal - originalTotal;
  const customerPays = Math.max(0, priceDifference);
  const totalAdditionalPayment = replacementLines.reduce((sum, line) => sum + Math.max(0, line.price_difference), 0);
  const hasSaleSelected = Boolean(selectedSale);
  const hasReturnedSelected = selectedReturnedItems.length > 0;
  const hasReplacementSelected =
    selectedReturnedItemsWithQty.length > 0 &&
    selectedReturnedItemsWithQty.every((item) => Boolean(productMap.get(item.product_id)));
  const eligibleReplacementProducts = useMemo(
    () => {
      const selectedProductIds = new Set(selectedReturnedItemsWithQty.map((item) => item.product_id));
      return products.filter((product) => selectedProductIds.has(product.product_id));
    },
    [products, selectedReturnedItemsWithQty],
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
    // Always reset dependent selection state when switching sale context.
    setReplacementLines([]);
    setSelectedReturnedDetailIds([]);
    setReturnedItemQtyByDetail({});
    setReturnedItemSearch("");
    setReplacementSearch("");
    setFormData((current) => ({
      ...current,
      sales_id: saleId,
      returned_product_id: "",
      replacement_product_id: "",
      quantity: 1,
    }));
    const disp = salesDisplayMap.get(saleId);
    if (disp) {
      setReceiptNumberInput(disp);
    }
  };

  const validateReceiptNumber = (queryToValidate?: string) => {
    const rawQuery = (queryToValidate ?? receiptNumberInput).trim();
    if (!rawQuery) {
      toast.error("Please enter a receipt number to validate.");
      return;
    }

    const q = rawQuery.toLowerCase();

    // 1. Search in all sales
    const matchedSale = sales.find((s: any) => {
      const displayId = (salesDisplayMap.get(String(s.sales_id ?? "")) ?? "").toLowerCase();
      const saleId = String(s.sales_id ?? "").toLowerCase();
      return displayId === q || saleId === q || displayId.includes(q) || saleId.includes(q);
    });

    if (!matchedSale) {
      setReceiptValidationStatus({
        state: "not_found",
        message: `No transaction found matching receipt "${rawQuery}". Please verify the printed receipt.`,
      });
      toast.error(`Receipt "${rawQuery}" not found.`);
      return;
    }

    const saleId = String(matchedSale.sales_id ?? "");
    const displayId = salesDisplayMap.get(saleId) ?? "SALES-000";
    const customer = Array.isArray(matchedSale.customer) ? matchedSale.customer[0] : matchedSale.customer;
    const customerName = customer?.name ?? "Walk-in Customer";
    const totalAmount = Number(matchedSale.total_amount ?? 0);
    const purchaseDate = matchedSale.transaction_date ? formatDate(matchedSale.transaction_date) : "N/A";
    const txnTime = new Date(matchedSale.transaction_date ?? "").getTime();
    const daysAgo = Number.isNaN(txnTime) ? 0 : Math.max(0, Math.floor((Date.now() - txnTime) / (1000 * 60 * 60 * 24)));

    // 2. Check if already replaced
    if (replacedSalesIds.has(saleId)) {
      setReceiptValidationStatus({
        state: "already_replaced",
        displayId,
        customerName,
        totalAmount,
        purchaseDate,
        daysAgo,
        message: `Receipt ${displayId} was already processed for replacement.`,
      });
      toast.error(`Receipt ${displayId} has already been replaced.`);
      return;
    }

    // 3. Check remaining returnable items
    const rawDetails = Array.isArray(matchedSale.sales_details) ? matchedSale.sales_details : [];
    const returnableCount = rawDetails.reduce((acc: number, d: any) => {
      const qty = Number(d.quantity ?? 0);
      const ret = Number(d.returned_quantity ?? 0);
      return acc + Math.max(0, qty - ret);
    }, 0);

    if (returnableCount <= 0) {
      setReceiptValidationStatus({
        state: "no_returnable_items",
        displayId,
        customerName,
        totalAmount,
        purchaseDate,
        daysAgo,
        returnableCount: 0,
        message: `All items on Receipt ${displayId} have already been fully returned or replaced.`,
      });
      toast.error(`No returnable items remaining on Receipt ${displayId}.`);
      return;
    }

    // 4. Check return policy window (standard 7 days)
    const isExpired = daysAgo > 7;
    setReceiptValidationStatus({
      state: isExpired ? "expired_warning" : "valid",
      displayId,
      customerName,
      totalAmount,
      purchaseDate,
      daysAgo,
      returnableCount,
      message: isExpired
        ? `Receipt found, but purchase was ${daysAgo} days ago (exceeds standard 7-day policy).`
        : `Receipt verified! Purchased ${daysAgo === 0 ? "today" : `${daysAgo} day${daysAgo > 1 ? "s" : ""} ago`} • Within 7-day return policy.`,
    });

    // Auto-select this sale for Step 2
    selectSaleForReturn(saleId);
    if (isExpired) {
      toast.warning(`Receipt ${displayId} exceeds 7-day policy (${daysAgo} days ago).`);
    } else {
      toast.success(`Receipt ${displayId} verified successfully!`);
    }
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
        const nextSelectedProductId = selectedSale?.details.find((detail: any) => next.includes(detail.sales_detail_id))?.product_id ?? "";
        if (next.length === 0) {
          setFormData((current) => ({ ...current, returned_product_id: "", replacement_product_id: "" }));
        } else {
          setFormData((current) => ({
            ...current,
            returned_product_id: nextSelectedProductId,
            replacement_product_id: nextSelectedProductId,
          }));
        }
        return next;
      }
      setFormData((current) => ({ ...current, returned_product_id: productId, replacement_product_id: productId }));
      setReturnedItemQtyByDetail((qtyPrev) => ({ ...qtyPrev, [salesDetailId]: Number(formData.quantity || 1) }));
      return [...prev, salesDetailId];
    });
  };

  const selectReplacementProduct = (productId: string) => {
    if (!selectedReturnedItems.some((item) => item.product_id === productId)) {
      toast.error("Replacement must be the same product as the returned item.");
      return;
    }
    setFormData((current) => ({ ...current, replacement_product_id: productId }));
    setIsReplacementPickerOpen(false);
  };

  const addReplacementLine = () => {
    if (!selectedSale || selectedReturnedItemsWithQty.length === 0 || !hasReplacementSelected) {
      toast.error("Select sale and replaced item(s) first");
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
    const stockNeededByProduct = selectedReturnedItemsWithQty.reduce((map, item) => {
      const productId = String(item.product_id ?? "");
      map.set(productId, (map.get(productId) ?? 0) + Number(item.selectedQty ?? 1));
      return map;
    }, new Map<string, number>());
    for (const [productId, stockNeeded] of stockNeededByProduct) {
      const sameProduct = productMap.get(productId);
      if (!sameProduct || sameProduct.stock < stockNeeded) {
        toast.error(`Only ${sameProduct?.stock ?? 0} replacement unit(s) available for ${sameProduct?.name ?? "this product"}, but ${stockNeeded} needed`);
        return;
      }
    }

    setReplacementLines((prev) => {
      const additions = selectedReturnedItemsWithQty.map((item) => {
        const sameProduct = productMap.get(item.product_id)!;
        const lineQty = Number(item.selectedQty ?? 1);
        const originalLineTotal = Number(item.price ?? 0) * lineQty;
        const replacementLineTotal = Number(sameProduct.price ?? 0) * lineQty;
        return {
          line_id: buildClientId(),
          sales_detail_id: item.sales_detail_id,
          returned_product_id: item.product_id,
          returned_product_name: item.productName,
          replacement_product_id: sameProduct.product_id,
          replacement_product_name: sameProduct.name,
          quantity: lineQty,
          returned_price_unit: Number(item.price ?? 0),
          replacement_price_unit: Number(sameProduct.price ?? 0),
          price_difference: replacementLineTotal - originalLineTotal,
          inventory_action: effectiveInventoryAction,
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
      returnDisplayMap.set(String(row.return_id ?? ""), formatSequence("REP", index + 1));
    });

    return returnRows.map((row: any) => {
      const sale = Array.isArray(row.sales_transaction) ? row.sales_transaction[0] : row.sales_transaction;
      const customer = Array.isArray(sale?.customer) ? sale.customer[0] : sale?.customer;
      const processedUser = Array.isArray(row.user) ? row.user[0] : row.user;
      const details = Array.isArray(row.return_details) ? row.return_details : [];
      const paymentFromDetails = details.reduce((sum: number, detail: any) => {
        const product = Array.isArray(detail.product) ? detail.product[0] : detail.product;
        const replacementJoin = Array.isArray(detail.replacement_product) ? detail.replacement_product[0] : detail.replacement_product;
        const newProductJoin = Array.isArray(detail.new_product) ? detail.new_product[0] : detail.new_product;
        const replacementNameFromNote = extractReplacementName(String(detail.reason ?? ""));
        const returnedFallback = productMap.get(String(detail.returned_product_id ?? detail.product_id ?? ""));
        const replacementFallback =
          productMap.get(String(detail.replacement_product_id ?? detail.new_product_id ?? "")) ??
          [...productMap.values()].find((item) => normalizeProductName(item.name) === normalizeProductName(replacementNameFromNote));
        const replacement = replacementJoin ?? newProductJoin;
        const returnedInventory = Array.isArray(product?.inventory) ? product.inventory[0] : product?.inventory;
        const replacementInventory = Array.isArray(replacement?.inventory) ? replacement.inventory[0] : replacement?.inventory;
        const returnedPrice = Number(detail.returned_price_unit ?? returnedInventory?.srp ?? product?.price ?? product?.cost_price ?? returnedFallback?.price ?? 0);
        const replacementPrice = Number(detail.new_price_unit ?? replacementInventory?.srp ?? replacement?.price ?? replacement?.cost_price ?? replacementFallback?.price ?? 0);
        const returnedQty = Number(detail.returned_quantity ?? detail.quantity_returned ?? 0);
        const replacementQty = Number(detail.new_quantity ?? detail.replacement_quantity ?? detail.quantity_returned ?? 0);
        const storedDifference = Number(detail.net_difference ?? detail.price_difference ?? 0);
        const computedDifference = (replacementPrice * replacementQty) - (returnedPrice * returnedQty);
        const byDiff = Math.max(0, storedDifference !== 0 ? storedDifference : computedDifference);
        if (byDiff > 0) return sum + byDiff;
        return sum + extractPesoAmount(String(detail?.reason ?? ""));
      }, 0);
      const rowAdditionalPayment = Number(row.additional_payment ?? row.total_replacement_payments ?? 0);
      return {
        return_id: String(row.return_id ?? ""),
        display_return_id: returnDisplayMap.get(String(row.return_id ?? "")) ?? "REP-000",
        sales_id: String(row.sales_id ?? ""),
        display_sales_id: salesDisplayMap.get(String(row.sales_id ?? "")) ?? "SALES-000",
        user_id: String(row.user_id ?? sale?.user_id ?? ""),
        customerName: customer?.name ?? "Walk-in Customer",
        return_date: formatDate(row.return_date ?? row.created_at),
        total_refund: Number(row.total_refund ?? 0),
        return_type: String(row.return_type ?? "Replacement"),
        return_status: String(row.return_status ?? "Completed"),
        additional_payment: paymentFromDetails > 0 ? paymentFromDetails : rowAdditionalPayment,
        adjustment_amount: Number(row.adjustment_amount ?? 0),
        processedBy: processedUser?.name ?? processedUser?.username ?? "Staff",
        staffCode: String(processedUser?.staff_code ?? processedUser?.staffCode ?? "N/A"),
        salesStatus: normalizeSaleStatus(sale?.sales_status ?? sale?.status),
        receiptProofName: String(row.receipt_proof_name ?? ""),
        receiptProofPath: String(row.receipt_proof_path ?? ""),
        receiptProofUrl: String(row.receipt_proof_url ?? ""),
        receiptVerifiedAt: formatDate(row.receipt_verified_at),
        returnDetails: details.map((detail: any) => {
          const product = Array.isArray(detail.product) ? detail.product[0] : detail.product;
          const replacementJoin = Array.isArray(detail.replacement_product) ? detail.replacement_product[0] : detail.replacement_product;
          const newProductJoin = Array.isArray(detail.new_product) ? detail.new_product[0] : detail.new_product;
          const returnedFallback = productMap.get(String(detail.returned_product_id ?? detail.product_id ?? ""));
          const replacementNameFromNote = extractReplacementName(String(detail.reason ?? ""));
          const replacementFallback =
            productMap.get(String(detail.replacement_product_id ?? detail.new_product_id ?? "")) ??
            [...productMap.values()].find((product) => normalizeProductName(product.name) === normalizeProductName(replacementNameFromNote));
          const replacement = replacementJoin ?? newProductJoin;
          const returnedInventory = Array.isArray(product?.inventory) ? product.inventory[0] : product?.inventory;
          const replacementInventory = Array.isArray(replacement?.inventory) ? replacement.inventory[0] : replacement?.inventory;
          const returnedPrice = Number(detail.returned_price_unit ?? returnedInventory?.srp ?? product?.price ?? product?.cost_price ?? returnedFallback?.price ?? 0);
          const replacementPrice = Number(detail.new_price_unit ?? replacementInventory?.srp ?? replacement?.price ?? replacement?.cost_price ?? replacementFallback?.price ?? 0);
          const returnedQty = Number(detail.returned_quantity ?? detail.quantity_returned ?? 0);
          const replacementQty = Number(detail.new_quantity ?? detail.replacement_quantity ?? detail.quantity_returned ?? 0);
          const storedDifference = Number(detail.net_difference ?? detail.price_difference ?? 0);
          const computedDifference = (replacementPrice * replacementQty) - (returnedPrice * returnedQty);
          return {
            return_detail_id: String(detail.return_detail_id ?? ""),
            product_id: String(detail.product_id ?? ""),
            productName: product?.product_name ?? returnedFallback?.name ?? "N/A",
            productSize: String(product?.size ?? returnedFallback?.size ?? "N/A"),
            productColor: String(product?.color ?? returnedFallback?.color ?? "N/A"),
            productPrice: returnedPrice,
            quantity_returned: returnedQty,
            reason: String(detail.reason ?? ""),
            refund_amount: Number(detail.refund_amount ?? 0),
            replacementProductId: String(detail.replacement_product_id ?? detail.new_product_id ?? ""),
            replacementProductName: replacement?.product_name ?? replacementFallback?.name ?? "N/A",
            replacementProductSize: String(replacement?.size ?? replacementFallback?.size ?? "N/A"),
            replacementProductColor: String(replacement?.color ?? replacementFallback?.color ?? "N/A"),
            replacementProductPrice: replacementPrice,
            replacementQuantity: replacementQty,
            price_difference: storedDifference !== 0 ? storedDifference : computedDifference,
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

  const handleReceiptProofChange = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Upload a receipt photo or image file.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast.error("Receipt photo must be 6MB or smaller.");
      return;
    }
    setReceiptProofFile(file);
    const reader = new FileReader();
    reader.onload = () => setReceiptProofPreview(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const clearReceiptProof = () => {
    setReceiptProofFile(null);
    setReceiptProofPreview("");
  };

  const uploadReceiptProof = async (returnId: string) => {
    if (!receiptProofFile) throw new Error("Upload a printed receipt photo before finalizing the replacement.");
    const extension = receiptProofFile.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
    const proofPath = `${returnId}/${Date.now()}-${buildClientId()}.${extension}`;
    const { error } = await supabase.storage
      .from(RECEIPT_PROOF_BUCKET)
      .upload(proofPath, receiptProofFile, {
        cacheControl: "3600",
        contentType: receiptProofFile.type || "image/jpeg",
        upsert: false,
      });
    if (error) {
      throw new Error("Receipt proof upload failed. Run the return receipt proof migration, then try again.");
    }
    const { data } = supabase.storage.from(RECEIPT_PROOF_BUCKET).getPublicUrl(proofPath);
    return {
      receiptProofName: receiptProofFile.name,
      receiptProofPath: proofPath,
      receiptProofUrl: data.publicUrl ?? "",
      receiptVerifiedAt: new Date().toISOString(),
    };
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
    if (!selectedReplacementReason) {
      toast.error("Please add a replacement reason");
      return;
    }
    if (!receiptProofFile) {
      toast.error("Upload the customer's printed receipt photo before finalizing.");
      return;
    }
    if (replacedSalesIds.has(selectedSale.sales_id)) {
      toast.error("This sales transaction already has a recorded replacement. Only one replacement is allowed per sale.");
      return;
    }

    try {
      setIsSaving(true);
      const saleDetailById = new Map((selectedSale.details ?? []).map((detail: any) => [detail.sales_detail_id, detail]));
      const returnedQtyIncrementByDetail = new Map<string, number>();
      const replacementStockUsed = new Map<string, number>();

      for (const line of replacementLines) {
        if (line.replacement_product_id !== line.returned_product_id) {
          throw new Error("Replacement must use the same product as the returned item.");
        }
        const saleDetail = saleDetailById.get(line.sales_detail_id);
        if (!saleDetail) {
          throw new Error(`Unable to find sale detail for ${line.returned_product_name}`);
        }
        const alreadyQueued = returnedQtyIncrementByDetail.get(line.sales_detail_id) ?? 0;
        const maxQty = Number(saleDetail.returnable_quantity ?? saleDetail.quantity ?? 0);
        if (line.quantity + alreadyQueued > maxQty) {
          throw new Error(`Replacement quantity exceeded for ${line.returned_product_name}`);
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

      const returnId = buildClientId();
      const receiptProof = await uploadReceiptProof(returnId);
      const adjustedTotal = Math.max(0, Number(selectedSale.total_amount ?? 0) + totalAdditionalPayment);
      const replacementSummary = [
        "Replacement",
        `Lines: ${replacementLines.length}`,
        `Additional payment: ${formatCurrency(totalAdditionalPayment)}`,
        `Receipt proof: ${receiptProof.receiptProofName}`,
        "No refund/store credit. Replacement only.",
        `Mode of payment: ${totalAdditionalPayment > 0 ? formData.mode_of_payment : "N/A"}`,
        `Reason: ${selectedReplacementReason}`,
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
          total_refund: 0,
          additional_payment: totalAdditionalPayment,
          adjustment_amount: totalAdditionalPayment,
          mode_of_payment: totalAdditionalPayment > 0 ? formData.mode_of_payment : null,
          payment_date: totalAdditionalPayment > 0 ? new Date().toISOString() : null,
          fulfilled_date: new Date().toISOString(),
          replacement_count: replacementLines.length,
          total_replacement_payments: totalAdditionalPayment,
          total_credits_issued: 0,
          net_amount: adjustedTotal,
          last_activity_date: new Date().toISOString(),
          receipt_proof_name: receiptProof.receiptProofName,
          receipt_proof_path: receiptProof.receiptProofPath,
          receipt_proof_url: receiptProof.receiptProofUrl,
          receipt_verified_at: receiptProof.receiptVerifiedAt,
          remarks: replacementSummary,
        },
        {
          return_id: returnId,
          sales_id: selectedSale.sales_id,
          user_id: user?.user_id ?? selectedSale.user_id,
          return_date: new Date().toISOString(),
          total_refund: 0,
        },
      ]);

      for (const line of replacementLines) {
        const saleDetail = saleDetailById.get(line.sales_detail_id);
        if (!saleDetail) continue;
        const effectiveLineInventoryAction = isUnsellableReason
          ? "Defective / Not Sellable"
          : line.inventory_action;

        const additionalPayment = Math.max(0, line.price_difference);
        const replacementNote = [
          "Replacement",
          `Replaced: ${line.returned_product_name}`,
          `Replacement: ${line.replacement_product_name}`,
          `Rule: ${line.price_difference > 0 ? `Customer adds ${formatCurrency(additionalPayment)}` : "No refund/store credit. Replacement only."}`,
          `Mode of payment: ${additionalPayment > 0 ? formData.mode_of_payment : "N/A"}`,
          `Inventory action: ${effectiveLineInventoryAction}`,
          `Reason: ${selectedReplacementReason}`,
        ].join(" | ");

        await tryInsertRow("return_details", [
          {
            return_detail_id: buildClientId(),
            return_id: returnId,
            product_id: line.returned_product_id,
            quantity_returned: line.quantity,
            reason: replacementNote,
            refund_amount: 0,
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
            inventory_action: effectiveLineInventoryAction,
          },
          {
            return_detail_id: buildClientId(),
            return_id: returnId,
            product_id: line.returned_product_id,
            quantity_returned: line.quantity,
            reason: replacementNote,
            refund_amount: 0,
          },
        ]);

        const nextReturnedQty = Number(saleDetail.returned_quantity ?? 0) + line.quantity;
        const isFullyReturnedItem = nextReturnedQty >= Number(saleDetail.quantity ?? 0);
        try {
          await tryUpdateById("sales_details", "sales_detail_id", line.sales_detail_id, [
            {
              returned_quantity: nextReturnedQty,
              replacement_product_id: line.replacement_product_id,
              item_status: isFullyReturnedItem ? "Replaced" : "Partially Replaced",
            },
          ]);
        } catch {
          // Older schemas may not have return-tracking columns on sales_details yet.
        }

        if (effectiveLineInventoryAction === "Return to Stock") {
          if (line.replacement_product_id !== line.returned_product_id) {
            await updateInventoryStock(line.returned_product_id, line.quantity);
            await createInventoryLog(line.returned_product_id, line.quantity, "return", returnId);
            await updateInventoryStock(line.replacement_product_id, -line.quantity);
            await createInventoryLog(line.replacement_product_id, -line.quantity, "adjustment", returnId);
          } else {
            await createInventoryLog(line.replacement_product_id, 0, "adjustment", returnId);
          }
        } else {
          await updateInventoryStock(line.replacement_product_id, -line.quantity);
          await createInventoryLog(line.replacement_product_id, -line.quantity, "adjustment", returnId);
        }
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

      // Policy: Replacement only. No store credit issuance and no cash refund.

      await queryClient.invalidateQueries({ queryKey: ["returns"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setIsAddDialogOpen(false);
      setFormData(defaultForm);
      setReplacementLines([]);
      setReasonOption("");
      setCustomReason("");
      clearReceiptProof();
      toast.success(`${replacementLines.length} replacement item(s) recorded successfully.`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to record replacement");
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

  const setReplacementDialogOpen = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (open) return;
    setFormData(defaultForm);
    setReplacementLines([]);
    setSelectedReturnedDetailIds([]);
    setReturnedItemQtyByDetail({});
    setReasonOption("");
    setCustomReason("");
    clearReceiptProof();
    setReceiptNumberInput("");
    setReceiptValidationStatus({ state: "idle" });
    setShowManualSaleList(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              Replacement Management
            </CardTitle>
            <Dialog open={isAddDialogOpen} onOpenChange={setReplacementDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                  <Plus className="w-4 h-4 mr-2" />
                  Process Replacement
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 !w-[94vw] !max-w-[1050px] max-h-[88vh] overflow-hidden p-0 shadow-2xl flex flex-col">
                <div className="border-b border-zinc-800 p-5 bg-zinc-900">
                  <DialogHeader>
                    <DialogTitle className="text-yellow-300 flex items-center gap-2">
                      <ArrowRightLeft className="w-5 h-5" />
                      Process Item Replacement
                    </DialogTitle>
                  </DialogHeader>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 scrollbar-hide">
                  <div className="grid gap-5">
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
                        <p className="text-[11px] text-zinc-400">2. Replaced Item</p>
                        <p className="text-sm text-zinc-100">{selectedOriginalItem?.productName ?? "Not selected"}</p>
                      </div>
                      <div className={`rounded-lg border p-2 ${hasReplacementSelected ? "border-emerald-600 bg-emerald-900/20" : "border-zinc-700 bg-zinc-950"}`}>
                        <p className="text-[11px] text-zinc-400">3. Replacement</p>
                        <p className="text-sm text-zinc-100">
                          {hasReplacementSelected ? "Same product only" : "Not selected"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-2">
                        <p className="text-[11px] text-zinc-400">4. Difference</p>
                        <p className={`text-sm ${priceDifference > 0 ? "text-orange-300" : priceDifference < 0 ? "text-cyan-300" : "text-zinc-100"}`}>
                          {formatCurrency(priceDifference)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-yellow-300 flex items-center gap-2 text-base font-semibold">
                        <Receipt className="w-5 h-5 text-yellow-400" />
                        Step 1: Validate Receipt / Original Sale *
                      </Label>
                      <Badge className="bg-yellow-400/15 text-yellow-300 border border-yellow-400/30 text-xs font-medium">
                        7-Day Policy Check
                      </Badge>
                    </div>

                    <div className="space-y-3 rounded-xl border border-zinc-800 p-4 bg-zinc-950">
                      {/* Receipt Number Validation Bar */}
                      <div className="space-y-1.5">
                        <p className="text-xs text-zinc-300">
                          Enter or scan the Receipt # (e.g. <span className="font-semibold text-yellow-300">SALES-001</span> or <span className="font-semibold text-yellow-300">RCP-...</span>) to verify purchase validity:
                        </p>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Receipt className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400/80" />
                            <Input
                              value={receiptNumberInput}
                              onChange={(event) => setReceiptNumberInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  validateReceiptNumber();
                                }
                              }}
                              placeholder="Enter Receipt Number (e.g. SALES-001)..."
                              className="h-11 rounded-xl pl-10 bg-[#1D1D25] border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-[#FFD60A]/40 font-medium"
                            />
                          </div>
                          <Button
                            type="button"
                            onClick={() => validateReceiptNumber()}
                            className="h-11 rounded-xl bg-[#FFD60A] hover:bg-[#ffcf24] px-5 text-[#15151B] font-bold shadow-md flex items-center gap-2"
                          >
                            <ShieldCheck className="w-4 h-4 text-[#15151B]" />
                            Verify Receipt
                          </Button>
                        </div>
                      </div>

                      {/* Receipt Validation Result Feedback Box */}
                      {receiptValidationStatus.state === "valid" && (
                        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                              <span className="text-emerald-300 font-semibold text-sm">
                                Valid Receipt Verified — {receiptValidationStatus.displayId}
                              </span>
                            </div>
                            <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-400/40 text-[11px]">
                              Within 7-Day Window
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-emerald-500/20">
                            <div>
                              <span className="text-emerald-400/70 block">Purchase Date:</span>
                              <span className="text-emerald-100 font-medium">{receiptValidationStatus.purchaseDate}</span>
                            </div>
                            <div>
                              <span className="text-emerald-400/70 block">Age:</span>
                              <span className="text-emerald-100 font-medium">
                                {receiptValidationStatus.daysAgo === 0 ? "Today" : `${receiptValidationStatus.daysAgo} day(s) ago`}
                              </span>
                            </div>
                            <div>
                              <span className="text-emerald-400/70 block">Customer:</span>
                              <span className="text-emerald-100 font-medium truncate block">{receiptValidationStatus.customerName}</span>
                            </div>
                            <div>
                              <span className="text-emerald-400/70 block">Total Amount:</span>
                              <span className="text-emerald-300 font-semibold">{formatCurrency(receiptValidationStatus.totalAmount ?? 0)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {receiptValidationStatus.state === "expired_warning" && (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                              <span className="text-amber-300 font-semibold text-sm">
                                Policy Notice — {receiptValidationStatus.displayId}
                              </span>
                            </div>
                            <Badge className="bg-amber-500/20 text-amber-200 border-amber-400/40 text-[11px]">
                              {receiptValidationStatus.daysAgo} Days Ago (&gt;7 Days)
                            </Badge>
                          </div>
                          <p className="text-xs text-amber-200/90">
                            {receiptValidationStatus.message} Transaction loaded; replacement permitted with manager/admin discretion.
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-amber-500/20">
                            <div>
                              <span className="text-amber-400/70 block">Purchase Date:</span>
                              <span className="text-amber-100 font-medium">{receiptValidationStatus.purchaseDate}</span>
                            </div>
                            <div>
                              <span className="text-amber-400/70 block">Customer:</span>
                              <span className="text-amber-100 font-medium truncate block">{receiptValidationStatus.customerName}</span>
                            </div>
                            <div>
                              <span className="text-amber-400/70 block">Total Amount:</span>
                              <span className="text-amber-300 font-semibold">{formatCurrency(receiptValidationStatus.totalAmount ?? 0)}</span>
                            </div>
                            <div>
                              <span className="text-amber-400/70 block">Eligible Items:</span>
                              <span className="text-amber-100 font-medium">{receiptValidationStatus.returnableCount} unit(s)</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {receiptValidationStatus.state === "already_replaced" && (
                        <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3.5 flex items-start gap-2.5">
                          <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                          <div className="text-xs space-y-0.5">
                            <span className="text-red-300 font-semibold text-sm block">
                              Receipt Already Replaced ({receiptValidationStatus.displayId})
                            </span>
                            <p className="text-red-200/80">
                              {receiptValidationStatus.message} Meryl policy allows 1 replacement per sales transaction.
                            </p>
                          </div>
                        </div>
                      )}

                      {receiptValidationStatus.state === "no_returnable_items" && (
                        <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3.5 flex items-start gap-2.5">
                          <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                          <div className="text-xs space-y-0.5">
                            <span className="text-red-300 font-semibold text-sm block">
                              No Returnable Items Remaining ({receiptValidationStatus.displayId})
                            </span>
                            <p className="text-red-200/80">
                              {receiptValidationStatus.message}
                            </p>
                          </div>
                        </div>
                      )}

                      {receiptValidationStatus.state === "not_found" && (
                        <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3.5 flex items-start gap-2.5">
                          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                          <div className="text-xs space-y-0.5">
                            <span className="text-red-300 font-semibold text-sm block">
                              Invalid Receipt Number
                            </span>
                            <p className="text-red-200/80">
                              {receiptValidationStatus.message} Check the receipt for the SALES-xxx code or search the sales list below.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Optional Manual Search Fallback Table */}
                      <div className="pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setShowManualSaleList(!showManualSaleList)}
                          className="text-xs text-yellow-300 hover:text-yellow-200 hover:bg-zinc-800/80 px-2 h-7"
                        >
                          {showManualSaleList ? "▲ Hide Sales List" : "▼ Or Browse All Sales Instead"}
                        </Button>

                        {showManualSaleList && (
                          <div className="mt-2 space-y-2 border-t border-zinc-800 pt-2">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                              <Input
                                value={salePickerSearch}
                                onChange={(event) => setSalePickerSearch(event.target.value)}
                                placeholder="Filter sales by ID, customer, status..."
                                className="h-9 rounded-lg pl-9 bg-[#1D1D25] border-zinc-700 text-white placeholder:text-zinc-500 text-xs focus-visible:ring-[#FFD60A]/40"
                              />
                            </div>
                            <div className="border border-zinc-800 rounded-xl overflow-y-auto overflow-x-hidden max-h-40 bg-zinc-950">
                              <Table className="w-full table-fixed text-xs">
                                <TableHeader>
                                  <TableRow className="bg-zinc-900 hover:bg-zinc-900 border-zinc-800">
                                    <TableHead className="w-[20%] text-yellow-300 text-center">Sales ID</TableHead>
                                    <TableHead className="w-[28%] text-yellow-300 text-center">Customer</TableHead>
                                    <TableHead className="w-[14%] text-yellow-300 text-center">Items</TableHead>
                                    <TableHead className="w-[20%] text-yellow-300 text-center">Amount</TableHead>
                                    <TableHead className="w-[18%] text-yellow-300 text-center">Action</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {filteredSaleOptions.map((sale) => (
                                    <TableRow key={sale.sales_id} className={`border-zinc-800 transition-colors hover:bg-zinc-900/60 ${formData.sales_id === sale.sales_id ? "bg-yellow-400/10" : ""}`}>
                                      <TableCell className="truncate text-zinc-200 text-center font-medium" title={sale.display_sales_id}>{sale.display_sales_id}</TableCell>
                                      <TableCell className="truncate text-zinc-200 text-center" title={sale.customerName}>{sale.customerName}</TableCell>
                                      <TableCell className="text-zinc-200 text-center">{sale.details.length}</TableCell>
                                      <TableCell className="truncate text-yellow-300 text-center font-semibold">{formatCurrency(sale.total_amount)}</TableCell>
                                      <TableCell className="text-center">
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            validateReceiptNumber(sale.display_sales_id);
                                          }}
                                          className="h-7 rounded-full bg-[#FFD60A] px-3 text-[#15151B] text-xs hover:bg-[#ffcf24] font-bold"
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
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <Label className="text-yellow-300">Receipt Proof *</Label>
                        <p className="mt-1 text-xs text-yellow-200/70">
                          Take or upload a photo of the printed receipt to validate the buyer.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Label
                          htmlFor="receipt-proof-upload"
                          className="inline-flex h-9 cursor-pointer items-center rounded-md bg-yellow-400 px-3 text-sm font-semibold text-red-900 hover:bg-yellow-500"
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Upload Receipt
                        </Label>
                        {receiptProofFile && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={clearReceiptProof}
                            className="h-9 border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                          >
                            <X className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                    <input
                      id="receipt-proof-upload"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(event) => handleReceiptProofChange(event.target.files?.[0])}
                    />
                    {receiptProofPreview ? (
                      <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 md:grid-cols-[160px_1fr] md:items-center">
                        <img
                          src={receiptProofPreview}
                          alt="Receipt proof preview"
                          className="h-28 w-full rounded-md border border-zinc-800 object-cover md:w-40"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-100">{receiptProofFile?.name}</p>
                          <p className="mt-1 text-xs text-zinc-400">
                            This proof will be saved with the replacement record for buyer validation.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-h-[96px] items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950 text-center text-sm text-zinc-400">
                        <div>
                          <FileImage className="mx-auto mb-2 h-7 w-7 text-yellow-300/70" />
                          No receipt photo uploaded
                        </div>
                      </div>
                    )}
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
                      <Label className="text-yellow-300">Replaced Item Inventory Action *</Label>
                      <Select
                        value={effectiveInventoryAction}
                        onValueChange={(value) =>
                          setFormData({ ...formData, inventory_action: value as ExchangeForm["inventory_action"] })
                        }
                        disabled={isUnsellableReason}
                      >
                        <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                          <SelectValue placeholder="Select inventory action" />
                        </SelectTrigger>
                        <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                          <SelectItem value="Defective / Not Sellable">Defective / Not Sellable</SelectItem>
                          <SelectItem value="Return to Stock">Back to Stock</SelectItem>
                        </SelectContent>
                      </Select>
                      {isUnsellableReason && (
                        <p className="text-xs text-yellow-300">
                          Damaged or defective items cannot be returned to sellable stock.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-xl border border-red-800 p-3">
                    <div>
                      <p className="text-xs text-yellow-300">Selected Sale</p>
                      <p className="text-sm text-yellow-200">{selectedSale?.display_sales_id ?? "Not selected"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-yellow-300">Replaced Item</p>
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
                        <Label className="text-yellow-300">Step 2: Select Replaced Product</Label>
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
                      <div key={`returned-items-${formData.sales_id || "none"}`} className="border border-zinc-800 rounded-xl overflow-y-auto overflow-x-auto max-h-48">
                        <Table className="w-full text-sm">
                          <TableHeader>
                            <TableRow className="bg-zinc-900 hover:bg-zinc-900 border-zinc-800">
                              <TableHead className="text-yellow-300 text-center">SKU</TableHead>
                              <TableHead className="text-yellow-300 text-center">Product</TableHead>
                              <TableHead className="text-yellow-300 text-center">Sold</TableHead>
                              <TableHead className="text-yellow-300 text-center">Replaceable</TableHead>
                              <TableHead className="text-yellow-300 text-center">Replace Qty</TableHead>
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
                                  <QuantityStepper
                                    value={rowQty}
                                    disabled={!isSelected}
                                    max={Math.max(1, Number(detail.returnable_quantity ?? detail.quantity ?? 1))}
                                    onChange={(nextQty) => {
                                      setReturnedItemQtyByDetail((prev) => ({
                                        ...prev,
                                        [detail.sales_detail_id]: nextQty,
                                      }));
                                    }}
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
                        <Label className="text-yellow-300">Step 3: Same Product Replacement</Label>
                        <Dialog open={isReplacementPickerOpen} onOpenChange={setIsReplacementPickerOpen}>
                          <DialogTrigger asChild>
                            <Button
                              type="button"
                              disabled={!hasReturnedSelected}
                              className="bg-yellow-400 text-red-900 hover:bg-yellow-500 disabled:opacity-50"
                            >
                              View Same Product Options
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 !w-[92vw] !max-w-[980px] max-h-[84vh] overflow-hidden p-0">
                            <div className="border-b border-zinc-800 p-4">
                              <DialogHeader>
                                <DialogTitle className="text-yellow-300">Same Product Replacement Options</DialogTitle>
                              </DialogHeader>
                            </div>
                            <div className="max-h-[66vh] overflow-y-auto p-4 space-y-3">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                                <Input
                                  value={replacementSearch}
                                  onChange={(event) => setReplacementSearch(event.target.value)}
                                  placeholder="Search same product by SKU, name, brand..."
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
                      {!hasReturnedSelected && <p className="text-xs text-zinc-300">Select the replaced product first.</p>}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                        <p className="text-xs text-yellow-300">Replacement Rule</p>
                        <p className="text-sm text-yellow-200">
                          {hasReplacementSelected
                            ? "Replacement will use the same product variant as each returned item."
                            : "Select the replaced product first."}
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
                            <TableHead className="text-yellow-300 text-center">Replaced</TableHead>
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
                      <QuantityStepper
                        value={quantity}
                        max={maxReturnQty}
                        onChange={(nextQty) => setFormData({ ...formData, quantity: nextQty })}
                      />
                      {selectedReturnedItems.length > 1 && (
                        <p className="text-xs text-yellow-300">Tip: Set exact qty per selected item in Step 2 (Replace Qty column).</p>
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
                      Added payment total: {formatCurrency(totalAdditionalPayment)} | Replacement-only policy (no store credit/refund)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-yellow-300">Reason *</Label>
                    <Select
                      value={reasonOption}
                      onValueChange={(value) => {
                        setReasonOption(value);
                        if (value !== "Others") {
                          setCustomReason("");
                          setFormData({ ...formData, reason: value });
                        } else {
                          setFormData({ ...formData, reason: customReason });
                        }
                      }}
                    >
                      <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                        <SelectValue placeholder="Select replacement reason" />
                      </SelectTrigger>
                      <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                        {REPLACEMENT_REASON_OPTIONS.map((reason) => (
                          <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {reasonOption === "Others" && (
                      <Input
                        value={customReason}
                        onChange={(e) => {
                          setCustomReason(e.target.value);
                          setFormData({ ...formData, reason: e.target.value });
                        }}
                        className="bg-red-600 border-red-800 text-yellow-200"
                        placeholder="Specify the replacement reason"
                      />
                    )}
                  </div>

                    <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-yellow-300/80">
                      Step 5: Add the selected row first, then finalize all rows below.
                    </p>
                    <Button
                      type="button"
                      onClick={addReplacementLine}
                      disabled={!hasReturnedSelected || !hasReplacementSelected}
                      className="border border-yellow-400/70 bg-transparent text-yellow-300 hover:bg-yellow-400/15"
                    >
                      Add Selected Item
                    </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter className="shrink-0 border-t border-red-800 p-5">
                  <Button
                    onClick={handleAddReturn}
                    disabled={isSaving}
                    className="bg-yellow-400 text-red-900 hover:bg-yellow-500 disabled:opacity-60 font-bold"
                  >
                    {isSaving ? "Processing..." : `Finalize Replacement (${replacementLines.length} item${replacementLines.length === 1 ? "" : "s"})`}
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
              placeholder="Search by replacement ID, sales ID, or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
            />
          </div>

          <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
            <Table className="w-full min-w-[980px]">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Replacement ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Sales ID</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Customer</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Staff Code</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Processed By</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Replacement Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Replacement Date</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.map((returnItem) => {
                  return (
                  <TableRow key={returnItem.return_id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.display_return_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.display_sales_id}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.customerName}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.staffCode}</TableCell>
                    <TableCell className="text-yellow-200 whitespace-nowrap text-center">{returnItem.processedBy}</TableCell>
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
                        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 max-w-3xl max-h-[85vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="text-zinc-100">Replacement Details - {returnItem.display_return_id}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                              <p className="mb-3 text-xs uppercase tracking-wide text-zinc-400">Summary</p>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                  <p className="text-sm text-zinc-400">Customer</p>
                                  <p className="text-zinc-100">{returnItem.customerName}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-zinc-400">Original Sale</p>
                                  <p className="text-zinc-100">{returnItem.display_sales_id}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-zinc-400">Replacement Type</p>
                                  <p className="text-zinc-100">{returnItem.return_type}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-zinc-400">Staff Code</p>
                                  <p className="text-zinc-100">{returnItem.staffCode}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-zinc-400">Processed By</p>
                                  <p className="text-zinc-100">{returnItem.processedBy}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-zinc-400">Replacement Date</p>
                                  <p className="text-zinc-100">{returnItem.return_date}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-zinc-400">Sales Status</p>
                                  <p className="text-zinc-100">{returnItem.salesStatus}</p>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                              <p className="mb-3 text-xs uppercase tracking-wide text-zinc-400">Financials</p>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-zinc-400">Additional Pay</p>
                                  <p className="text-zinc-100">{formatCurrency(returnItem.additional_payment)}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-zinc-400">Replacement Status</p>
                                  <p className="text-zinc-100">{returnItem.return_status}</p>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                              <p className="mb-3 text-xs uppercase tracking-wide text-zinc-400">Receipt Proof</p>
                              {returnItem.receiptProofUrl ? (
                                <div className="grid gap-3 md:grid-cols-[180px_1fr] md:items-center">
                                  <a href={returnItem.receiptProofUrl} target="_blank" rel="noreferrer">
                                    <img
                                      src={returnItem.receiptProofUrl}
                                      alt="Uploaded receipt proof"
                                      className="h-32 w-full rounded-md border border-zinc-800 object-cover md:w-44"
                                    />
                                  </a>
                                  <div className="min-w-0">
                                    <p className="truncate text-zinc-100">{returnItem.receiptProofName || "Receipt photo"}</p>
                                    <p className="mt-1 text-sm text-zinc-400">Verified: {returnItem.receiptVerifiedAt}</p>
                                    <a
                                      href={returnItem.receiptProofUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-2 inline-flex text-sm font-semibold text-yellow-300 hover:text-yellow-200"
                                    >
                                      Open receipt proof
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-zinc-400">No receipt proof uploaded for this replacement.</p>
                              )}
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                              <p className="mb-3 text-xs uppercase tracking-wide text-zinc-400">Replacement Items</p>
                              <div className="space-y-3">
                                {returnItem.returnDetails.map((detail) => (
                                  <div key={detail.return_detail_id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-stretch">
                                      <div className="rounded-md border border-red-900/50 bg-red-950/20 p-3">
                                        <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Replaced Item</p>
                                        <p className="font-medium text-zinc-100">{detail.productName}</p>
                                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-300">
                                          <span>Qty: {detail.quantity_returned}</span>
                                          <span>Price: {formatCurrency(detail.productPrice)}</span>
                                          <span>Size: {detail.productSize}</span>
                                          <span>Color: {detail.productColor}</span>
                                        </div>
                                      </div>
                                      <div className="rounded-md border border-emerald-900/50 bg-emerald-950/20 p-3">
                                        <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Replacement Item</p>
                                        <p className="font-medium text-zinc-100">{detail.replacementProductName}</p>
                                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-300">
                                          <span>Qty: {detail.replacementQuantity}</span>
                                          <span>Price: {formatCurrency(detail.replacementProductPrice)}</span>
                                          <span>Size: {detail.replacementProductSize}</span>
                                          <span>Color: {detail.replacementProductColor}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-300">
                                      <Badge className="bg-zinc-800 text-zinc-200">Difference: {formatCurrency(detail.price_difference)}</Badge>
                                      <Badge className="bg-zinc-800 text-zinc-200">Inventory: {detail.inventory_action}</Badge>
                                    </div>
                                  </div>
                                ))}
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



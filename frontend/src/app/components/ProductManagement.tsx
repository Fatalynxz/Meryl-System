import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Edit, Eye, Info, Package, Plus, Search, Settings, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { useCategories, useInventory, useProducts, useProductsMutations } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";

type InventoryStatus = "Active" | "Inactive";
type ProductTab = "list" | "settings" | "inventory";
type ProductEditScope = "this_variant" | "selected_variants" | "all_variants_base";

type UiProduct = {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  category_id: string;
  color: string;
  gender: string;
  size: string;
  unit_price: number;
  inventory_id: string;
  stock: number;
  reserved_stock: number;
  available_stock: number;
  reorder_level: number;
  srp: number;
  status: InventoryStatus;
  manufacturer_date: string;
  expiration_date: string;
  hasInventory: boolean;
  isArchived: boolean;
};

type ProductFormData = {
  name: string;
  brand: string;
  category_id: string;
  color: string;
  gender: string;
  size: string;
  unit_price: number;
};

type StockFormData = {
  product_id: string;
  stock_in: number;
  reserved_quantity: number;
  markup_rate: number;
  reorder_level: number;
  status: InventoryStatus;
  manufacturer_date: string;
  expiration_date: string;
};

const defaultProductForm: ProductFormData = {
  name: "",
  brand: "",
  category_id: "",
  color: "",
  gender: "",
  size: "",
  unit_price: 0,
};

const defaultStockForm: StockFormData = {
  product_id: "",
  stock_in: 0,
  reserved_quantity: 0,
  markup_rate: 0.9,
  reorder_level: 10,
  status: "Active",
  manufacturer_date: "",
  expiration_date: "",
};

const MARKUP_RATE_OPTIONS = [0.1, 0.2, 0.3, 0.5, 0.75, 0.9, 1];

function buildClientId(prefix = "id") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function shortId(value: string | null | undefined, head = 8, tail = 6) {
  const text = String(value ?? "").trim();
  if (text.length <= head + tail + 1) return text;
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function toDbStatus(status: InventoryStatus): "active" | "inactive" {
  return status === "Active" ? "active" : "inactive";
}

function toUiStatus(value: string | null | undefined): InventoryStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "active" || normalized === "available" ? "Active" : "Inactive";
}

function getProductStatusMeta(product?: UiProduct) {
  if (!product) return { label: "Not Selected", className: "border-slate-500/30 bg-slate-500/15 text-slate-200" };
  if (product.status !== "Active") return { label: "Inactive", className: "border-slate-500/30 bg-slate-500/15 text-slate-200" };
  if (isExpiredProduct(product)) return { label: "Expired", className: "border-red-500/40 bg-red-500/15 text-red-200" };
  if (Number(product.available_stock || 0) <= 0) return { label: "Out of Stock", className: "border-red-500/40 bg-red-500/15 text-red-200" };
  if (Number(product.available_stock || 0) <= Number(product.reorder_level || 0)) return { label: "Low Stock", className: "border-yellow-400/40 bg-yellow-400/15 text-yellow-100" };
  return { label: "Active", className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" };
}

function isExpiredProduct(product?: Pick<UiProduct, "expiration_date">) {
  const expirationDate = String(product?.expiration_date ?? "").slice(0, 10);
  if (!expirationDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return expirationDate < today;
}

function stockCondition(stock: number, reorder: number, expired = false) {
  if (expired) return { label: "Expired", className: "bg-red-800 text-yellow-100" };
  if (stock <= 0) return { label: "Out of Stock", className: "bg-red-900 text-yellow-100" };
  if (stock <= reorder) return { label: "Critical", className: "bg-red-700 text-yellow-100" };
  if (stock <= reorder + 5) return { label: "Warning", className: "bg-yellow-600 text-red-950" };
  return { label: "Good", className: "bg-green-700 text-white" };
}

function formatMoney(value: number) {
  return `PHP ${Number(value || 0).toLocaleString()}`;
}

function calculateSrpFromMarkup(unitPrice: number, markupRate: number) {
  const price = Number(unitPrice || 0);
  const rate = Number(markupRate || 0);
  return Math.round((price + price * rate) * 100) / 100;
}

function defaultMarkupRateForProduct(product?: Pick<UiProduct, "unit_price" | "srp">) {
  if (!product || Number(product.unit_price || 0) <= 0) return 0.9;
  const savedMarkup = (Number(product.srp || 0) - Number(product.unit_price || 0)) / Number(product.unit_price || 0);
  if (!Number.isFinite(savedMarkup) || savedMarkup <= 0) return 0.9;

  return MARKUP_RATE_OPTIONS.reduce((closest, option) => {
    return Math.abs(option - savedMarkup) < Math.abs(closest - savedMarkup) ? option : closest;
  }, MARKUP_RATE_OPTIONS[0]);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function productNameWithoutBrand(productName: string, brand: string) {
  const name = String(productName ?? "").trim().replace(/\s+/g, " ");
  const brandName = String(brand ?? "").trim().replace(/\s+/g, " ");
  if (!name || !brandName || brandName.toLowerCase() === "n/a") return name;

  return name
    .replace(new RegExp(`^${escapeRegExp(brandName)}(?:\\s+|[-_/]+)+`, "i"), "")
    .trim() || name;
}

function variantLabel(product: Pick<UiProduct, "color" | "gender" | "size">) {
  return [product.color, product.gender, product.size ? `Size ${product.size}` : ""]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value && value.toLowerCase() !== "n/a" && value.toLowerCase() !== "default")
    .join(" / ") || "Default";
}

function productGroupKey(product: UiProduct) {
  return [product.name, product.brand, product.category].map((value) => value.trim().toLowerCase()).join("::");
}

type ProductManagementProps = {
  view?: ProductTab;
  onViewChange?: (view: ProductTab) => void;
};

export function ProductManagement({ view, onViewChange }: ProductManagementProps = {}) {
  const queryClient = useQueryClient();
  const [internalActiveTab, setInternalActiveTab] = useState<ProductTab>(view ?? "inventory");
  const [searchTerm, setSearchTerm] = useState("");
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<UiProduct | null>(null);
  const [deleteTargetProductId, setDeleteTargetProductId] = useState<string>("");
  const [productForm, setProductForm] = useState<ProductFormData>(defaultProductForm);
  const [editScope, setEditScope] = useState<ProductEditScope>("this_variant");
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [stockForm, setStockForm] = useState<StockFormData>(defaultStockForm);
  const [showArchived, setShowArchived] = useState(false);

  const productsQuery = useProducts();
  const inventoryQuery = useInventory();
  const categoriesQuery = useCategories();
  const productMutations = useProductsMutations();
  const activeTab = view ?? internalActiveTab;

  useEffect(() => {
    if (view) setInternalActiveTab(view);
  }, [view]);

  const setActiveTab = (nextView: ProductTab) => {
    setInternalActiveTab(nextView);
    onViewChange?.(nextView);
  };

  const categories = ((categoriesQuery.data as any[]) ?? []).filter((category: any) => {
    const name = String(category?.category_name ?? "").trim().toLowerCase();
    return !["kid", "kids", "men", "women"].includes(name);
  });

  const inventoryByProductId = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of (inventoryQuery.data as any[]) ?? []) {
      const key = String(row.product_id ?? "");
      if (key) map.set(key, row);
    }
    return map;
  }, [inventoryQuery.data]);

  const products = useMemo<UiProduct[]>(() => {
    return ((productsQuery.data as any[]) ?? []).map((row: any) => {
      const category = Array.isArray(row.category) ? row.category[0] : row.category;
      const inventory = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory ?? inventoryByProductId.get(String(row.product_id ?? ""));
      const brand = String(row.brand ?? "N/A");
      const unitPrice = Number(row.unit_price ?? row.cost_price ?? 0);
      const srp = Number(inventory?.srp ?? row.price ?? row.cost_price ?? unitPrice);
      const reorder = Number(inventory?.reorder_level ?? row.reorder_level ?? 10);
      const stock = Number(inventory?.stock_quantity ?? 0);
      const reserved = Math.min(Math.max(Number(inventory?.reserved_quantity ?? 0), 0), Math.max(stock, 0));
      const status = toUiStatus(inventory?.inventory_status ?? row.status);
      const isArchived = String(row.status ?? "").trim().toLowerCase() === "inactive";
      return {
        id: String(row.product_id ?? ""),
        product_id: String(row.product_id ?? ""),
        sku: String(row.sku ?? row.product_id ?? ""),
        name: productNameWithoutBrand(String(row.product_name ?? "Unnamed Product"), brand),
        brand,
        category: String(category?.category_name ?? "Uncategorized"),
        category_id: String(row.category_id ?? ""),
        color: String(row.color ?? "Default"),
        gender: String(row.gender ?? "N/A"),
        size: String(row.size ?? "N/A"),
        unit_price: unitPrice,
        inventory_id: inventory?.inventory_id ? String(inventory.inventory_id) : "",
        stock,
        reserved_stock: reserved,
        available_stock: Math.max(stock - reserved, 0),
        reorder_level: reorder,
        srp,
        status,
        manufacturer_date: String(inventory?.manufacturer_date ?? ""),
        expiration_date: String(inventory?.expiration_date ?? ""),
        hasInventory: Boolean(inventory?.inventory_id),
        isArchived,
      };
    });
  }, [inventoryByProductId, productsQuery.data]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.product_id, product])), [products]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const sourceRaw = activeTab === "inventory" ? products.filter((product) => product.hasInventory) : products;
    const source = activeTab === "list" && !showArchived ? sourceRaw.filter((product) => !product.isArchived) : sourceRaw;
    return source.filter(
      (product) =>
        product.name.toLowerCase().includes(q) ||
        product.brand.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        product.color.toLowerCase().includes(q) ||
        product.gender.toLowerCase().includes(q) ||
        product.size.toLowerCase().includes(q) ||
        variantLabel(product).toLowerCase().includes(q),
    );
  }, [activeTab, products, searchTerm, showArchived]);

  const selectedSettingsProduct = productMap.get(stockForm.product_id);
  const editableVariantGroup = useMemo(() => {
    if (!editingProduct) return [] as UiProduct[];
    const key = productGroupKey(editingProduct);
    return products
      .filter((product) => productGroupKey(product) === key)
      .sort((a, b) => `${a.color} ${a.size}`.localeCompare(`${b.color} ${b.size}`, undefined, { numeric: true }));
  }, [editingProduct, products]);
  const isExternallyRouted = Boolean(view);

  const openAddProduct = () => {
    setEditingProduct(null);
    setDeleteTargetProductId("");
    setEditScope("this_variant");
    setSelectedVariantIds([]);
    setProductForm(defaultProductForm);
    setIsProductDialogOpen(true);
  };

  const openEditProduct = (product: UiProduct) => {
    setEditingProduct(product);
    setDeleteTargetProductId(product.product_id);
    setProductForm({
      name: product.name,
      brand: product.brand === "N/A" ? "" : product.brand,
      category_id: product.category_id,
      color: product.color === "Default" ? "" : product.color,
      gender: product.gender === "N/A" ? "" : product.gender,
      size: product.size === "N/A" ? "" : product.size,
      unit_price: product.unit_price,
    });
    const variantIds = products
      .filter((candidate) => productGroupKey(candidate) === productGroupKey(product))
      .map((candidate) => candidate.product_id);
    setEditScope("this_variant");
    setSelectedVariantIds(variantIds);
    setIsProductDialogOpen(true);
  };

  const openSettingsForProduct = (product: UiProduct) => {
    setActiveTab("settings");
    setStockForm({
      product_id: product.product_id,
      stock_in: 0,
      reserved_quantity: product.reserved_stock || 0,
      markup_rate: defaultMarkupRateForProduct(product),
      reorder_level: product.reorder_level || 10,
      status: product.status,
      manufacturer_date: product.manufacturer_date ? product.manufacturer_date.slice(0, 10) : "",
      expiration_date: product.expiration_date ? product.expiration_date.slice(0, 10) : "",
    });
  };

  const validateProductForm = () => {
    if (!productForm.name.trim()) return "Product name is required.";
    if (!productForm.brand.trim()) return "Brand is required.";
    if (!productNameWithoutBrand(productForm.name, productForm.brand)) {
      return "Product name should include the model/style, not only the brand.";
    }
    if (!productForm.category_id) return "Category is required.";
    if (Number(productForm.unit_price) < 0) return "Unit price must be greater than or equal to 0.";
    return "";
  };

  const saveProduct = async () => {
    const validation = validateProductForm();
    if (validation) return toast.error(validation);

    const cleanProductName = productNameWithoutBrand(productForm.name, productForm.brand);
    const basePayload = {
      product_name: cleanProductName,
      brand: productForm.brand.trim(),
      category_id: productForm.category_id,
      cost_price: Number(productForm.unit_price || 0),
    } as any;

    const thisVariantPayload = {
      ...basePayload,
      size: productForm.size.trim() || null,
      color: productForm.color.trim() || null,
      gender: productForm.gender || null,
    } as any;

    try {
      if (editingProduct) {
        if (editScope === "this_variant") {
          await productMutations.updateMutation.mutateAsync({ id: editingProduct.product_id, payload: thisVariantPayload });
          toast.success("Product variant updated.");
        } else {
          const targetIds =
            editScope === "all_variants_base"
              ? editableVariantGroup.map((variant) => variant.product_id)
              : selectedVariantIds.filter((id) => editableVariantGroup.some((variant) => variant.product_id === id));
          if (!targetIds.length) {
            return toast.error("Select at least one variant to update.");
          }
          const { error } = await supabase.from("product").update(basePayload as any).in("product_id", targetIds);
          if (error) throw error;
          toast.success(`Updated ${targetIds.length} variant${targetIds.length === 1 ? "" : "s"} (base fields only).`);
        }
      } else {
        await productMutations.createMutation.mutateAsync(thisVariantPayload);
        toast.success("Product added to Product List.");
      }
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      setIsProductDialogOpen(false);
      setEditingProduct(null);
      setDeleteTargetProductId("");
      setEditScope("this_variant");
      setSelectedVariantIds([]);
      setProductForm(defaultProductForm);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save product");
    }
  };

  const saveProductSettings = async () => {
    const product = selectedSettingsProduct;
    if (!product) return toast.error("Select an existing product first.");
    if (Number(stockForm.stock_in) < 0) return toast.error("Stock-in quantity cannot be negative.");
    if (!product.hasInventory && Number(stockForm.stock_in) <= 0) {
      return toast.error("Stock-in quantity must be greater than 0 for new inventory.");
    }
    const computedSrp = calculateSrpFromMarkup(product.unit_price, stockForm.markup_rate);
    if (Number(product.unit_price) <= 0) {
      return toast.error("Unit price must be greater than 0 before SRP can be calculated.");
    }
    if (computedSrp <= Number(product.unit_price)) {
      return toast.error("Select a markup greater than 0 to calculate SRP.");
    }
    if (Number(stockForm.reorder_level) < 0) return toast.error("Reorder level must be greater than or equal to 0.");
    if (stockForm.manufacturer_date && stockForm.expiration_date && stockForm.expiration_date < stockForm.manufacturer_date) {
      return toast.error("Expiration date must not be earlier than manufacturer date.");
    }

    const nextStock = Number(product.stock || 0) + Number(stockForm.stock_in || 0);
    const requestedReserved = Math.max(Number(stockForm.reserved_quantity || 0), 0);
    if (requestedReserved > nextStock) {
      return toast.error("Held stock cannot be greater than total on-hand stock.");
    }
    const nextReserved = requestedReserved;
    const inventoryPayload = {
      stock_quantity: nextStock,
      reserved_quantity: nextReserved,
      reorder_level: Number(stockForm.reorder_level || 0),
      srp: computedSrp,
      inventory_status: toDbStatus(stockForm.status),
      manufacturer_date: stockForm.manufacturer_date || null,
      expiration_date: stockForm.expiration_date || null,
      last_updated: new Date().toISOString(),
    };

    try {
      if (product.inventory_id) {
        const { error } = await supabase
          .from("inventory")
          .update(inventoryPayload as any)
          .eq("inventory_id", product.inventory_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory").insert({
          inventory_id: buildClientId("inv"),
          product_id: product.product_id,
          ...inventoryPayload,
        });
        if (error) throw error;
      }

      if (Number(stockForm.stock_in) !== 0) {
        const { error: logError } = await supabase.from("inventory_log").insert({
          inventory_log_id: buildClientId("log"),
          product_id: product.product_id,
          quantity_change: Number(stockForm.stock_in),
          transaction_type: "restock",
          reference_id: product.inventory_id || null,
          date_updated: new Date().toISOString(),
        });
        if (logError) throw logError;
      }

      const reservedDelta = nextReserved - Number(product.reserved_stock || 0);
      if (reservedDelta !== 0) {
        const { error: holdLogError } = await supabase.from("inventory_log").insert({
          inventory_log_id: buildClientId("log"),
          product_id: product.product_id,
          quantity_change: Math.abs(reservedDelta),
          transaction_type: reservedDelta > 0 ? "hold" : "release_hold",
          reference_id: product.inventory_id || null,
          date_updated: new Date().toISOString(),
        });
        if (holdLogError) throw holdLogError;
      }

      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["inventoryLog"] });
      toast.success("Product settings saved and inventory updated.");
      setActiveTab("inventory");
      setStockForm(defaultStockForm);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save product settings");
    }
  };

  const updateProductArchiveStatus = async (productId: string, status: "active" | "inactive") => {
    const { data, error } = await supabase
      .from("product")
      .update({ status } as any)
      .eq("product_id", productId)
      .select("product_id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(`No product row was updated for product_id=${productId}. Check RLS permissions and record id.`);
    }
    return data;
  };

  const deleteProduct = async (productId: string) => {
    const product = productMap.get(productId);
    if (!product) {
      toast.error("Selected product was not found.");
      return;
    }
    if (product.isArchived) {
      try {
        await updateProductArchiveStatus(productId, "active");

        const { error: restoreInventoryError } = await supabase
          .from("inventory")
          .update({
            inventory_status: "active",
            last_updated: new Date().toISOString(),
          } as any)
          .eq("product_id", productId);
        if (restoreInventoryError) throw restoreInventoryError;

        await queryClient.invalidateQueries({ queryKey: ["products"] });
        await queryClient.invalidateQueries({ queryKey: ["inventory"] });
        setIsProductDialogOpen(false);
        setEditingProduct(null);
        setDeleteTargetProductId("");
        toast.success("Product restored.");
        return;
      } catch (error: any) {
        toast.error(error?.message ?? "Failed to restore product");
        return;
      }
    }

    try {
      // Remove related inventory logs and inventory rows first to satisfy FK constraints.
      const { error: logDeleteError } = await supabase
        .from("inventory_log")
        .delete()
        .eq("product_id", productId);
      if (logDeleteError) throw logDeleteError;

      const { error: inventoryDeleteError } = await supabase
        .from("inventory")
        .delete()
        .eq("product_id", productId);
      if (inventoryDeleteError) throw inventoryDeleteError;

      await productMutations.removeMutation.mutateAsync(productId);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["inventoryLog"] });
      await queryClient.invalidateQueries({ queryKey: ["returns"] });
      setIsProductDialogOpen(false);
      setEditingProduct(null);
      setDeleteTargetProductId("");
      toast.success("Product deleted from Product List.");
    } catch (error: any) {
      const message = String(error?.message ?? "").toLowerCase();
      const blockedByHistory =
        message.includes("foreign key") ||
        message.includes("sales_details_product_id_fkey") ||
        message.includes("violates") ||
        message.includes("no product row was deleted");

      if (blockedByHistory) {
        try {
          // Keep sales history intact: archive product instead of hard delete.
          await updateProductArchiveStatus(productId, "inactive");

          const { error: archiveInventoryError } = await supabase
            .from("inventory")
            .update({
              inventory_status: "inactive",
              stock_quantity: 0,
              last_updated: new Date().toISOString(),
            } as any)
            .eq("product_id", productId);
          if (archiveInventoryError) throw archiveInventoryError;

          await queryClient.invalidateQueries({ queryKey: ["products"] });
          await queryClient.invalidateQueries({ queryKey: ["inventory"] });
          setIsProductDialogOpen(false);
          setEditingProduct(null);
          setDeleteTargetProductId("");
          toast.success("Product is linked to sales history and was archived instead.");
          return;
        } catch (archiveError: any) {
          toast.error(archiveError?.message ?? "Failed to archive product");
          return;
        }
      }

      toast.error(error?.message ?? "Failed to delete product");
    }
  };

  return (
    <div className="space-y-4">
      {!isExternallyRouted && <Card className="bg-red-700 border-red-800">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Inventory Module
              </CardTitle>
              <p className="text-sm text-yellow-200/80 mt-1">Separate master products, item settings, and sellable inventory.</p>
            </div>
            <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAddProduct} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product Master
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-red-700 border-red-800 text-yellow-200 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-yellow-300">{editingProduct ? "Edit Product Master" : "Add Product Master"}</DialogTitle>
                </DialogHeader>
                <ProductMasterForm formData={productForm} setFormData={setProductForm} categories={categories} />
                {editingProduct && (
                  <VariantUpdateScope
                    editScope={editScope}
                    setEditScope={setEditScope}
                    editableVariantGroup={editableVariantGroup}
                    selectedVariantIds={selectedVariantIds}
                    setSelectedVariantIds={setSelectedVariantIds}
                  />
                )}
                <DialogFooter>
                  <Button onClick={saveProduct} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                    {editingProduct ? "Update Product" : "Save Product"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-3">
            <TabButton active={activeTab === "list"} onClick={() => setActiveTab("list")} icon={<Package className="w-4 h-4" />} label="Product List" />
            <TabButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")} icon={<Settings className="w-4 h-4" />} label="Product Settings" />
            <TabButton active={activeTab === "inventory"} onClick={() => setActiveTab("inventory")} icon={<Warehouse className="w-4 h-4" />} label="Inventory" />
          </div>
        </CardContent>
      </Card>}

      {activeTab === "settings" ? (
        <ProductSettingsPage
          products={products}
          categories={categories}
          stockForm={stockForm}
          setStockForm={setStockForm}
          selectedProduct={selectedSettingsProduct}
          onSave={saveProductSettings}
        />
      ) : (
        <Card className="bg-red-700 border-red-800">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                {activeTab === "list" ? <Package className="w-5 h-5" /> : <Warehouse className="w-5 h-5" />}
                {activeTab === "list" ? "Product List / Master Data" : "Sellable Inventory"}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge className="bg-yellow-400 text-red-900">{filteredProducts.length} records</Badge>
                {activeTab === "list" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowArchived((prev) => !prev)}
                    className="border border-red-700 text-yellow-200 hover:bg-red-800"
                  >
                    {showArchived ? "Hide Archived" : "Show Archived"}
                  </Button>
                )}
                {activeTab === "list" && isExternallyRouted && (
                  <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={openAddProduct} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Product
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-red-700 border-red-800 text-yellow-200 max-w-2xl">
                      <DialogHeader>
                        <DialogTitle className="text-yellow-300">{editingProduct ? "Edit Product Master" : "Add Product Master"}</DialogTitle>
                      </DialogHeader>
                      <ProductMasterForm formData={productForm} setFormData={setProductForm} categories={categories} />
                      {editingProduct && (
                        <VariantUpdateScope
                          editScope={editScope}
                          setEditScope={setEditScope}
                          editableVariantGroup={editableVariantGroup}
                          selectedVariantIds={selectedVariantIds}
                          setSelectedVariantIds={setSelectedVariantIds}
                        />
                      )}
                      <DialogFooter className="flex items-center justify-between gap-2">
                        {editingProduct ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void deleteProduct(deleteTargetProductId || editingProduct.product_id)}
                            className="text-red-300 hover:bg-red-800/70 hover:text-red-100"
                          >
                            {editingProduct.isArchived ? "Restore Product" : "Delete / Archive Product"}
                          </Button>
                        ) : <span />}
                        <Button onClick={saveProduct} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                          {editingProduct ? "Update Product" : "Save Product"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
              <Input
                placeholder={activeTab === "inventory" ? "Search by SKU, product, brand, category, or variant..." : "Search by SKU, product, brand, or category..."}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
              />
            </div>
            {activeTab === "list" ? (
              <ProductListTable products={filteredProducts} onEdit={openEditProduct} />
            ) : (
              <InventoryTable products={filteredProducts} onConfigure={openSettingsForProduct} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={active ? "bg-yellow-400 text-red-900 hover:bg-yellow-500" : "bg-red-800 text-yellow-200 hover:bg-red-600"}
    >
      {icon}
      <span className="ml-2">{label}</span>
    </Button>
  );
}

function ProductListTable({ products, onEdit }: { products: UiProduct[]; onEdit: (product: UiProduct) => void }) {
  return (
    <div className="border border-red-800 rounded-lg overflow-x-auto">
      <Table className="w-full min-w-[980px]">
        <TableHeader>
          <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
            {['SKU', 'Product', 'Brand', 'Category', 'Color', 'Intended For', 'Size', 'Unit Price', 'Actions'].map((head) => (
              <TableHead key={head} className="text-yellow-300 text-center whitespace-nowrap">{head}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.product_id} className={`border-red-800 ${product.isArchived ? "opacity-55" : ""}`}>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{shortId(product.sku)}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">
                <span>{product.name}</span>
              </TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.brand}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.category}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.color}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.gender}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.size}</TableCell>
              <TableCell className="text-yellow-300 text-center whitespace-nowrap">{formatMoney(product.unit_price)}</TableCell>
              <TableCell className="text-center whitespace-nowrap">
                <div className="flex justify-center gap-2">
                  <Button size="sm" variant="ghost" className="text-yellow-400 hover:bg-red-600" onClick={() => onEdit(product)}><Edit className="w-4 h-4" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function InventoryTable({ products, onConfigure }: { products: UiProduct[]; onConfigure: (product: UiProduct) => void }) {
  const [selectedProduct, setSelectedProduct] = useState<UiProduct | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const openDetails = (product: UiProduct) => {
    setSelectedProduct(product);
    setIsDetailsOpen(true);
  };

  return (
    <div className="border border-red-800 rounded-lg overflow-x-auto">
      <Table className="w-full min-w-[760px]">
        <TableHeader>
          <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
            {["Product", "Variant", "Price", "Available", "Status", "Actions"].map((head) => (
              <TableHead key={head} className="text-yellow-300 text-center whitespace-nowrap">{head}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            return (
              <TableRow key={product.product_id} className="border-red-800">
                <TableCell className="text-yellow-200 text-center whitespace-nowrap font-medium">{product.name}</TableCell>
                <TableCell className="text-yellow-200 text-center whitespace-nowrap" title={variantLabel(product)}>{variantLabel(product)}</TableCell>
                <TableCell className="text-yellow-300 text-center whitespace-nowrap">{formatMoney(product.srp)}</TableCell>
                <TableCell className="text-center whitespace-nowrap">
                  <Badge className={product.available_stock > 0 ? "bg-green-700 text-white" : "bg-red-800 text-yellow-100"}>
                    {product.available_stock} available
                  </Badge>
                </TableCell>
                <TableCell className="text-center whitespace-nowrap"><Badge className={product.status === 'Active' ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'}>{product.status}</Badge></TableCell>
                <TableCell className="text-center whitespace-nowrap">
                  <div className="flex justify-center gap-2">
                    <Button size="sm" variant="ghost" title="View details" className="text-yellow-400 hover:bg-red-600" onClick={() => openDetails(product)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Product settings" className="text-yellow-400 hover:bg-red-600" onClick={() => onConfigure(product)}>
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-xl border-[#2d2d3a] bg-[#15151d] text-yellow-100">
          <DialogHeader>
            <DialogTitle className="text-yellow-300">Inventory Details</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <DetailPill label="SKU" value={shortId(selectedProduct.sku, 12, 8)} />
              <DetailPill label="Product" value={selectedProduct.name} />
              <DetailPill label="Brand" value={selectedProduct.brand} />
              <DetailPill label="Category" value={selectedProduct.category} />
              <DetailPill label="Variant" value={variantLabel(selectedProduct)} />
              <DetailPill label="Price" value={formatMoney(selectedProduct.srp)} />
              <DetailPill label="On Hand" value={`${selectedProduct.stock} units`} />
              <DetailPill label="Held" value={`${selectedProduct.reserved_stock} units`} />
              <DetailPill label="Available" value={`${selectedProduct.available_stock} units`} />
              <DetailPill label="Reorder" value={`${selectedProduct.reorder_level}`} />
              <DetailPill label="Status" value={selectedProduct.status} />
              <DetailPill label="Condition" value={stockCondition(selectedProduct.available_stock, selectedProduct.reorder_level, isExpiredProduct(selectedProduct)).label} />
              <DetailPill label="Manufacturer Date" value={selectedProduct.manufacturer_date ? selectedProduct.manufacturer_date.slice(0, 10) : "N/A"} />
              <DetailPill label="Expiration Date" value={selectedProduct.expiration_date ? selectedProduct.expiration_date.slice(0, 10) : "N/A"} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductSettingsPage({ products, stockForm, setStockForm, selectedProduct, onSave }: { products: UiProduct[]; categories: any[]; stockForm: StockFormData; setStockForm: (data: StockFormData) => void; selectedProduct?: UiProduct; onSave: () => void }) {
  const [settingsProductSearch, setSettingsProductSearch] = useState("");
  const [expandedGroupKey, setExpandedGroupKey] = useState("");
  const statusMeta = getProductStatusMeta(selectedProduct);
  const computedSrp = selectedProduct ? calculateSrpFromMarkup(selectedProduct.unit_price, stockForm.markup_rate) : 0;
  const markupAmount = selectedProduct ? computedSrp - Number(selectedProduct.unit_price || 0) : 0;
  const productGroups = useMemo(() => {
    const groupMap = new Map<string, { key: string; name: string; brand: string; category: string; variants: UiProduct[] }>();
    for (const product of products) {
      const key = productGroupKey(product);
      const existing = groupMap.get(key);
      if (existing) {
        existing.variants.push(product);
      } else {
        groupMap.set(key, {
          key,
          name: product.name,
          brand: product.brand,
          category: product.category,
          variants: [product],
        });
      }
    }
    return Array.from(groupMap.values()).map((group) => ({
      ...group,
      variants: group.variants.sort((a, b) => `${a.color} ${a.size}`.localeCompare(`${b.color} ${b.size}`, undefined, { numeric: true })),
    }));
  }, [products]);

  const filteredProductGroups = useMemo(() => {
    const term = settingsProductSearch.trim().toLowerCase();
    if (!term) return productGroups;
    return productGroups.filter((group) => {
      const searchable = [
        group.name,
        group.brand,
        group.category,
        ...group.variants.flatMap((product) => [
          product.sku,
          product.color,
          product.gender,
          product.size,
          String(product.unit_price),
        ]),
      ].join(" ").toLowerCase();
      return searchable.includes(term);
    });
  }, [productGroups, settingsProductSearch]);

  useEffect(() => {
    if (selectedProduct) setExpandedGroupKey(productGroupKey(selectedProduct));
  }, [selectedProduct]);

  const selectProductForSettings = (value: string) => {
    const product = products.find((item) => item.product_id === value);
    setStockForm({
      ...stockForm,
      product_id: value,
      stock_in: 0,
      reserved_quantity: product?.reserved_stock || 0,
      markup_rate: defaultMarkupRateForProduct(product),
      reorder_level: product?.reorder_level || 10,
      status: product?.status || 'Active',
      manufacturer_date: product?.manufacturer_date ? product.manufacturer_date.slice(0, 10) : "",
      expiration_date: product?.expiration_date ? product.expiration_date.slice(0, 10) : "",
    });
  };

  const formatPriceRange = (variants: UiProduct[]) => {
    const prices = variants.map((product) => Number(product.unit_price || 0));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatMoney(min) : `${formatMoney(min)} - ${formatMoney(max)}`;
  };

  return (
    <Card className="border-[#24242f] bg-[#101017]">
      <CardHeader className="pb-3">
        <CardTitle className="text-yellow-300 flex items-center gap-2"><Settings className="w-5 h-5" />Product Settings / Item Parameter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-6 pt-0">
        <div className="grid gap-6 2xl:gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.45fr)]">
          <div className="space-y-4 rounded-2xl border border-[#24242f] bg-[#12121a] p-5">
            <Label className="text-sm font-semibold text-yellow-200">Select Existing Product</Label>
            <Select value={stockForm.product_id} onValueChange={selectProductForSettings}>
              <SelectTrigger className="h-10 bg-[#1d1d27] border-[#2d2d3a] text-yellow-100 focus:ring-yellow-400/50"><SelectValue placeholder="Choose product from Product List" /></SelectTrigger>
              <SelectContent className="bg-[#15151d] border-[#2d2d3a] text-yellow-100 max-h-72">
                {products.map((product) => <SelectItem key={product.product_id} value={product.product_id}>{product.name} - {product.brand} - Size {product.size}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="rounded-2xl border border-[#2d2d3a] bg-[#15151d] p-4 shadow-inner shadow-black/20 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                <Input
                  value={settingsProductSearch}
                  onChange={(event) => setSettingsProductSearch(event.target.value)}
                  placeholder="Search by SKU, product, brand, variant, or unit price"
                  className="h-11 pl-10 bg-[#1d1d27] border-[#2d2d3a] text-yellow-100 placeholder:text-yellow-300/50 focus-visible:ring-yellow-400/50"
                />
              </div>
              <div className="rounded-xl border border-[#2d2d3a] bg-[#101018] p-2">
                <div className="max-h-72 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
                  {filteredProductGroups.length > 0 ? (
                    filteredProductGroups.map((group) => {
                      const isOpen = expandedGroupKey === group.key;
                      const hasSelectedVariant = group.variants.some((product) => product.product_id === stockForm.product_id);

                      return (
                        <div key={group.key} className={`rounded-lg border transition ${hasSelectedVariant ? "border-yellow-400/80 bg-yellow-400/10" : "border-[#262633] bg-[#15151d]"}`}>
                          <button
                            type="button"
                            onClick={() => setExpandedGroupKey(isOpen ? "" : group.key)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-white">{group.name}</span>
                              <span className="block truncate text-xs text-yellow-200/55">{group.brand} - {group.category}</span>
                            </span>
                            <span className="hidden rounded-full bg-[#20202a] px-2.5 py-1 text-xs text-yellow-100 sm:inline-flex">
                              {group.variants.length} variant{group.variants.length === 1 ? "" : "s"}
                            </span>
                            <span className="shrink-0 text-right text-xs font-semibold text-yellow-200">{formatPriceRange(group.variants)}</span>
                          </button>

                          {isOpen && (
                            <div className="space-y-1 border-t border-[#2d2d3a] p-2">
                              {group.variants.map((product) => {
                                const isSelected = stockForm.product_id === product.product_id;
                                return (
                                  <button
                                    type="button"
                                    key={product.product_id}
                                    onClick={() => selectProductForSettings(product.product_id)}
                                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                                      isSelected
                                        ? "bg-yellow-400 text-red-950"
                                        : "bg-[#111118] text-yellow-100 hover:bg-yellow-400/10 hover:text-white"
                                    }`}
                                  >
                                    <span className="min-w-0">
                                      <span className="font-semibold">{product.color} / Size {product.size}</span>
                                      <span className={`ml-2 text-xs ${isSelected ? "text-red-950/70" : "text-yellow-200/45"}`}>{shortId(product.sku)}</span>
                                    </span>
                                    <span className="shrink-0 font-semibold">{formatMoney(product.unit_price)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-[#2d2d3a] px-4 py-8 text-center text-sm text-yellow-200/60">
                      No master products match your search.
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-yellow-200/60">Open a product group, then select the exact color/size variant to configure stock.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-[#24242f] bg-[#12121a] p-3.5 text-yellow-100 shadow-inner shadow-black/20">
            <div className="mb-2.5 flex items-center gap-2">
              <Package className="h-4 w-4 text-yellow-300" />
              <p className="font-semibold text-yellow-100">Product Details</p>
            </div>
            {selectedProduct ? (
              <div className="space-y-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-bold leading-tight text-white">{selectedProduct.name}</p>
                    <p className="text-xs text-yellow-200/60">{shortId(selectedProduct.sku)} - {selectedProduct.brand}</p>
                  </div>
                  <Badge className={`w-fit border px-2.5 py-0.5 text-xs ${statusMeta.className}`}>{statusMeta.label}</Badge>
                </div>
                <div className="grid gap-1.5">
                  <DetailPill label="Category" value={selectedProduct.category} />
                  <DetailPill label="Variant" value={`${selectedProduct.color} / ${selectedProduct.size}`} />
                  <DetailPill label="Intended For" value={selectedProduct.gender} />
                  <DetailPill label="Unit Price" value={formatMoney(selectedProduct.unit_price)} />
                  <DetailPill label="On-Hand Stock" value={`${selectedProduct.stock} units`} />
                  <DetailPill label="Held Stock" value={`${selectedProduct.reserved_stock} units`} />
                  <DetailPill label="POS Available" value={`${selectedProduct.available_stock} units`} />
                  <DetailPill label="Manufacturer Date" value={selectedProduct.manufacturer_date ? selectedProduct.manufacturer_date.slice(0, 10) : "N/A"} />
                  <DetailPill label="Expiration Date" value={selectedProduct.expiration_date ? selectedProduct.expiration_date.slice(0, 10) : "N/A"} />
                  <DetailPill label="Inventory Status" value={selectedProduct.status} />
                </div>
                <div className="flex gap-2 rounded-lg border border-yellow-400/20 bg-yellow-400/10 p-2 text-xs text-yellow-100/80">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-yellow-300" />
                  <span>Configure stock-in quantity, held stock, SRP, reorder level, and inventory status below before saving.</span>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-[#343443] bg-[#111118] p-3 text-center">
                <Package className="mb-2 h-8 w-8 text-yellow-300/70" />
                <p className="text-sm font-semibold text-white">No product selected yet</p>
                <p className="mt-1 max-w-xs text-xs text-yellow-200/60">
                  Choose a product to set SRP, stock-in quantity, and POS availability.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#24242f] bg-[#12121a] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-yellow-100">Inventory Configuration</p>
              <p className="text-xs text-yellow-200/50">Review the current saved setup, then update stock, pricing, dates, and status.</p>
            </div>
          </div>

          {selectedProduct ? (
            <div className="mb-4 rounded-xl border border-[#2d2d3a] bg-[#15151d] p-3">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-yellow-100">Current Saved Configuration</p>
                  <p className="text-xs text-yellow-200/50">Loaded from INVENTORY for the selected product.</p>
                </div>
                <Badge className={`w-fit border px-2.5 py-0.5 text-xs ${statusMeta.className}`}>{statusMeta.label}</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <ConfigSnapshotPill label="On-Hand Stock" value={`${selectedProduct.stock} units`} />
                <ConfigSnapshotPill label="Held Stock" value={`${selectedProduct.reserved_stock} units`} />
                <ConfigSnapshotPill label="POS Available" value={`${selectedProduct.available_stock} units`} tone="good" />
                <ConfigSnapshotPill label="Current SRP" value={formatMoney(selectedProduct.srp)} />
                <ConfigSnapshotPill label="Reorder Level" value={`${selectedProduct.reorder_level} units`} />
                <ConfigSnapshotPill label="Manufacturer Date" value={formatDateValue(selectedProduct.manufacturer_date)} />
                <ConfigSnapshotPill label="Expiration Date" value={formatDateValue(selectedProduct.expiration_date)} tone={isExpiredProduct(selectedProduct) ? "danger" : "default"} />
                <ConfigSnapshotPill label="Inventory Status" value={selectedProduct.status} />
              </div>
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-dashed border-[#343443] bg-[#15151d] px-3 py-4 text-center text-sm text-yellow-100/60">
              Select a product above to load its current inventory configuration.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <NumberField label="Stock-in Quantity to Add" value={stockForm.stock_in} onChange={(value) => setStockForm({ ...stockForm, stock_in: value })} />
            <NumberField label="Held / Reserved Stock" value={stockForm.reserved_quantity} onChange={(value) => setStockForm({ ...stockForm, reserved_quantity: value })} />
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-yellow-300">Markup Rate</Label>
              <Select value={String(stockForm.markup_rate)} onValueChange={(value) => setStockForm({ ...stockForm, markup_rate: Number(value) })}>
                <SelectTrigger className="h-9 bg-[#1d1d27] border-[#2d2d3a] text-yellow-100 focus:ring-yellow-400/50"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#15151d] border-[#2d2d3a] text-yellow-100">
                  {MARKUP_RATE_OPTIONS.map((rate) => (
                    <SelectItem key={rate} value={String(rate)}>{rate.toFixed(2)}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-yellow-300">Calculated SRP</Label>
              <div className="flex h-9 items-center rounded-md border border-[#2d2d3a] bg-[#1d1d27] px-3 text-sm font-semibold text-yellow-100">
                {formatMoney(computedSrp)}
              </div>
            </div>
            <NumberField label="Reorder Level" value={stockForm.reorder_level} onChange={(value) => setStockForm({ ...stockForm, reorder_level: value })} />
          </div>

          <div className="mt-2 text-xs text-yellow-200/55">
            SRP is computed as {formatMoney(selectedProduct?.unit_price || 0)} unit price + {formatMoney(markupAmount)} markup.
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-yellow-300">Manufacturer Date</Label>
              <Input type="date" value={stockForm.manufacturer_date} onChange={(event) => setStockForm({ ...stockForm, manufacturer_date: event.target.value })} className="h-9 bg-[#1d1d27] border-[#2d2d3a] text-yellow-100 focus-visible:ring-yellow-400/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-yellow-300">Expiration Date</Label>
              <Input type="date" value={stockForm.expiration_date} onChange={(event) => setStockForm({ ...stockForm, expiration_date: event.target.value })} className="h-9 bg-[#1d1d27] border-[#2d2d3a] text-yellow-100 focus-visible:ring-yellow-400/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-yellow-300">Inventory Status</Label>
              <Select value={stockForm.status} onValueChange={(value) => setStockForm({ ...stockForm, status: value as InventoryStatus })}>
                <SelectTrigger className="h-9 bg-[#1d1d27] border-[#2d2d3a] text-yellow-100 focus:ring-yellow-400/50"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#15151d] border-[#2d2d3a] text-yellow-100"><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100/80 lg:flex-row lg:items-center lg:justify-between">
            <p>
              Saves SRP, on-hand stock, held stock, reorder level, and status to INVENTORY. Held stock is excluded from POS availability.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setStockForm(defaultStockForm)} className="h-9 border-[#3a3a46] bg-transparent px-4 text-yellow-100 hover:bg-[#1d1d27] hover:text-yellow-300">Clear</Button>
              <Button onClick={onSave} className="h-9 bg-yellow-400 px-5 text-red-900 hover:bg-yellow-500">Save Settings</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductMasterForm({ formData, setFormData, categories }: { formData: ProductFormData; setFormData: (data: ProductFormData) => void; categories: any[] }) {
  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Product Name *" value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} />
        <TextField label="Brand *" value={formData.brand} onChange={(value) => setFormData({ ...formData, brand: value })} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-yellow-300">Category *</Label>
          <Select value={formData.category_id} onValueChange={(value) => setFormData({ ...formData, category_id: value })}>
            <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
              {categories.map((category: any) => <SelectItem key={category.category_id} value={category.category_id}>{category.category_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <TextField label="Size" value={formData.size} onChange={(value) => setFormData({ ...formData, size: value })} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="Color" value={formData.color} onChange={(value) => setFormData({ ...formData, color: value })} />
        <div className="space-y-2">
          <Label className="text-yellow-300">Intended For</Label>
          <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
            <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200"><SelectValue placeholder="Select intended audience" /></SelectTrigger>
            <SelectContent className="bg-red-700 border-red-800 text-yellow-200"><SelectItem value="Men">Men</SelectItem><SelectItem value="Women">Women</SelectItem><SelectItem value="Kids">Kids</SelectItem><SelectItem value="Unisex">Unisex</SelectItem></SelectContent>
          </Select>
        </div>
        <NumberField label="Unit Price" value={formData.unit_price} onChange={(value) => setFormData({ ...formData, unit_price: value })} />
      </div>
    </div>
  );
}

function VariantUpdateScope({
  editScope,
  setEditScope,
  editableVariantGroup,
  selectedVariantIds,
  setSelectedVariantIds,
}: {
  editScope: ProductEditScope;
  setEditScope: (scope: ProductEditScope) => void;
  editableVariantGroup: UiProduct[];
  selectedVariantIds: string[];
  setSelectedVariantIds: (ids: string[]) => void;
}) {
  const toggleVariant = (productId: string) => {
    if (selectedVariantIds.includes(productId)) {
      setSelectedVariantIds(selectedVariantIds.filter((id) => id !== productId));
      return;
    }
    setSelectedVariantIds([...selectedVariantIds, productId]);
  };

  return (
    <div className="rounded-xl border border-[#2d2d3a] bg-[#12121a] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-300/70">Update Scope</p>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setEditScope("this_variant")}
          className={editScope === "this_variant" ? "bg-yellow-400 text-red-900 hover:bg-yellow-500" : "border border-[#2d2d3a] text-yellow-100 hover:bg-[#1d1d27]"}
        >
          This variant only
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setEditScope("selected_variants")}
          className={editScope === "selected_variants" ? "bg-yellow-400 text-red-900 hover:bg-yellow-500" : "border border-[#2d2d3a] text-yellow-100 hover:bg-[#1d1d27]"}
        >
          Selected variants
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setEditScope("all_variants_base")}
          className={editScope === "all_variants_base" ? "bg-yellow-400 text-red-900 hover:bg-yellow-500" : "border border-[#2d2d3a] text-yellow-100 hover:bg-[#1d1d27]"}
        >
          All variants of base
        </Button>
      </div>

      {editScope !== "this_variant" && (
        <div className="mt-3 rounded-lg border border-[#2d2d3a] bg-[#15151d] p-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-yellow-200/80">Select which variants are affected:</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedVariantIds(editableVariantGroup.map((variant) => variant.product_id))}
              className="h-7 px-2 text-xs text-yellow-200 hover:bg-[#1d1d27]"
            >
              Select all
            </Button>
          </div>
          <div className="grid max-h-36 gap-1 overflow-y-auto pr-1">
            {editableVariantGroup.map((variant) => (
              <label key={variant.product_id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-yellow-100 hover:bg-[#1d1d27]">
                <input
                  type="checkbox"
                  checked={selectedVariantIds.includes(variant.product_id)}
                  onChange={() => toggleVariant(variant.product_id)}
                  className="h-4 w-4 accent-yellow-400"
                />
                <span className="text-xs">
                  {variant.color} / {variant.size} ({shortId(variant.sku)})
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-yellow-300/70">
            Group updates change base fields only (name, brand, category, unit price). Variant attributes stay unchanged.
          </p>
        </div>
      )}
    </div>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#2d2d3a] bg-[#1d1d27] px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-yellow-300/60">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold leading-tight text-yellow-50">{value || "N/A"}</p>
    </div>
  );
}

function ConfigSnapshotPill({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "danger" }) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
      : tone === "danger"
        ? "border-red-500/30 bg-red-500/10 text-red-100"
        : "border-[#2d2d3a] bg-[#1d1d27] text-yellow-50";

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-yellow-300/60">{label}</p>
      <p className="mt-1 truncate text-sm font-bold">{value || "Not set"}</p>
    </div>
  );
}

function formatDateValue(value?: string) {
  const date = String(value ?? "").slice(0, 10);
  return date || "Not set";
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-yellow-300">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="bg-[#1d1d27] border-[#2d2d3a] text-yellow-100" />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [inputValue, setInputValue] = useState(String(Number(value || 0)));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(String(Number(value || 0)));
    }
  }, [isFocused, value]);

  const commitValue = (rawValue: string) => {
    if (rawValue === "") {
      setInputValue(String(Number(value || 0)));
      return;
    }

    const nextValue = Math.max(0, Number(rawValue) || 0);
    setInputValue(String(nextValue));
    onChange(nextValue);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-yellow-300">{label}</Label>
      <Input
        type="number"
        min={0}
        value={inputValue}
        onFocus={() => setIsFocused(true)}
        onBlur={(event) => {
          setIsFocused(false);
          commitValue(event.target.value);
        }}
        onChange={(event) => {
          const rawValue = event.target.value;
          setInputValue(rawValue);
          if (rawValue !== "") {
            onChange(Math.max(0, Number(rawValue) || 0));
          }
        }}
        className="h-9 bg-[#1d1d27] border-[#2d2d3a] text-yellow-100 focus-visible:ring-yellow-400/50"
      />
    </div>
  );
}

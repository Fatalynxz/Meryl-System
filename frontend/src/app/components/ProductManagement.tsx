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
import { Edit, Info, Package, Plus, Search, Settings, Trash2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { useCategories, useInventory, useProducts, useProductsMutations } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";

type InventoryStatus = "Active" | "Inactive";
type ProductTab = "list" | "settings" | "inventory";

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
  reorder_level: number;
  srp: number;
  status: InventoryStatus;
  hasInventory: boolean;
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
  srp: number;
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
  srp: 0,
  reorder_level: 10,
  status: "Active",
  manufacturer_date: "",
  expiration_date: "",
};

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
  if (Number(product.stock || 0) <= 0) return { label: "Out of Stock", className: "border-red-500/40 bg-red-500/15 text-red-200" };
  if (Number(product.stock || 0) <= Number(product.reorder_level || 0)) return { label: "Low Stock", className: "border-yellow-400/40 bg-yellow-400/15 text-yellow-100" };
  return { label: "Active", className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" };
}

function stockCondition(stock: number, reorder: number) {
  if (stock <= 0) return { label: "Out of Stock", className: "bg-red-900 text-yellow-100" };
  if (stock <= reorder) return { label: "Critical", className: "bg-red-700 text-yellow-100" };
  if (stock <= reorder + 5) return { label: "Warning", className: "bg-yellow-600 text-red-950" };
  return { label: "Good", className: "bg-green-700 text-white" };
}

function formatMoney(value: number) {
  return `PHP ${Number(value || 0).toLocaleString()}`;
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
  const [productForm, setProductForm] = useState<ProductFormData>(defaultProductForm);
  const [stockForm, setStockForm] = useState<StockFormData>(defaultStockForm);

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
      const unitPrice = Number(row.unit_price ?? row.cost_price ?? 0);
      const srp = Number(inventory?.srp ?? row.price ?? row.cost_price ?? unitPrice);
      const reorder = Number(inventory?.reorder_level ?? row.reorder_level ?? 10);
      const status = toUiStatus(inventory?.inventory_status ?? row.status);
      return {
        id: String(row.product_id ?? ""),
        product_id: String(row.product_id ?? ""),
        sku: String(row.sku ?? row.product_id ?? ""),
        name: String(row.product_name ?? "Unnamed Product"),
        brand: String(row.brand ?? "N/A"),
        category: String(category?.category_name ?? "Uncategorized"),
        category_id: String(row.category_id ?? ""),
        color: String(row.color ?? "Default"),
        gender: String(row.gender ?? "N/A"),
        size: String(row.size ?? "N/A"),
        unit_price: unitPrice,
        inventory_id: inventory?.inventory_id ? String(inventory.inventory_id) : "",
        stock: Number(inventory?.stock_quantity ?? 0),
        reorder_level: reorder,
        srp,
        status,
        hasInventory: Boolean(inventory?.inventory_id),
      };
    });
  }, [inventoryByProductId, productsQuery.data]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.product_id, product])), [products]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const source = activeTab === "inventory" ? products.filter((product) => product.hasInventory) : products;
    return source.filter(
      (product) =>
        product.name.toLowerCase().includes(q) ||
        product.brand.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q),
    );
  }, [activeTab, products, searchTerm]);

  const selectedSettingsProduct = productMap.get(stockForm.product_id);
  const isExternallyRouted = Boolean(view);

  const openAddProduct = () => {
    setEditingProduct(null);
    setProductForm(defaultProductForm);
    setIsProductDialogOpen(true);
  };

  const openEditProduct = (product: UiProduct) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      brand: product.brand === "N/A" ? "" : product.brand,
      category_id: product.category_id,
      color: product.color === "Default" ? "" : product.color,
      gender: product.gender === "N/A" ? "" : product.gender,
      size: product.size === "N/A" ? "" : product.size,
      unit_price: product.unit_price,
    });
    setIsProductDialogOpen(true);
  };

  const openSettingsForProduct = (product: UiProduct) => {
    setActiveTab("settings");
    setStockForm({
      product_id: product.product_id,
      stock_in: 0,
      srp: product.srp || product.unit_price,
      reorder_level: product.reorder_level || 10,
      status: product.status,
      manufacturer_date: "",
      expiration_date: "",
    });
  };

  const validateProductForm = () => {
    if (!productForm.name.trim()) return "Product name is required.";
    if (!productForm.brand.trim()) return "Brand is required.";
    if (!productForm.category_id) return "Category is required.";
    if (Number(productForm.unit_price) < 0) return "Unit price must be greater than or equal to 0.";
    return "";
  };

  const saveProduct = async () => {
    const validation = validateProductForm();
    if (validation) return toast.error(validation);

    const payload = {
      product_name: productForm.name.trim(),
      brand: productForm.brand.trim(),
      category_id: productForm.category_id,
      size: productForm.size.trim() || null,
      color: productForm.color.trim() || null,
      gender: productForm.gender || null,
      cost_price: Number(productForm.unit_price || 0),
    } as any;

    try {
      if (editingProduct) {
        await productMutations.updateMutation.mutateAsync({ id: editingProduct.product_id, payload });
        toast.success("Product master data updated.");
      } else {
        await productMutations.createMutation.mutateAsync(payload);
        toast.success("Product added to Product List.");
      }
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      setIsProductDialogOpen(false);
      setEditingProduct(null);
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
    if (Number(stockForm.srp) <= Number(product.unit_price)) {
      return toast.error("SRP / selling price must be greater than unit price.");
    }
    if (Number(stockForm.reorder_level) < 0) return toast.error("Reorder level must be greater than or equal to 0.");
    if (stockForm.manufacturer_date && stockForm.expiration_date && stockForm.expiration_date < stockForm.manufacturer_date) {
      return toast.error("Expiration date must not be earlier than manufacturer date.");
    }

    const nextStock = Number(product.stock || 0) + Number(stockForm.stock_in || 0);
    const inventoryPayload = {
      stock_quantity: nextStock,
      reorder_level: Number(stockForm.reorder_level || 0),
      srp: Number(stockForm.srp || product.srp || product.unit_price || 0),
      inventory_status: toDbStatus(stockForm.status),
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

  const deleteProduct = async (product: UiProduct) => {
    if (product.hasInventory) {
      toast.error("This product has inventory. Remove or archive inventory before deleting master data.");
      return;
    }
    try {
      await productMutations.removeMutation.mutateAsync(product.product_id);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted from Product List.");
    } catch (error: any) {
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
                      <DialogFooter>
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
                placeholder="Search by SKU, product, brand, or category..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
              />
            </div>
            {activeTab === "list" ? (
              <ProductListTable products={filteredProducts} onEdit={openEditProduct} onDelete={deleteProduct} onConfigure={openSettingsForProduct} />
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

function ProductListTable({ products, onEdit, onDelete, onConfigure }: { products: UiProduct[]; onEdit: (product: UiProduct) => void; onDelete: (product: UiProduct) => void; onConfigure: (product: UiProduct) => void }) {
  return (
    <div className="border border-red-800 rounded-lg overflow-x-auto">
      <Table className="w-full min-w-[980px]">
        <TableHeader>
          <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
            {['SKU', 'Product', 'Brand', 'Category', 'Color', 'Gender', 'Size', 'Unit Price', 'Actions'].map((head) => (
              <TableHead key={head} className="text-yellow-300 text-center whitespace-nowrap">{head}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.product_id} className="border-red-800">
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{shortId(product.sku)}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.name}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.brand}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.category}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.color}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.gender}</TableCell>
              <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.size}</TableCell>
              <TableCell className="text-yellow-300 text-center whitespace-nowrap">{formatMoney(product.unit_price)}</TableCell>
              <TableCell className="text-center whitespace-nowrap">
                <div className="flex justify-center gap-2">
                  <Button size="sm" variant="ghost" className="text-yellow-400 hover:bg-red-600" onClick={() => onConfigure(product)}><Settings className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-yellow-400 hover:bg-red-600" onClick={() => onEdit(product)}><Edit className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-yellow-400 hover:bg-red-600" onClick={() => onDelete(product)}><Trash2 className="w-4 h-4" /></Button>
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
  return (
    <div className="border border-red-800 rounded-lg overflow-x-auto">
      <Table className="w-full min-w-[1120px]">
        <TableHeader>
          <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
            {['SKU', 'Product', 'Brand', 'Category', 'Color', 'Gender', 'Size', 'Price', 'Stock', 'Reorder', 'Status', 'Condition', 'Actions'].map((head) => (
              <TableHead key={head} className="text-yellow-300 text-center whitespace-nowrap">{head}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const condition = stockCondition(product.stock, product.reorder_level);
            return (
              <TableRow key={product.product_id} className="border-red-800">
                <TableCell className="text-yellow-200 text-center whitespace-nowrap">{shortId(product.sku)}</TableCell>
                <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.name}</TableCell>
                <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.brand}</TableCell>
                <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.category}</TableCell>
                <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.color}</TableCell>
                <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.gender}</TableCell>
                <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.size}</TableCell>
                <TableCell className="text-yellow-300 text-center whitespace-nowrap">{formatMoney(product.srp)}</TableCell>
                <TableCell className="text-center whitespace-nowrap"><Badge className="bg-yellow-400 text-red-900">{product.stock} units</Badge></TableCell>
                <TableCell className="text-yellow-200 text-center whitespace-nowrap">{product.reorder_level}</TableCell>
                <TableCell className="text-center whitespace-nowrap"><Badge className={product.status === 'Active' ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'}>{product.status}</Badge></TableCell>
                <TableCell className="text-center whitespace-nowrap"><Badge className={condition.className}>{condition.label}</Badge></TableCell>
                <TableCell className="text-center whitespace-nowrap"><Button size="sm" variant="ghost" className="text-yellow-400 hover:bg-red-600" onClick={() => onConfigure(product)}><Settings className="w-4 h-4" /></Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ProductSettingsPage({ products, stockForm, setStockForm, selectedProduct, onSave }: { products: UiProduct[]; categories: any[]; stockForm: StockFormData; setStockForm: (data: StockFormData) => void; selectedProduct?: UiProduct; onSave: () => void }) {
  const [settingsProductSearch, setSettingsProductSearch] = useState("");
  const statusMeta = getProductStatusMeta(selectedProduct);
  const filteredProducts = useMemo(() => {
    const term = settingsProductSearch.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      [
        product.sku,
        product.name,
        product.brand,
        product.category,
        product.color,
        product.gender,
        product.size,
        String(product.unit_price),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [products, settingsProductSearch]);

  const selectProductForSettings = (value: string) => {
    const product = products.find((item) => item.product_id === value);
    setStockForm({
      ...stockForm,
      product_id: value,
      srp: product?.srp || product?.unit_price || 0,
      reorder_level: product?.reorder_level || 10,
      status: product?.status || 'Active',
    });
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
              <div className="rounded-xl border border-[#2d2d3a] overflow-hidden">
                <div className="sticky top-0 z-10 grid grid-cols-[minmax(220px,1.7fr)_0.75fr_0.9fr_0.8fr] gap-5 bg-[#1d1d27] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-yellow-200/80">
                  <span>Product</span>
                  <span className="text-center">Brand</span>
                  <span className="text-center">Variant</span>
                  <span className="text-right">Unit Price</span>
                </div>
                <div className="max-h-64 overflow-y-auto overflow-x-hidden">
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map((product) => {
                      const isSelected = stockForm.product_id === product.product_id;

                      return (
                        <button
                          type="button"
                          key={product.product_id}
                          onClick={() => selectProductForSettings(product.product_id)}
                          className={`grid w-full grid-cols-[minmax(220px,1.7fr)_0.75fr_0.9fr_0.8fr] items-center gap-5 border-t border-[#2d2d3a] px-4 py-3 text-left transition duration-150 ${
                            isSelected ? "bg-yellow-400 text-red-950 shadow-inner shadow-yellow-700/20" : "text-yellow-100 hover:bg-yellow-400/10 hover:text-white"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{product.name}</span>
                            <span className={`block truncate text-xs ${isSelected ? "text-red-950/70" : "text-yellow-200/50"}`}>{shortId(product.sku)}</span>
                          </span>
                          <span className="truncate text-center">{product.brand}</span>
                          <span className="truncate text-center">{product.color} / {product.size}</span>
                          <span className="text-right font-semibold">{formatMoney(product.unit_price)}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="border-t border-[#2d2d3a] px-4 py-8 text-center text-sm text-yellow-200/60">
                      No master products match your search.
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-yellow-200/60">Click a product row to load its default details and configure stock.</p>
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
                  <DetailPill label="Gender" value={selectedProduct.gender} />
                  <DetailPill label="Unit Price" value={formatMoney(selectedProduct.unit_price)} />
                  <DetailPill label="Current Stock" value={`${selectedProduct.stock} units`} />
                  <DetailPill label="Inventory Status" value={selectedProduct.status} />
                </div>
                <div className="flex gap-2 rounded-lg border border-yellow-400/20 bg-yellow-400/10 p-2 text-xs text-yellow-100/80">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-yellow-300" />
                  <span>Configure stock-in quantity, SRP, reorder level, and inventory status below before saving.</span>
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
              <p className="text-xs text-yellow-200/50">Set sellable stock, pricing, reorder threshold, and status.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <NumberField label="Stock-in Quantity" value={stockForm.stock_in} onChange={(value) => setStockForm({ ...stockForm, stock_in: value })} />
            <NumberField label="SRP / Selling Price" value={stockForm.srp} onChange={(value) => setStockForm({ ...stockForm, srp: value })} />
            <NumberField label="Reorder Level" value={stockForm.reorder_level} onChange={(value) => setStockForm({ ...stockForm, reorder_level: value })} />
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
              Saves SRP, stock, reorder level, and status to INVENTORY. Product List unit price stays unchanged.
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
          <Label className="text-yellow-300">Gender</Label>
          <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
            <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200"><SelectValue placeholder="Select gender" /></SelectTrigger>
            <SelectContent className="bg-red-700 border-red-800 text-yellow-200"><SelectItem value="Men">Men</SelectItem><SelectItem value="Women">Women</SelectItem><SelectItem value="Kids">Kids</SelectItem><SelectItem value="Unisex">Unisex</SelectItem></SelectContent>
          </Select>
        </div>
        <NumberField label="Unit Price" value={formData.unit_price} onChange={(value) => setFormData({ ...formData, unit_price: value })} />
      </div>
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

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-yellow-300">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="bg-[#1d1d27] border-[#2d2d3a] text-yellow-100" />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-yellow-300">{label}</Label>
      <Input type="number" value={value === 0 ? "" : value} onChange={(event) => onChange(event.target.value === "" ? 0 : Math.max(0, Number(event.target.value) || 0))} className="h-9 bg-[#1d1d27] border-[#2d2d3a] text-yellow-100 focus-visible:ring-yellow-400/50" />
    </div>
  );
}

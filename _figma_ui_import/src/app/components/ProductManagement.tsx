import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Edit, Package, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCategories, useInventory, useProducts, useProductsMutations } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";

type UiProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  category_id: string | null;
  size: string;
  color: string;
  cost_price: number;
  price: number;
  reorder_level: number;
  stock: number;
  status: "Active" | "Inactive";
  sku: string;
  product_id: string;
};

type ProductFormData = {
  name: string;
  brand: string;
  category_id: string;
  size: string;
  color: string;
  cost_price: number;
  price: number;
  reorder_level: number;
  stock: number;
  status: "Active" | "Inactive";
  sku: string;
};

function toDbStatus(status: ProductFormData["status"]): "active" | "inactive" {
  return status === "Active" ? "active" : "inactive";
}

function toUiStatus(value: string | null | undefined): ProductFormData["status"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "active" || normalized === "available") return "Active";
  return "Inactive";
}

function buildClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `inv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const defaultForm: ProductFormData = {
  name: "",
  brand: "",
  category_id: "",
  size: "",
  color: "",
  cost_price: 0,
  price: 0,
  reorder_level: 10,
  stock: 0,
  status: "Active",
  sku: "",
};

function toUiProduct(row: any, inventoryByProductId: Record<string, any>): UiProduct {
  const firstInventory = inventoryByProductId[String(row.product_id)] ?? null;
  const category = Array.isArray(row.category) ? row.category[0] : row.category;
  return {
    id: row.product_id,
    product_id: row.product_id,
    name: row.product_name ?? "Unnamed",
    brand: row.brand ?? "N/A",
    category: category?.category_name ?? "Uncategorized",
    category_id: row.category_id ?? null,
    size: row.size ?? "N/A",
    color: row.color ?? "N/A",
    cost_price: Number(row.cost_price ?? 0),
    price: Number(row.cost_price ?? 0),
    reorder_level: Number(row.reorder_level ?? firstInventory?.reorder_level ?? 0),
    stock: Number(firstInventory?.stock_quantity ?? 0),
    status: toUiStatus(row.status),
    sku: row.product_id,
  };
}

export function ProductManagement() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<UiProduct | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(defaultForm);

  const productsQuery = useProducts();
  const inventoryQuery = useInventory();
  const categoriesQuery = useCategories();
  const productMutations = useProductsMutations();

  const inventoryByProductId = useMemo(() => {
    const rows = (inventoryQuery.data as any[]) ?? [];
    const map: Record<string, any> = {};
    for (const row of rows) {
      const key = String(row.product_id ?? "");
      if (!key) continue;
      map[key] = row;
    }
    return map;
  }, [inventoryQuery.data]);

  const products = useMemo<UiProduct[]>(
    () => (productsQuery.data ?? []).map((row) => toUiProduct(row, inventoryByProductId)),
    [productsQuery.data, inventoryByProductId],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.sku.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [products, searchTerm],
  );

  const openEditDialog = (product: UiProduct) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      brand: product.brand,
      category_id: product.category_id ?? "",
      size: product.size,
      color: product.color,
      cost_price: product.cost_price,
      price: product.price,
      reorder_level: product.reorder_level,
      stock: product.stock,
      status: product.status,
      sku: product.sku,
    });
  };

  const upsertInventoryAbsolute = async (productId: string, stock: number, reorderLevel: number) => {
    const { data: existing, error: selectError } = await supabase
      .from("inventory")
      .select("inventory_id")
      .eq("product_id", productId)
      .limit(1);

    if (selectError) throw selectError;

    if (existing && existing.length > 0) {
      const { error: updateError } = await supabase
        .from("inventory")
        .update({
          stock_quantity: Math.max(0, stock),
          reorder_level: reorderLevel,
          last_updated: new Date().toISOString(),
        })
        .eq("product_id", productId);

      if (updateError) throw updateError;
      return;
    }

    const { error: insertError } = await supabase.from("inventory").insert({
      inventory_id: buildClientId(),
      product_id: productId,
      stock_quantity: Math.max(0, stock),
      reorder_level: reorderLevel,
      last_updated: new Date().toISOString(),
    });

    if (insertError) throw insertError;
  };

  const handleAddProduct = async () => {
    if (!formData.name || !formData.category_id) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const created = await productMutations.createMutation.mutateAsync({
        product_name: formData.name,
        category_id: formData.category_id,
        size: formData.size || null,
        color: formData.color || null,
        cost_price: formData.price ?? formData.cost_price ?? 0,
        reorder_level: formData.reorder_level ?? 10,
        status: toDbStatus(formData.status ?? "Active"),
      });

      if (formData.stock > 0) {
        await upsertInventoryAbsolute(
          (created as any).product_id,
          Number(formData.stock ?? 0),
          Number(formData.reorder_level ?? 10),
        );
      }

      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setIsAddDialogOpen(false);
      setFormData(defaultForm);
      toast.success("Product added successfully!");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to add product");
    }
  };

  const handleEditProduct = async () => {
    if (!editingProduct) return;
    try {
      await productMutations.updateMutation.mutateAsync({
        id: editingProduct.product_id,
        payload: {
          product_name: formData.name,
          category_id: formData.category_id || editingProduct.category_id,
          size: formData.size || null,
          color: formData.color || null,
          cost_price: formData.price ?? formData.cost_price ?? 0,
          reorder_level: formData.reorder_level ?? editingProduct.reorder_level,
          status: toDbStatus(formData.status ?? editingProduct.status),
        },
      });

      await upsertInventoryAbsolute(
        editingProduct.product_id,
        Number(formData.stock ?? 0),
        Number(formData.reorder_level ?? editingProduct.reorder_level ?? 10),
      );

      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setEditingProduct(null);
      setFormData(defaultForm);
      toast.success("Product updated successfully!");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update product");
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await productMutations.removeMutation.mutateAsync(id);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Product deleted successfully!");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete product");
    }
  };

  return (
    <Card className="bg-red-700 border-red-800">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-yellow-300 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Product Inventory
          </CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-red-700 border-red-800 text-yellow-200">
              <DialogHeader>
                <DialogTitle className="text-yellow-300">Add New Product</DialogTitle>
              </DialogHeader>
              <ProductForm
                formData={formData}
                setFormData={setFormData}
                categories={(categoriesQuery.data as any[]) ?? []}
              />
              <DialogFooter>
                <Button onClick={handleAddProduct} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                  Add Product
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
            placeholder="Search products by name, brand, or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
          />
        </div>

        <div className="border border-red-800 rounded-lg overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <Table className="w-full min-w-[1120px] text-base">
            <TableHeader>
              <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                <TableHead className="text-yellow-300 whitespace-nowrap py-4 px-3">SKU</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap py-4 px-3">Product</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap py-4 px-3">Brand</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap py-4 px-3">Category</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap text-center py-4 px-3">Size</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap text-right py-4 px-3">Price</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap text-center py-4 px-3">Stock</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap text-center py-4 px-3">Reorder</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap text-center py-4 px-3 min-w-[110px]">Status</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap text-right py-4 px-3 min-w-[90px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id} className="border-red-800">
                  <TableCell className="text-yellow-200 text-sm whitespace-nowrap truncate py-4 px-3">{product.sku}</TableCell>
                  <TableCell className="text-yellow-200 whitespace-nowrap truncate py-4 px-3">{product.name}</TableCell>
                  <TableCell className="text-yellow-200 whitespace-nowrap py-4 px-3">{product.brand}</TableCell>
                  <TableCell className="text-yellow-200 whitespace-nowrap truncate py-4 px-3">{product.category}</TableCell>
                  <TableCell className="text-yellow-200 whitespace-nowrap text-center py-4 px-3">{product.size}</TableCell>
                  <TableCell className="text-yellow-300 whitespace-nowrap text-right py-4 px-3">PHP {product.price}</TableCell>
                  <TableCell className="whitespace-nowrap text-center py-4 px-3 min-w-[110px]">
                    <Badge
                      variant={product.stock <= product.reorder_level ? "destructive" : "default"}
                      className={product.stock <= product.reorder_level ? "bg-yellow-600 text-red-900" : "bg-yellow-400 text-red-900"}
                    >
                      {product.stock} units
                    </Badge>
                  </TableCell>
                  <TableCell className="text-yellow-200 whitespace-nowrap text-center py-4 px-3">{product.reorder_level}</TableCell>
                  <TableCell className="whitespace-nowrap text-center py-4 px-3">
                    <Badge
                      className={
                        product.status === "Active"
                          ? "bg-green-600 text-white"
                          : "bg-gray-600 text-white"
                      }
                    >
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 px-3 min-w-[90px]">
                    <div className="flex justify-end gap-2">
                      <Dialog
                        open={editingProduct?.id === product.id}
                        onOpenChange={(open) => !open && setEditingProduct(null)}
                      >
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                            onClick={() => openEditDialog(product)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-red-700 border-red-800 text-yellow-200">
                          <DialogHeader>
                            <DialogTitle className="text-yellow-300">Edit Product</DialogTitle>
                          </DialogHeader>
                          <ProductForm
                            formData={formData}
                            setFormData={setFormData}
                            categories={(categoriesQuery.data as any[]) ?? []}
                          />
                          <DialogFooter>
                            <Button onClick={handleEditProduct} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                              Update Product
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                        onClick={() => handleDeleteProduct(product.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductForm({
  formData,
  setFormData,
  categories,
}: {
  formData: ProductFormData;
  setFormData: (data: ProductFormData) => void;
  categories: any[];
}) {
  const filteredCategories = categories.filter((category: any) => {
    const name = String(category?.category_name ?? "").trim().toLowerCase();
    return !["kid", "kids", "men", "women"].includes(name);
  });

  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-yellow-300">
            Product Name *
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="brand" className="text-yellow-300">
            Brand *
          </Label>
          <Input
            id="brand"
            value={formData.brand}
            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category" className="text-yellow-300">
            Category
          </Label>
          <Select
            value={formData.category_id}
            onValueChange={(value) => setFormData({ ...formData, category_id: value })}
          >
            <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
              {filteredCategories.map((category: any) => (
                <SelectItem key={category.category_id} value={category.category_id}>
                  {category.category_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="size" className="text-yellow-300">
            Size
          </Label>
          <Input
            id="size"
            value={formData.size}
            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="color" className="text-yellow-300">
            Color
          </Label>
          <Input
            id="color"
            value={formData.color}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sku" className="text-yellow-300">
            SKU
          </Label>
          <Input
            id="sku"
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price" className="text-yellow-300">
            Selling Price (₱) *
          </Label>
          <Input
            id="price"
            type="number"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value || "0") })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="stock" className="text-yellow-300">
            Stock Quantity
          </Label>
          <Input
            id="stock"
            type="number"
            value={formData.stock}
            onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value || "0", 10) })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reorder_level" className="text-yellow-300">
            Reorder Level
          </Label>
          <Input
            id="reorder_level"
            type="number"
            value={formData.reorder_level}
            onChange={(e) => setFormData({ ...formData, reorder_level: parseInt(e.target.value || "0", 10) })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status" className="text-yellow-300">
            Status
          </Label>
          <Select
            value={formData.status}
            onValueChange={(value) => setFormData({ ...formData, status: value as ProductFormData["status"] })}
          >
            <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}



import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Plus, Search, Edit, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';

type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  size: string;
  color: string;
  cost_price: number;
  price: number;
  reorder_level: number;
  stock: number;
  status: 'Active' | 'Inactive' | 'Discontinued';
  sku: string;
};

export function ProductManagement() {
  const [products, setProducts] = useState<Product[]>([
    { id: '1', name: 'Air Max 90', brand: 'Nike', category: 'Running', size: '10', color: 'Black', cost_price: 80, price: 120, reorder_level: 10, stock: 45, status: 'Active', sku: 'NK-AM90-BLK-10' },
    { id: '2', name: 'Ultraboost 22', brand: 'Adidas', category: 'Running', size: '9', color: 'White', cost_price: 120, price: 180, reorder_level: 8, stock: 32, status: 'Active', sku: 'AD-UB22-WHT-9' },
    { id: '3', name: 'Suede Classic', brand: 'Puma', category: 'Casual', size: '11', color: 'Red', cost_price: 55, price: 85, reorder_level: 10, stock: 28, status: 'Active', sku: 'PM-SC-RED-11' },
    { id: '4', name: 'Chuck Taylor', brand: 'Converse', category: 'Casual', size: '8', color: 'Blue', cost_price: 40, price: 65, reorder_level: 15, stock: 52, status: 'Active', sku: 'CV-CT-BLU-8' },
    { id: '5', name: '574 Core', brand: 'New Balance', category: 'Lifestyle', size: '10', color: 'Grey', cost_price: 65, price: 95, reorder_level: 10, stock: 8, status: 'Active', sku: 'NB-574-GRY-10' },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    brand: '',
    category: '',
    size: '',
    color: '',
    cost_price: 0,
    price: 0,
    reorder_level: 10,
    stock: 0,
    status: 'Active',
    sku: ''
  });

  const handleAddProduct = () => {
    if (!formData.name || !formData.brand || !formData.price) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newProduct: Product = {
      id: Date.now().toString(),
      name: formData.name!,
      brand: formData.brand!,
      category: formData.category || 'Uncategorized',
      size: formData.size || 'N/A',
      color: formData.color || 'N/A',
      cost_price: formData.cost_price!,
      price: formData.price!,
      reorder_level: formData.reorder_level || 10,
      stock: formData.stock || 0,
      status: formData.status as Product['status'] || 'Active',
      sku: formData.sku || `SKU-${Date.now()}`
    };

    setProducts([...products, newProduct]);
    setIsAddDialogOpen(false);
    setFormData({});
    toast.success('Product added successfully!');
  };

  const handleEditProduct = () => {
    if (!editingProduct) return;

    setProducts(products.map(p => 
      p.id === editingProduct.id 
        ? { ...editingProduct, ...formData }
        : p
    ));
    setEditingProduct(null);
    setFormData({});
    toast.success('Product updated successfully!');
  };

  const handleDeleteProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
    toast.success('Product deleted successfully!');
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setFormData(product);
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
              <ProductForm formData={formData} setFormData={setFormData} />
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
        {/* Search */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-yellow-400" />
          <Input
            placeholder="Search products by name, brand, or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
          />
        </div>

        {/* Products Table */}
        <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                <TableHead className="text-yellow-300 whitespace-nowrap">SKU</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap">Product</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap">Brand</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap">Category</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap">Size</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap">Price</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap">Stock</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap">Reorder</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap">Status</TableHead>
                <TableHead className="text-yellow-300 whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id} className="border-red-800">
                  <TableCell className="text-yellow-200 text-xs whitespace-nowrap">{product.sku}</TableCell>
                  <TableCell className="text-yellow-200 whitespace-nowrap">{product.name}</TableCell>
                  <TableCell className="text-yellow-200 whitespace-nowrap">{product.brand}</TableCell>
                  <TableCell className="text-yellow-200 whitespace-nowrap">{product.category}</TableCell>
                  <TableCell className="text-yellow-200 whitespace-nowrap">{product.size}</TableCell>
                  <TableCell className="text-yellow-300 whitespace-nowrap">₱{product.price}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant={product.stock <= product.reorder_level ? "destructive" : "default"}
                      className={product.stock <= product.reorder_level ? "bg-yellow-600 text-red-900" : "bg-yellow-400 text-red-900"}
                    >
                      {product.stock} units
                    </Badge>
                  </TableCell>
                  <TableCell className="text-yellow-200 whitespace-nowrap">{product.reorder_level}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      className={
                        product.status === 'Active' ? 'bg-green-600 text-white' :
                        product.status === 'Inactive' ? 'bg-gray-600 text-white' :
                        'bg-red-900 text-yellow-200'
                      }
                    >
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog open={editingProduct?.id === product.id} onOpenChange={(open) => !open && setEditingProduct(null)}>
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
                          <ProductForm formData={formData} setFormData={setFormData} />
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

function ProductForm({ formData, setFormData }: { 
  formData: Partial<Product>; 
  setFormData: (data: Partial<Product>) => void;
}) {
  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-yellow-300">Product Name *</Label>
          <Input
            id="name"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="brand" className="text-yellow-300">Brand *</Label>
          <Input
            id="brand"
            value={formData.brand || ''}
            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category" className="text-yellow-300">Category</Label>
          <Select value={formData.category || ''} onValueChange={(value) => setFormData({ ...formData, category: value })}>
            <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
              <SelectItem value="Running">Running</SelectItem>
              <SelectItem value="Casual">Casual</SelectItem>
              <SelectItem value="Lifestyle">Lifestyle</SelectItem>
              <SelectItem value="Sports">Sports</SelectItem>
              <SelectItem value="Formal">Formal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="size" className="text-yellow-300">Size</Label>
          <Input
            id="size"
            value={formData.size || ''}
            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="color" className="text-yellow-300">Color</Label>
          <Input
            id="color"
            value={formData.color || ''}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sku" className="text-yellow-300">SKU</Label>
          <Input
            id="sku"
            value={formData.sku || ''}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price" className="text-yellow-300">Selling Price (₱) *</Label>
          <Input
            id="price"
            type="number"
            value={formData.price || ''}
            onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="stock" className="text-yellow-300">Stock Quantity</Label>
          <Input
            id="stock"
            type="number"
            value={formData.stock || ''}
            onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reorder_level" className="text-yellow-300">Reorder Level</Label>
          <Input
            id="reorder_level"
            type="number"
            value={formData.reorder_level || ''}
            onChange={(e) => setFormData({ ...formData, reorder_level: parseInt(e.target.value) })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status" className="text-yellow-300">Status</Label>
          <Select value={formData.status || 'Active'} onValueChange={(value) => setFormData({ ...formData, status: value as Product['status'] })}>
            <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
              <SelectItem value="Discontinued">Discontinued</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

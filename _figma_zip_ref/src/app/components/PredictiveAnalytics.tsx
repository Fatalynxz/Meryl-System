import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Package, Coins, Calendar } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function PredictiveAnalytics() {
  // Mock sales forecast data
  const salesForecast = [
    { id: 'jan', month: 'Jan', actual: 24500, predicted: 25200, confidence: 92 },
    { id: 'feb', month: 'Feb', actual: 26800, predicted: 26500, confidence: 89 },
    { id: 'mar', month: 'Mar', actual: 28200, predicted: 28800, confidence: 94 },
    { id: 'apr', month: 'Apr', actual: null, predicted: 31500, confidence: 87 },
    { id: 'may', month: 'May', actual: null, predicted: 33200, confidence: 85 },
    { id: 'jun', month: 'Jun', actual: null, predicted: 35800, confidence: 82 },
  ];

  // Product demand trends
  const demandTrends = [
    { id: 'w1', week: 'Week 1', running: 145, casual: 98, sports: 67, formal: 34 },
    { id: 'w2', week: 'Week 2', running: 152, casual: 105, sports: 71, formal: 38 },
    { id: 'w3', week: 'Week 3', running: 168, casual: 112, sports: 75, formal: 42 },
    { id: 'w4', week: 'Week 4', running: 175, casual: 118, sports: 80, formal: 45 },
  ];

  // Fast-moving products
  const fastMovingProducts = [
    { id: 'fmp1', name: 'Nike Air Max 90', category: 'Running', sold: 156, trend: 'up', velocity: 12.3, forecastNext30: 180 },
    { id: 'fmp2', name: 'Adidas Ultraboost', category: 'Running', sold: 142, trend: 'up', velocity: 11.8, forecastNext30: 165 },
    { id: 'fmp3', name: 'Vans Old Skool', category: 'Casual', sold: 128, trend: 'up', velocity: 10.2, forecastNext30: 145 },
    { id: 'fmp4', name: 'Puma Suede', category: 'Casual', sold: 115, trend: 'stable', velocity: 9.5, forecastNext30: 120 },
  ];

  // Slow-moving products
  const slowMovingProducts = [
    { id: 'smp1', name: 'Formal Oxford', category: 'Formal', sold: 12, daysInStock: 145, trend: 'down', recommendation: 'Discount 30%' },
    { id: 'smp2', name: 'Dress Loafer', category: 'Formal', sold: 18, daysInStock: 132, trend: 'down', recommendation: 'Bundle Offer' },
    { id: 'smp3', name: 'Classic Boot', category: 'Casual', sold: 23, daysInStock: 98, trend: 'down', recommendation: 'Promotion' },
  ];

  // Restocking recommendations
  const restockingRecommendations = [
    {
      id: 'rr1',
      product: 'Nike Air Max 90',
      currentStock: 8,
      recommendedStock: 45,
      urgency: 'high',
      daysUntilStockout: 3,
      orderQuantity: 50
    },
    {
      id: 'rr2',
      product: 'Adidas Ultraboost',
      currentStock: 15,
      recommendedStock: 40,
      urgency: 'medium',
      daysUntilStockout: 7,
      orderQuantity: 40
    },
    {
      id: 'rr3',
      product: 'Converse Chuck Taylor',
      currentStock: 22,
      recommendedStock: 50,
      urgency: 'medium',
      daysUntilStockout: 10,
      orderQuantity: 35
    },
    {
      id: 'rr4',
      product: 'New Balance 574',
      currentStock: 8,
      recommendedStock: 25,
      urgency: 'high',
      daysUntilStockout: 4,
      orderQuantity: 30
    },
  ];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Forecast Accuracy</p>
                <p className="text-2xl text-yellow-300">89.5%</p>
              </div>
              <CheckCircle className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Predicted Next Month</p>
                <p className="text-2xl text-yellow-300">₱31.5K</p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Items Need Restock</p>
                <p className="text-2xl text-yellow-300">4</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Inventory Turnover</p>
                <p className="text-2xl text-yellow-300">6.2x</p>
              </div>
              <Package className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Forecast Chart */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <CardTitle className="text-yellow-300 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Sales Forecast - Next 6 Months
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesForecast}>
              <CartesianGrid strokeDasharray="3 3" stroke="#991b1b" />
              <XAxis dataKey="month" stroke="#fef08a" />
              <YAxis stroke="#fef08a" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#991b1b', border: '1px solid #7f1d1d', color: '#fef08a' }}
              />
              <Legend wrapperStyle={{ color: '#fef08a' }} />
              <Line key="actual-line" type="monotone" dataKey="actual" stroke="#fef08a" strokeWidth={2} name="Actual Sales (₱)" />
              <Line key="predicted-line" type="monotone" dataKey="predicted" stroke="#facc15" strokeWidth={2} strokeDasharray="5 5" name="Predicted Sales (₱)" />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-6 gap-2">
            {salesForecast.map((item) => (
              <div key={item.id} className="text-center">
                <p className="text-yellow-200 text-xs">{item.month}</p>
                <Badge className="bg-yellow-400 text-red-900 text-xs">
                  {item.confidence}%
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Demand Trends by Category */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <CardTitle className="text-yellow-300 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Product Demand Trends by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={demandTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#991b1b" />
              <XAxis dataKey="week" stroke="#fef08a" />
              <YAxis stroke="#fef08a" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#991b1b', border: '1px solid #7f1d1d', color: '#fef08a' }}
              />
              <Legend wrapperStyle={{ color: '#fef08a' }} />
              <Bar key="running-bar" dataKey="running" fill="#fef08a" name="Running" />
              <Bar key="casual-bar" dataKey="casual" fill="#facc15" name="Casual" />
              <Bar key="sports-bar" dataKey="sports" fill="#fde047" name="Sports" />
              <Bar key="formal-bar" dataKey="formal" fill="#fef9c3" name="Formal" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Fast-Moving and Slow-Moving Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fast-Moving Products */}
        <Card className="bg-red-700 border-red-800">
          <CardHeader>
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              Fast-Moving Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                    <TableHead className="text-yellow-300 whitespace-nowrap">Product</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap">Sold (30d)</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap">Velocity</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap">Forecast</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fastMovingProducts.map((product) => (
                    <TableRow key={product.id} className="border-red-800">
                      <TableCell className="min-w-[150px]">
                        <div>
                          <p className="text-yellow-200 whitespace-nowrap">{product.name}</p>
                          <p className="text-yellow-300 text-xs whitespace-nowrap">{product.category}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-yellow-300 whitespace-nowrap">{product.sold}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className="bg-green-600 text-white">
                          {product.velocity}/day
                        </Badge>
                      </TableCell>
                      <TableCell className="text-yellow-300 whitespace-nowrap">{product.forecastNext30} units</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Slow-Moving Products */}
        <Card className="bg-red-700 border-red-800">
          <CardHeader>
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-orange-400" />
              Slow-Moving Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                    <TableHead className="text-yellow-300 whitespace-nowrap">Product</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap">Sold (30d)</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap">Days</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slowMovingProducts.map((product) => (
                    <TableRow key={product.id} className="border-red-800">
                      <TableCell className="min-w-[150px]">
                        <div>
                          <p className="text-yellow-200 whitespace-nowrap">{product.name}</p>
                          <p className="text-yellow-300 text-xs whitespace-nowrap">{product.category}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-yellow-300 whitespace-nowrap">{product.sold}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className="bg-orange-600 text-white">
                          {product.daysInStock}d
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className="bg-yellow-400 text-red-900 text-xs">
                          {product.recommendation}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Restocking Recommendations */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <CardTitle className="text-yellow-300 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Intelligent Restocking Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-yellow-300 whitespace-nowrap">Product</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Current Stock</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Recommended</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Urgency</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Stockout In</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap">Order Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {restockingRecommendations.map((item) => (
                  <TableRow key={item.id} className="border-red-800">
                    <TableCell className="text-yellow-200 whitespace-nowrap">{item.product}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge className={item.currentStock < 10 ? "bg-red-900 text-yellow-200" : "bg-yellow-400 text-red-900"}>
                        {item.currentStock} units
                      </Badge>
                    </TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap">{item.recommendedStock} units</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge className={
                        item.urgency === 'high' ? "bg-red-900 text-yellow-200" :
                        "bg-yellow-600 text-red-900"
                      }>
                        {item.urgency.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap">{item.daysUntilStockout} days</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge className="bg-green-600 text-white">
                        Order {item.orderQuantity}
                      </Badge>
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

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, History, Package, RefreshCw, Search } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useInventoryLog } from "../../lib/hooks";

type InventoryLogRow = {
  inventory_log_id: string;
  product_id: string;
  quantity_change: number;
  transaction_type: string | null;
  reference_id: string | null;
  date_updated: string | null;
  product?: any;
};

function formatDateTime(value?: string | null) {
  if (!value) return "No date";
  const raw = String(value).trim();
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const date = new Date(hasTimezone ? raw : `${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatType(value?: string | null) {
  const normalized = String(value ?? "adjustment").trim().toLowerCase();
  if (normalized === "restock") return "Restock";
  if (normalized === "return") return "Return";
  if (normalized === "hold") return "Reserved / Hold";
  if (normalized === "sale") return "Sale";
  return normalized ? normalized.replace(/\b\w/g, (char) => char.toUpperCase()) : "Adjustment";
}

function typeBadgeClass(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["restock", "return"].includes(normalized)) return "bg-emerald-500/15 text-emerald-200 border border-emerald-400/30";
  if (["sale", "adjustment"].includes(normalized)) return "bg-red-500/15 text-red-200 border border-red-400/30";
  if (normalized === "hold") return "bg-yellow-400/15 text-yellow-200 border border-yellow-400/30";
  return "bg-zinc-800 text-zinc-200";
}

function getProduct(row: InventoryLogRow) {
  const product = Array.isArray(row.product) ? row.product[0] : row.product;
  return {
    name: String(product?.product_name ?? "Unknown Product"),
    brand: String(product?.brand ?? "N/A"),
    size: String(product?.size ?? "N/A"),
    color: String(product?.color ?? "N/A"),
  };
}

export function InventoryLogPage() {
  const inventoryLogQuery = useInventoryLog();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const logs = ((inventoryLogQuery.data as InventoryLogRow[]) ?? []).map((row) => ({
    ...row,
    quantity_change: Number(row.quantity_change ?? 0),
  }));

  const movementTypes = useMemo(
    () =>
      Array.from(new Set(logs.map((row) => String(row.transaction_type ?? "adjustment").trim().toLowerCase()).filter(Boolean))).sort(),
    [logs],
  );

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((row) => {
      const product = getProduct(row);
      const type = String(row.transaction_type ?? "adjustment").trim().toLowerCase();
      const matchesType = typeFilter === "all" || type === typeFilter;
      const haystack = [
        row.inventory_log_id,
        row.product_id,
        row.reference_id,
        type,
        product.name,
        product.brand,
        product.size,
        product.color,
      ]
        .join(" ")
        .toLowerCase();
      return matchesType && (!term || haystack.includes(term));
    });
  }, [logs, search, typeFilter]);

  const totalIn = logs.filter((row) => row.quantity_change > 0).reduce((sum, row) => sum + row.quantity_change, 0);
  const totalOut = logs.filter((row) => row.quantity_change < 0).reduce((sum, row) => sum + Math.abs(row.quantity_change), 0);
  const netMovement = totalIn - totalOut;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-zinc-800 bg-zinc-950">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs uppercase tracking-widest text-yellow-300/70">Stock In</p>
              <p className="mt-2 text-2xl text-white">{totalIn}</p>
            </div>
            <ArrowUp className="h-8 w-8 text-emerald-400" />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-800 bg-zinc-950">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs uppercase tracking-widest text-yellow-300/70">Stock Out</p>
              <p className="mt-2 text-2xl text-white">{totalOut}</p>
            </div>
            <ArrowDown className="h-8 w-8 text-red-400" />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-800 bg-zinc-950">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs uppercase tracking-widest text-yellow-300/70">Net Movement</p>
              <p className="mt-2 text-2xl text-white">{netMovement >= 0 ? `+${netMovement}` : netMovement}</p>
            </div>
            <History className="h-8 w-8 text-yellow-400" />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-zinc-800 bg-zinc-950">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <Package className="h-5 w-5 text-yellow-400" />
              Inventory Stock Movement Log
            </CardTitle>
            <Button
              type="button"
              onClick={() => void inventoryLogQuery.refetch()}
              className="h-10 rounded-xl bg-yellow-400 text-red-950 hover:bg-yellow-300"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yellow-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product, brand, SKU, movement type, or reference..."
                className="h-11 rounded-xl border-zinc-800 bg-zinc-900 pl-10 text-yellow-100 placeholder:text-yellow-200/40"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-11 rounded-xl border-zinc-800 bg-zinc-900 text-yellow-100">
                <SelectValue placeholder="Movement type" />
              </SelectTrigger>
              <SelectContent className="border-zinc-800 bg-zinc-950 text-yellow-100">
                <SelectItem value="all">All movement types</SelectItem>
                {movementTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {formatType(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 bg-zinc-900 hover:bg-zinc-900">
                  <TableHead className="text-yellow-300">Date</TableHead>
                  <TableHead className="text-yellow-300">Product</TableHead>
                  <TableHead className="text-yellow-300 text-center">Movement</TableHead>
                  <TableHead className="text-yellow-300 text-center">Qty Change</TableHead>
                  <TableHead className="text-yellow-300">Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryLogQuery.isLoading ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={5} className="py-8 text-center text-yellow-100/70">
                      Loading stock movement logs...
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={5} className="py-8 text-center text-yellow-100/70">
                      No inventory movement records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((row) => {
                    const product = getProduct(row);
                    const qty = Number(row.quantity_change ?? 0);
                    return (
                      <TableRow key={row.inventory_log_id} className="border-zinc-800 hover:bg-zinc-900/70">
                        <TableCell className="whitespace-nowrap text-zinc-200">{formatDateTime(row.date_updated)}</TableCell>
                        <TableCell className="min-w-[260px]">
                          <div className="font-medium text-yellow-100">{product.name}</div>
                          <div className="text-xs text-zinc-400">
                            {product.brand} | Size {product.size} | {product.color}
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-500">{row.product_id.slice(0, 8)}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={typeBadgeClass(row.transaction_type)}>{formatType(row.transaction_type)}</Badge>
                        </TableCell>
                        <TableCell className={`text-center font-semibold tabular-nums ${qty >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                          {qty >= 0 ? `+${qty}` : qty}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-zinc-300" title={row.reference_id ?? ""}>
                          {row.reference_id ?? "Manual / No reference"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

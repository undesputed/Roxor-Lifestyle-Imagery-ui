"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Product = {
  identifier: string;
  family: string;
  title: string;
  colour: string;
  hasCutout: boolean;
  hasLifestyle1: boolean;
  hasLifestyle2: boolean;
  hasLifestyle3: boolean;
};

type ApiResponse = {
  count: number;
  products: Product[];
};

function ProductSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

function ProductTable({ products, showGenerateButton }: { products: Product[]; showGenerateButton?: boolean }) {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(products.length / pageSize));

  useEffect(() => {
    // Reset to first page when the data set changes
    setPage(1);
  }, [products]);

  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, products.length);
  const paginatedProducts = products.slice(startIndex, endIndex);

  if (products.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No products found.</p>;
  }
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sales Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Family</TableHead>
            <TableHead>Colour</TableHead>
            <TableHead>Cutout</TableHead>
            <TableHead>Lifestyle</TableHead>
            {showGenerateButton && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedProducts.map((product) => {
            const hasAnyLifestyle = product.hasLifestyle1 || product.hasLifestyle2 || product.hasLifestyle3;
            return (
              <TableRow key={product.identifier}>
                <TableCell className="font-mono text-xs">{product.identifier}</TableCell>
                <TableCell className="text-sm max-w-xs truncate">{product.title || "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">{product.family}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{product.colour || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-xs", product.hasCutout ? "text-green-600 border-green-200" : "text-muted-foreground")}>
                    {product.hasCutout ? "Yes" : "No"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-xs", hasAnyLifestyle ? "text-green-600 border-green-200" : "text-red-600 border-red-200")}>
                    {hasAnyLifestyle ? "Has images" : "Missing"}
                  </Badge>
                </TableCell>
                {showGenerateButton && (
                  <TableCell>
                    <a
                      href={`/generate?salesCode=${product.identifier}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      Generate
                    </a>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {products.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {startIndex + 1}–{endIndex} of {products.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page === pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  const [missingProducts, setMissingProducts] = useState<Product[]>([]);
  const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
  const [loadingMissing, setLoadingMissing] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [errorMissing, setErrorMissing] = useState<string | null>(null);
  const [errorCandidates, setErrorCandidates] = useState<string | null>(null);

  const fetchMissing = useCallback(async () => {
    setLoadingMissing(true);
    setErrorMissing(null);
    try {
      const res = await fetch("/api/products/missing-lifestyle");
      const data: ApiResponse = await res.json();
      if (!res.ok) throw new Error((data as { detail?: string }).detail ?? "Failed to load");
      setMissingProducts(data.products);
    } catch (e: unknown) {
      setErrorMissing(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingMissing(false);
    }
  }, []);

  const fetchCandidates = useCallback(async () => {
    setLoadingCandidates(true);
    setErrorCandidates(null);
    try {
      const res = await fetch("/api/products/candidates");
      const data: ApiResponse = await res.json();
      console.log("Response: ", data);
      if (!res.ok) throw new Error((data as { detail?: string }).detail ?? "Failed to load");
      setCandidateProducts(data.products);
    } catch (e: unknown) {
      setErrorCandidates(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  // Load missing lifestyle on mount
  useEffect(() => { fetchMissing(); }, [fetchMissing]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Products</h2>
          <p className="text-muted-foreground mt-1">Balterley products from Akeneo PIM.</p>
        </div>
        <Button onClick={fetchMissing} variant="outline" size="sm" disabled={loadingMissing}>
          {loadingMissing ? "Loading..." : "Refresh from Akeneo"}
        </Button>
      </div>

      <Tabs defaultValue="missing">
        <TabsList>
          <TabsTrigger value="missing">
            Missing Lifestyle
            {missingProducts.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{missingProducts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="candidates" onClick={() => { if (candidateProducts.length === 0) fetchCandidates(); }}>
            Dark Grey Candidates
            {candidateProducts.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{candidateProducts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="missing" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Products with cutout images but no lifestyle imagery
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingMissing && <ProductSkeleton />}
              {errorMissing && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {errorMissing}
                  <button onClick={fetchMissing} className="ml-3 underline">Retry</button>
                </div>
              )}
              {!loadingMissing && !errorMissing && (
                <ProductTable products={missingProducts} showGenerateButton />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="candidates" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Dark grey Balterley products with cutouts — good scene candidates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCandidates && <ProductSkeleton />}
              {errorCandidates && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {errorCandidates}
                  <button onClick={fetchCandidates} className="ml-3 underline">Retry</button>
                </div>
              )}
              {!loadingCandidates && !errorCandidates && (
                <ProductTable products={candidateProducts} showGenerateButton />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

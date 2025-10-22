import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Package, CheckCircle2, Truck, Clock } from "lucide-react";
import {
  getOrders,
  updateOrderStatus,
  saveInvoiceForOrder,
  Order,
} from "@/lib/store";
import { subscribeOrders } from "@/lib/firebase";

const Track = () => {
  const [orderNumber, setOrderNumber] = useState("");
  const [showStatus, setShowStatus] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("tf:session") || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // subscribe to remote orders to keep view synced
    const unsub = subscribeOrders((remote) => {
      try {
        if (!orderNumber) return;
        const found = getOrders().find((o) => o.id === orderNumber);
        setOrder(found || null);
      } catch (err) {
        void err;
      }
    });
    return unsub;
  }, [orderNumber]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!orderNumber) {
      toast.error("الرجاء إدخال رقم الطلب");
      return;
    }

    const found = getOrders().find((o) => o.id === orderNumber);
    if (!found) {
      toast.error("لم يتم العثور على هذا الطلب");
      return;
    }
    setOrder(found);
    setShowStatus(true);
    toast.success("تم العثور على الطلب");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ordered":
        return <Package className="h-5 w-5" />;
      case "processing":
        return <Clock className="h-5 w-5" />;
      case "ready":
        return <CheckCircle2 className="h-5 w-5" />;
      case "shipped":
        return <Truck className="h-5 w-5" />;
      default:
        return null;
    }
  };

  const handleChangeStatus = (status: string) => {
    if (!order) return;
    updateOrderStatus(order.id, status);
    const updated = getOrders().find((o) => o.id === order.id) || null;
    setOrder(updated);
    toast.success("تم تحديث حالة الطلب");
  };

  const handleCreateInvoice = () => {
    if (!order) return;
    const inv = {
      number: `INV-${Date.now()}`,
      amount: 0,
      createdAt: new Date().toISOString(),
      notes: "فاتورة منفصلة",
    };
    saveInvoiceForOrder(order.id, inv);
    const updated = getOrders().find((o) => o.id === order.id) || null;
    setOrder(updated);
    toast.success("تم إنشاء الفاتورة");
  };

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Navbar />

      <main className="flex-1 py-12 px-4">
        <div className="container mx-auto max-w-3xl">
          <Card className="shadow-elegant animate-fade-in">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold">
                متابعة <span className="text-gradient">الطلب</span>
              </CardTitle>
              <CardDescription className="text-lg">
                أدخل رقم الطلب لمتابعة حالته
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="orderNumber">رقم الطلب</Label>
                  <Input
                    id="orderNumber"
                    type="text"
                    placeholder="ORD-2025-XXX"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    required
                    dir="ltr"
                  />
                </div>

                <Button type="submit" className="w-full" size="lg">
                  تتبع الطلب
                </Button>
              </form>

              {showStatus && order && (
                <div className="space-y-6 pt-6 border-t animate-slide-up">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold">الطلب: {order.id}</h3>
                    <Badge variant="secondary" className="text-base">
                      {order.status || "قيد التنفيذ"}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-lg">تفاصيل الطلب:</h4>
                    <div className="p-3 bg-muted rounded-lg">
                      <div>نوع المنتج: {order.productType}</div>
                      <div>المقاس: {order.size}</div>
                      <div>الكمية: {order.quantity}</div>
                      <div>العميل: {order.customerPhone || "-"}</div>
                      {order.invoice && (
                        <div className="mt-2 p-2 border rounded bg-white/5">
                          <div>فاتورة: {order.invoice.number}</div>
                          <div>المبلغ: {order.invoice.amount}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-semibold text-lg">حالة الطلب:</h4>
                    <div className="flex gap-2 items-center">
                      <select
                        value={order.status}
                        onChange={(e) => handleChangeStatus(e.target.value)}
                        className="p-2 border rounded"
                      >
                        <option>قيد التنفيذ</option>
                        <option>تم التجهيز</option>
                        <option>تم التسليم</option>
                        <option>ملغى</option>
                      </select>
                      {session?.isAdmin && (
                        <>
                          <Button onClick={handleCreateInvoice}>
                            إنشاء فاتورة
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground text-center">
                  للاستفسارات: اتصل بنا على +20 01558342393
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Track;

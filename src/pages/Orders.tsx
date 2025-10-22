import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import {
  saveOrder,
  getOrders,
  Order,
  updateOrderStatus,
  findUser,
  upsertRemoteOrders,
  saveInvoiceForPhone,
} from "@/lib/store";
import { subscribeOrders, fetchRemoteSnapshot } from "@/lib/firebase";
import type { RemoteOrder } from "@/lib/firebase";

type OrderWithInvoice = Order & {
  invoice?: {
    number: string;
    amount: number;
    createdAt: string;
    notes?: string;
  };
};

// Simple session reader
function getSession() {
  try {
    return JSON.parse(localStorage.getItem("tf:session") || "null");
  } catch {
    return null;
  }
}

const Orders = () => {
  const navigate = useNavigate();
  const [productType, setProductType] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productType || !color || !size || !quantity) {
      toast.error("الرجاء ملء جميع الحقول المطلوبة");
      return;
    }
    const session = getSession();
    // attempt to allocate a formatted order number from remote counters
    let id: string | null = null;
    try {
      const fb = await import("@/lib/firebase");
      if (fb && typeof fb.allocateOrderNumber === "function") {
        id = await fb.allocateOrderNumber();
      }
    } catch {
      // ignore
    }
    if (!id) id = `${Date.now()}`;

    const tracking = `TRK-${Math.random()
      .toString(36)
      .slice(2, 9)
      .toUpperCase()}`;
    const order: Order = {
      id,
      productType,
      color,
      size,
      quantity: Number(quantity),
      notes,
      status: "قيد التنفيذ",
      createdAt: new Date().toISOString(),
      customerPhone: session?.phone,
      tracking,
    };

    // create a simple invoice record for the order (demo: amount 0, can be adjusted later)
    const inv = {
      number: `INV-${Date.now()}`,
      amount: 0,
      createdAt: new Date().toISOString(),
      notes: `فاتورة تلقائية للطلب ${id}`,
    };

    // attach invoice to the order so it is persisted under orders/{id} in Firebase
    const orderWithInv = order as OrderWithInvoice;
    orderWithInv.invoice = inv;

    saveOrder(order);
    try {
      // save per-order invoice into the phone's invoice list
      const session = getSession();
      if (session?.phone) {
        saveInvoiceForPhone(session.phone, { ...inv, orders: [order] });
      } else {
        // fallback: attach invoice to order record
        const mod = await import("@/lib/store");
        if (mod && typeof mod.saveInvoiceForOrder === "function") {
          mod.saveInvoiceForOrder(id, inv);
        }
      }
    } catch {
      // ignore invoice save errors
    }

    // push order to Firebase and invoice to invoices node separately
    (async () => {
      try {
        const fb = await import("@/lib/firebase");
        let orderOk = false;
        if (fb && typeof fb.writeOrderRemote === "function") {
          try {
            // include invoice and tracking in the remote order payload
            const payload: Record<string, unknown> = {
              id: order.id,
              productType: order.productType,
              color: order.color,
              size: order.size,
              quantity: order.quantity,
              notes: order.notes,
              status: order.status,
              createdAt: order.createdAt,
              customerPhone: order.customerPhone,
              invoice: orderWithInv.invoice,
              tracking: order.tracking,
            };
            orderOk = await fb.writeOrderRemote(payload);
          } catch (err) {
            orderOk = false;
            console.error("writeOrderRemote failed", err);
          }
        }

        if (orderOk) {
          toast.success("تم مزامنة الطلب مع السحابة");
        } else {
          toast.error(
            "تعذر مزامنة الطلب إلى السحابة الآن — سيتم المحاولة لاحقاً"
          );
          try {
            localStorage.setItem(
              "tf:lastRemoteError",
              JSON.stringify({
                when: Date.now(),
                type: "writeOrder",
                orderId: order.id,
              })
            );
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.error("order push failed", err);
        toast.error(
          "تعذر مزامنة الطلب إلى السحابة الآن — سيتم المحاولة لاحقاً"
        );
      }
    })();

    toast.success(
      "تم إرسال طلبك بنجاح! رقم الطلب ورقم التتبع ستظهر في الفاتورة"
    );

    // Reset form
    setProductType("");
    setColor("");
    setSize("");
    setQuantity("");
    setNotes("");
    // refresh list
    loadOrders();
    // redirect to invoice page for the created order so customer sees order+tracking+invoice
    window.location.href = `/invoice?orderId=${id}`;
  };

  const [orders, setOrders] = useState<Order[]>([]);

  function loadOrders() {
    const all = getOrders();
    const session = getSession();
    if (session?.isAdmin) {
      setOrders(all);
    } else if (session?.phone) {
      setOrders(all.filter((o) => o.customerPhone === session.phone));
    } else {
      setOrders([]);
    }
  }
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let timer: number | undefined;

    (async () => {
      try {
        const mod = await import("@/lib/firebase");
        if (mod && typeof mod.subscribeOrders === "function") {
          unsub = subscribeOrders((remote: RemoteOrder[]) => {
            try {
              // merge remote into local store and refresh list
              upsertRemoteOrders(remote);
              loadOrders();

              // notify customers about status changes
              const session = getSession();
              if (session?.phone) {
                const prev = getOrders();
                const prevMap = new Map(prev.map((p) => [p.id, p.status]));
                for (const o of remote) {
                  const oldStatus = prevMap.get(o.id) || null;
                  if (oldStatus && oldStatus !== o.status) {
                    toast(`حالة طلبك ${o.id} تغيرت إلى: ${o.status}`);
                  }
                }
              }
            } catch (err) {
              console.debug("subscribeOrders handler error", err);
            }
          });
        }

        // initial snapshot + polling fallback
        if (mod && typeof mod.fetchRemoteSnapshot === "function") {
          try {
            const snap = await mod.fetchRemoteSnapshot();
            if (snap && Array.isArray(snap.orders)) {
              upsertRemoteOrders(snap.orders as RemoteOrder[]);
              loadOrders();
            }
          } catch {
            // ignore
          }

          timer = window.setInterval(async () => {
            try {
              const s = await mod.fetchRemoteSnapshot();
              if (s && Array.isArray(s.orders)) {
                upsertRemoteOrders(s.orders as RemoteOrder[]);
                loadOrders();
              }
            } catch (err) {
              void err;
            }
          }, 15000) as unknown as number;
        }
      } catch (err) {
        console.debug("orders sync setup failed", err);
      }
    })();

    return () => {
      try {
        if (unsub) unsub();
      } catch (err) {
        void err;
      }
      try {
        if (timer) clearInterval(timer);
      } catch (err) {
        void err;
      }
    };
  }, []);

  // Redirect unauthenticated users to login page
  useEffect(() => {
    const session = getSession();
    if (!session?.phone) {
      navigate("/auth");
    }
  }, [navigate]);

  const handleStatusChange = (id: string, status: string) => {
    updateOrderStatus(id, status);
    toast.success("تم تحديث حالة الطلب");
    loadOrders();
  };

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Navbar />

      <main className="flex-1 py-12 px-4">
        <div className="container mx-auto max-w-2xl">
          <Card className="shadow-elegant animate-fade-in">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                <ShoppingCart className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-3xl font-bold">
                نموذج <span className="text-gradient">الطلب</span>
              </CardTitle>
              <CardDescription className="text-lg">
                املأ البيانات التالية وسنتواصل معك في أقرب وقت
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="productType">نوع المنتج *</Label>
                  <Select value={productType} onValueChange={setProductType}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر نوع المنتج" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="windows">نوافذ ألومنيوم</SelectItem>
                      <SelectItem value="doors">أبواب ألومنيوم</SelectItem>
                      <SelectItem value="facades">واجهات محلات</SelectItem>
                      <SelectItem value="kitchens">مطابخ ألومنيوم</SelectItem>
                      <SelectItem value="railings">درابزين</SelectItem>
                      <SelectItem value="cladding">كسوة ألومنيوم</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="color">اللون *</Label>
                  <Select value={color} onValueChange={setColor}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر اللون" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="silver">فضي</SelectItem>
                      <SelectItem value="white">أبيض</SelectItem>
                      <SelectItem value="black">أسود</SelectItem>
                      <SelectItem value="brown">بني</SelectItem>
                      <SelectItem value="gray">رمادي</SelectItem>
                      <SelectItem value="custom">لون مخصص</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="size">المقاس *</Label>
                    <Input
                      id="size"
                      type="text"
                      placeholder="مثال: 2م × 1.5م"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quantity">الكمية *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      placeholder="عدد القطع"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">ملاحظات إضافية</Label>
                  <Textarea
                    id="notes"
                    placeholder="أي تفاصيل أو متطلبات خاصة..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                  />
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    * سيتم التواصل معك خلال 24 ساعة لتأكيد الطلب وتحديد السعر
                    والموعد
                  </p>
                </div>

                <Button type="submit" className="w-full" size="lg">
                  إرسال الطلب
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Orders;

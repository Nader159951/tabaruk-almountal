import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { findUser, getOrders, Order, upsertRemoteOrders } from "@/lib/store";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { subscribeOrders, fetchRemoteSnapshot } from "@/lib/firebase";
import type { RemoteOrder } from "@/lib/firebase";

// read session helper
function getSession() {
  try {
    return JSON.parse(localStorage.getItem("tf:session") || "null");
  } catch {
    return null;
  }
}

function openPrintWindow(html: string) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    toast.error(
      "تعذر فتح نافذة الطباعة — سمح للنافذة المنبثقة ثم أعد المحاولة."
    );
    return null;
  }
  w.document.write(`
    <html dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>فاتورة</title>
        <style>
          body { font-family: Arial, Tahoma, sans-serif; padding:20px; }
          table { width:100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background:#f3f4f6; }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);
  w.document.close();
  w.focus();
  return w;
}

function printHtmlElementById(id: string, autoClose = false) {
  const el = document.getElementById(id);
  if (!el) {
    toast.error("تعذر العثور على الفاتورة للطباعة");
    return;
  }
  const w = openPrintWindow(el.outerHTML);
  if (!w) return;
  // give the new window a moment to render before printing
  setTimeout(() => {
    w.print();
    if (autoClose) {
      setTimeout(() => w.close(), 500);
    }
  }, 300);
}

const Invoice = () => {
  // Mock invoice data - enhanced to use logged-in user when available
  const location = useLocation();
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const orderId = qs.get("orderId");
    const session = getSession();

    if (!session?.phone) {
      window.location.href = "/auth";
      return;
    }

    let unsub: (() => void) | null = null;
    (async () => {
      try {
        // initial local lookup
        if (orderId) {
          const found = getOrders().find((o) => o.id === orderId);
          if (found) setInvoiceOrder(found);
        }

        // try realtime subscribe
        try {
          unsub = subscribeOrders((remote: RemoteOrder[]) => {
            try {
              if (!orderId) return;
              // merge remote into local store then update view
              upsertRemoteOrders(remote as RemoteOrder[]);
              const found = getOrders().find((o) => o.id === orderId);
              if (found) setInvoiceOrder(found);
            } catch {
              // ignore
            }
          });
        } catch {
          // ignore subscription errors
        }

        // snapshot fallback
        try {
          const snap = await fetchRemoteSnapshot();
          if (snap && Array.isArray(snap.orders)) {
            upsertRemoteOrders(snap.orders as RemoteOrder[]);
            if (orderId) {
              const found = getOrders().find((o) => o.id === orderId);
              if (found) setInvoiceOrder(found);
            }
          }
        } catch {
          // ignore
        }
      } catch {
        // ignore outer errors
      }
    })();

    return () => {
      try {
        if (unsub) unsub();
      } catch {
        // ignore
      }
    };
  }, [location.search]);

  const session = getSession();
  const user = session ? findUser(session.phone) : null;

  // fallback mock invoice when invoiceOrder not found
  const invoice = invoiceOrder
    ? {
        number: invoiceOrder.invoice?.number || `INV-${Date.now()}`,
        orderNumber: invoiceOrder.id,
        date: invoiceOrder.invoice?.createdAt || new Date().toISOString(),
        customerName: user?.fullName || "العميل",
        customerPhone: user?.phone || "-",
        items: [
          {
            name: invoiceOrder.productType,
            quantity: invoiceOrder.quantity,
            price: 0,
            total: 0,
          },
        ],
        subtotal: invoiceOrder.invoice?.amount || 0,
        tax: 0,
        delivery: 0,
        total: invoiceOrder.invoice?.amount || 0,
        tracking: invoiceOrder.tracking || "",
      }
    : {
        number: "INV-2025-001",
        orderNumber: "ORD-2025-001",
        date: "2025-01-15",
        customerName: user?.fullName || "محمد أحمد",
        customerPhone: user?.phone || "0501234567",
        items: [
          { name: "نوافذ ألومنيوم", quantity: 4, price: 1500, total: 6000 },
          { name: "باب ألومنيوم", quantity: 1, price: 2500, total: 2500 },
        ],
        subtotal: 8500,
        tax: 1275, // 15% VAT
        delivery: 200,
        total: 9975,
        tracking: "",
      };

  const handlePrint = () => {
    toast.success("جاري تحضير الفاتورة للطباعة...");
    printHtmlElementById("invoice-root", false);
  };

  const handleDownloadPdf = () => {
    // We use the browser print dialog; user can choose 'Save as PDF'.
    toast.success("جاري تحضير الفاتورة كـ PDF...");
    printHtmlElementById("invoice-root", true);
  };

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Navbar />

      <main className="flex-1 py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <Card id="invoice-root" className="shadow-elegant animate-fade-in">
            <CardHeader className="text-center border-b">
              <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-3xl font-bold mb-2">
                فاتورة ضريبية
              </CardTitle>
              <div className="text-muted-foreground space-y-1">
                <p>رقم الفاتورة: {invoice.number}</p>
                <p>التاريخ: {invoice.date}</p>
              </div>
            </CardHeader>

            <CardContent className="p-8 space-y-6">
              {/* Company & Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-primary">
                    تبارك لتصنيع الألوميتال
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    مصر، محافظة القليوبية، مركز طوخ، قرية ميت كنانه (بجوار
                    مستشفى الحكمة)
                  </p>
                  <p className="text-sm text-muted-foreground" dir="ltr">
                    +20 XX XXX XXXX
                  </p>
                  <p className="text-sm text-muted-foreground">
                    الرقم الضريبي: 123456789
                  </p>
                </div>

                <div className="space-y-2 md:text-left">
                  <h3 className="font-semibold text-lg">بيانات العميل</h3>
                  <p className="text-sm">{invoice.customerName}</p>
                  <p className="text-sm text-muted-foreground" dir="ltr">
                    {invoice.customerPhone}
                  </p>
                  {user?.fullName && (
                    <p className="text-sm">الاسم الكامل: {user.fullName}</p>
                  )}
                  {/* if user had address/email fields, show them (future) */}
                  <p className="text-sm text-muted-foreground">
                    رقم الطلب: {invoice.orderNumber}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Items Table */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">تفاصيل الطلب</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-right">المنتج</th>
                        <th className="p-3 text-center">الكمية</th>
                        <th className="p-3 text-left">السعر</th>
                        <th className="p-3 text-left">المجموع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item, index) => (
                        <tr key={index} className="border-b">
                          <td className="p-3 text-right">{item.name}</td>
                          <td className="p-3 text-center">{item.quantity}</td>
                          <td className="p-3 text-left">
                            {item.price.toLocaleString("ar-EG")} ج.م
                          </td>
                          <td className="p-3 text-left font-medium">
                            {item.total.toLocaleString("ar-EG")} ج.م
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Separator />

              {/* Totals */}
              <div className="space-y-3 max-w-md mr-auto">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المجموع الفرعي:</span>
                  <span>{invoice.subtotal.toLocaleString("ar-EG")} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    ضريبة القيمة المضافة (15%):
                  </span>
                  <span>{invoice.tax.toLocaleString("ar-EG")} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">التوصيل:</span>
                  <span>{invoice.delivery.toLocaleString("ar-EG")} ج.م</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>الإجمالي:</span>
                  <span className="text-primary">
                    {invoice.total.toLocaleString("ar-EG")} ج.م
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-6">
                <Button onClick={handlePrint} className="gap-2" size="lg">
                  <Printer className="h-5 w-5" />
                  طباعة الفاتورة
                </Button>
                <Button variant="outline" size="lg">
                  تحميل PDF
                </Button>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground text-center">
                  شكراً لتعاملكم معنا. نتطلع لخدمتكم مرة أخرى!
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

export default Invoice;

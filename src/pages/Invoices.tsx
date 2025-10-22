import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { getInvoicesForPhone } from "@/lib/store";
import { subscribeInvoices, fetchRemoteSnapshot } from "@/lib/firebase";
import { upsertRemoteInvoices } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// lightweight session helper
function readSession() {
  try {
    return JSON.parse(localStorage.getItem("tf:session") || "null");
  } catch {
    return null;
  }
}

const InvoicesPage = () => {
  const session = readSession();
  const phone = session?.phone;
  const [query, setQuery] = useState("");
  const [invoices, setInvoices] = useState(() =>
    phone ? getInvoicesForPhone(phone) : []
  );

  useEffect(() => {
    if (!phone) {
      window.location.href = "/auth";
      return;
    }

    setInvoices(getInvoicesForPhone(phone));

    let unsub: (() => void) | null = null;
    (async () => {
      try {
        unsub = subscribeInvoices((remote) => {
          try {
            upsertRemoteInvoices(
              remote as Array<{ phone: string; items: Record<string, unknown> }>
            );
            setInvoices(getInvoicesForPhone(phone));
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }

      // initial snapshot
      try {
        const snap = await fetchRemoteSnapshot();
        if (snap && Array.isArray(snap.invoices)) {
          upsertRemoteInvoices(
            snap.invoices as Array<{
              phone: string;
              items: Record<string, unknown>;
            }>
          );
          setInvoices(getInvoicesForPhone(phone));
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      try {
        if (unsub) unsub();
      } catch {
        // ignore
      }
    };
  }, [phone]);

  const filtered = invoices.filter((inv) => inv.number.includes(query));

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Navbar />
      <main className="flex-1 py-12 px-4">
        <div className="container mx-auto max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle>الفواتير الخاصة بك</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex gap-2">
                <Input
                  placeholder="بحث برقم الفاتورة"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Button
                  onClick={() => {
                    setQuery("");
                    setInvoices(getInvoicesForPhone(phone));
                  }}
                >
                  مسح
                </Button>
              </div>

              {filtered.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  لا توجد فواتير
                </div>
              )}

              <div className="space-y-3">
                {filtered.map((inv) => (
                  <div
                    key={inv.number}
                    className="p-3 border rounded flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">{inv.number}</div>
                      <div className="text-sm text-muted-foreground">
                        {inv.createdAt}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        {inv.amount.toLocaleString("ar-EG")} ج.م
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default InvoicesPage;

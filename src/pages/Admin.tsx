import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getUsers,
  getOrders,
  getInvoices,
  getVisits,
  updateOrderStatus,
  Order,
  getGallery,
  saveGalleryImage,
  deleteGalleryImage,
  setUserAdmin,
  deleteUser,
  GalleryImage,
  getSiteStats,
  saveSiteStats,
  saveInvoiceForOrder,
} from "@/lib/store";
import {
  subscribeUsers,
  subscribeOrders,
  subscribeGallery,
  subscribeInvoices,
} from "@/lib/firebase";
import type { RemoteOrder, RemoteGalleryItem } from "@/lib/firebase";
import {
  upsertRemoteUsers,
  upsertRemoteOrders,
  upsertRemoteGallery,
} from "@/lib/store";
import { upsertRemoteInvoices } from "@/lib/store";
import { fetchRemoteSnapshot } from "@/lib/firebase";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChartContainer } from "@/components/ui/chart";
import * as Recharts from "recharts";
import { subscribeStore } from "@/lib/store";

const Admin = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<unknown | null>(null);
  const [lastRemoteError, setLastRemoteError] = useState<string | null>(null);
  const [visits, setVisits] = useState<Record<string, Record<string, number>>>({
    daily: {},
    monthly: {},
  });
  const [gallery, setGallery] = useState(() => getGallery());
  const [invoices, setInvoices] = useState(() => getInvoices());
  const [users, setUsers] = useState(() => getUsers());
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});
  const invoicesCount = Object.entries(invoices || {}).reduce(
    (sum, [, arr]) => sum + (Array.isArray(arr) ? arr.length : 0),
    0
  );
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [siteStats, setSiteStats] = useState(() => getSiteStats());
  const [editingStats, setEditingStats] = useState(() => getSiteStats());

  function refreshGallery() {
    setGallery(getGallery());
  }

  useEffect(() => {
    setOrders(getOrders());
    setVisits(getVisits());
    setUsers(getUsers());
    setInvoices(getInvoices());
    // initialize price map from orders
    const initial = Object.fromEntries(
      getOrders().map((o) => [
        o.id,
        o.invoice?.amount?.toString() || "",
      ]) as Array<[string, string]>
    );
    setPriceMap(initial);

    // Guard: ensure only admin can view; otherwise redirect to /auth
    try {
      const s = JSON.parse(localStorage.getItem("tf:session") || "null");
      if (!s || !s.isAdmin) {
        navigate("/auth");
      }
    } catch {
      navigate("/auth");
    }
  }, [navigate]);

  // read persistent last remote error (set by store when remote writes fail)
  useEffect(() => {
    try {
      const v = localStorage.getItem("tf:lastRemoteError");
      setLastRemoteError(v);
    } catch {
      setLastRemoteError(null);
    }
    const unsub = subscribeStore((c) => {
      if (c.key === "tf:lastRemoteError") {
        try {
          setLastRemoteError(JSON.stringify(c.newValue) ?? null);
        } catch {
          setLastRemoteError(String(c.newValue || null));
        }
      }
    });
    return unsub;
  }, []);

  // subscribe to remote users (Firebase) and merge with local users
  useEffect(() => {
    let unsubRemote: (() => void) | null = null;
    let unsubOrders: (() => void) | null = null;
    // allow using an outer-scope unsubscribe variable so cleanup can call it
    // eslint-disable-next-line prefer-const
    let unsubInvoices: (() => void) | null = null;
    let unsubGallery: (() => void) | null = null;
    let pollTimer: number | null = null;

    (async () => {
      try {
        unsubRemote = subscribeUsers((remote) => {
          try {
            upsertRemoteUsers(remote);
            setUsers(getUsers());
          } catch {
            // ignore
          }
        });
      } catch (err) {
        console.debug("subscribeUsers failed", err);
      }

      try {
        unsubOrders = subscribeOrders((remote) => {
          try {
            const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
            if (DEBUG) console.debug("Admin.subscribeOrders payload:", remote);
            // record last payload for debug panel
            setLastPayload(remote);
            upsertRemoteOrders(remote);
            setOrders(getOrders());
            setLastSync(new Date().toISOString());
          } catch (err) {
            console.debug("subscribeOrders handler error", err);
          }
        });
      } catch (err) {
        console.debug("subscribeOrders failed", err);
      }

      // subscribe invoices and mirror into local store
      let unsubInvoices: (() => void) | null = null;
      try {
        unsubInvoices = subscribeInvoices((remote) => {
          try {
            upsertRemoteInvoices(remote);
            setInvoices(getInvoices());
            setLastSync(new Date().toISOString());
          } catch (err) {
            console.debug("subscribeInvoices handler error", err);
          }
        });
      } catch (err) {
        console.debug("subscribeInvoices failed", err);
      }

      try {
        unsubGallery = subscribeGallery((remote) => {
          try {
            upsertRemoteGallery(remote);
            setGallery(getGallery());
          } catch (err) {
            console.debug("subscribeGallery handler error", err);
          }
        });
      } catch (err) {
        console.debug("subscribeGallery failed", err);
      }

      // initial snapshot + polling fallback for robustness
      try {
        const snap = await fetchRemoteSnapshot();
        if (snap && Array.isArray(snap.orders)) {
          upsertRemoteOrders(snap.orders as RemoteOrder[]);
          setOrders(getOrders());
          setLastPayload(snap.orders);
          setLastSync(new Date().toISOString());
        }
        if (snap && Array.isArray(snap.invoices)) {
          upsertRemoteInvoices(
            snap.invoices as Array<{
              phone: string;
              items: Record<string, unknown>;
            }>
          );
          setInvoices(getInvoices());
        }
      } catch (err) {
        void err;
      }

      try {
        pollTimer = window.setInterval(async () => {
          try {
            const s = await fetchRemoteSnapshot();
            if (s && Array.isArray(s.orders)) {
              upsertRemoteOrders(s.orders as RemoteOrder[]);
              setOrders(getOrders());
            }
            if (s && Array.isArray(s.invoices)) {
              upsertRemoteInvoices(
                s.invoices as Array<{
                  phone: string;
                  items: Record<string, unknown>;
                }>
              );
              setInvoices(getInvoices());
            }
          } catch (err) {
            void err;
          }
        }, 15000) as unknown as number;
      } catch (err) {
        void err;
      }
    })();

    return () => {
      try {
        if (unsubRemote) unsubRemote();
      } catch (err) {
        console.debug("unsubRemote error", err);
      }
      try {
        if (unsubOrders) unsubOrders();
      } catch (err) {
        console.debug("unsubOrders error", err);
      }
      try {
        if (unsubInvoices) unsubInvoices();
      } catch (err) {
        console.debug("unsubInvoices error", err);
      }
      try {
        if (unsubGallery) unsubGallery();
      } catch (err) {
        console.debug("unsubGallery error", err);
      }
      try {
        if (pollTimer) clearInterval(pollTimer);
      } catch (err) {
        void err;
      }
    };
  }, []);

  // subscribe to cross-tab changes so admin updates live
  useEffect(() => {
    const unsub = subscribeStore((c) => {
      if (c.key === "tf:orders") setOrders(getOrders());
      if (c.key === "tf:users") setUsers(getUsers());
      if (c.key === "tf:gallery") setGallery(getGallery());
      if (c.key === "tf:visits") setVisits(getVisits());
      if (c.key === "tf:site_stats") setSiteStats(getSiteStats());
      if (c.key === "tf:invoices") setInvoices(getInvoices());
    });
    return unsub;
  }, []);

  const usersCount = useMemo(() => getUsers().length, []);
  const ordersCount = orders.length;

  const todayKey = new Date().toISOString().slice(0, 10);
  const visitsToday = visits.daily?.[todayKey] || 0;

  const monthlyData = Object.entries(visits.monthly || {}).map(
    ([month, count]) => ({ month, count })
  );

  const changeStatus = (id: string, status: string) => {
    updateOrderStatus(id, status);
    setOrders(getOrders());
    toast.success("تم تحديث الحالة");
  };

  function refreshUsers() {
    setUsers(getUsers());
  }

  const toggleAdmin = (phone: string, value: boolean) => {
    setUserAdmin(phone, value);
    refreshUsers();
    toast.success(
      value ? "تم تفعيل صلاحيات المسؤول" : "تم إلغاء صلاحيات المسؤول"
    );
    try {
      const s = JSON.parse(localStorage.getItem("tf:session") || "null");
      if (s && s.phone === phone) {
        // update current session to keep UI consistent
        localStorage.setItem(
          "tf:session",
          JSON.stringify({ ...s, isAdmin: value })
        );
        // reload so Navbar and route guards reflect change
        window.location.reload();
      }
    } catch (err) {
      // ignore session parse errors
      void err;
    }
  };

  const removeUser = (phone: string) => {
    deleteUser(phone);
    refreshUsers();
    toast.success("تم حذف المستخدم");
    try {
      const s = JSON.parse(localStorage.getItem("tf:session") || "null");
      if (s && s.phone === phone) {
        // if current user removed themselves, clear session and redirect
        localStorage.removeItem("tf:session");
        navigate("/auth");
      }
    } catch (err) {
      // ignore session parse errors
      void err;
    }
  };

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Navbar />
      <main className="flex-1 py-12 px-4">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>إحصائيات عامة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  عدد العملاء المسجلين: <strong>{usersCount}</strong>
                </div>
                <div>
                  عدد الطلبات: <strong>{ordersCount}</strong>
                </div>
                <div>
                  زيارات اليوم: <strong>{visitsToday}</strong>
                </div>
                <div>
                  مشاريع منجزة: <strong>{siteStats.projects}</strong>
                </div>
                <div>
                  سنوات خبرة: <strong>{siteStats.years}</strong>
                </div>
                <div>
                  تقييم العملاء: <strong>{siteStats.rating}</strong>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>تحكم الصفحة الرئيسية</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm">
                      عدد المشاريع المنجزة
                    </label>
                    <input
                      type="number"
                      className="w-full p-2 border rounded"
                      value={editingStats.projects}
                      onChange={(e) =>
                        setEditingStats((s) => ({
                          ...s,
                          projects: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm">سنوات الخبرة</label>
                    <input
                      type="number"
                      className="w-full p-2 border rounded"
                      value={editingStats.years}
                      onChange={(e) =>
                        setEditingStats((s) => ({
                          ...s,
                          years: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm">
                      تقييم العملاء (0 - 5)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="5"
                      className="w-full p-2 border rounded"
                      value={editingStats.rating}
                      onChange={(e) =>
                        setEditingStats((s) => ({
                          ...s,
                          rating: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={() => {
                        // basic validation
                        const s = editingStats;
                        if (
                          s.projects < 0 ||
                          s.years < 0 ||
                          s.rating < 0 ||
                          s.rating > 5
                        ) {
                          toast.error("القيم غير صحيحة");
                          return;
                        }
                        saveSiteStats(s);
                        setSiteStats(s);
                        toast.success("تم تحديث بيانات الصفحة الرئيسية");
                      }}
                    >
                      حفظ
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingStats(siteStats);
                        toast("تم التراجع");
                      }}
                    >
                      تراجع
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>الزيارات الشهرية</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{ visits: { color: "#4f46e5" } }}>
                  <Recharts.LineChart data={monthlyData} margin={{ left: 20 }}>
                    <Recharts.CartesianGrid strokeDasharray="3 3" />
                    <Recharts.XAxis dataKey="month" />
                    <Recharts.YAxis />
                    <Recharts.Tooltip />
                    <Recharts.Line
                      type="monotone"
                      dataKey="count"
                      stroke="#4f46e5"
                    />
                  </Recharts.LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>المستخدمون المسجلون</CardTitle>
              </CardHeader>
              <CardContent>
                {users.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    لا يوجد مستخدمين مسجلين
                  </div>
                )}
                <div className="space-y-3">
                  {users.map((u) => (
                    <div
                      key={u.phone}
                      className="p-3 border rounded-md flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium">
                          {u.fullName || "-"} •{" "}
                          <span className="font-mono">{u.phone}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!u.isAdmin}
                            onChange={(e) =>
                              toggleAdmin(u.phone, e.target.checked)
                            }
                          />
                          <span className="text-sm">مسؤول</span>
                        </label>
                        <Button
                          variant="destructive"
                          onClick={() => removeUser(u.phone)}
                        >
                          حذف
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>إدارة الصور (معرض)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  أضف صوراً جديدة مع عنوان ووصف؛ ستُعرض مباشرة في المعرض.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <div>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const isVideo = f.type.startsWith("video");
                          // Hard limit: 20MB for any upload (images or videos)
                          const MAX_UPLOAD = 1024 * 1024 * 20; // 20MB
                          if (f.size > MAX_UPLOAD) {
                            toast.error(
                              "حجم الملف كبير جداً — الحد الأقصى للرفع الآن 20MB. حاول ملف أصغر أو استخدم رفع للخادم."
                            );
                            return;
                          }

                          const reader = new FileReader();
                          reader.onerror = () => {
                            toast.error("تعذر قراءة الملف. حاول ملفاً آخر.");
                          };
                          reader.onload = () => {
                            setFilePreview(String(reader.result || ""));
                          };
                          reader.readAsDataURL(f);
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm">العنوان</label>
                    <input
                      className="w-full p-2 border rounded"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm">الوصف</label>
                    <textarea
                      className="w-full p-2 border rounded"
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                    />
                  </div>

                  {filePreview && (
                    <div className="p-2 border rounded">
                      {/* detect if preview is video by checking data:video or file extension */}
                      {filePreview.startsWith("data:video") ||
                      filePreview.match(/\.mp4|\.webm|\.ogg$/i) ? (
                        <video
                          src={filePreview}
                          className="max-h-40"
                          controls
                        />
                      ) : (
                        <img
                          src={filePreview}
                          alt="preview"
                          className="max-h-40 object-contain"
                        />
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (!filePreview) {
                          toast.error("اختر ملفاً أولاً");
                          return;
                        }
                        const isVideo =
                          filePreview.startsWith("data:video") ||
                          filePreview.match(/\.mp4|\.webm|\.ogg$/i);
                        const img: GalleryImage = {
                          id: `${Date.now()}`,
                          dataUrl: filePreview,
                          title,
                          description: desc,
                          createdAt: new Date().toISOString(),
                          mediaType: isVideo ? "video" : "image",
                        };
                        try {
                          saveGalleryImage(img);
                          setTitle("");
                          setDesc("");
                          setFilePreview(null);
                          refreshGallery();
                          toast.success("تم إضافة الملف");
                        } catch (err) {
                          // likely quota exceeded writing to localStorage
                          console.error(err);
                          toast.error(
                            "فشل حفظ الملف محلياً — قد يكون حجم الملف كبيراً أو أن المتصفح يمنع التخزين. أنصح برفع فيديو أصغر أو استخدام رفع للخادم."
                          );
                        }
                      }}
                    >
                      أضف الملف
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const snap = await fetchRemoteSnapshot();
                          type RemoteUser = {
                            phone: string;
                            fullName?: string | null;
                            isAdmin?: boolean;
                            password?: string;
                          };
                          upsertRemoteUsers(snap.users as RemoteUser[]);
                          upsertRemoteOrders(snap.orders as RemoteOrder[]);
                          upsertRemoteGallery(
                            snap.gallery as RemoteGalleryItem[]
                          );
                          setUsers(getUsers());
                          setOrders(getOrders());
                          setGallery(getGallery());
                          toast.success("تم جلب ومزامنة البيانات من السحابة");
                        } catch (err) {
                          toast.error("فشل المزامنة، راجع الـ Console للمزيد");
                          console.error(err);
                        }
                      }}
                    >
                      مزامنة الآن
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTitle("");
                        setDesc("");
                        setFilePreview(null);
                      }}
                    >
                      إلغاء
                    </Button>
                  </div>

                  <div className="mt-4">
                    <h4 className="font-medium">صور المعرض (مستخدم)</h4>
                    <div className="space-y-3 mt-3">
                      {gallery.length === 0 && (
                        <div className="text-sm text-muted-foreground">
                          لا توجد ملفات تم رفعها
                        </div>
                      )}
                      {gallery.map((img) => (
                        <div
                          key={img.id}
                          className="flex items-center justify-between p-2 border rounded"
                        >
                          <div className="flex items-center gap-3">
                            {img.mediaType === "video" ? (
                              <video
                                src={img.dataUrl}
                                className="h-16 w-24 object-cover rounded"
                                controls
                              />
                            ) : (
                              <img
                                src={img.dataUrl}
                                alt={img.title}
                                className="h-16 w-24 object-cover rounded"
                              />
                            )}
                            <div>
                              <div className="font-medium">
                                {img.title || "بدون عنوان"}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {img.description}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="destructive"
                              onClick={() => {
                                deleteGalleryImage(img.id);
                                refreshGallery();
                                toast.success("تم حذف الملف");
                              }}
                            >
                              حذف
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>إدارة الطلبات</CardTitle>
                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const snap = await fetchRemoteSnapshot();
                          // store the full payload for debug panel
                          setLastPayload(snap);
                          // upsert orders and invoices if present
                          if (snap && Array.isArray(snap.orders)) {
                            upsertRemoteOrders(snap.orders as RemoteOrder[]);
                          }
                          if (snap && Array.isArray(snap.invoices)) {
                            upsertRemoteInvoices(
                              snap.invoices as Array<{
                                phone: string;
                                items: Record<string, unknown>;
                              }>
                            );
                          }
                          setOrders(getOrders());
                          setInvoices(getInvoices());
                          setLastSync(new Date().toISOString());
                          // compute counts for feedback
                          const ordersFetched = Array.isArray(snap.orders)
                            ? snap.orders.length
                            : 0;
                          const invoicesFetched = Array.isArray(snap.invoices)
                            ? snap.invoices.length
                            : 0;
                          toast.success(
                            `تم مزامنة ${ordersFetched} طلب(ات) و ${invoicesFetched} مجموعة فواتير من السحابة`
                          );
                          console.debug("fetchRemoteSnapshot.payload", snap);
                        } catch (err) {
                          console.error("orders sync failed", err);
                          toast.error(
                            "فشل مزامنة الطلبات/الفواتير، راجع الـ Console للمزيد من التفاصيل"
                          );
                        }
                      }}
                    >
                      مزامنة الآن
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {orders.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    لا توجد طلبات حالياً
                  </div>
                )}
                {import.meta.env.VITE_FIREBASE_DEBUG === "true" &&
                  lastPayload && (
                    <div className="my-3 p-2 bg-slate-50 text-xs rounded border">
                      <div className="font-medium">DEBUG: آخر حزمة مستلمة</div>
                      <pre className="overflow-auto max-h-40">
                        {JSON.stringify(lastPayload, null, 2)}
                      </pre>
                    </div>
                  )}
                {lastRemoteError && (
                  <div className="my-3 p-3 bg-red-50 text-sm rounded border border-red-200">
                    <div className="font-medium text-red-700">
                      خطأ مزامنة سابق
                    </div>
                    <pre className="whitespace-pre-wrap text-xs mt-2">
                      {lastRemoteError}
                    </pre>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          try {
                            localStorage.removeItem("tf:lastRemoteError");
                            setLastRemoteError(null);
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        مسح
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  {orders.map((o) => (
                    <div
                      key={o.id}
                      className="p-3 border rounded-md flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium">
                          {o.productType} — {o.size} — x{o.quantity}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {o.customerPhone || "-"} •{" "}
                          {new Date(o.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={o.status}
                          onChange={(e) => changeStatus(o.id, e.target.value)}
                          className="p-1 border rounded"
                        >
                          <option>قيد التنفيذ</option>
                          <option>تم التجهيز</option>
                          <option>تم التسليم</option>
                          <option>ملغى</option>
                        </select>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="سعر"
                            className="p-1 border rounded w-28"
                            value={
                              priceMap[o.id] ??
                              (o.invoice?.amount?.toString() || "")
                            }
                            onChange={(e) =>
                              setPriceMap((m) => ({
                                ...m,
                                [o.id]: e.target.value,
                              }))
                            }
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              const v =
                                priceMap[o.id] ??
                                o.invoice?.amount?.toString() ??
                                "";
                              const amount = Number(v || 0);
                              if (isNaN(amount)) {
                                toast.error("الرجاء إدخال سعر صالح");
                                return;
                              }
                              const invNumber =
                                o.invoice?.number || `INV-${Date.now()}`;
                              try {
                                saveInvoiceForOrder(o.id, {
                                  number: invNumber,
                                  amount,
                                  createdAt: new Date().toISOString(),
                                  notes: "سعر محدد من لوحة الإدارة",
                                });
                                setOrders(getOrders());
                                toast.success("تم حفظ السعر ومزامنته");
                              } catch (err) {
                                console.error(err);
                                toast.error("فشل حفظ السعر");
                              }
                            }}
                          >
                            حفظ السعر
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard?.writeText(o.id);
                            toast.success("نسخ رقم الطلب");
                          }}
                        >
                          نسخ ID
                        </Button>
                        {o.status === "ملغى" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (
                                !confirm(`هل تريد حذف الطلب ${o.id} نهائياً؟`)
                              )
                                return;
                              try {
                                // dynamic import to avoid circular deps
                                (async () => {
                                  const mod = await import("@/lib/store");
                                  if (
                                    mod &&
                                    typeof mod.deleteOrder === "function"
                                  ) {
                                    mod.deleteOrder(o.id);
                                  }
                                })();
                                setOrders(getOrders());
                                toast.success("تم حذف الطلب");
                              } catch (err) {
                                console.error(err);
                                toast.error("فشل حذف الطلب");
                              }
                            }}
                          >
                            حذف
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Admin;

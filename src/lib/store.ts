// Lightweight client-side store using localStorage for demo/admin features
import type { RemoteOrder, RemoteGalleryItem } from "./firebase";
export type User = {
  phone: string;
  password: string;
  fullName?: string;
  isAdmin?: boolean;
};

export type Order = {
  id: string;
  productType: string;
  color: string;
  size: string;
  quantity: number;
  notes?: string;
  status?: string;
  createdAt: string;
  customerPhone?: string;
  invoice?: {
    number: string;
    amount: number;
    createdAt: string;
    notes?: string;
  };
  tracking?: string; // tracking number or code (for customer tracking)
};
export type Invoice = {
  number: string;
  amount: number;
  createdAt: string;
  notes?: string;
  orders?: Order[];
};
const LS_USERS = "tf:users";
const LS_ORDERS = "tf:orders";
const LS_VISITS = "tf:visits"; // { daily: {YYYY-MM-DD: number}, monthly: {YYYY-MM: number} }
const LS_SITE_STATS = "tf:site_stats"; // { projects: number, years: number, rating: number }
const LS_GALLERY = "tf:gallery"; // [{ id, dataUrl, title, description, createdAt }]
const LS_INVOICES = "tf:invoices"; // { [phone]: Array<Invoice> }

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  // notify subscribers and other tabs
  try {
    const payload = { key, newValue: value };
    // local subscribers
    callSubscribers(payload);
    // BroadcastChannel for other tabs (if supported)
    if (bc) {
      bc.postMessage(payload);
    }
  } catch {
    // ignore notify errors
  }
}

// --- Cross-tab sync / subscription API ---
type StoreChange = { key: string; newValue: unknown | null };
const subscribers: Array<(c: StoreChange) => void> = [];
let bc: BroadcastChannel | null = null;

function callSubscribers(payload: StoreChange) {
  for (const s of subscribers) {
    try {
      s(payload);
    } catch {
      // ignore subscriber errors
    }
  }
}

// initialize BroadcastChannel and storage listener
try {
  if (typeof BroadcastChannel !== "undefined") {
    bc = new BroadcastChannel("tf:store_channel");
    bc.onmessage = (ev) => {
      try {
        callSubscribers(ev.data as StoreChange);
      } catch {
        // ignore
      }
    };
  }
} catch {
  bc = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    try {
      if (!e.key) return;
      const parsed = e.newValue ? JSON.parse(e.newValue) : null;
      callSubscribers({ key: e.key, newValue: parsed });
    } catch {
      // ignore
    }
  });
}

export function subscribeStore(fn: (c: StoreChange) => void) {
  subscribers.push(fn);
  return () => {
    const idx = subscribers.indexOf(fn);
    if (idx >= 0) subscribers.splice(idx, 1);
  };
}

export function getUsers(): User[] {
  return readJSON<User[]>(LS_USERS, [
    // default admin account (first-run)
    { phone: "0000", password: "admin", fullName: "المسؤول", isAdmin: true },
  ]);
}

// attempt to push user to remote (firebase) if helper exists
async function tryWriteUserRemote(user: User) {
  try {
    // dynamic import to avoid hard dependency on firebase package
    const mod = await import("./firebase");
    if (mod && typeof mod.writeUserToRemote === "function") {
      try {
        await mod.writeUserToRemote({
          phone: user.phone,
          password: user.password,
          fullName: user.fullName,
          isAdmin: user.isAdmin,
        });
      } catch {
        /* ignore */
      }
    }
  } catch {
    // ignore if firebase not configured
  }
}

export function saveUser(user: User) {
  const users = getUsers();
  const exists = users.find((u) => u.phone === user.phone);
  if (exists) {
    // replace
    const updated = users.map((u) =>
      u.phone === user.phone ? { ...u, ...user } : u
    );
    writeJSON(LS_USERS, updated);
    void tryWriteUserRemote(user);
    return;
  }
  users.push(user);
  writeJSON(LS_USERS, users);
  void tryWriteUserRemote(user);
}

export function setUserAdmin(phone: string, isAdmin: boolean) {
  const users = getUsers();
  const updated = users.map((u) => (u.phone === phone ? { ...u, isAdmin } : u));
  writeJSON(LS_USERS, updated);
  // attempt to update remote copy
  (async () => {
    try {
      const mod = await import("./firebase");
      if (mod && typeof mod.writeUserToRemote === "function") {
        const user = updated.find((u) => u.phone === phone);
        if (user) {
          await mod.writeUserToRemote({
            phone: user.phone,
            password: user.password,
            fullName: user.fullName,
            isAdmin: !!user.isAdmin,
          });
        }
      }
    } catch {
      // ignore
    }
  })();
}

export function deleteUser(phone: string) {
  const users = getUsers();
  const updated = users.filter((u) => u.phone !== phone);
  writeJSON(LS_USERS, updated);
  // attempt remote delete
  (async () => {
    try {
      const mod = await import("./firebase");
      if (mod && typeof mod.deleteRemoteUser === "function") {
        await mod.deleteRemoteUser(phone);
      }
    } catch {
      // ignore
    }
  })();
  // if current session belongs to the deleted user, clear it
  try {
    const s = JSON.parse(localStorage.getItem("tf:session") || "null");
    if (s && s.phone === phone) {
      localStorage.removeItem("tf:session");
    }
  } catch {
    /* ignore */
  }
}

export function findUser(phone: string, password?: string) {
  const users = getUsers();
  const u = users.find(
    (x) => x.phone === phone && (password ? x.password === password : true)
  );
  return u;
}

export function getOrders(): Order[] {
  return readJSON<Order[]>(LS_ORDERS, []);
}

export function saveOrder(order: Order) {
  const orders = getOrders();
  orders.unshift(order);
  writeJSON(LS_ORDERS, orders);
  // push to remote in background
  (async () => {
    try {
      const mod = await import("./firebase");
      if (mod && typeof mod.writeOrderRemote === "function") {
        // cast using structural typing
        const o = {
          id: order.id,
          productType: order.productType,
          color: order.color,
          size: order.size,
          quantity: order.quantity,
          notes: order.notes,
          status: order.status,
          createdAt: order.createdAt,
          customerPhone: order.customerPhone,
          invoice: (order as unknown as Record<string, unknown>).invoice,
          tracking: (order as unknown as Record<string, unknown>).tracking,
        } as const;
        // include invoice/tracking when sending to remote so orders carry invoice data
        const ok = await mod.writeOrderRemote(
          o as unknown as Record<string, unknown>
        );
        if (!ok) {
          try {
            localStorage.setItem(
              "tf:lastRemoteError",
              JSON.stringify({
                when: Date.now(),
                type: "writeOrder",
                orderId: o.id,
              })
            );
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  })();
}

// Per-customer invoices stored keyed by phone number
export function getInvoices(): Record<string, Invoice[]> {
  return readJSON<Record<string, Invoice[]>>(LS_INVOICES, {});
}

export function getInvoicesForPhone(phone: string): Invoice[] {
  const all = getInvoices();
  return all[phone] || [];
}

export function saveInvoiceForPhone(phone: string, invoice: Invoice) {
  try {
    const all = getInvoices();
    const list = all[phone] || [];
    // if invoice with same number exists, merge orders and update metadata
    const existingIdx = list.findIndex((i) => i.number === invoice.number);
    if (existingIdx >= 0) {
      const existing = list[existingIdx];
      // merge orders (preserve unique by id)
      const mergedOrders: Order[] = [];
      const seen = new Set<string>();
      const pushOrder = (o?: Order) => {
        if (!o || !o.id) return;
        if (!seen.has(o.id)) {
          seen.add(o.id);
          mergedOrders.push(o);
        }
      };
      if (Array.isArray(existing.orders)) existing.orders.forEach(pushOrder);
      if (Array.isArray(invoice.orders)) invoice.orders.forEach(pushOrder);

      const merged: Invoice = {
        number: invoice.number,
        amount: invoice.amount || existing.amount || 0,
        createdAt: invoice.createdAt || existing.createdAt,
        notes: invoice.notes || existing.notes,
        orders: mergedOrders.length ? mergedOrders : undefined,
      };
      // replace existing invoice in place
      list.splice(existingIdx, 1);
      list.unshift(merged);
    } else {
      list.unshift(invoice);
    }
    all[phone] = list;
    writeJSON(LS_INVOICES, all);

    // push invoice to remote and record persistent write failures
    (async () => {
      try {
        const mod = await import("./firebase");
        if (mod && typeof mod.writeInvoiceRemote === "function") {
          const ok = await mod.writeInvoiceRemote(
            phone,
            invoice as unknown as {
              number: string;
              amount: number;
              createdAt: string;
              notes?: string;
              orders?: unknown;
            }
          );
          if (!ok) {
            try {
              localStorage.setItem(
                "tf:lastRemoteError",
                JSON.stringify({
                  when: Date.now(),
                  type: "writeInvoice",
                  phone,
                  invoice: invoice.number,
                })
              );
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    })();
  } catch {
    // ignore
  }
}

export function updateOrderStatus(id: string, status: string) {
  const orders = getOrders();
  const updated = orders.map((o) => (o.id === id ? { ...o, status } : o));
  writeJSON(LS_ORDERS, updated);
  // push status update to remote
  (async () => {
    try {
      const mod = await import("./firebase");
      if (mod && typeof mod.writeOrderRemote === "function") {
        const o = updated.find((x) => x.id === id);
        if (o) {
          await mod.writeOrderRemote({
            id: o.id,
            productType: o.productType,
            color: o.color,
            size: o.size,
            quantity: o.quantity,
            notes: o.notes,
            status: o.status,
            createdAt: o.createdAt,
            customerPhone: o.customerPhone,
            invoice: (o as unknown as Record<string, unknown>).invoice,
            tracking: (o as unknown as Record<string, unknown>).tracking,
          } as unknown as Record<string, unknown>);
        }
      }
    } catch {
      // ignore
    }
  })();
}

export function incrementVisit() {
  const visits = readJSON<Record<string, Record<string, number>>>(LS_VISITS, {
    daily: {},
    monthly: {},
  });
  const d = new Date();
  const day = d.toISOString().slice(0, 10);
  const month = d.toISOString().slice(0, 7);
  visits.daily[day] = (visits.daily[day] || 0) + 1;
  visits.monthly[month] = (visits.monthly[month] || 0) + 1;
  writeJSON(LS_VISITS, visits);
}

export function getVisits() {
  return readJSON<Record<string, Record<string, number>>>(LS_VISITS, {
    daily: {},
    monthly: {},
  });
}

export type SiteStats = {
  projects: number;
  years: number;
  rating: number; // 0-5 scale
};

export function getSiteStats(): SiteStats {
  return readJSON<SiteStats>(LS_SITE_STATS, {
    projects: 500,
    years: 15,
    rating: 4.9,
  });
}

export function saveSiteStats(stats: SiteStats) {
  writeJSON(LS_SITE_STATS, stats);
  // push updated stats to remote DB if available
  (async () => {
    try {
      const mod = await import("./firebase");
      if (mod && typeof mod.writeSiteStatsRemote === "function") {
        await mod.writeSiteStatsRemote(stats);
      }
    } catch {
      // ignore
    }
  })();
}

// Apply stats received from remote DB directly to localStorage without pushing them back
// (used to avoid feedback loop when we receive site_stats updates from Firebase)
export function applyRemoteSiteStats(stats: SiteStats) {
  try {
    writeJSON(LS_SITE_STATS, stats);
  } catch {
    // ignore
  }
}

export function clearAllDemoData() {
  localStorage.removeItem(LS_ORDERS);
  localStorage.removeItem(LS_USERS);
  localStorage.removeItem(LS_VISITS);
}

export type GalleryImage = {
  id: string;
  dataUrl: string; // can be data:image/... or asset/video path
  title?: string;
  description?: string;
  createdAt: string;
  mediaType?: "image" | "video";
};

export function getGallery(): GalleryImage[] {
  return readJSON<GalleryImage[]>(LS_GALLERY, []);
}

export function saveGalleryImage(img: GalleryImage) {
  const images = getGallery();
  images.unshift(img);
  writeJSON(LS_GALLERY, images);
  // try remote push
  (async () => {
    try {
      const mod = await import("./firebase");
      if (mod && typeof mod.writeGalleryRemote === "function") {
        const g = {
          id: img.id,
          dataUrl: img.dataUrl,
          title: img.title,
          description: img.description,
          createdAt: img.createdAt,
          mediaType: img.mediaType,
        } as const;
        await mod.writeGalleryRemote(g as RemoteGalleryItem);
      }
    } catch {
      // ignore
    }
  })();
}

export function deleteGalleryImage(id: string) {
  const images = getGallery();
  const updated = images.filter((i) => i.id !== id);
  writeJSON(LS_GALLERY, updated);
  // try remote delete by writing null to that key if firebase available
  (async () => {
    try {
      const mod = await import("./firebase");
      if (mod && typeof mod.deleteRemoteGalleryItem === "function") {
        await mod.deleteRemoteGalleryItem(id);
      }
    } catch {
      // ignore
    }
  })();
}

export function deleteOrder(id: string) {
  const orders = getOrders();
  const updated = orders.filter((o) => o.id !== id);
  writeJSON(LS_ORDERS, updated);
  // try remote delete
  (async () => {
    try {
      const mod = await import("./firebase");
      if (mod && typeof mod.deleteRemoteOrder === "function") {
        await mod.deleteRemoteOrder(id);
      }
    } catch {
      // ignore
    }
  })();
}

export function saveInvoiceForOrder(
  orderId: string,
  invoice: { number: string; amount: number; createdAt: string; notes?: string }
) {
  const orders = getOrders();
  const updated = orders.map((o) =>
    o.id === orderId
      ? {
          ...o,
          invoice: {
            number: invoice.number,
            amount: invoice.amount,
            createdAt: invoice.createdAt,
            notes: invoice.notes,
          },
        }
      : o
  );
  writeJSON(LS_ORDERS, updated);
  // push updated order to remote
  (async () => {
    try {
      const mod = await import("./firebase");
      if (mod && typeof mod.writeOrderRemote === "function") {
        const o = updated.find((x) => x.id === orderId);
        if (o) {
          await mod.writeOrderRemote(o as RemoteOrder);
        }
      }
    } catch {
      // ignore
    }
  })();
}

// ----- Remote upsert helpers (merge remote data into local store) -----
export function upsertRemoteUsers(
  remote: Array<{
    phone: string;
    fullName?: string | null;
    isAdmin?: boolean;
    password?: string;
  }>
) {
  // Mirror remote users into local store but preserve any existing local passwords
  try {
    const local = getUsers();
    const preservedLocalAdmins = local.filter(
      (u) => !!u.isAdmin && u.password && u.password !== "remote"
    );
    const remoteUsers = remote.map((r) => {
      // try to use remote password if provided; otherwise preserve local password when exists
      const localMatch = local.find((u) => u.phone === r.phone);
      const password =
        typeof r.password === "string" && r.password.length > 0
          ? r.password
          : localMatch?.password ?? "remote";
      return {
        phone: r.phone,
        password,
        fullName: r.fullName || undefined,
        isAdmin: !!r.isAdmin,
      } as User;
    });
    // merge preserved admins if they are not present remotely
    for (const p of preservedLocalAdmins) {
      if (!remoteUsers.find((u) => u.phone === p.phone)) {
        remoteUsers.push({
          phone: p.phone,
          password: p.password,
          fullName: p.fullName || "",
          isAdmin: !!p.isAdmin,
        });
      }
    }
    writeJSON(LS_USERS, remoteUsers);

    // if current session user no longer exists, clear session
    try {
      const s = JSON.parse(localStorage.getItem("tf:session") || "null");
      if (s && s.phone && !remoteUsers.find((u) => u.phone === s.phone)) {
        localStorage.removeItem("tf:session");
      }
    } catch {
      // ignore
    }
  } catch {
    // ignore sync errors
  }
}

export function upsertRemoteOrders(
  remote: Array<{
    id: string;
    productType: string;
    color: string;
    size: string;
    quantity: number;
    notes?: string;
    status?: string;
    createdAt: string;
    customerPhone?: string;
    invoice?: {
      number: string;
      amount: number;
      createdAt: string;
      notes?: string;
    };
    tracking?: string;
  }>
) {
  const local = getOrders();
  const map = new Map(local.map((o) => [o.id, o] as [string, typeof o]));
  for (const r of remote) {
    const existing = map.get(r.id);
    if (!existing) {
      // push new remote order to top
      const o = {
        id: r.id,
        productType: r.productType,
        color: r.color,
        size: r.size,
        quantity: r.quantity,
        notes: r.notes,
        status: r.status || "قيد التنفيذ",
        createdAt: r.createdAt,
        customerPhone: r.customerPhone,
        invoice: r.invoice ? { ...r.invoice } : undefined,
        tracking: r.tracking,
      };
      local.unshift(o);
      map.set(o.id, o);
    } else {
      // merge status/notes if remote seems newer
      if (r.status && r.status !== existing.status) {
        existing.status = r.status;
      }
      // merge invoice/tracking if provided remotely
      if (r.invoice) {
        existing.invoice = { ...r.invoice };
      }
      if (r.tracking) {
        existing.tracking = r.tracking;
      }
    }
  }
  writeJSON(LS_ORDERS, local);
}

// Mirror remote invoices into local storage under LS_INVOICES
export function upsertRemoteInvoices(
  remote: Array<{ phone: string; items: Record<string, unknown> }>
) {
  try {
    const all = getInvoices();
    for (const r of remote) {
      try {
        // convert items object to array of invoices
        const items = r.items || {};
        const arr = Object.entries(items).map(([k, v]) => {
          const obj = v as Record<string, unknown>;
          // parse orders if present: could be array or object keyed by id
          let orders: Order[] | undefined = undefined;
          try {
            const raw = obj.orders as unknown;
            if (Array.isArray(raw)) {
              orders = raw.map((o) => o as Order);
            } else if (raw && typeof raw === "object") {
              orders = Object.entries(raw as Record<string, unknown>).map(
                ([ok, ov]) => {
                  const oo = ov as Record<string, unknown>;
                  return {
                    id: (oo.id as string) || ok,
                    productType: (oo.productType as string) || "",
                    color: (oo.color as string) || "",
                    size: (oo.size as string) || "",
                    quantity: Number(oo.quantity) || 0,
                    notes: (oo.notes as string) || undefined,
                    status: (oo.status as string) || undefined,
                    createdAt: String(oo.createdAt || ""),
                    customerPhone: (oo.customerPhone as string) || undefined,
                    invoice: oo.invoice as unknown as Invoice | undefined,
                    tracking: (oo.tracking as string) || undefined,
                  } as Order;
                }
              );
            }
          } catch {
            // ignore parse errors for orders
            orders = undefined;
          }

          return {
            number: String(obj.number || k),
            amount: Number(obj.amount || 0),
            createdAt: String(obj.createdAt || ""),
            notes: (obj.notes as string) || undefined,
            orders: orders,
          } as Invoice;
        });
        all[r.phone] = arr;
      } catch {
        // ignore per-phone parse errors
      }
    }
    writeJSON(LS_INVOICES, all);
  } catch {
    // ignore
  }
}

export function upsertRemoteGallery(
  remote: Array<{
    id: string;
    dataUrl: string;
    title?: string;
    description?: string;
    createdAt: string;
    mediaType?: "image" | "video";
  }>
) {
  try {
    // Mirror remote gallery: replace local gallery with remote list
    const remoteItems = remote.map((r) => ({
      id: r.id,
      dataUrl: r.dataUrl,
      title: r.title || undefined,
      description: r.description || undefined,
      createdAt: r.createdAt,
      mediaType: r.mediaType || "image",
    }));
    writeJSON(LS_GALLERY, remoteItems);
  } catch {
    // ignore
  }
}

export default {};

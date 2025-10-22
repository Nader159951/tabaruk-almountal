import { initializeApp, getApps } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  onDisconnect,
  serverTimestamp,
  onValue,
  off,
  runTransaction,
} from "firebase/database";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
} from "firebase/auth";
import { get as dbGet } from "firebase/database";
// Firebase initialization using Vite env variables (VITE_*)
export function initFirebase() {
  try {
    if (getApps().length > 0) return true;
    const cfg = {
      apiKey:
        import.meta.env.VITE_FIREBASE_API_KEY ||
        "AIzaSyBnTCqUCKOyokE1IshD3L8tjwEguKMJhuo",
      authDomain:
        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
        "nader-11d20.firebaseapp.com",
      databaseURL:
        import.meta.env.VITE_FIREBASE_DATABASE_URL ||
        "https://nader-11d20-default-rtdb.firebaseio.com",
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "nader-11d20",
      storageBucket:
        import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
        "nader-11d20.firebasestorage.app",
      messagingSenderId:
        import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "786543738921",
      appId:
        import.meta.env.VITE_FIREBASE_APP_ID ||
        "1:786543738921:web:8d7fc040bdda94eacd1c38",
      measurementId:
        import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-LH0DJLXXCJ",
    };
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG)
      console.debug(
        "firebase init config:",
        cfg && { projectId: cfg.projectId, databaseURL: cfg.databaseURL }
      );
    // minimal check
    if (!cfg.apiKey || !cfg.databaseURL) {
      if (DEBUG) console.warn("firebase config missing API key or databaseURL");
      return false;
    }

    initializeApp(cfg);
    if (DEBUG) console.debug("firebase initialized");
    return true;
  } catch (err) {
    // initialization failed
    // expose error when debugging
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG) console.error("firebase init failed", err);
    return false;
  }
}

function getDB() {
  try {
    if (!initFirebase()) return null;
    return getDatabase();
  } catch {
    return null;
  }
}

// ensure anonymous auth so DB rules that require auth work
export async function ensureAuth() {
  try {
    if (!initFirebase()) return false;
    const auth = getAuth();
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    // if already signed in
    if (auth.currentUser) {
      if (DEBUG) console.debug("ensureAuth: already signed in");
      return true;
    }
    // otherwise try anonymous sign-in
    try {
      await signInAnonymously(auth);
      if (DEBUG) console.debug("ensureAuth: signed in anonymously");
      return true;
    } catch (err: unknown) {
      if (DEBUG) {
        try {
          // Narrow to common Firebase error shape for logging
          const e = err as { code?: string; message?: string };
          console.error(
            "ensureAuth: anonymous sign-in failed",
            e.code ?? e.message ?? err
          );
        } catch (e) {
          console.error("ensureAuth: anonymous sign-in failed", err);
        }
      }
      return false;
    }
  } catch {
    return false;
  }
}

export function getDeviceId() {
  try {
    let id = localStorage.getItem("tf:deviceId");
    if (!id) {
      id = `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("tf:deviceId", id);
    }
    return id;
  } catch {
    return `d-${Date.now()}`;
  }
}

export async function setPresence(
  userPhone: string,
  deviceId?: string,
  info?: Record<string, unknown>
) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();
    const id = deviceId || getDeviceId();
    const r = ref(db, `presence/${userPhone}/${id}`);
    // set data
    await set(r, {
      online: true,
      lastSeen: Date.now(),
      deviceInfo: info || {
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      },
    });
    // register onDisconnect to mark offline
    try {
      onDisconnect(r).set({ online: false, lastSeen: serverTimestamp() });
    } catch {
      // ignore onDisconnect errors in some environments
    }
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG)
      console.debug("setPresence success", { userPhone, deviceId: id });
    return true;
  } catch {
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG) console.error("setPresence failed for", userPhone);
    return false;
  }
}

export async function clearPresence(userPhone: string, deviceId?: string) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();
    const id = deviceId || localStorage.getItem("tf:deviceId") || getDeviceId();
    const r = ref(db, `presence/${userPhone}/${id}`);
    await set(r, { online: false, lastSeen: Date.now() });
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG) console.debug("clearPresence", { userPhone, deviceId: id });
    return true;
  } catch {
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG) console.error("clearPresence failed for", userPhone);
    return false;
  }
}

export type DevicePresence = {
  id: string;
  online?: boolean;
  lastSeen?: number | { ".sv": string } | null;
  deviceInfo?: Record<string, unknown>;
};

export function subscribePresence(
  userPhone: string,
  cb: (devices: Array<DevicePresence>) => void
) {
  const db = getDB();
  if (!db) return () => {};
  try {
    const r = ref(db, `presence/${userPhone}`);
    const listener = onValue(r, (snap) => {
      const v = snap.val() || {};
      const arr = Object.entries(v).map(
        ([id, val]) =>
          ({
            id,
            ...(val as unknown as Record<string, unknown>),
          } as DevicePresence)
      );
      cb(arr);
    });
    return () => {
      try {
        off(r);
      } catch (err) {
        // ignore unsubscribe errors
        void err;
      }
    };
  } catch {
    return () => {};
  }
}

// --- Simple users sync helpers ---
export async function writeUserToRemote(user: {
  phone: string;
  password?: string;
  fullName?: string;
  isAdmin?: boolean;
}) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();

    // Sign in or create a regular user (phone -> synthetic email) using Email/Password Auth
    const r = ref(db, `users/${user.phone}`);
    // store password too for demo cross-device auth (insecure for production)
    await set(r, {
      phone: user.phone,
      password: user.password || null,
      fullName: user.fullName || null,
      isAdmin: !!user.isAdmin,
      updatedAt: Date.now(),
    });
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG) console.debug("writeUserToRemote success", user.phone);
    return true;
  } catch {
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG) console.error("writeUserToRemote failed", user.phone);
    return false;
  }
}

export function subscribeUsers(
  cb: (
    users: Array<{ phone: string; fullName?: string | null; isAdmin?: boolean }>
  ) => void
) {
  const db = getDB();
  if (!db) return () => {};
  try {
    const r = ref(db, `users`);
    const listener = onValue(r, (snap) => {
      const v = snap.val() || {};
      const arr = Object.entries(v).map(([k, val]) => ({
        phone: k,
        ...(val as unknown as Record<string, unknown>),
      }));
      const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
      if (DEBUG) console.debug("subscribeUsers received", arr.length, "users");
      cb(
        arr as Array<{
          phone: string;
          fullName?: string | null;
          isAdmin?: boolean;
        }>
      );
    });
    return () => {
      try {
        off(r);
      } catch (err) {
        void err;
      }
    };
  } catch {
    return () => {};
  }
}

// Orders sync
export async function writeOrderRemote(order: Record<string, unknown>) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();
    const r = ref(db, `orders/${order.id}`);
    await set(r, order);
    return true;
  } catch (err) {
    // always log persistent write errors so the developer can diagnose
    console.error("writeOrderRemote failed", err);
    return false;
  }
}

export type RemoteOrder = {
  id: string;
  productType: string;
  color: string;
  size: string;
  quantity: number;
  notes?: string;
  status?: string;
  createdAt: string;
  customerPhone?: string;
};

// Remote order may include invoice and tracking fields
export type RemoteOrderWithInvoice = RemoteOrder & {
  invoice?: {
    number: string;
    amount: number;
    createdAt: string;
    notes?: string;
  };
  tracking?: string;
};

export function subscribeOrders(cb: (orders: Array<RemoteOrder>) => void) {
  const db = getDB();
  if (!db) return () => {};
  try {
    const r = ref(db, `orders`);
    // attach listener after ensuring auth so DB rules allowing only authenticated
    // reads won't block the realtime subscription. We don't await here to
    // keep the subscribeOrders API synchronous; off(r) is safe even if
    // onValue hasn't been attached yet.
    (async () => {
      try {
        try {
          await ensureAuth();
        } catch (errAuth) {
          // ensureAuth may fail if anonymous auth is disabled; warn but continue
          console.warn(
            "subscribeOrders: ensureAuth failed, attempting to attach listener anyway",
            errAuth
          );
        }
        onValue(r, (snap) => {
          const v = snap.val() || {};
          const arr = Object.entries(v).map(([k, val]) => {
            const obj = val as Record<string, unknown>;
            return {
              id: (obj.id as string) || k,
              productType: (obj.productType as string) || "",
              color: (obj.color as string) || "",
              size: (obj.size as string) || "",
              quantity: Number(obj.quantity) || 0,
              notes: (obj.notes as string) || undefined,
              status: (obj.status as string) || undefined,
              createdAt: (obj.createdAt as string) || "",
              customerPhone: (obj.customerPhone as string) || undefined,
              invoice:
                obj.invoice && typeof obj.invoice === "object"
                  ? {
                      number: String(
                        (obj.invoice as Record<string, unknown>).number || ""
                      ),
                      amount: Number(
                        (obj.invoice as Record<string, unknown>).amount || 0
                      ),
                      createdAt: String(
                        (obj.invoice as Record<string, unknown>).createdAt || ""
                      ),
                      notes: (obj.invoice as Record<string, unknown>).notes as
                        | string
                        | undefined,
                    }
                  : undefined,
              tracking:
                typeof obj.tracking === "string"
                  ? (obj.tracking as string)
                  : undefined,
            } as RemoteOrderWithInvoice;
          });
          const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
          if (DEBUG)
            console.debug("subscribeOrders received", arr.length, "orders");
          cb(arr);
        });
      } catch (err) {
        // If attaching the onValue listener itself fails, always surface it
        console.error("subscribeOrders: failed to attach listener", err);
      }
    })();

    return () => {
      try {
        off(r);
      } catch (err) {
        void err;
      }
    };
  } catch {
    return () => {};
  }
}

// Gallery sync
export async function writeGalleryRemote(img: {
  id: string;
  dataUrl: string;
  title?: string;
  description?: string;
  createdAt: string;
  mediaType?: "image" | "video";
}) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();
    const r = ref(db, `gallery/${img.id}`);
    await set(r, img);
    return true;
  } catch (err) {
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG) console.error("writeGalleryRemote failed", err);
    return false;
  }
}

export type RemoteGalleryItem = {
  id: string;
  dataUrl: string;
  title?: string;
  description?: string;
  createdAt: string;
  mediaType?: "image" | "video";
};

// delete a gallery item remotely
export async function deleteRemoteGalleryItem(id: string) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();
    const r = ref(db, `gallery/${id}`);
    await set(r, null);
    return true;
  } catch {
    return false;
  }
}

// delete a user remotely
export async function deleteRemoteUser(phone: string) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();
    const r = ref(db, `users/${phone}`);
    await set(r, null);
    return true;
  } catch {
    return false;
  }
}

// delete an order remotely
export async function deleteRemoteOrder(id: string) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();
    const r = ref(db, `orders/${id}`);
    await set(r, null);
    return true;
  } catch {
    return false;
  }
}

export function subscribeGallery(
  cb: (items: Array<RemoteGalleryItem>) => void
) {
  const db = getDB();
  if (!db) return () => {};
  try {
    const r = ref(db, `gallery`);
    const listener = onValue(r, (snap) => {
      const v = snap.val() || {};
      const arr = Object.entries(v).map(([k, val]) => {
        const obj = val as Record<string, unknown>;
        return {
          id: (obj.id as string) || k,
          dataUrl: (obj.dataUrl as string) || "",
          title: (obj.title as string) || undefined,
          description: (obj.description as string) || undefined,
          createdAt: (obj.createdAt as string) || "",
          mediaType: (obj.mediaType as "image" | "video") || "image",
        } as RemoteGalleryItem;
      });
      const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
      if (DEBUG)
        console.debug("subscribeGallery received", arr.length, "items");
      cb(arr);
    });
    return () => {
      try {
        off(r);
      } catch (err) {
        void err;
      }
    };
  } catch {
    return () => {};
  }
}

// Fetch snapshot of users/orders/gallery once (helpful for manual sync)
export async function fetchRemoteSnapshot() {
  const db = getDB();
  if (!db) return { users: [], orders: [], gallery: [] };
  try {
    await ensureAuth();
    const usersSnap = await dbGet(ref(db, "users"));
    const ordersSnap = await dbGet(ref(db, "orders"));
    const gallerySnap = await dbGet(ref(db, "gallery"));
    const invoicesSnap = await dbGet(ref(db, "invoices"));
    const usersVal = usersSnap.val() || {};
    const ordersVal = ordersSnap.val() || {};
    const galleryVal = gallerySnap.val() || {};
    const invoicesVal = invoicesSnap.val() || {};
    const users = Object.entries(usersVal).map(([k, v]) => ({
      phone: k,
      ...(v as Record<string, unknown>),
    }));
    const orders = Object.entries(ordersVal).map(([k, v]) => {
      const obj = v as Record<string, unknown>;
      return { id: k, ...(obj || {}) } as Record<string, unknown>;
    });
    const gallery = Object.entries(galleryVal).map(
      ([k, v]) => v as Record<string, unknown>
    );
    const invoices = Object.entries(invoicesVal).map(([phone, val]) => ({
      phone,
      items: (val as Record<string, unknown>) || {},
    }));
    return { users, orders, gallery, invoices };
  } catch (err) {
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG) console.error("fetchRemoteSnapshot failed", err);
    return { users: [], orders: [], gallery: [], invoices: [] };
  }
}

// Site stats sync
export async function writeSiteStatsRemote(stats: {
  projects: number;
  years: number;
  rating: number;
}) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();
    const r = ref(db, `site_stats`);
    await set(r, { ...stats, updatedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

// Sign in admin by mapping phone -> synthetic email and using email/password auth.
export async function signInAdminByPhone(phone: string, password: string) {
  try {
    if (!initFirebase()) return { ok: false, error: "no-firebase" };
    const auth = getAuth();
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    const email = `${phone}@admin.local`;
    // check Realtime DB whether the phone is marked isAdmin
    try {
      const db = getDB();
      if (!db) return { ok: false, error: "no-db" };
      const userSnap = await dbGet(ref(db, `users/${phone}`));
      const userVal = userSnap.val() as Record<string, unknown> | null;
      const isAdminFlag = !!(
        userVal &&
        (userVal.isAdmin === true || String(userVal.isAdmin) === "true")
      );
      const allowAuto = import.meta.env.VITE_ADMIN_ALLOW_AUTO_CREATE === "true";
      if (!isAdminFlag && !allowAuto) {
        if (DEBUG)
          console.debug(
            "signInAdminByPhone: denied - not an admin in DB and auto-create disabled",
            phone
          );
        return { ok: false, error: "not-admin" };
      }
    } catch (err) {
      if (DEBUG) console.debug("signInAdminByPhone: db check failed", err);
      // allow continuation only if auto-create enabled
      const allowAuto = import.meta.env.VITE_ADMIN_ALLOW_AUTO_CREATE === "true";
      if (!allowAuto) return { ok: false, error: "db-fail" };
    }
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (DEBUG) console.debug("signInAdminByPhone: signed in", email);
      return { ok: true, user: cred.user };
    } catch (err: unknown) {
      // if user not found, try to create (convenience for first-run)
      // narrow error shape safely
      let code = "";
      try {
        const e = err as Record<string, unknown> | null;
        if (e && typeof e.code === "string") code = e.code;
      } catch {
        code = "";
      }
      if (
        code === "auth/user-not-found" ||
        /user-not-found/i.test(String(err))
      ) {
        const allowAuto =
          import.meta.env.VITE_ADMIN_ALLOW_AUTO_CREATE === "true";
        if (!allowAuto) {
          if (DEBUG)
            console.debug(
              "signInAdminByPhone: user not found and auto-create disabled"
            );
          return { ok: false, error: "user-not-found" };
        }
        try {
          const c = await createUserWithEmailAndPassword(auth, email, password);
          if (DEBUG)
            console.debug(
              "signInAdminByPhone: created admin user (auto-create)",
              email
            );
          return { ok: true, user: c.user };
        } catch (createErr) {
          if (DEBUG)
            console.error("signInAdminByPhone: create failed", createErr);
          return { ok: false, error: createErr };
        }
      }
      if (DEBUG) console.error("signInAdminByPhone: signIn failed", err);
      return { ok: false, error: err };
    }
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function signOutAuth() {
  try {
    if (!initFirebase()) return false;
    const auth = getAuth();
    await fbSignOut(auth);
    return true;
  } catch {
    return false;
  }
}

// Allocate a sequential order number per-year using a transaction.
// Returns formatted string like ORD-2025-001 or null on failure.
export async function allocateOrderNumber() {
  try {
    if (!initFirebase()) return null;
    const db = getDB();
    if (!db) return null;
    await ensureAuth();
    const year = new Date().getFullYear();
    const counterRef = ref(db, `counters/orders/${year}`);
    const res = await runTransaction(counterRef, (current) => {
      if (current === null || typeof current === "undefined") return 1;
      if (typeof current === "number") return current + 1;
      const parsed = Number(current) || 0;
      return parsed + 1;
    });
    const val = res?.snapshot?.val();
    const seq = Number(val) || 0;
    const padded = String(seq).padStart(3, "0");
    return `ORD-${year}-${padded}`;
  } catch (err) {
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    if (DEBUG) console.error("allocateOrderNumber failed", err);
    return null;
  }
}

export function subscribeSiteStats(
  cb: (
    stats: { projects: number; years: number; rating: number } | null
  ) => void
) {
  const db = getDB();
  if (!db) return () => {};
  try {
    const r = ref(db, `site_stats`);
    const listener = onValue(r, (snap) => {
      const v = snap.val();
      if (!v) return cb(null);
      cb({
        projects: Number(v.projects) || 0,
        years: Number(v.years) || 0,
        rating: Number(v.rating) || 0,
      });
    });
    return () => {
      try {
        off(r);
      } catch (err) {
        void err;
      }
    };
  } catch {
    return () => {};
  }
}

// write a per-phone invoice node under /invoices/{phone}/{invoiceNumber}
export async function writeInvoiceRemote(
  phone: string,
  invoice: {
    number: string;
    amount: number;
    createdAt: string;
    notes?: string;
    orders?: unknown;
  }
) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();
    const key = invoice.number || `inv-${Date.now()}`;
    const r = ref(db, `invoices/${phone}/${key}`);
    await set(r, invoice);
    return true;
  } catch (err) {
    console.error("writeInvoiceRemote failed", err);
    return false;
  }
}

export function subscribeInvoices(
  cb: (
    invoices: Array<{ phone: string; items: Record<string, unknown> }>
  ) => void
) {
  const db = getDB();
  if (!db) return () => {};
  try {
    const r = ref(db, `invoices`);
    const listener = onValue(r, (snap) => {
      const v = snap.val() || {};
      const arr = Object.entries(v).map(([phone, val]) => ({
        phone,
        items: val as Record<string, unknown>,
      }));
      const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
      if (DEBUG)
        console.debug("subscribeInvoices received", arr.length, "phones");
      cb(arr);
    });
    return () => {
      try {
        off(r);
      } catch (err) {
        void err;
      }
    };
  } catch {
    return () => {};
  }
}

// Sign in or create a regular user (phone -> synthetic email) using Email/Password Auth
export async function signInUserByPhone(phone: string, password: string) {
  try {
    if (!initFirebase()) return { ok: false, error: "no-firebase" };
    const auth = getAuth();
    const DEBUG = import.meta.env.VITE_FIREBASE_DEBUG === "true";
    const email = `${phone}@users.local`;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (DEBUG) console.debug("signInUserByPhone: signed in", email);
      try {
        const db = getDB();
        if (db && cred.user?.uid) {
          await set(ref(db, `users/${phone}/uid`), cred.user.uid);
        }
      } catch {
        // ignore
      }
      return { ok: true, user: cred.user };
    } catch (err: unknown) {
      // attempt to create on not-found (convenience); caller may prefer to create explicitly
      let code = "";
      try {
        const e = err as Record<string, unknown> | null;
        if (e && typeof e.code === "string") code = e.code;
      } catch {
        code = "";
      }
      if (
        code === "auth/user-not-found" ||
        /user-not-found/i.test(String(err))
      ) {
        try {
          const c = await createUserWithEmailAndPassword(auth, email, password);
          if (DEBUG) console.debug("signInUserByPhone: created user", email);
          try {
            const db = getDB();
            if (db && c.user?.uid) {
              await set(ref(db, `users/${phone}/uid`), c.user.uid);
            }
          } catch {
            // ignore
          }
          return { ok: true, user: c.user };
        } catch (createErr) {
          if (DEBUG)
            console.error("signInUserByPhone: create failed", createErr);
          return { ok: false, error: createErr };
        }
      }
      if (DEBUG) console.error("signInUserByPhone: signIn failed", err);
      return { ok: false, error: err };
    }
  } catch (err) {
    return { ok: false, error: err };
  }
}

// set admin flag for a Firebase UID under /admins/{uid} = true/false
export async function setAdminFlag(uid: string, flag: boolean) {
  const db = getDB();
  if (!db) return false;
  try {
    await ensureAuth();
    const r = ref(db, `admins/${uid}`);
    if (flag) {
      await set(r, true);
    } else {
      await set(r, null);
    }
    return true;
  } catch {
    return false;
  }
}

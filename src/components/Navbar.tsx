import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Menu } from "lucide-react";
import { useState, useEffect } from "react";
import { findUser } from "@/lib/store";
import { subscribeStore } from "@/lib/store";
import {
  subscribePresence,
  clearPresence,
  DevicePresence,
  subscribeUsers,
  subscribeOrders,
  subscribeGallery,
} from "@/lib/firebase";
import {
  upsertRemoteUsers,
  upsertRemoteOrders,
  upsertRemoteGallery,
  getUsers,
  getOrders,
  getGallery,
} from "@/lib/store";

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [session, setSession] = useState<{
    phone?: string;
    isAdmin?: boolean;
  } | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [avatarFallback, setAvatarFallback] = useState<string>("م");
  const [devices, setDevices] = useState<DevicePresence[]>([]);
  const location = useLocation();

  // Read session if present and refresh on route change so Navbar updates after login
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("tf:session") || "null");
      setIsAdmin(!!s?.isAdmin);
      setSession(s);
      if (s?.phone) {
        const u = findUser(s.phone);
        if (u) {
          // if we support profileImage on the user type, treat it as optional
          type MaybeProfile = typeof u & { profileImage?: string };
          const up = u as MaybeProfile;
          if (typeof up.profileImage === "string" && up.profileImage.length) {
            setAvatarSrc(up.profileImage);
          } else {
            setAvatarSrc(null);
          }
          setAvatarFallback(
            (u.fullName && u.fullName[0]) || (u.phone ? u.phone.slice(-2) : "م")
          );
        }
      } else {
        setAvatarSrc(null);
        setAvatarFallback("م");
      }
    } catch {
      setIsAdmin(false);
      setSession(null);
      setAvatarSrc(null);
      setAvatarFallback("م");
    }
  }, [location]);

  // subscribe to presence updates for current user
  useEffect(() => {
    let unsubPresence: (() => void) | null = null;
    try {
      const s = JSON.parse(localStorage.getItem("tf:session") || "null");
      if (s?.phone) {
        unsubPresence = subscribePresence(s.phone, (list) => {
          setDevices(list);
        });
      }
    } catch {
      // ignore
    }
    return () => {
      if (unsubPresence) unsubPresence();
    };
  }, [location]);

  // Global subscriptions so every client syncs with remote changes automatically
  useEffect(() => {
    // subscribe users/orders/gallery and merge into local store
    try {
      const unsubU = subscribeUsers((remote) => {
        try {
          upsertRemoteUsers(remote);
        } catch (err) {
          console.debug("subscribeUsers handler error", err);
        }
      });
      const unsubO = subscribeOrders((remote) => {
        try {
          upsertRemoteOrders(remote);
        } catch (err) {
          console.debug("subscribeOrders handler error", err);
        }
      });
      const unsubG = subscribeGallery((remote) => {
        try {
          upsertRemoteGallery(remote);
        } catch (err) {
          console.debug("subscribeGallery handler error", err);
        }
      });
      return () => {
        try {
          unsubU();
        } catch (e) {
          void e;
        }
        try {
          unsubO();
        } catch (e) {
          void e;
        }
        try {
          unsubG();
        } catch (e) {
          void e;
        }
      };
    } catch (err) {
      // ignore
      void err;
    }
  }, []);

  // subscribe to store changes (cross-tab)
  useEffect(() => {
    const unsub = subscribeStore((c) => {
      if (c.key === "tf:session" || c.key === "tf:users") {
        try {
          const s = JSON.parse(localStorage.getItem("tf:session") || "null");
          setIsAdmin(!!s?.isAdmin);
          setSession(s);
          if (s?.phone) {
            const u = findUser(s.phone);
            if (u) {
              type MaybeProfile = typeof u & { profileImage?: string };
              const up = u as MaybeProfile;
              if (
                typeof up.profileImage === "string" &&
                up.profileImage.length
              ) {
                setAvatarSrc(up.profileImage);
              } else {
                setAvatarSrc(null);
              }
              setAvatarFallback(
                (u.fullName && u.fullName[0]) ||
                  (u.phone ? u.phone.slice(-2) : "م")
              );
            }
          }
        } catch {
          // ignore
        }
      }
    });
    return unsub;
  }, []);

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="text-2xl font-bold text-gradient">تبارك</div>
            <div className="text-sm text-muted-foreground hidden sm:block">
              لتصنيع الألوميتال
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <Link
              to="/"
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              الرئيسية
            </Link>
            <Link
              to="/gallery"
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              معرض الصور
            </Link>
            <Link
              to="/orders"
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              الطلبات
            </Link>
            <Link
              to="/track"
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              متابعة الطلب
            </Link>
            <Link
              to="/invoice"
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              الفاتورة
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="text-foreground hover:text-primary transition-colors font-medium"
              >
                الداشبورد
              </Link>
            )}
          </div>

          {/* Auth / Profile */}
          <div className="hidden md:flex items-center gap-3">
            {!session ? (
              <>
                <Link to="/auth">
                  <Button variant="outline">تسجيل الدخول</Button>
                </Link>
                <Link to="/auth?mode=register">
                  <Button variant="default">إنشاء حساب</Button>
                </Link>
              </>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="p-1"
                >
                  <Avatar>
                    {avatarSrc ? (
                      <AvatarImage src={avatarSrc} alt="profile" />
                    ) : (
                      <AvatarFallback>{avatarFallback}</AvatarFallback>
                    )}
                  </Avatar>
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-card border rounded shadow p-2">
                    <div className="flex flex-col gap-2">
                      {isAdmin && (
                        <Link
                          to="/admin"
                          onClick={() => setProfileMenuOpen(false)}
                          className="block px-2 py-1 hover:bg-muted rounded"
                        >
                          الداشبورد
                        </Link>
                      )}
                      <div className="px-2 py-1">
                        <div className="text-sm font-medium">
                          الأجهزة المتصلة
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {devices.length === 0 && <div>لا أجهزة متصلة</div>}
                          {devices.map((d) => (
                            <div
                              key={d.id}
                              className="flex items-center justify-between py-1"
                            >
                              <div className="truncate">
                                {d.deviceInfo?.ua
                                  ? String(d.deviceInfo.ua).slice(0, 40)
                                  : d.id}
                              </div>
                              <div
                                className={`text-xs ${
                                  d.online
                                    ? "text-green-500"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {d.online ? "متصل" : "آخر ظهور"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          try {
                            const s = JSON.parse(
                              localStorage.getItem("tf:session") || "null"
                            );
                            if (s?.phone) clearPresence(s.phone);
                          } catch (err) {
                            void err;
                          }
                          localStorage.removeItem("tf:session");
                          setSession(null);
                          setIsAdmin(false);
                          setProfileMenuOpen(false);
                          window.location.reload();
                        }}
                        className="text-left px-2 py-1 hover:bg-muted rounded"
                      >
                        تسجيل خروج
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden py-4 space-y-3 animate-slide-up">
            <Link
              to="/"
              className="block py-2 text-foreground hover:text-primary transition-colors font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              الرئيسية
            </Link>
            <Link
              to="/gallery"
              className="block py-2 text-foreground hover:text-primary transition-colors font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              معرض الصور
            </Link>
            <Link
              to="/orders"
              className="block py-2 text-foreground hover:text-primary transition-colors font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              الطلبات
            </Link>
            <Link
              to="/track"
              className="block py-2 text-foreground hover:text-primary transition-colors font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              متابعة الطلب
            </Link>
            <Link
              to="/invoice"
              className="block py-2 text-foreground hover:text-primary transition-colors font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              الفاتورة
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="block py-2 text-foreground hover:text-primary transition-colors font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                الداشبورد
              </Link>
            )}
            <div className="pt-3 space-y-2">
              {!session ? (
                <>
                  <Link to="/auth" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      تسجيل الدخول
                    </Button>
                  </Link>
                  <Link
                    to="/auth?mode=register"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Button variant="default" className="w-full">
                      إنشاء حساب
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setIsMenuOpen(false)}
                      className="block w-full text-center py-2"
                    >
                      الداشبورد
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      localStorage.removeItem("tf:session");
                      setSession(null);
                      setIsAdmin(false);
                      setIsMenuOpen(false);
                      window.location.reload();
                    }}
                    className="block w-full text-center py-2"
                  >
                    تسجيل خروج
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
import { toast } from "sonner";
import { getUsers, saveUser, findUser } from "@/lib/store";
import {
  setPresence,
  clearPresence,
  getDeviceId,
  writeUserToRemote,
  signInAdminByPhone,
  signInUserByPhone,
} from "@/lib/firebase";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isReset, setIsReset] = useState(false);
  const [resetPhone, setResetPhone] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try {
      const qp = new URLSearchParams(location.search);
      const mode = qp.get("mode");
      if (mode === "register") {
        setIsLogin(false);
        setIsReset(false);
      }
    } catch {
      // ignore
    }
  }, [location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    if (!phone || !password || (!isLogin && !fullName)) {
      toast.error("الرجاء ملء جميع الحقول");
      return;
    }

    if (isLogin) {
      // admin credentials configured via environment: treat matching phone/pass as admin
      try {
        const ADMIN_USER = import.meta.env.VITE_ADMIN_USER || "01558342393";
        const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || "Nader@159951";
        if (phone === ADMIN_USER && password === ADMIN_PASS) {
          // back admin sign-in with Firebase (creates user if missing)
          try {
            const res = await signInAdminByPhone(ADMIN_USER, ADMIN_PASS);
            if (res && res.ok) {
              localStorage.setItem(
                "tf:session",
                JSON.stringify({ phone: ADMIN_USER, isAdmin: true })
              );
              // presence
              try {
                const ok = await setPresence(ADMIN_USER, getDeviceId());
                if (!ok)
                  toast.error(
                    "ملاحظة: لم يتم تسجيل الحالة عبر السحابة — تأكد من إعداد Firebase"
                  );
              } catch {
                /* ignore */
              }
              toast.success("تم تسجيل الدخول كمسؤول");
              navigate("/");
              return;
            } else {
              toast.error("تعذر تسجيل دخول المسؤول عبر الخدمة السحابية");
              // fallthrough to local-password check (if any)
            }
          } catch (err) {
            console.error("admin sign-in error", err);
            toast.error("تعذر تسجيل دخول المسؤول");
            return;
          }
        }
      } catch (err) {
        console.error("admin env check error", err);
      }
      // Prefer Firebase-backed sign-in for regular users (creates remote auth user when needed)
      try {
        const res = await signInUserByPhone(phone, password);
        if (res && res.ok) {
          // ensure local record exists and store session
          const existing = findUser(phone);
          if (!existing) {
            saveUser({ phone, password, fullName: "", isAdmin: false });
          }
          localStorage.setItem(
            "tf:session",
            JSON.stringify({ phone, isAdmin: false })
          );
          try {
            await setPresence(phone, getDeviceId());
          } catch {
            /* ignore */
          }
          toast.success("مرحباً بك!");
          navigate("/");
          return;
        }
      } catch (err) {
        console.debug("Firebase signInUserByPhone failed", err);
      }

      // Fallback to local credential check
      const user = findUser(phone, password);
      if (!user) {
        toast.error("خطأ: الاسم أو كلمة غير صحيحة");
        return;
      }
      localStorage.setItem(
        "tf:session",
        JSON.stringify({ phone: user.phone, isAdmin: !!user.isAdmin })
      );
      try {
        const ok = await setPresence(user.phone, getDeviceId());
        if (!ok)
          toast.error(
            "ملاحظة: لم يتم تسجيل الحالة عبر السحابة — تأكد من إعداد Firebase"
          );
      } catch {
        // ignore
      }
      toast.success(`مرحباً بك!`);
      navigate("/");
    } else {
      // register
      const existing = getUsers().find((u) => u.phone === phone);
      if (existing) {
        toast.error("الرقم الهاتف مسجل بالفعل بالسابق");
        return;
      }

      saveUser({ phone, password, fullName, isAdmin: false });
      // Auto-login the new user (set session + presence) to avoid forcing immediate re-login
      try {
        localStorage.setItem(
          "tf:session",
          JSON.stringify({ phone, isAdmin: false })
        );
        try {
          const ok2 = await setPresence(phone, getDeviceId());
          if (!ok2)
            toast.error(
              "ملاحظة: لم يتم تسجيل الحالة عبر السحابة — تأكد من إعداد Firebase"
            );
        } catch {
          // ignore presence errors
        }
        toast.success("تم إنشاء الحساب وتم تسجيل الدخول تلقائياً!");
        navigate("/");
        return;
      } catch (err) {
        toast.success("تم إنشاء الحساب بنجاح! الرجاء تسجيل الدخول.");
        setIsLogin(true);
        return;
      }
    }
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPhone || !resetPassword) {
      toast.error("الرجاء ملء جميع الحقول");
      return;
    }
    const users = getUsers();
    const u = users.find((x) => x.phone === resetPhone);
    if (!u) {
      toast.error("لم يتم العثور على مستخدم بهذا الرقم");
      return;
    }
    // Update password and save
    saveUser({ ...u, password: resetPassword });
    toast.success("تم إعادة تعيين كلمة المرور. يمكنك الآن تسجيل الدخول.");
    // reset form and go back to login
    setIsReset(false);
    setResetPhone("");
    setResetPassword("");
    setIsLogin(true);
  };

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md shadow-elegant animate-fade-in">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold">
              {isLogin ? "تسجيل الدخول" : "إنشاء حساب جديد"}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? "سجل دخولك للوصول إلى حسابك"
                : "أنشئ حساباً جديداً للبدء"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isReset ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Admin login is implicit: use the configured admin phone/password */}
                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">الاسم الكامل</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="أدخل اسمك الكامل"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={!isLogin}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="phone">رقم الهاتف</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="05XXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    dir="ltr"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="أدخل كلمة المرور"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <Button type="submit" className="w-full" size="lg">
                  {isLogin ? "تسجيل الدخول" : "إنشاء الحساب"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resetPhone">رقم الهاتف المسجل</Label>
                  <Input
                    id="resetPhone"
                    type="tel"
                    value={resetPhone}
                    onChange={(e) => setResetPhone(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resetPassword">كلمة المرور الجديدة</Label>
                  <Input
                    id="resetPassword"
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="w-full">
                    إعادة تعيين
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsReset(false);
                      setResetPhone("");
                      setResetPassword("");
                    }}
                  >
                    إلغاء
                  </Button>
                </div>
              </form>
            )}

            <div className="mt-6 text-center space-y-2">
              {!isReset && (
                <div>
                  <button
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-primary hover:underline font-medium"
                  >
                    {isLogin
                      ? "ليس لديك حساب؟ سجل الآن"
                      : "لديك حساب؟ سجل دخولك"}
                  </button>
                </div>
              )}
              {!isReset && (
                <div>
                  <button
                    className="text-sm text-muted-foreground hover:underline"
                    onClick={() => {
                      setIsReset(true);
                      setResetPhone("");
                      setResetPassword("");
                    }}
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                مرحبا بكم في موقع تبارك فورج! نحن ملتزمون بتوفير أفضل تجربة
                ممكنة لعملائنا الكرام. إذا كان لديكم أي أسئلة أو تحتاجون إلى
                مساعدة، لا تترددوا في التواصل معنا عبر الهاتف أو البريد
                الإلكتروني. شكراً لاختياركم لنا!
              </p>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default Auth;

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ArrowLeft, CheckCircle2, Star } from "lucide-react";
import heroImage from "@/assets/hero-alumetal.jpg";
import { useEffect, useState } from "react";
import {
  incrementVisit,
  getSiteStats,
  applyRemoteSiteStats,
} from "@/lib/store";
import { subscribeSiteStats } from "@/lib/firebase";

const Home = () => {
  useEffect(() => {
    incrementVisit();
  }, []);
  const [stats, setStats] = useState(() => getSiteStats());

  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        const mod = await import("@/lib/firebase");
        if (mod && typeof mod.subscribeSiteStats === "function") {
          unsub = mod.subscribeSiteStats((s) => {
            if (s) {
              // update local store without echoing back to remote
              applyRemoteSiteStats(s);
              setStats(s);
            }
          });
        }
      } catch {
        // ignore if firebase not configured
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);
  const features = [
    "جودة عالية في التصنيع",
    "ضمان شامل على المنتجات",
    "تصاميم عصرية ومبتكرة",
    "خدمة عملاء متميزة",
    "أسعار تنافسية",
    "التوصيل والتركيب",
  ];

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-95" />
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Alumetal Hero"
            className="w-full h-full object-cover opacity-20"
          />
        </div>
        <div className="relative container mx-auto px-4 py-24 md:py-32">
          <div className="max-w-3xl animate-fade-in">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-6">
              تبارك لتصنيع
              <span className="block text-accent">الألوميتال</span>
            </h1>
            <p className="text-xl md:text-2xl text-primary-foreground/90 mb-8">
              نوفر أفضل حلول الألوميتال بجودة استثنائية وتصاميم عصرية تناسب
              احتياجاتك
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/gallery">
                <Button variant="default" size="lg" className="gap-2">
                  <span>استكشف منتجاتنا</span>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/orders">
                <Button
                  variant="outline"
                  size="lg"
                  className="bg-card/50 backdrop-blur hover:bg-card border-primary-foreground/30 text-primary-foreground hover:text-primary"
                >
                  اطلب الآن
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12 animate-slide-up">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              لماذا <span className="text-gradient">تبارك</span>؟
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              نقدم أفضل الخدمات والمنتجات في مجال الألوميتال
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card
                key={index}
                className="shadow-elegant hover:shadow-glow transition-all duration-300 hover:scale-105 animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-2 rounded-full bg-primary/10">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-lg font-medium">{feature}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="space-y-2 animate-fade-in">
              <div className="text-4xl md:text-5xl font-bold text-gradient">
                {stats.projects}
                {stats.projects >= 100 ? "+" : ""}
              </div>
              <div className="text-lg text-muted-foreground">مشروع منجز</div>
            </div>
            <div
              className="space-y-2 animate-fade-in"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="text-4xl md:text-5xl font-bold text-gradient">
                {stats.years}
                {stats.years >= 10 ? "+" : ""}
              </div>
              <div className="text-lg text-muted-foreground">سنوات خبرة</div>
            </div>
            <div
              className="space-y-2 animate-fade-in"
              style={{ animationDelay: "0.4s" }}
            >
              <div className="text-4xl md:text-5xl font-bold text-gradient flex items-center justify-center gap-2">
                <Star className="h-8 w-8 fill-accent text-accent" />
                {stats.rating}
              </div>
              <div className="text-lg text-muted-foreground">تقييم العملاء</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 gradient-primary">
        <div className="container mx-auto px-4 text-center animate-fade-in">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-6">
            جاهز لبدء مشروعك؟
          </h2>
          <p className="text-xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
            تواصل معنا اليوم واحصل على استشارة مجانية لمشروعك
          </p>
          <Link to="/orders">
            <Button
              variant="default"
              size="lg"
              className="bg-card text-primary hover:bg-card/90"
            >
              ابدأ الآن
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;

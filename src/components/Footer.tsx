import { Facebook, Instagram, Phone, Mail, MapPin } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-card border-t mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-2xl font-bold text-gradient">تبارك</h3>
            <p className="text-muted-foreground">
              شركة رائدة في تصنيع الألوميتال بجودة عالية وخدمة متميزة
            </p>
            <div className="flex gap-4">
              <a
                href="#"
                className="p-2 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="#"
                className="p-2 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold">روابط سريعة</h4>
            <ul className="space-y-2">
              <li>
                <a href="/" className="text-muted-foreground hover:text-primary transition-colors">
                  الرئيسية
                </a>
              </li>
              <li>
                <a href="/gallery" className="text-muted-foreground hover:text-primary transition-colors">
                  معرض الصور
                </a>
              </li>
              <li>
                <a href="/orders" className="text-muted-foreground hover:text-primary transition-colors">
                  الطلبات
                </a>
              </li>
              <li>
                <a href="/track" className="text-muted-foreground hover:text-primary transition-colors">
                  متابعة الطلب
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold">معلومات التواصل</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Phone className="h-5 w-5 text-primary" />
                <span dir="ltr">+20 01558342393</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Mail className="h-5 w-5 text-primary" />
                <span>info@tabarok.com</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <MapPin className="h-5 w-5 text-primary" />
                <span>مصر, محافظة القليوبية، مركز طوخ , قرية, ميت كنانه بجوار مستشفى الحكمة</span>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-8 border-t text-center text-muted-foreground">
          <p>© 2025 تبارك لتصنيع الألوميتال. جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

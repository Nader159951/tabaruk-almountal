import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import product1 from "@/assets/product-1.jpg";
import product2 from "@/assets/product-2.jpg";
import product3 from "@/assets/product-3.jpg";
import product4 from "@/assets/product-4.jpg";
import product5 from "@/assets/product-5.jpg";
import product6 from "@/assets/product-6.jpg";
import { subscribeGallery } from "@/lib/firebase";
import { upsertRemoteGallery, getGallery } from "@/lib/store";
import { subscribeStore } from "@/lib/store";

const Gallery = () => {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const products = [
    { id: 1, title: "نوافذ ألومنيوم", category: "windows", image: product1 },
    { id: 2, title: "أبواب ألومنيوم", category: "doors", image: product2 },
    { id: 3, title: "واجهات محلات", category: "facades", image: product3 },
    { id: 4, title: "مطابخ ألومنيوم", category: "kitchens", image: product4 },
    { id: 5, title: "درابزين", category: "railings", image: product5 },
    { id: 6, title: "كسوة ألومنيوم", category: "cladding", image: product6 },
  ];

  // Load user-uploaded images from local store
  type UserImg = {
    id: string;
    dataUrl: string;
    title?: string;
    description?: string;
    mediaType?: string;
  };
  const userImages = (() => {
    try {
      const raw = localStorage.getItem("tf:gallery");
      if (!raw)
        return [] as Array<{
          id: string;
          title?: string;
          category: string;
          image: string;
          description?: string;
        }>;
      const arr = JSON.parse(raw) as UserImg[];
      return arr.map((x, i) => ({
        id: `u-${x.id}`,
        title: x.title || `عنصر ${i + 1}`,
        category: "user",
        image: x.dataUrl,
        description: x.description,
        mediaType: x.mediaType || "image",
      }));
    } catch {
      return [] as Array<{
        id: string;
        title?: string;
        category: string;
        image: string;
        description?: string;
      }>;
    }
  })();

  const combined = [...userImages, ...products];

  const categories = [
    { id: "all", label: "الكل" },
    { id: "windows", label: "نوافذ" },
    { id: "doors", label: "أبواب" },
    { id: "facades", label: "واجهات" },
    { id: "kitchens", label: "مطابخ" },
    { id: "railings", label: "درابزين" },
    { id: "cladding", label: "كسوة" },
  ];

  const deleted = (() => {
    try {
      return JSON.parse(
        localStorage.getItem("tf:gallery:deleted") || "[]"
      ) as string[];
    } catch {
      return [] as string[];
    }
  })();

  const filteredProducts =
    selectedCategory === "all"
      ? combined
      : combined.filter((p) => p.category === selectedCategory);

  // subscribe to remote gallery updates and merge
  useEffect(() => {
    const unsub = subscribeGallery((remote) => {
      try {
        upsertRemoteGallery(remote);
        // trigger state refresh by reading local gallery again
        // (userImages is computed at render time from localStorage)
      } catch (err) {
        console.debug("subscribeGallery handler error", err);
      }
    });
    return unsub;
  }, []);

  // subscribe to local store changes and force re-render
  useEffect(() => {
    const unsub = subscribeStore((c) => {
      if (c.key === "tf:gallery") {
        // trigger a re-render by updating state
        setSelectedCategory((s) => s);
      }
    });
    return unsub;
  }, []);

  const visibleProducts = filteredProducts.filter(
    (p) => !deleted.includes(p.image.substring(p.image.lastIndexOf("/") + 1))
  );

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Navbar />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              معرض <span className="text-gradient">منتجاتنا</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              استعرض مجموعتنا المتنوعة من منتجات الألوميتال عالية الجودة
            </p>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-3 justify-center mb-12 animate-slide-up">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={
                  selectedCategory === category.id ? "default" : "outline"
                }
                onClick={() => setSelectedCategory(category.id)}
                className="transition-all duration-200"
              >
                {category.label}
              </Button>
            ))}
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleProducts.map((product, index) => (
              <Card
                key={product.id}
                className="overflow-hidden shadow-elegant hover:shadow-glow transition-all duration-300 hover:scale-105 cursor-pointer animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
                onClick={() => setSelectedImage(product.image)}
              >
                <CardContent className="p-0">
                  <div className="aspect-[4/3] overflow-hidden">
                    {"mediaType" in product && product.mediaType === "video" ? (
                      <video
                        src={product.image}
                        className="w-full h-full object-cover"
                        controls
                      />
                    ) : (
                      <img
                        src={product.image}
                        alt={product.title}
                        className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                      />
                    )}
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-semibold text-center">
                      {product.title}
                    </h3>
                    {"description" in product && product.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {product.description}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* No Results */}
          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-xl text-muted-foreground">
                لا توجد منتجات في هذه الفئة
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-accent transition-colors text-4xl"
            >
              ×
            </button>
            {selectedImage.startsWith("data:video") ||
            selectedImage.match(/\.mp4|\.webm|\.ogg$/i) ? (
              <video
                src={selectedImage}
                controls
                className="w-full h-auto rounded-lg shadow-glow"
              />
            ) : (
              <img
                src={selectedImage}
                alt="عرض كبير"
                className="w-full h-auto rounded-lg shadow-glow"
              />
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default Gallery;

import type { Metadata } from "next";
import "@/styles/globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "LiveLove - Property Management",
  description: "LiveLove Properties",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Love Live Myoko",
    "url": "https://love-live-myoko.com",
    "logo": "https://love-live-myoko.com/logo.png",
    "founder": {
      "@type": "Person",
      "name": "David Bolwell"
    },
    "areaServed": {
      "@type": "Place",
      "name": "Myoko, Niigata, Japan"
    },
    "sameAs": [
      "https://www.facebook.com/lovelivemyoko",
      "https://www.instagram.com/lovelivemyoko"
    ]
  };

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Love Live Myoko",
    "url": "https://love-live-myoko.com",
    "areaServed": "Myoko, Niigata, Japan",
    "description": "Property sales, property management, accommodation management and relocation assistance in Myoko, Niigata, Japan."
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Love Live Myoko",
    "url": "https://love-live-myoko.com"
  };

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
      </head>
      <body>
        <Header />
        <main className="layout__main">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}

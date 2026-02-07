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
  return (
    <html lang="en">
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

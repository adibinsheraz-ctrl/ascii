"use client";
import { useEffect } from "react";
import { initAnalytics } from "@/lib/firebase";

export default function FirebaseProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return <>{children}</>;
}

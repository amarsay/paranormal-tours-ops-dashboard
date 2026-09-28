import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewLoginForm } from "@/components/review/ReviewLoginForm";

export const metadata: Metadata = {
  title: "Sign in · Content review",
};

export default function ReviewLoginPage() {
  return (
    <Suspense fallback={null}>
      <ReviewLoginForm />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { ReviewBoard } from "@/components/review/ReviewBoard";

export const metadata: Metadata = {
  title: "Content review · Paranormal Tours Agent Ops",
};

export default function ReviewPage() {
  return <ReviewBoard />;
}

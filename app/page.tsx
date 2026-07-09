"use client";
import dynamic from "next/dynamic";

// react-pdf / pdf.js touch browser-only globals (DOMMatrix) at module eval, so
// the whole workspace is loaded client-side only — never server-rendered.
const Workspace = dynamic(
  () => import("@/components/Workspace").then((m) => m.Workspace),
  { ssr: false },
);

export default function Home() {
  return <Workspace />;
}

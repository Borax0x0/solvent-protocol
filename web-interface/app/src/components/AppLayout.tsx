"use client";

import { ReactNode } from "react";
import { Nav } from "./Nav";
import { Sidebar } from "./Sidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <div className="hidden">
        <button className="wallet-adapter-button" style={{ display: "none" }} />
      </div>
      <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.07]" style={{ backgroundImage: "linear-gradient(to right, #00FFB2 1px, transparent 1px), linear-gradient(to bottom, #00FFB2 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      <main className="flex-grow pt-16 flex relative z-10">
        <div className="flex-1 p-5 lg:p-8 max-w-6xl mx-auto w-full">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 min-w-0">{children}</div>
            <Sidebar />
          </div>
        </div>
      </main>
    </>
  );
}

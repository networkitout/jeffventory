"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Icon, { type IconName } from "./Icon";

const links: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Inventory", icon: "box" },
  { href: "/scan", label: "Scan a code", icon: "scan" },
  { href: "/labels", label: "Print labels", icon: "print" },
  { href: "/data", label: "Your data", icon: "database" },
  { href: "/account", label: "Account & access", icon: "settings" },
];

export default function Navigation() {
  const pathname = usePathname();

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const element = event.target;
      if (element instanceof HTMLElement &&
        (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName))) return;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const search = document.getElementById("inventory-search");
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    }
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <aside className="app-navigation print:hidden">
      <Link href="/" className="brand" aria-label="Jeffventory home">
        <span className="brand-mark"><Icon name="box" width="23" height="23" /></span>
        <span>Jeffventory<span className="brand-caption">A home for your hardware.</span></span>
      </Link>
      {pathname !== "/login" && <nav aria-label="Main navigation" className="nav-links">
        {links.map((link) => {
          const active = link.href === "/" ? pathname === "/" || pathname.startsWith("/items") : pathname === link.href;
          return (
            <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}
              className={`nav-link${active ? " is-active" : ""}`}>
              <Icon name={link.icon} /><span>{link.label}</span>
            </Link>
          );
        })}
      </nav>}
      <div className="nav-footer">
        <span className="local-indicator" /> Private shared workspace
        <p>Your inventory stays on your server.</p>
      </div>
    </aside>
  );
}

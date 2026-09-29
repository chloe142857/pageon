import Image from "next/image";

import logo from "../../page_on_logo.png";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <Image className={compact ? "brand-logo brand-logo-compact" : "brand-logo"} src={logo} alt="Page On" priority />;
}

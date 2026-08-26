import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-gray-500">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-logisalud-green hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-gray-700" : ""}>{item.label}</span>
            )}
            {!isLast && <span className="text-gray-300">/</span>}
          </span>
        );
      })}
    </nav>
  );
}

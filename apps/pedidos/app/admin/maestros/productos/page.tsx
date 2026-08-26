import { listProducts, listActiveSuppliers } from "@/services/products";
import { Breadcrumb } from "@/components/breadcrumb";
import { ProductForm } from "./product-form";
import { ProductList } from "./product-list";
import { crearProducto, cambiarEstadoProducto } from "./actions";

export default async function ProductosPage() {
  const [products, suppliers] = await Promise.all([listProducts(), listActiveSuppliers()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Productos" }]} />
        <h2 className="text-xl font-semibold">Productos</h2>
        <p className="mt-1 text-sm text-gray-600">
          El tratamiento tributario es versionado: crear un perfil nuevo cierra
          automáticamente el anterior, nunca lo borra.
        </p>
      </div>
      <ProductForm suppliers={suppliers} onCreate={crearProducto} />
      <ProductList products={products} onToggle={cambiarEstadoProducto} />
    </div>
  );
}

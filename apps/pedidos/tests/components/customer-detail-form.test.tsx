// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/admin/maestros/clientes/actions", () => ({
  buscarProvincias: async () => ["HUANCAYO"],
  buscarDistritos: async () => ["EL TAMBO"],
  guardarDatosDelCliente: async () => {},
  guardarDireccion: async () => {},
}));

import { CustomerDetailForm } from "@/app/admin/maestros/clientes/[ruc]/customer-detail-form";
import type { CustomerDetail } from "@/services/customers";

/**
 * Esta pantalla existe para cerrar direcciones sin ubigeo. Lo que importa
 * probar es que no pueda volver a guardar una así: el botón sólo se
 * habilita con los tres niveles elegidos, y el aviso ámbar tiene que
 * aparecer en la dirección que quedó sin resolver.
 */

const CLIENTE: CustomerDetail = {
  id: "3f2b1b1e-0f4e-4b5f-9a2c-0d6f5c1a2b3c",
  ruc_o_documento: "10464768152",
  razon_social: "CASIMIRO CARASCO KETTY SUSAN",
  nombre_comercial: null,
  tipo_comprobante_permitido: "FACTURA_O_BOLETA",
  canal_id: 1,
  zona_id: 2,
  condicion_pago_habitual_id: null,
  estado: "ACTIVO",
  es_agente_retencion: false,
  departamento: "JUNIN",
  provincia: "HUANCAYO",
  distrito: "EL TAMBBO",
  whatsapp: null,
  created_at: "2026-08-01T00:00:00Z",
  canal: { nombre: "FARMACIAS" },
  zona: { nombre: "ZONA 5" },
  condicion_pago: null,
  direcciones: [
    {
      id: "9c0e5f5b-3a4d-4c7e-8f1a-2b3c4d5e6f70",
      direccion: "AV. HUANCAVELICA 1234",
      referencia: null,
      ubigeo: null,
      es_principal: true,
      estado: "ACTIVO",
      departamento: null,
      provincia: null,
      distrito: null,
    },
  ],
};

function montar(puedeEditar: boolean) {
  const contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  const root = createRoot(contenedor);
  act(() =>
    root.render(
      <CustomerDetailForm
        cliente={CLIENTE}
        canales={[{ id: 1, nombre: "FARMACIAS" }]}
        zonas={[{ id: 2, nombre: "ZONA 5" }]}
        condicionesPago={[{ id: 3, nombre: "CONTADO" }]}
        departamentos={["JUNIN", "LIMA"]}
        puedeEditar={puedeEditar}
      />,
    ),
  );

  const boton = (texto: string) =>
    Array.from(contenedor.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes(texto),
    );

  return { contenedor, boton };
}

describe("CustomerDetailForm", () => {
  it("avisa que la dirección sin ubigeo no puede emitir guía", () => {
    const { contenedor } = montar(true);
    expect(contenedor.textContent).toContain("Sin ubigeo");
    expect(contenedor.textContent).toContain("AV. HUANCAVELICA 1234");
    expect(contenedor.textContent).toContain("Principal");
  });

  it("un no administrador ve los datos pero no puede editarlos", () => {
    const { contenedor, boton } = montar(false);
    expect(contenedor.textContent).toContain("Solo un administrador");
    expect(boton("Editar")).toBeUndefined();
    expect(boton("Agregar dirección")).toBeUndefined();
    const razon = contenedor.querySelector<HTMLInputElement>("#razonSocial")!;
    expect(razon.disabled).toBe(true);
    expect(razon.value).toBe("CASIMIRO CARASCO KETTY SUSAN");
  });

  it("el RUC se muestra pero no es un campo editable", () => {
    const { contenedor } = montar(true);
    expect(contenedor.textContent).toContain("10464768152");
    expect(contenedor.querySelector('[name="rucODocumento"]')).toBeNull();
  });

  it("no deja guardar la dirección hasta tener los tres niveles del ubigeo", async () => {
    const { contenedor, boton } = montar(true);
    await act(async () => boton("Editar")!.click());

    const guardar = boton("Guardar dirección")!;
    expect((guardar as HTMLButtonElement).disabled).toBe(true);

    const elegir = async (nivel: string, valor: string) => {
      const el = contenedor.querySelector<HTMLSelectElement>(
        `#ubigeo-${CLIENTE.direcciones[0].id}-${nivel}`,
      )!;
      await act(async () => {
        el.value = valor;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };

    await elegir("departamento", "JUNIN");
    expect((boton("Guardar dirección") as HTMLButtonElement).disabled).toBe(true);
    await elegir("provincia", "HUANCAYO");
    await elegir("distrito", "EL TAMBO");

    expect((boton("Guardar dirección") as HTMLButtonElement).disabled).toBe(false);
  });
});

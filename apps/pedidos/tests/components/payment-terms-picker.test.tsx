// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentTermsPicker } from "@/components/payment-terms-picker";

afterEach(cleanup);

const OPCIONES = [
  { id: 1, nombre: "Contado", permite_dias_libres: false },
  { id: 2, nombre: "Crédito 30 días", permite_dias_libres: false },
  { id: 7, nombre: "Crédito (otro número de días)", permite_dias_libres: true },
];

const CAMPO_DIAS = /Días de crédito solicitados/;

describe("PaymentTermsPicker", () => {
  it("con una condición estándar no pide días", () => {
    render(
      <PaymentTermsPicker
        paymentTerms={OPCIONES}
        paymentTermsId={2}
        diasCredito=""
        onChange={() => {}}
      />,
    );
    expect(screen.queryByLabelText(CAMPO_DIAS)).toBeNull();
  });

  it("al elegir la opción libre aparece el campo numérico", () => {
    render(
      <PaymentTermsPicker
        paymentTerms={OPCIONES}
        paymentTermsId={7}
        diasCredito=""
        onChange={() => {}}
      />,
    );
    const campo = screen.getByLabelText(CAMPO_DIAS);
    expect(campo.getAttribute("type")).toBe("number");
    expect(campo.getAttribute("required")).not.toBeNull();
  });

  it("avisa que el pedido va a caer en excepción administrativa", () => {
    render(
      <PaymentTermsPicker
        paymentTerms={OPCIONES}
        paymentTermsId={7}
        diasCredito="15"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/excepción administrativa/)).toBeTruthy();
  });

  it("volver a una condición estándar limpia los días escritos", async () => {
    const onChange = vi.fn();
    render(
      <PaymentTermsPicker
        paymentTerms={OPCIONES}
        paymentTermsId={7}
        diasCredito="15"
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Condición de pago"), "1");
    expect(onChange).toHaveBeenCalledWith({ paymentTermsId: 1, diasCredito: "" });
  });

  it("los días escritos suben al padre tal cual", async () => {
    const onChange = vi.fn();
    render(
      <PaymentTermsPicker
        paymentTerms={OPCIONES}
        paymentTermsId={7}
        diasCredito=""
        onChange={onChange}
      />,
    );
    await userEvent.type(screen.getByLabelText(CAMPO_DIAS), "1");
    expect(onChange).toHaveBeenCalledWith({ paymentTermsId: 7, diasCredito: "1" });
  });

  it("los campos llevan name, así que también sirven dentro de un form nativo", () => {
    render(
      <PaymentTermsPicker
        paymentTerms={OPCIONES}
        paymentTermsId={7}
        diasCredito="15"
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("Condición de pago").getAttribute("name")).toBe("paymentTermsId");
    expect(screen.getByLabelText(CAMPO_DIAS).getAttribute("name")).toBe("diasCredito");
  });
});

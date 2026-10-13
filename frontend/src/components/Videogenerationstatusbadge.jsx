import React from "react";

const ESTILOS = {
  pendiente: "bg-gray-200 text-gray-700",
  procesando: "bg-yellow-100 text-yellow-800 animate-pulse",
  completado: "bg-green-100 text-green-800",
  fallido: "bg-red-100 text-red-800",
  cancelado: "bg-gray-200 text-gray-600",
};

const TEXTOS = {
  pendiente: "Pendiente",
  procesando: "Generando video...",
  completado: "Completado",
  fallido: "Error",
  cancelado: "Cancelado",
};

export default function VideoGenerationStatusBadge({ estado }) {
  const clase = ESTILOS[estado] || ESTILOS.pendiente;
  const texto = TEXTOS[estado] || estado;

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${clase}`}>
      {texto}
    </span>
  );
}
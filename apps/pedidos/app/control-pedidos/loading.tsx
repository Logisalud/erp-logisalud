export default function ControlPedidosLoading() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card-highlight h-32 animate-pulse bg-gray-100 p-5" />
      ))}
    </div>
  );
}
